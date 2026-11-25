-- Nestly database, part 11: a stronger student ID check, and a per-university choice of how students are verified.
--
-- 1. Universities say whether their student emails actually arrive (email_ok). It starts off for every university,
--    so new students use the student ID check everywhere until an admin has seen confirmations getting through.
-- 2. On the student ID route the personal email (for example Gmail) is confirmed by a link, like any sign-up.
--    After confirming, the student adds two photos: the front of the ID and a selfie holding it. Until then the
--    account waits in 'needs_photo' and is not shown to admins.
-- 3. A student number is held only by an approved account. Pending or rejected claims no longer block anyone,
--    so nobody can lock a real student out by claiming their number first.
-- 4. Approval lasts until the date the admin enters from the card, at most one year (set by the app).
-- Run after 0001 to 0010.

alter table public.universities add column if not exists email_ok boolean not null default false;

alter table public.profiles drop constraint if exists profiles_id_status_check;
alter table public.profiles add constraint profiles_id_status_check check (id_status in ('none', 'needs_photo', 'pending', 'approved', 'rejected'));

drop index if exists public.profiles_student_no_unique;
create unique index if not exists profiles_student_no_approved on public.profiles (university_id, upper(student_no)) where id_status = 'approved';

alter table public.docs drop constraint if exists docs_kind_check;
alter table public.docs add constraint docs_kind_check check (kind in ('national_id', 'selfie', 'ownership', 'trading_licence', 'student_id', 'student_selfie'));

-- New accounts. Same as 0010, except: the student number only has to be free of approved accounts,
-- and an ID-route account starts in 'needs_photo' (it has no photos yet).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  r text := coalesce(meta->>'role', 'student');
  by_id boolean := coalesce(meta->>'verify', '') = 'id';
  sno text := nullif(upper(btrim(coalesce(meta->>'student_no', ''))), '');
  uni universities;
  inv invites;
begin
  if r not in ('student', 'owner', 'custodian') then r := 'student'; end if;
  if r <> 'student' then by_id := false; end if;
  if r = 'custodian' then
    select * into inv from invites where upper(code) = upper(coalesce(meta->>'invite', '')) and hostel_id = meta->>'hostel_id'
      and not used and not cancelled and at > now() - interval '7 days';
    if inv.code is null then raise exception 'This invite is no longer valid.'; end if;
    update invites set used = true where code = inv.code;
  end if;
  if r = 'student' then
    select * into uni from universities where id = meta->>'university_id';
    if uni.id is null then raise exception 'Choose your university first.'; end if;
    if by_id then
      if sno is null or sno !~ '^[A-Z0-9/-]{4,30}$' then raise exception 'Enter your student number as it is on your student ID.'; end if;
      if exists (select 1 from profiles p where p.university_id = uni.id and upper(p.student_no) = sno and p.id_status = 'approved') then
        raise exception 'This student number is already verified on another account. If it is yours, contact support@nestly.app.';
      end if;
    elsif not (lower(new.email) like '%@' || uni.domain or lower(new.email) like '%.' || uni.domain) then
      raise exception 'Use your % student email. It must end with %.', uni.short, uni.domain;
    end if;
  end if;
  insert into profiles (id, role, name, email, username, phone, university_id, hostel_id, owner_status, email_verified, verified_until,
    verify_via, student_no, id_status)
  values (
    new.id, r, coalesce(meta->>'name', ''), lower(new.email), nullif(lower(meta->>'username'), ''), nullif(meta->>'phone', ''),
    case when r = 'student' then meta->>'university_id' end,
    case when r = 'custodian' then meta->>'hostel_id' end,
    case when r = 'owner' then 'incomplete' end,
    not by_id and new.email_confirmed_at is not null,
    case when not by_id and new.email_confirmed_at is not null then (now() + interval '1 year')::date end,
    case when by_id then 'id' else 'email' end,
    case when by_id then sno end,
    case when by_id then 'needs_photo' else 'none' end
  );
  if r = 'owner' then insert into owner_accounts (owner_id) values (new.id); end if;
  return new;
end $$;

-- Same as 0010, plus: a student on the ID route may fix their student number and send photos while the account
-- is waiting for photos or was rejected. Only the Nestly team can approve or reject.
create or replace function public.guard_profile() returns trigger
language plpgsql as $$
begin
  if not public.from_app() or public.is_admin() then return new; end if;
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
  -- Sending for review needs both photos.
  if new.id_status = 'pending' and old.id_status is distinct from 'pending' and not (
       exists (select 1 from docs d where d.owner_id = new.id and d.kind = 'student_id')
       and exists (select 1 from docs d where d.owner_id = new.id and d.kind = 'student_selfie')) then
    raise exception 'Add both photos first: your student ID and a selfie holding it.';
  end if;
  return new;
end $$;

-- Tell every admin when a student sends their ID photos for review (first time or after a rejection).
create or replace function public.notify_id_review() returns trigger
language plpgsql security definer set search_path = public as $$
declare u universities;
begin
  if new.id_status = 'pending' and old.id_status is distinct from 'pending' then
    select * into u from universities where id = new.university_id;
    insert into notifications (user_id, kind, title, text, "to")
    select p.id, 'review', 'Student ID to check',
      new.name || ' (' || coalesce(u.short, '') || ') sent their student ID' || case when old.id_status = 'rejected' then ' again.' else '.' end,
      '/a/reviews?tab=students'
    from profiles p where p.role = 'admin';
  end if;
  return new;
end $$;
drop trigger if exists notify_id_review on public.profiles;
create trigger notify_id_review after update of id_status on public.profiles for each row execute function public.notify_id_review();
