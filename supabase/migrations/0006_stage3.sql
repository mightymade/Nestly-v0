-- Nestly database, part 6: the visitor page at the gate, removing custodians, cancelled bookings, reviews and documents.
-- Run it after 0005. It is safe to run more than once.

/* ---------------------------------------------------------------- visitors at the gate */

-- A visitor scans the gate QR on their own phone. They have no account, so these functions do the
-- few things the visitor page needs, and nothing more. Times are Uganda time.

-- "Who are you visiting?": residents whose name or room matches what the visitor typed.
-- At least two letters, at most six results, and only at a live hostel, so nobody can list who lives where.
create or replace function public.search_residents(p_hostel text, p_q text)
returns table (id text, name text, room text)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, t.room from tenants t
  join hostels h on h.id = t.hostel_id and h.status = 'live'
  where t.hostel_id = p_hostel and t.status = 'in' and t.room_id is not null
    and length(trim(coalesce(p_q, ''))) >= 2
    and (t.name || ' ' || t.room) ilike '%' || trim(p_q) || '%'
  order by t.name limit 6;
$$;

-- Signs a visitor in. Checks the person they visit really lives in that room. Returns the visit.
create or replace function public.visitor_sign_in(p_hostel text, p_name text, p_room text, p_host text, p_phone text)
returns visitors
language plpgsql volatile security definer set search_path = public as $$
declare v visitors; ph text := regexp_replace(coalesce(p_phone, ''), '[\s-]', '', 'g');
begin
  if not exists (select 1 from hostels where id = p_hostel and status = 'live') then raise exception 'This hostel is not taking visitors on Nestly.'; end if;
  if array_length(regexp_split_to_array(trim(coalesce(p_name, '')), '\s+'), 1) < 2 or length(trim(p_name)) > 60 then raise exception 'Enter your first and last name.'; end if;
  if not (ph ~ '^07\d{8}$' or ph ~ '^\+?2567\d{8}$') then raise exception 'Enter a 10-digit number, like 0772 123 456.'; end if;
  if not exists (select 1 from tenants where hostel_id = p_hostel and status = 'in' and room = p_room and name = p_host) then
    raise exception 'Choose who you are visiting from the list.';
  end if;
  insert into visitors (id, hostel_id, name, room, host, phone, tin, tout, via, date)
  values ('vs' || replace(gen_random_uuid()::text, '-', ''), p_hostel, trim(p_name), p_room, p_host, trim(p_phone),
          to_char(now() at time zone 'Africa/Kampala', 'HH24:MI'), null, 'QR', (now() at time zone 'Africa/Kampala')::date)
  returning * into v;
  return v;
end $$;

-- The visitor's own pass, so scanning again on the way out shows it. The id is long and random, so only their phone knows it.
create or replace function public.visitor_pass(p_id text)
returns visitors
language sql stable security definer set search_path = public as $$
  select * from visitors where id = p_id and date >= (now() at time zone 'Africa/Kampala')::date - 1;
$$;

-- The visitor signs themselves out.
create or replace function public.visitor_sign_out(p_id text)
returns visitors
language plpgsql volatile security definer set search_path = public as $$
declare v visitors;
begin
  update visitors set tout = to_char(now() at time zone 'Africa/Kampala', 'HH24:MI')
  where id = p_id and tout is null and date >= (now() at time zone 'Africa/Kampala')::date - 1
  returning * into v;
  if v.id is null then raise exception 'This visit has already ended.'; end if;
  return v;
end $$;

grant execute on function public.search_residents(text, text), public.visitor_sign_in(text, text, text, text, text),
  public.visitor_pass(text), public.visitor_sign_out(text) to anon, authenticated;

/* ---------------------------------------------------------------- staff */

-- An owner removes one of their custodians. Owners cannot edit other people's accounts directly, so this does it for them.
create or replace function public.remove_custodian(p_user uuid)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare c profiles;
begin
  select * into c from profiles where id = p_user and role = 'custodian';
  if c.id is null or not (public.owns_hostel(c.hostel_id) or public.is_admin()) then raise exception 'You can only remove your own staff.'; end if;
  update profiles set suspended = true, suspend_reason = 'Removed by the owner' where id = p_user;
end $$;
revoke execute on function public.remove_custodian(uuid) from public, anon;
grant execute on function public.remove_custodian(uuid) to authenticated;

/* ---------------------------------------------------------------- bookings and reviews */

-- When a booking is cancelled, the student is no longer expected at the hostel.
create or replace function public.drop_cancelled_arrival() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from tenants where booking_id = new.id and status = 'due';
  return null;
end $$;
drop trigger if exists drop_cancelled_arrival on public.bookings;
create trigger drop_cancelled_arrival after update of status on public.bookings for each row
  when (new.status = 'cancelled' and old.status is distinct from 'cancelled') execute function public.drop_cancelled_arrival();

-- One review per stay.
create unique index if not exists reviews_one_per_booking on public.reviews (booking_id) where booking_id is not null;

-- Only students who finished a stay write a review, for that stay.
drop policy if exists "guests of the hostel write reviews" on public.reviews;
create policy "guests of the hostel write reviews" on public.reviews for insert to authenticated with check (
  user_id = auth.uid() and exists (select 1 from bookings b where b.id = booking_id and b.user_id = auth.uid() and b.hostel_id = reviews.hostel_id and b.status in ('completed', 'rated')));

/* ---------------------------------------------------------------- documents */

-- Owners can replace any of their own documents. The new one waits for the Nestly team again.
drop policy if exists "delete own documents" on public.docs;
create policy "delete own documents" on public.docs for delete to authenticated using (owner_id = auth.uid() or public.is_admin());
