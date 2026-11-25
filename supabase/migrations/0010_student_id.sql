-- Nestly database, part 10: students can be verified by student ID instead of a university email.
--
-- Two ways to become a verified student:
-- 1. University email (as before): the email must end with the university's domain and is confirmed by its link.
-- 2. Student ID: any email (for example Gmail), the student number and a photo of the student ID card.
--    The student-signup server function creates the account already confirmed, so no email has to arrive.
--    An admin checks the ID in Reviews. Approval sets email_verified, the same flag booking already checks.
--
-- Privacy: the ID photo is deleted as soon as an admin approves or rejects it. Only the result is kept.
-- Each student number can be used by one account per university.
-- Run after 0001 to 0009.

alter table public.profiles
  add column if not exists verify_via text not null default 'email' check (verify_via in ('email', 'id')),
  add column if not exists student_no text,
  add column if not exists id_status text not null default 'none' check (id_status in ('none', 'pending', 'approved', 'rejected')),
  add column if not exists id_note text;
create unique index if not exists profiles_student_no_unique on public.profiles (university_id, upper(student_no)) where student_no is not null;

alter table public.docs drop constraint if exists docs_kind_check;
alter table public.docs add constraint docs_kind_check check (kind in ('national_id', 'selfie', 'ownership', 'trading_licence', 'student_id'));

-- New accounts. Same as 0002, plus the student ID route: no email domain check, a student number instead,
-- and the account starts unverified with its ID waiting for review, even though the email is confirmed.
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
    -- Only a real, unused invite for that hostel makes a custodian. Anything else is refused.
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
      if exists (select 1 from profiles p where p.university_id = uni.id and upper(p.student_no) = sno) then
        raise exception 'An account already uses this student number. Log in instead, or contact support@nestly.app.';
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
    case when by_id then 'pending' else 'none' end
  );
  if r = 'owner' then insert into owner_accounts (owner_id) values (new.id); end if;
  return new;
end $$;

-- Confirming the email verifies a student only on the university email route. On the ID route an admin decides.
create or replace function public.handle_email_confirmed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    update profiles set email_verified = true, verified_until = (now() + interval '1 year')::date
    where id = new.id and verify_via = 'email';
  end if;
  if new.email is distinct from old.email then
    update profiles set email = lower(new.email) where id = new.id;
  end if;
  return new;
end $$;

-- Same as 0002, plus: people cannot change how they were verified, their student number or the admin's note,
-- and the only ID status change they can make is sending a new photo after a rejection (rejected to pending).
create or replace function public.guard_profile() returns trigger
language plpgsql as $$
begin
  if not public.from_app() or public.is_admin() then return new; end if;
  if new.id is distinct from old.id or new.role is distinct from old.role or new.email is distinct from old.email
     or new.email_verified is distinct from old.email_verified or new.verified_until is distinct from old.verified_until
     or new.suspended is distinct from old.suspended or new.suspend_reason is distinct from old.suspend_reason
     or new.hostel_id is distinct from old.hostel_id or new.owner_note is distinct from old.owner_note
     or new.joined is distinct from old.joined or new.university_id is distinct from old.university_id
     or new.verify_via is distinct from old.verify_via or new.student_no is distinct from old.student_no
     or new.id_note is distinct from old.id_note then
    raise exception 'You cannot change that part of an account.';
  end if;
  if new.owner_status is distinct from old.owner_status
     and not (old.owner_status in ('incomplete', 'rejected') and new.owner_status = 'pending') then
    raise exception 'Only the Nestly team can approve owners.';
  end if;
  if new.id_status is distinct from old.id_status
     and not (old.verify_via = 'id' and old.id_status = 'rejected' and new.id_status = 'pending') then
    raise exception 'Only the Nestly team can approve a student ID.';
  end if;
  return new;
end $$;
