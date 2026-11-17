-- Nestly database, part 2 of 4: who can see and change what.
-- Row level security (RLS) is on for every table. The rules mirror the app:
--   students see live hostels and their own bookings;
--   owners manage their own hostels, rooms, staff and invites;
--   custodians run the one hostel they work at;
--   admins see everything.
-- Values the app must not be able to fake (roles, approvals, ratings, payments) are guarded by triggers.

/* ---------------------------------------------------------------- helpers
   Security definer so they can look things up without tripping RLS on the same tables. */

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and not suspended
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from profiles where id = auth.uid() and not suspended), false)
$$;

create or replace function public.owns_hostel(hid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from hostels where id = hid and owner_id = auth.uid())
$$;

create or replace function public.works_at(hid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'custodian' and hostel_id = hid and not suspended)
$$;

-- Owner, custodian or admin of a hostel.
create or replace function public.staff_of(hid text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.owns_hostel(hid) or public.works_at(hid)
$$;

-- The signed-in student has a booking (not cancelled) at this hostel.
create or replace function public.stays_at(hid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from bookings where user_id = auth.uid() and hostel_id = hid and status <> 'cancelled')
$$;

-- A student who booked at a hostel the signed-in person runs, so staff can see who their tenants are.
create or replace function public.is_my_student(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from bookings b where b.user_id = uid and public.staff_of(b.hostel_id))
$$;

-- Requests from the browser run as these roles. Database functions and the SQL editor do not.
create or replace function public.from_app() returns boolean
language sql stable as $$ select current_user in ('anon', 'authenticated') $$;

/* ---------------------------------------------------------------- new accounts */

-- Creates the profile when someone signs up. Students must use their university's email domain.
-- Custodian accounts are made by the accept-invite function, which sends role and hostel in the metadata.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  r text := coalesce(meta->>'role', 'student');
  uni universities;
  inv invites;
begin
  if r not in ('student', 'owner', 'custodian') then r := 'student'; end if;
  if r = 'custodian' then
    -- Only a real, unused invite for that hostel makes a custodian. Anything else is refused.
    select * into inv from invites where upper(code) = upper(coalesce(meta->>'invite', '')) and hostel_id = meta->>'hostel_id'
      and not used and not cancelled and at > now() - interval '7 days';
    if inv.code is null then raise exception 'This invite is no longer valid.'; end if;
    update invites set used = true where code = inv.code;
  end if;
  if r = 'student' then
    select * into uni from universities where id = meta->>'university_id';
    if uni.id is null then raise exception 'Choose your university first.'; end if;
    if not (lower(new.email) like '%@' || uni.domain or lower(new.email) like '%.' || uni.domain) then
      raise exception 'Use your % student email. It must end with %.', uni.short, uni.domain;
    end if;
  end if;
  insert into profiles (id, role, name, email, username, phone, university_id, hostel_id, owner_status, email_verified, verified_until)
  values (
    new.id, r, coalesce(meta->>'name', ''), lower(new.email), nullif(lower(meta->>'username'), ''), nullif(meta->>'phone', ''),
    case when r = 'student' then meta->>'university_id' end,
    case when r = 'custodian' then meta->>'hostel_id' end,
    case when r = 'owner' then 'incomplete' end,
    new.email_confirmed_at is not null,
    case when new.email_confirmed_at is not null then (now() + interval '1 year')::date end
  );
  if r = 'owner' then insert into owner_accounts (owner_id) values (new.id); end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Marks the student email as confirmed once they click the link. Confirmation lasts a year.
create or replace function public.handle_email_confirmed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    update profiles set email_verified = true, verified_until = (now() + interval '1 year')::date where id = new.id;
  end if;
  if new.email is distinct from old.email then
    update profiles set email = lower(new.email) where id = new.id;
  end if;
  return new;
end $$;
create trigger on_auth_user_updated after update on auth.users for each row execute function public.handle_email_confirmed();

/* ---------------------------------------------------------------- guards */

-- People can edit their own name, phone, photo and username. Only admins change roles, approvals and pauses.
-- An owner can send themselves for review (incomplete or rejected to pending), nothing more.
create or replace function public.guard_profile() returns trigger
language plpgsql as $$
begin
  if not public.from_app() or public.is_admin() then return new; end if;
  if new.id is distinct from old.id or new.role is distinct from old.role or new.email is distinct from old.email
     or new.email_verified is distinct from old.email_verified or new.verified_until is distinct from old.verified_until
     or new.suspended is distinct from old.suspended or new.suspend_reason is distinct from old.suspend_reason
     or new.hostel_id is distinct from old.hostel_id or new.owner_note is distinct from old.owner_note
     or new.joined is distinct from old.joined or new.university_id is distinct from old.university_id then
    raise exception 'You cannot change that part of an account.';
  end if;
  if new.owner_status is distinct from old.owner_status
     and not (old.owner_status in ('incomplete', 'rejected') and new.owner_status = 'pending') then
    raise exception 'Only the Nestly team can approve owners.';
  end if;
  return new;
end $$;
create trigger guard_profile before update on public.profiles for each row execute function public.guard_profile();

-- Owners edit their listing. Only admins publish, pause, verify or change ratings and counts.
-- Owners can send a listing for review, and a live listing goes back to review after big edits.
-- Booked counts ("taken") inside room types are kept by the server, never by the browser.
create or replace function public.guard_hostel() returns trigger
language plpgsql as $$
begin
  if not public.from_app() or public.is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.status := 'draft'; new.verified := false; new.rating := 0; new.n_rev := 0; new.views := 0; new.saves := 0;
    new.listed_at := null; new.paused_for := null; new.suspend_reason := null; new.review_note := null; new.review_sections := null;
    new.rooms := (select coalesce(jsonb_agg(jsonb_set(v, '{taken}', '0')), '[]'::jsonb) from jsonb_array_elements(new.rooms) v);
    return new;
  end if;
  if public.works_at(old.id) and not public.owns_hostel(old.id) then
    -- Custodians only update room counts when they take rooms in or out of use.
    if (to_jsonb(new) - 'rooms') is distinct from (to_jsonb(old) - 'rooms') then raise exception 'Custodians cannot edit the listing.'; end if;
  end if;
  if new.owner_id is distinct from old.owner_id or new.verified is distinct from old.verified or new.rating is distinct from old.rating
     or new.n_rev is distinct from old.n_rev or new.paused_for is distinct from old.paused_for or new.suspend_reason is distinct from old.suspend_reason
     or new.review_note is distinct from old.review_note or new.review_sections is distinct from old.review_sections
     or new.listed_at is distinct from old.listed_at or new.created_at is distinct from old.created_at then
    raise exception 'Only the Nestly team can change that part of a listing.';
  end if;
  new.views := old.views; new.saves := old.saves;
  if new.status is distinct from old.status
     and not (new.status = 'in_review' and old.status in ('draft', 'changes_requested', 'live')) then
    raise exception 'Only the Nestly team can publish or pause a listing.';
  end if;
  -- Keep the server's booked counts for every room type that already existed.
  new.rooms := (
    select coalesce(jsonb_agg(case when o.v is null then n.v else jsonb_set(n.v, '{taken}', coalesce(o.v->'taken', '0')) end order by n.i), '[]'::jsonb)
    from jsonb_array_elements(new.rooms) with ordinality n(v, i)
    left join lateral (select v from jsonb_array_elements(old.rooms) v where v->>'t' = n.v->>'t' limit 1) o on true
  );
  return new;
end $$;
create trigger guard_hostel before insert or update on public.hostels for each row execute function public.guard_hostel();

-- Students can cancel or mark a booking as rated. Staff give rooms and check people in.
-- Prices, owners and payment details never change from the browser.
create or replace function public.guard_booking() returns trigger
language plpgsql as $$
begin
  if not public.from_app() or public.is_admin() then return new; end if;
  if new.user_id is distinct from old.user_id or new.hostel_id is distinct from old.hostel_id or new.fee is distinct from old.fee
     or new.pay_ref is distinct from old.pay_ref or new.tx_ref is distinct from old.tx_ref or new.at is distinct from old.at
     or new.sem is distinct from old.sem or new.method is distinct from old.method or new.paid_on is distinct from old.paid_on then
    raise exception 'Payment details cannot be changed.';
  end if;
  if public.staff_of(old.hostel_id) then
    if new.status not in ('paid', 'checked-in', 'completed', 'cancelled', 'rated') then raise exception 'Not a valid booking status.'; end if;
    return new;
  end if;
  if old.user_id = auth.uid() then
    if new.room_no is distinct from old.room_no or new.room is distinct from old.room then raise exception 'Only the custodian gives rooms.'; end if;
    if new.status is distinct from old.status and not ((old.status = 'paid' and new.status = 'cancelled') or (old.status = 'completed' and new.status = 'rated')) then
      raise exception 'You cannot change this booking like that.';
    end if;
    return new;
  end if;
  raise exception 'Not your booking.';
end $$;
create trigger guard_booking before update on public.bookings for each row execute function public.guard_booking();

-- Owners reply to reviews. Admins hide them. Writers cannot change a review after posting.
create or replace function public.guard_review() returns trigger
language plpgsql as $$
begin
  if not public.from_app() or public.is_admin() then return new; end if;
  if (to_jsonb(new) - 'reply') is distinct from (to_jsonb(old) - 'reply') then raise exception 'Only the reply can be changed.'; end if;
  if not public.owns_hostel(old.hostel_id) then raise exception 'Only the hostel owner can reply.'; end if;
  return new;
end $$;
create trigger guard_review before update on public.reviews for each row execute function public.guard_review();

-- Only admins accept or reject documents.
create or replace function public.guard_doc() returns trigger
language plpgsql as $$
begin
  if not public.from_app() or public.is_admin() then return new; end if;
  if tg_op = 'INSERT' then new.status := 'pending'; new.note := null; return new; end if;
  if new.status is distinct from old.status or new.note is distinct from old.note or new.owner_id is distinct from old.owner_id then
    raise exception 'Only the Nestly team reviews documents.';
  end if;
  return new;
end $$;
create trigger guard_doc before insert or update on public.docs for each row execute function public.guard_doc();

-- Owners cannot mark their own subscription as paid; payments are recorded by the server or an admin.
create or replace function public.guard_owner_account() returns trigger
language plpgsql as $$
begin
  if not public.from_app() or public.is_admin() then return new; end if;
  if tg_op = 'INSERT' then new.sub_paid_until := null; new.sub_grace_until := null; new.sub_reminded_at := null; return new; end if;
  if new.sub_paid_until is distinct from old.sub_paid_until or new.sub_grace_until is distinct from old.sub_grace_until
     or new.sub_reminded_at is distinct from old.sub_reminded_at or new.owner_id is distinct from old.owner_id then
    raise exception 'Subscription dates are set by Nestly.';
  end if;
  return new;
end $$;
create trigger guard_owner_account before insert or update on public.owner_accounts for each row execute function public.guard_owner_account();

-- Keeps "taken" in each room type in step with bookings, so the browser never has to be trusted with it.
create or replace function public.count_taken() returns trigger
language plpgsql security definer set search_path = public as $$
declare d int; hid text; t text;
begin
  if tg_op = 'INSERT' then
    if new.status in ('cancelled', 'pending') then return new; end if;
    d := 1; hid := new.hostel_id; t := new.room;
  elsif new.status = 'cancelled' and old.status not in ('cancelled', 'pending') then
    d := -1; hid := old.hostel_id; t := old.room;
  elsif old.status = 'pending' and new.status not in ('cancelled', 'pending') then
    d := 1; hid := new.hostel_id; t := new.room;
  else
    return new;
  end if;
  update hostels set rooms = (
    select jsonb_agg(case when v->>'t' = t then jsonb_set(v, '{taken}', to_jsonb(greatest(0, coalesce((v->>'taken')::int, 0) + d))) else v end order by i)
    from jsonb_array_elements(rooms) with ordinality x(v, i)
  ) where id = hid;
  return new;
end $$;
create trigger count_taken after insert or update of status on public.bookings for each row execute function public.count_taken();

-- Keeps a hostel's rating and review count in step with visible reviews.
create or replace function public.count_reviews() returns trigger
language plpgsql security definer set search_path = public as $$
declare hid text := coalesce(new.hostel_id, old.hostel_id);
begin
  update hostels h set
    n_rev = (select count(*) from reviews r where r.hostel_id = hid and not r.hidden),
    rating = coalesce((select round(avg(stars)::numeric, 1) from reviews r where r.hostel_id = hid and not r.hidden), 0)
  where h.id = hid;
  return null;
end $$;
create trigger count_reviews after insert or delete or update of hidden, stars on public.reviews for each row execute function public.count_reviews();

/* ---------------------------------------------------------------- row level security */

alter table public.universities enable row level security;
alter table public.profiles enable row level security;
alter table public.owner_accounts enable row level security;
alter table public.hostels enable row level security;
alter table public.reviews enable row level security;
alter table public.bookings enable row level security;
alter table public.saved enable row level security;
alter table public.rooms enable row level security;
alter table public.tenants enable row level security;
alter table public.visitors enable row level security;
alter table public.notices enable row level security;
alter table public.notifications enable row level security;
alter table public.invites enable row level security;
alter table public.docs enable row level security;
alter table public.flags enable row level security;
alter table public.sub_payments enable row level security;
alter table public.config enable row level security;
alter table public.audit enable row level security;

-- Universities and settings: anyone reads, admins write.
create policy "read universities" on public.universities for select using (true);
create policy "admins write universities" on public.universities for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read config" on public.config for select using (true);
create policy "admins write config" on public.config for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Profiles: yourself; owners and custodians are business contacts any signed-in person can see;
-- students are visible to staff of hostels they booked at; admins see all.
create policy "read profiles" on public.profiles for select to authenticated using (
  id = auth.uid() or public.is_admin() or role in ('owner', 'custodian') or public.is_my_student(id));
create policy "edit own profile" on public.profiles for update to authenticated using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());
create policy "admins delete profiles" on public.profiles for delete to authenticated using (public.is_admin());

