-- Nestly database, part 12: security hardening.
--
--  F1  Usernames no longer reveal emails: only the login server function turns a username into an email.
--  F2  Owners' and custodians' contact details are visible only to people who work with them or stay with them.
--  F3  The visitor gate cannot list residents: a visitor needs the room number and three letters of the name,
--      sees only a first name and initial, and the gate is rate limited.
--  F4  The activity log cannot be faked: each entry is stamped with the real person, role and time, and
--      admin-only actions can only be written by admins.
--  F5  The last bed cannot be sold twice: starting a booking holds the bed under a lock, and confirming a
--      payment checks again under the same lock.
--  Plus: payout account changes wait 24 hours and can be cancelled from an email; admins need two-step login
--  and a recent sign-in for approvals; login records, rate limits, an email outbox, security signals for
--  admins, a security problem report box, and automatic clean-up of old data.
-- Run after 0001 to 0011.

/* ---------------------------------------------------------------- helpers */

-- How the person signed in: 'aal2' once they passed two-step login.
create or replace function public.aal() returns text
language sql stable as $$ select coalesce(auth.jwt() ->> 'aal', 'aal1') $$;

-- True when the person proved who they are (password or two-step code) within the last p_minutes.
-- Uses the sign-in times inside the login token, which refreshing the token does not change.
create or replace function public.recent_auth(p_minutes int) returns boolean
language sql stable as $$
  select coalesce((select max((e ->> 'timestamp')::bigint) from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) e)
    > extract(epoch from now()) - p_minutes * 60, false)
$$;

-- Admin powers need the admin role, an active account and two-step login (aal2) in this session.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from profiles where id = auth.uid() and not suspended), false) and public.aal() = 'aal2'
$$;

-- For the app: an admin account that still has to set up or pass two-step login.
create or replace function public.admin_needs_2fa() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin' and not suspended) and public.aal() <> 'aal2'
$$;
grant execute on function public.admin_needs_2fa() to authenticated;

/* ---------------------------------------------------------------- F1 usernames */

revoke execute on function public.email_for_login(text) from public, anon, authenticated;
grant execute on function public.email_for_login(text) to service_role;

/* ---------------------------------------------------------------- F2 who sees staff contact details */

-- The signed-in person works at, owns, or has a booking at a hostel where the target is the owner or a custodian.
create or replace function public.knows_staff(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from hostels h
    where (h.owner_id = target or exists (select 1 from profiles c where c.id = target and c.role = 'custodian' and c.hostel_id = h.id))
      and (public.owns_hostel(h.id) or public.works_at(h.id) or public.stays_at(h.id)))
$$;

drop policy if exists "read profiles" on public.profiles;
create policy "read profiles" on public.profiles for select to authenticated using (
  id = auth.uid() or public.is_admin() or public.is_my_student(id) or (role in ('owner', 'custodian') and public.knows_staff(id)));

/* ---------------------------------------------------------------- rate limits */

create table if not exists public.rate_hits (
  key text not null,
  at timestamptz not null default now()
);
create index if not exists rate_hits_key_at on public.rate_hits (key, at);
alter table public.rate_hits enable row level security;   -- no policies: only database functions and the server use it

-- Records one try under p_key and says whether it is still within p_max tries per p_seconds.
create or replace function public.rate_ok(p_key text, p_max int, p_seconds int) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  select count(*) into n from rate_hits where key = p_key and at > now() - make_interval(secs => p_seconds);
  if n >= p_max then return false; end if;
  insert into rate_hits (key) values (p_key);
  return true;
end $$;
revoke execute on function public.rate_ok(text, int, int) from public, anon, authenticated;
grant execute on function public.rate_ok(text, int, int) to service_role;

/* ---------------------------------------------------------------- F3 visitor gate */