create policy "own owner account" on public.owner_accounts for select to authenticated using (owner_id = auth.uid() or public.is_admin());
create policy "create own owner account" on public.owner_accounts for insert to authenticated with check (owner_id = auth.uid() or public.is_admin());
create policy "edit own owner account" on public.owner_accounts for update to authenticated using (owner_id = auth.uid() or public.is_admin()) with check (owner_id = auth.uid() or public.is_admin());

-- Hostels: live ones are public. Owners, their custodians, admins and students who booked there see the rest.
create policy "read hostels" on public.hostels for select using (
  status = 'live' or owner_id = auth.uid() or public.staff_of(id) or public.stays_at(id));
create policy "owners add hostels" on public.hostels for insert to authenticated with check (owner_id = auth.uid() and public.my_role() = 'owner');
create policy "staff edit hostels" on public.hostels for update to authenticated using (owner_id = auth.uid() or public.staff_of(id)) with check (owner_id = auth.uid() or public.staff_of(id));
create policy "owners delete drafts" on public.hostels for delete to authenticated using ((public.owns_hostel(id) and status = 'draft') or public.is_admin());

-- Reviews: visible unless hidden. Students who stayed can write one.
create policy "read reviews" on public.reviews for select using (not hidden or public.is_admin() or public.owns_hostel(hostel_id));
create policy "guests of the hostel write reviews" on public.reviews for insert to authenticated with check (user_id = auth.uid() and public.stays_at(hostel_id));
create policy "owners reply, admins hide" on public.reviews for update to authenticated using (public.owns_hostel(hostel_id) or public.is_admin());
create policy "admins delete reviews" on public.reviews for delete to authenticated using (public.is_admin());

-- Bookings: the student and the hostel's staff. New bookings come from the payment function, not the browser.
create policy "read bookings" on public.bookings for select to authenticated using (user_id = auth.uid() or public.staff_of(hostel_id));
create policy "student or staff update bookings" on public.bookings for update to authenticated using (user_id = auth.uid() or public.staff_of(hostel_id));

create policy "own saved" on public.saved for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Rooms: the owner sets them up; custodians can take rooms in and out of use.
create policy "staff read rooms" on public.rooms for select to authenticated using (public.staff_of(hostel_id));
create policy "owners add rooms" on public.rooms for insert to authenticated with check (public.owns_hostel(hostel_id) or public.is_admin());
create policy "staff edit rooms" on public.rooms for update to authenticated using (public.staff_of(hostel_id)) with check (public.staff_of(hostel_id));
create policy "owners delete rooms" on public.rooms for delete to authenticated using (public.owns_hostel(hostel_id) or public.is_admin());

-- Tenants: the hostel's staff, and each student sees their own row.
create policy "read tenants" on public.tenants for select to authenticated using (public.staff_of(hostel_id) or user_id = auth.uid());
create policy "staff add tenants" on public.tenants for insert to authenticated with check (public.staff_of(hostel_id));
create policy "staff edit tenants" on public.tenants for update to authenticated using (public.staff_of(hostel_id)) with check (public.staff_of(hostel_id));