-- Finds a resident for a visitor at the gate. The visitor must give the exact room and at least three letters of
-- the resident's first or last name. Only the first name and initial are shown. At most 40 searches per hostel
-- in 10 minutes, so nobody can work through the rooms.
create or replace function public.find_resident(p_hostel text, p_room text, p_q text)
returns table (id text, label text, room text)
language plpgsql volatile security definer set search_path = public as $$
declare q text := lower(trim(coalesce(p_q, ''))); r text := upper(trim(coalesce(p_room, '')));
begin
  if length(q) < 3 or r = '' then return; end if;
  if not exists (select 1 from hostels where hostels.id = p_hostel and status = 'live') then return; end if;
  if not public.rate_ok('gate:' || p_hostel, 40, 600) then raise exception 'Too many searches at this gate. Ask the custodian to sign you in.'; end if;
  return query
    select t.id, split_part(t.name, ' ', 1) || coalesce(' ' || nullif(left(split_part(t.name, ' ', 2), 1), '') || '.', ''), t.room
    from tenants t
    where t.hostel_id = p_hostel and t.status = 'in' and t.room_id is not null and upper(t.room) = r
      and exists (select 1 from regexp_split_to_table(lower(t.name), '\s+') w where w like q || '%')
    order by t.name limit 3;
end $$;

-- Signs a visitor in using the resident they picked (by id). Same checks as before.
create or replace function public.visitor_check_in(p_hostel text, p_name text, p_tenant text, p_phone text)
returns visitors
language plpgsql volatile security definer set search_path = public as $$
declare v visitors; t tenants; ph text := regexp_replace(coalesce(p_phone, ''), '[\s-]', '', 'g');
begin
  if not exists (select 1 from hostels where id = p_hostel and status = 'live') then raise exception 'This hostel is not taking visitors on Nestly.'; end if;
  if not public.rate_ok('gate-in:' || p_hostel, 60, 600) then raise exception 'Too many sign-ins at this gate. Ask the custodian.'; end if;
  if array_length(regexp_split_to_array(trim(coalesce(p_name, '')), '\s+'), 1) < 2 or length(trim(p_name)) > 60 then raise exception 'Enter your first and last name.'; end if;
  if not (ph ~ '^07\d{8}$' or ph ~ '^\+?2567\d{8}$') then raise exception 'Enter a 10-digit number, like 0772 123 456.'; end if;
  select * into t from tenants where id = p_tenant and hostel_id = p_hostel and status = 'in';
  if t.id is null then raise exception 'Choose who you are visiting from the list.'; end if;
  insert into visitors (id, hostel_id, name, room, host, phone, tin, tout, via, date)
  values ('vs' || replace(gen_random_uuid()::text, '-', ''), p_hostel, trim(p_name), t.room, t.name, trim(p_phone),
          to_char(now() at time zone 'Africa/Kampala', 'HH24:MI'), null, 'QR', (now() at time zone 'Africa/Kampala')::date)
  returning * into v;
  return v;
end $$;

-- The visitor's own pass shows only the resident's first name and initial.
create or replace function public.visitor_pass(p_id text)
returns visitors
language sql stable security definer set search_path = public as $$
  select v.id, v.hostel_id, v.name, v.room,
    split_part(v.host, ' ', 1) || coalesce(' ' || nullif(left(split_part(v.host, ' ', 2), 1), '') || '.', '') as host,
    v.phone, v.tin, v.tout, v.via, v.date, v.seq
  from visitors v where v.id = p_id and v.date >= (now() at time zone 'Africa/Kampala')::date - 1;
$$;

revoke execute on function public.search_residents(text, text) from public, anon, authenticated;
revoke execute on function public.visitor_sign_in(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.find_resident(text, text, text), public.visitor_check_in(text, text, text, text), public.visitor_pass(text) to anon, authenticated;

-- Visitor logs are now kept for 30 days.
create or replace function public.forget_old_visitors() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from visitors where date < (now() at time zone 'Africa/Kampala')::date - 30;
  return null;
end $$;

/* ---------------------------------------------------------------- F4 activity log */

-- Entries written from the app are stamped with the real person, role and time. Admin-only actions can only be
-- written by an admin, and text is kept short. Nobody can edit or delete entries (there are no policies for that).
-- At most 120 activity entries an hour per person.
create or replace function public.audit_quota() returns boolean
language sql volatile security definer set search_path = public as $$ select public.rate_ok('audit:' || coalesce(auth.uid()::text, 'anon'), 120, 3600) $$;
grant execute on function public.audit_quota() to authenticated;

-- Not security definer: it must see who is calling (from_app checks the caller's role).
create or replace function public.stamp_audit() returns trigger
language plpgsql set search_path = public as $$
begin
  if not public.from_app() then return new; end if;
  new.actor_id := auth.uid();
  new.actor_role := coalesce((select role from profiles where id = auth.uid()), 'unknown');
  new.at := now();
  new.target := left(coalesce(new.target, ''), 200);
  new.detail := left(coalesce(new.detail, ''), 400);
  if new.action in ('Approved listing', 'Approved owner', 'Approved student ID', 'Changed subscription price', 'Gave more time to pay',
      'Paused account', 'Paused for unpaid subscription', 'Recorded subscription payment', 'Rejected owner', 'Rejected student ID',
      'Requested changes', 'Resolved report', 'Restored account', 'Sent password reset link', 'Approved payout change', 'Rejected payout change', 'Paid subscription')
     and not public.is_admin() then
    raise exception 'Only the Nestly team can record that.';
  end if;
  if not public.audit_quota() then raise exception 'Too many changes in a short time. Wait a while.'; end if;
  return new;
end $$;
drop trigger if exists stamp_audit on public.audit;
create trigger stamp_audit before insert on public.audit for each row execute function public.stamp_audit();

/* ---------------------------------------------------------------- F5 the last bed */

-- Starts a booking that waits for payment. Locks the hostel so two students cannot both take the last bed:
-- beds already taken plus other students' unpaid bookings from the last 20 minutes must leave one free.
-- Only the payments server function calls it.
create or replace function public.start_booking(p_user uuid, p_hostel text, p_type text, p_sem text, p_fee int, p_tx text, p_method text)
returns bookings
language plpgsql volatile security definer set search_path = public as $$
declare h hostels; total int; taken int; held int; b bookings;
begin
  select * into h from hostels where id = p_hostel for update;
  if h.id is null or h.status <> 'live' then raise exception 'This hostel is not taking bookings right now.'; end if;
  select (v ->> 'total')::int, coalesce((v ->> 'taken')::int, 0) into total, taken from jsonb_array_elements(h.rooms) v where v ->> 't' = p_type limit 1;
  if total is null then raise exception 'Pick a room type.'; end if;
  select count(*) into held from bookings where hostel_id = p_hostel and room = p_type and status = 'pending' and user_id <> p_user and at > now() - interval '20 minutes';
  if taken + held >= total then raise exception 'Someone just took the last room of this type. Pick another.'; end if;
  insert into bookings (user_id, hostel_id, room, sem, fee, status, tx_ref, method, paid_on)
  values (p_user, p_hostel, p_type, p_sem, p_fee, 'pending', p_tx, p_method, '') returning * into b;
  return b;
end $$;
revoke execute on function public.start_booking(uuid, text, text, text, int, text, text) from public, anon, authenticated;
grant execute on function public.start_booking(uuid, text, text, text, int, text, text) to service_role;

-- Confirming a payment checks the bed again under the same lock. If the room filled up meanwhile (the student
-- took longer than 20 minutes to pay), the booking is cancelled and the owner is told to refund the fee.
create or replace function public.bed_still_free() returns trigger
language plpgsql security definer set search_path = public as $$
declare h hostels; total int; taken int;
begin
  if new.status = 'paid' and old.status = 'pending' then
    select * into h from hostels where id = new.hostel_id for update;
    select (v ->> 'total')::int, coalesce((v ->> 'taken')::int, 0) into total, taken from jsonb_array_elements(h.rooms) v where v ->> 't' = new.room limit 1;
    if total is not null and taken >= total then
      new.status := 'cancelled';
      insert into notifications (user_id, kind, title, text, "to") values
        (new.user_id, 'booking', 'That room filled up', 'Your payment arrived after the last ' || lower(new.room) || ' room at ' || h.name || ' was taken. The owner will refund your booking fee.', '/s/bookings');
      if h.owner_id is not null then
        insert into notifications (user_id, kind, title, text, "to") values
          (h.owner_id, 'money', 'Refund needed', 'A booking fee for ' || h.name || ' (' || new.room || ', ref ' || new.id || ') arrived after the room filled up. Please refund the student.', '/o/money');
      end if;
      insert into notifications (user_id, kind, title, text, "to")
        select id, 'review', 'Refund needed at ' || h.name, 'Booking ' || new.id || ' was paid after the room filled up.', '/a/overview' from profiles where role = 'admin';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists bed_still_free on public.bookings;
create trigger bed_still_free before update of status on public.bookings for each row execute function public.bed_still_free();

/* ---------------------------------------------------------------- email outbox */

-- Security emails wait here until the send-mail server function sends them (see SETUP.md).
create table if not exists public.outbox (
  id bigint generated by default as identity primary key,
  to_email text not null,
  subject text not null,
  body text not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  error text
);
alter table public.outbox enable row level security;   -- no policies: only database functions and the server use it

create or replace function public.queue_mail(p_to text, p_subject text, p_body text) returns void
language sql volatile security definer set search_path = public as $$
  insert into outbox (to_email, subject, body)
  select lower(p_to), p_subject, p_body
  where p_to ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and p_to !~ '@(sms|custodian)\.nestly\.app$'
$$;
revoke execute on function public.queue_mail(text, text, text) from public, anon, authenticated;

/* ---------------------------------------------------------------- payout account changes */

alter table public.owner_accounts
  add column if not exists payout_pending jsonb,
  add column if not exists payout_pending_at timestamptz,
  add column if not exists payout_review boolean not null default false,
  add column if not exists payout_cancel text;

-- The first payout account is set during owner sign-up. After that, changes go through request_payout_change().
create or replace function public.guard_owner_account() returns trigger
language plpgsql as $$
begin
  if not public.from_app() or public.is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.sub_paid_until := null; new.sub_grace_until := null; new.sub_reminded_at := null;
    new.payout_pending := null; new.payout_pending_at := null; new.payout_review := false; new.payout_cancel := null;
    return new;
  end if;
  if new.sub_paid_until is distinct from old.sub_paid_until or new.sub_grace_until is distinct from old.sub_grace_until
     or new.sub_reminded_at is distinct from old.sub_reminded_at or new.owner_id is distinct from old.owner_id then
    raise exception 'Subscription dates are set by Nestly.';
  end if;
  if new.payout_pending is distinct from old.payout_pending or new.payout_pending_at is distinct from old.payout_pending_at
     or new.payout_review is distinct from old.payout_review or new.payout_cancel is distinct from old.payout_cancel then
    raise exception 'Use the payout settings page to change the account.';
  end if;
  if new.payout is distinct from old.payout and old.payout is not null
     and exists (select 1 from profiles where id = old.owner_id and owner_status = 'approved') then
    raise exception 'Changes to the payout account wait 24 hours. Use the payout settings page.';
  end if;
  return new;
end $$;

-- True when the two names share a word of three or more letters ("Grace Namuli" and "NAMULI GRACE A.").
create or replace function public.names_match(a text, b text) returns boolean
language sql immutable as $$
  select exists (select 1 from regexp_split_to_table(lower(coalesce(a, '')), '[^a-z]+') x
                 join regexp_split_to_table(lower(coalesce(b, '')), '[^a-z]+') y on x = y where length(x) >= 3)
$$;

-- An approved owner asks to change where students pay. The new account starts after 24 hours. The owner gets an
-- email with a link that cancels it; if the account name does not match their name, an admin must approve it too.
create or replace function public.request_payout_change(p_payout jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare me profiles; tok text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''); review boolean; site text;
begin
  select * into me from profiles where id = auth.uid() and role = 'owner' and not suspended;
  if me.id is null then raise exception 'Only owners have a payout account.'; end if;
  if not public.recent_auth(15) then raise exception 'For your safety, enter your password again first.'; end if;
  -- An owner with two-step login must have passed it in this session.
  if public.aal() <> 'aal2' and exists (select 1 from auth.mfa_factors f where f.user_id = me.id and f.status = 'verified') then
    raise exception 'Enter the code from your authenticator app first.';
  end if;
  if coalesce(p_payout ->> 'method', '') not in ('mtn', 'airtel', 'bank') then raise exception 'Choose how you are paid.'; end if;
  if p_payout ->> 'method' <> 'bank' and regexp_replace(coalesce(p_payout ->> 'to', ''), '\s', '', 'g') !~ '^0?7\d{8}$' then raise exception 'Enter a 10-digit mobile money number.'; end if;
  if length(trim(coalesce(p_payout ->> 'name', ''))) < 3 then raise exception 'Enter the name on the account.'; end if;
  review := not public.names_match(p_payout ->> 'name', me.name);
  update owner_accounts set payout_pending = p_payout, payout_pending_at = now(), payout_review = review, payout_cancel = tok where owner_id = me.id;
  select coalesce(site_url, 'https://nestly-ug.vercel.app') into site from config where id = 1;
  perform queue_mail(me.email, 'Your Nestly payout account is changing',
    'Hello ' || split_part(me.name, ' ', 1) || E',\n\nSomeone signed in to your Nestly account asked to change the account students pay into, to '
    || case p_payout ->> 'method' when 'bank' then 'a bank account' when 'mtn' then 'MTN Mobile Money' else 'Airtel Money' end
    || ' ending ' || right(regexp_replace(coalesce(p_payout ->> 'to', ''), '\s', '', 'g'), 4) || ' in the name ' || (p_payout ->> 'name') || E'.\n\n'
    || E'The change starts in 24 hours' || case when review then ', after the Nestly team checks it, because the name is different from yours' else '' end || E'.\n\n'
    || E'If this was not you, cancel it now and then reset your password:\n' || site || '/payout/cancel?t=' || tok || E'\n\nNestly');
  insert into audit (actor_id, actor_role, action, target, detail) values (me.id, 'owner', 'Asked to change payout account', me.name,
    'To ' || (p_payout ->> 'method') || ' ending ' || right(regexp_replace(coalesce(p_payout ->> 'to', ''), '\s', '', 'g'), 4) || ', name ' || (p_payout ->> 'name') || case when review then '. Name differs: admin check needed' else '' end);
  if review then
    insert into notifications (user_id, kind, title, text, "to")
      select id, 'review', 'Payout name to check', me.name || ' wants payments to go to an account named ' || (p_payout ->> 'name') || '.', '/a/reviews?tab=payouts' from profiles where role = 'admin';
  end if;
  return jsonb_build_object('starts', now() + interval '24 hours', 'review', review);
end $$;

-- Moves due payout changes into place (24 hours passed and, if needed, an admin approved). Run by the app for the
-- signed-in owner, and by the hourly job for everyone.
create or replace function public.apply_due_payouts() returns int
language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  update owner_accounts set payout = payout_pending, payout_pending = null, payout_pending_at = null, payout_review = false, payout_cancel = null
  where payout_pending is not null and not payout_review and payout_pending_at <= now() - interval '24 hours'
    and (public.from_app() is false or owner_id = auth.uid());
  get diagnostics n = row_count; return n;
end $$;

-- The "this was not me" link from the email. Works without signing in, because the owner may be locked out.
create or replace function public.cancel_payout_change(p_token text) returns text
language plpgsql volatile security definer set search_path = public as $$
declare a owner_accounts; me profiles;
begin
  if length(coalesce(p_token, '')) < 40 then return 'invalid'; end if;
  update owner_accounts set payout_pending = null, payout_pending_at = null, payout_review = false, payout_cancel = null
  where payout_cancel = p_token returning * into a;
  if a.owner_id is null then return 'invalid'; end if;
  select * into me from profiles where id = a.owner_id;
  insert into audit (actor_id, actor_role, action, target, detail) values (a.owner_id, 'owner', 'Cancelled payout change from email', me.name, 'The owner said they did not ask for it');
  insert into notifications (user_id, kind, title, text, "to")
    select id, 'review', 'Payout change cancelled by owner', me.name || ' said they did not ask to change their payout account. Their password may be known to someone else.', '/a/users?u=' || me.id
    from profiles where role = 'admin';
  insert into notifications (user_id, kind, title, text, "to") values (me.id, 'money', 'Payout change cancelled', 'Your payout account stays as it was. Change your password now.', '/o/settings');
  return 'cancelled';
end $$;

-- An admin approves a payout account whose name differs from the owner's (after checking with them).
create or replace function public.approve_payout_change(p_owner uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare me profiles;
begin
  if not public.is_admin() or not public.recent_auth(15) then raise exception 'Confirm it is you again, then try once more.'; end if;
  update owner_accounts set payout_review = false where owner_id = p_owner and payout_pending is not null;
  select * into me from profiles where id = p_owner;
  insert into audit (actor_id, actor_role, action, target, detail) values (auth.uid(), 'admin', 'Approved payout change', me.name, 'Name on the new account checked');
  insert into notifications (user_id, kind, title, text, "to") values (p_owner, 'money', 'Payout account approved', 'The Nestly team checked your new payout account. It starts 24 hours after you asked.', '/o/money');
end $$;

revoke execute on function public.apply_due_payouts() from public, anon;
grant execute on function public.request_payout_change(jsonb), public.apply_due_payouts(), public.approve_payout_change(uuid) to authenticated;
grant execute on function public.cancel_payout_change(text) to anon, authenticated;

-- Where links in security emails point. Admins can change it in the SQL editor.
alter table public.config add column if not exists site_url text;

/* ---------------------------------------------------------------- admin decisions need a recent sign-in */

-- Same as 0011, plus: admins approving, rejecting or pausing accounts must have signed in (or passed two-step
-- login again) in the last 15 minutes.
create or replace function public.guard_profile() returns trigger
language plpgsql as $$
begin
  if not public.from_app() then return new; end if;
  if public.is_admin() then
    if (new.owner_status is distinct from old.owner_status or new.id_status is distinct from old.id_status
        or new.suspended is distinct from old.suspended or new.role is distinct from old.role)
       and not public.recent_auth(15) then
      raise exception 'Confirm it is you again, then try once more.';
    end if;
    return new;
  end if;
  if new.id is distinct from old.id or new.role is distinct from old.role or new.email is distinct from old.email
     or new.email_verified is distinct from old.email_verified or new.verified_until is distinct from old.verified_until
     or new.suspended is distinct from old.suspended or new.suspend_reason is distinct from old.suspend_reason
     or new.hostel_id is distinct from old.hostel_id or new.owner_note is distinct from old.owner_note
     or new.joined is distinct from old.joined or new.university_id is distinct from old.university_id
     or new.verify_via is distinct from old.verify_via or new.id_note is distinct from old.id_note then
    raise exception 'You cannot change that part of an account.';
  end if;
  if new.student_no is distinct from old.student_no
     and not (old.verify_via = 'id' and old.id_status in ('needs_photo', 'rejected') and upper(coalesce(new.student_no, '')) ~ '^[A-Z0-9/-]{4,30}$') then
    raise exception 'You cannot change your student number now.';
  end if;
  if new.owner_status is distinct from old.owner_status
     and not (old.owner_status in ('incomplete', 'rejected') and new.owner_status = 'pending') then
    raise exception 'Only the Nestly team can approve owners.';
  end if;
  if new.id_status is distinct from old.id_status
     and not (old.verify_via = 'id' and old.id_status in ('needs_photo', 'rejected') and new.id_status = 'pending') then
    raise exception 'Only the Nestly team can approve a student ID.';
  end if;
  if new.id_status = 'pending' and old.id_status is distinct from 'pending' and not (
       exists (select 1 from docs d where d.owner_id = new.id and d.kind = 'student_id')
       and exists (select 1 from docs d where d.owner_id = new.id and d.kind = 'student_selfie')) then
    raise exception 'Add both photos first: your student ID and a selfie holding it.';
  end if;
  return new;
end $$;

/* ---------------------------------------------------------------- sign-in records */

create table if not exists public.login_events (
  id bigint generated by default as identity primary key,
  user_id uuid references public.profiles (id) on delete cascade,
  login text not null default '',        -- what was typed (email or username), for failed tries
  ok boolean not null,
  ip text not null default '',
  device text not null default '',       -- a random id kept by the browser
  agent text not null default '',        -- browser and system, shortened
  at timestamptz not null default now()
);
create index if not exists login_events_user_at on public.login_events (user_id, at desc);
create index if not exists login_events_login_at on public.login_events (lower(login), at desc);
alter table public.login_events enable row level security;
drop policy if exists "own or admin sign-ins" on public.login_events;
create policy "own or admin sign-ins" on public.login_events for select to authenticated using (user_id = auth.uid() or public.is_admin());

/* ---------------------------------------------------------------- security signals for admins */

-- Things worth a look, for the admin overview. Admins only.
create or replace function public.security_signals() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  return jsonb_build_object(
    'failed_logins', coalesce((select jsonb_agg(x) from (
       select lower(login) as login, count(*) as n, max(at) as last from login_events
       where not ok and at > now() - interval '24 hours' group by lower(login) having count(*) >= 5 order by count(*) desc limit 10) x), '[]'),
    'shared_payers', coalesce((select jsonb_agg(x) from (
       select regexp_replace(phone, '\D', '', 'g') as phone, count(distinct user_id) as students from payments
       where kind = 'booking' and created_at > now() - interval '30 days' and coalesce(phone, '') <> ''
       group by 1 having count(distinct user_id) >= 3 order by 2 desc limit 10) x), '[]'),
    'cancellations', coalesce((select jsonb_agg(x) from (
       select h.id as hostel_id, h.name, count(*) as n from bookings b join hostels h on h.id = b.hostel_id
       where b.status = 'cancelled' and b.at > now() - interval '7 days' group by h.id, h.name having count(*) >= 3 order by 3 desc limit 10) x), '[]'),
    'student_numbers', coalesce((select jsonb_agg(x) from (
       select u.short as uni, upper(p.student_no) as number, count(*) as n from profiles p join universities u on u.id = p.university_id
       where p.student_no is not null and p.id_status in ('pending', 'approved', 'rejected') group by u.short, upper(p.student_no) having count(*) >= 2 limit 10) x), '[]'),
    'payout_changes', coalesce((select jsonb_agg(x) from (
       select p.id as owner_id, p.name, a.payout_pending ->> 'name' as account_name, a.payout_review as review, a.payout_pending_at as at
       from owner_accounts a join profiles p on p.id = a.owner_id where a.payout_pending is not null order by a.payout_pending_at) x), '[]')
  );
end $$;
grant execute on function public.security_signals() to authenticated;

/* ---------------------------------------------------------------- security problem reports */

create table if not exists public.security_reports (
  id bigint generated by default as identity primary key,
  text text not null,
  contact text not null default '',
  at timestamptz not null default now(),
  closed boolean not null default false
);
alter table public.security_reports enable row level security;
drop policy if exists "admins read security reports" on public.security_reports;
create policy "admins read security reports" on public.security_reports for select to authenticated using (public.is_admin());
drop policy if exists "admins close security reports" on public.security_reports;
create policy "admins close security reports" on public.security_reports for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Anyone can report a security problem, without an account. At most 20 reports an hour from everyone together.
create or replace function public.report_security_problem(p_text text, p_contact text) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if length(trim(coalesce(p_text, ''))) < 20 then raise exception 'Describe the problem in a few sentences.'; end if;
  if not public.rate_ok('security-report', 20, 3600) then raise exception 'Too many reports just now. Try again later.'; end if;
  insert into security_reports (text, contact) values (left(trim(p_text), 4000), left(trim(coalesce(p_contact, '')), 200));
  insert into notifications (user_id, kind, title, text, "to")
    select id, 'review', 'Security problem reported', left(trim(p_text), 120), '/a/overview' from profiles where role = 'admin';
end $$;
grant execute on function public.report_security_problem(text, text) to anon, authenticated;

/* ---------------------------------------------------------------- clean-up of old data */

-- Deletes data Nestly no longer needs. The daily job runs it (see SETUP.md).
create or replace function public.purge_old_data() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare r jsonb := '{}'; n int;
begin
  delete from visitors where date < (now() at time zone 'Africa/Kampala')::date - 30; get diagnostics n = row_count; r := r || jsonb_build_object('visitors', n);
  delete from login_events where at < now() - interval '90 days'; get diagnostics n = row_count; r := r || jsonb_build_object('login_events', n);
  delete from rate_hits where at < now() - interval '1 day'; get diagnostics n = row_count; r := r || jsonb_build_object('rate_hits', n);
  delete from notifications where read and at < now() - interval '180 days'; get diagnostics n = row_count; r := r || jsonb_build_object('notifications', n);
  delete from outbox where (sent_at is not null and sent_at < now() - interval '30 days') or created_at < now() - interval '90 days'; get diagnostics n = row_count; r := r || jsonb_build_object('outbox', n);
  delete from payments where status = 'failed' and created_at < now() - interval '180 days'; get diagnostics n = row_count; r := r || jsonb_build_object('failed_payments', n);
  -- Accounts that never confirmed their email after 30 days, and ID accounts that never sent photos after 60 days.
  delete from auth.users u where u.email_confirmed_at is null and u.created_at < now() - interval '30 days'
    and exists (select 1 from profiles p where p.id = u.id and p.role = 'student'); get diagnostics n = row_count; r := r || jsonb_build_object('unconfirmed_accounts', n);
  delete from auth.users u where u.created_at < now() - interval '60 days'
    and exists (select 1 from profiles p where p.id = u.id and p.role = 'student' and p.id_status = 'needs_photo'); get diagnostics n = row_count; r := r || jsonb_build_object('no_photo_accounts', n);
  return r;
end $$;
revoke execute on function public.purge_old_data() from public, anon, authenticated;

-- The server functions use these with the service key.
grant execute on function public.queue_mail(text, text, text), public.apply_due_payouts() to service_role;

-- Invite codes are short, so checking them is rate limited (300 checks in 10 minutes across the whole site) and
-- the answer no longer shows the invited person's email.
drop function if exists public.lookup_invite(text);
create or replace function public.lookup_invite(p_code text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.rate_ok('invite-lookup', 300, 600) then raise exception 'Too many invite checks just now. Try again in a few minutes.'; end if;
  select jsonb_build_object('code', i.code, 'hostelId', i.hostel_id, 'name', i.name, 'email', '',
    'invitedBy', i.invited_by, 'used', i.used, 'cancelled', i.cancelled, 'expired', i.at < now() - interval '7 days',
    'hostel', jsonb_build_object('id', h.id, 'name', h.name, 'seed', h.seed, 'floors', h.floors, 'cols', h.cols, 'photoUrl', h.photo_url, 'photos', h.photos, 'area', h.area))
  into r from invites i join hostels h on h.id = i.hostel_id where upper(i.code) = upper(trim(p_code));
  return r;
end $$;
grant execute on function public.lookup_invite(text) to anon, authenticated;

-- The signed-in owner cancels their own waiting payout change from the payout settings page.
create or replace function public.cancel_my_payout_change() returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  update owner_accounts set payout_pending = null, payout_pending_at = null, payout_review = false, payout_cancel = null where owner_id = auth.uid();
  insert into audit (actor_id, actor_role, action, target, detail) select auth.uid(), 'owner', 'Cancelled payout change', name, 'From the payout settings page' from profiles where id = auth.uid();
end $$;
grant execute on function public.cancel_my_payout_change() to authenticated;