-- Visitors: the hostel's staff. Visitors at the gate sign in through sign_in_visitor() below.
create policy "staff read visitors" on public.visitors for select to authenticated using (public.staff_of(hostel_id));
create policy "custodians log visitors" on public.visitors for insert to authenticated with check (public.staff_of(hostel_id));
create policy "custodians update visitors" on public.visitors for update to authenticated using (public.staff_of(hostel_id)) with check (public.staff_of(hostel_id));

-- Notices: staff post them; tenants read them.
create policy "read notices" on public.notices for select to authenticated using (public.staff_of(hostel_id) or public.stays_at(hostel_id));
create policy "staff post notices" on public.notices for insert to authenticated with check (public.staff_of(hostel_id));
create policy "staff delete notices" on public.notices for delete to authenticated using (public.staff_of(hostel_id));

-- Notifications: you read and clear your own. Any signed-in person can send one (the app tells owners
-- about bookings, students about rooms, and so on). Nobody can read someone else's.
create policy "read own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "send notifications" on public.notifications for insert to authenticated with check (auth.uid() is not null);
create policy "mark own notifications" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "clear own notifications" on public.notifications for delete to authenticated using (user_id = auth.uid());

-- Invites: the hostel's owner. Custodians check a code through lookup_invite() below.
create policy "owners manage invites" on public.invites for all to authenticated using (public.owns_hostel(hostel_id) or public.is_admin()) with check (public.owns_hostel(hostel_id) or public.is_admin());

-- Documents: the owner who uploaded them, and admins.
create policy "own documents" on public.docs for select to authenticated using (owner_id = auth.uid() or public.is_admin());
create policy "upload documents" on public.docs for insert to authenticated with check (owner_id = auth.uid());
create policy "update documents" on public.docs for update to authenticated using (owner_id = auth.uid() or public.is_admin()) with check (owner_id = auth.uid() or public.is_admin());
create policy "delete own documents" on public.docs for delete to authenticated using ((owner_id = auth.uid() and status = 'pending') or public.is_admin());

-- Reports: anyone signed in can report; only the reporter and admins can read them.
create policy "send reports" on public.flags for insert to authenticated with check (reported_by = auth.uid());
create policy "read reports" on public.flags for select to authenticated using (reported_by = auth.uid() or public.is_admin());
create policy "admins close reports" on public.flags for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Subscription payments: owners see theirs; admins record cash payments. App payments come from the payment function.
create policy "read subscription payments" on public.sub_payments for select to authenticated using (owner_id = auth.uid() or public.is_admin());
create policy "admins record payments" on public.sub_payments for insert to authenticated with check (public.is_admin());

-- Activity log: everyone writes their own actions; only admins read it.
create policy "write own activity" on public.audit for insert to authenticated with check (actor_id = auth.uid());
create policy "admins read activity" on public.audit for select to authenticated using (public.is_admin());

/* ---------------------------------------------------------------- functions the app calls directly */

-- Lets people log in with their username. Returns the account's email, or null.
create or replace function public.email_for_login(p_login text) returns text
language sql stable security definer set search_path = public as $$
  select case when position('@' in p_login) > 0 then lower(trim(p_login))
              else (select email from profiles where lower(username) = lower(trim(p_login)) limit 1) end
$$;

-- True when nobody else has this username.
create or replace function public.username_free(p_username text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from profiles where lower(username) = lower(trim(p_username)) and id is distinct from auth.uid())
$$;

-- Checks a custodian invite code without signing in. Shows only what the invite page needs.
create or replace function public.lookup_invite(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('code', i.code, 'hostelId', i.hostel_id, 'name', i.name, 'email', i.email,
    'invitedBy', i.invited_by, 'used', i.used, 'cancelled', i.cancelled, 'expired', i.at < now() - interval '7 days',
    'hostel', jsonb_build_object('id', h.id, 'name', h.name, 'seed', h.seed, 'floors', h.floors, 'cols', h.cols, 'photoUrl', h.photo_url, 'photos', h.photos, 'area', h.area))
  from invites i join hostels h on h.id = i.hostel_id where upper(i.code) = upper(trim(p_code))
$$;

-- Counts a listing view or save for the owner's "How students find you" box. Anyone can call it.
create or replace function public.bump_hostel(p_hostel text, p_field text, p_by int default 1) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_field = 'views' then update hostels set views = views + 1 where id = p_hostel and status = 'live';
  elsif p_field = 'saves' then update hostels set saves = greatest(0, saves + sign(p_by)::int) where id = p_hostel;
  end if;
end $$;

grant execute on function public.email_for_login(text), public.lookup_invite(text), public.bump_hostel(text, text, int) to anon, authenticated;
grant execute on function public.username_free(text) to authenticated;

/* ---------------------------------------------------------------- table access for the app
   Row level security above decides which rows; these grants let the app's roles reach the tables at all.
   Supabase usually adds them by itself; they are repeated here so nothing depends on project defaults. */
grant usage on schema public to anon, authenticated;
grant select on public.universities, public.config, public.hostels, public.reviews to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
