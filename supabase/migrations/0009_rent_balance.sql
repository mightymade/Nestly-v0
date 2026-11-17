-- Nestly database, part 9: the booking fee counts toward the rent, and a student checks in only after the balance is paid.
-- Run it after 0008. It is safe to run more than once.
--
-- How it works:
-- * The booking fee is paid on Nestly. The rest of the rent (rent - fee) is paid to the owner outside Nestly.
-- * "rent" is the room price at the moment of booking. The server fills it in, so the browser can never change it.
-- * When the owner or custodian has received the balance they press "Balance received". That sets rent_paid_on.
-- * A booking cannot become "checked-in", and a tenant cannot become "in", until the balance is paid.

alter table public.bookings add column if not exists rent integer;
alter table public.bookings add column if not exists rent_paid_on text;

/* ---------------------------------------------------------------- fill in rent on new bookings */

-- The price of a room type at a hostel, read from the hostel's own list of rooms.
create or replace function public.room_price(hid text, rtype text) returns integer
language sql stable security definer set search_path = public as $$
  select (v->>'price')::int from hostels h, jsonb_array_elements(h.rooms) v where h.id = hid and v->>'t' = rtype limit 1
$$;

-- Every new booking gets its rent from the hostel, whichever function created it.
-- A booking that is already checked in (for example sample data) counts as settled.
create or replace function public.set_booking_rent() returns trigger
language plpgsql as $$
begin
  if new.rent is null then new.rent := public.room_price(new.hostel_id, new.room); end if;
  if new.rent_paid_on is null and new.status in ('checked-in', 'completed', 'rated') then new.rent_paid_on := nullif(new.paid_on, ''); end if;
  return new;
end $$;
drop trigger if exists set_booking_rent on public.bookings;
create trigger set_booking_rent before insert on public.bookings for each row execute function public.set_booking_rent();

-- Bookings made before this part: fill in the rent. People who already moved in are treated as settled.
update public.bookings set rent = public.room_price(hostel_id, room) where rent is null;
update public.bookings set rent_paid_on = nullif(paid_on, '')
  where rent_paid_on is null and status in ('checked-in', 'completed', 'rated');

/* ---------------------------------------------------------------- who may change what */

-- True when the student still owes part of the rent.
create or replace function public.balance_owed(b bookings) returns boolean
language sql immutable as $$ select b.rent_paid_on is null and coalesce(b.rent, 0) - b.fee > 0 $$;

-- Same rules as before, plus: rent can never be changed from the browser, only staff can record that the balance
-- was received (once), and nobody can check a student in while the balance is unpaid.
create or replace function public.guard_booking() returns trigger
language plpgsql as $$
begin
  if not public.from_app() or public.is_admin() then return new; end if;
  if new.user_id is distinct from old.user_id or new.hostel_id is distinct from old.hostel_id or new.fee is distinct from old.fee
     or new.pay_ref is distinct from old.pay_ref or new.tx_ref is distinct from old.tx_ref or new.at is distinct from old.at
     or new.sem is distinct from old.sem or new.method is distinct from old.method or new.paid_on is distinct from old.paid_on
     or new.rent is distinct from old.rent then
    raise exception 'Payment details cannot be changed.';
  end if;
  if public.staff_of(old.hostel_id) then
    if new.status not in ('paid', 'checked-in', 'completed', 'cancelled', 'rated') then raise exception 'Not a valid booking status.'; end if;
    if new.rent_paid_on is distinct from old.rent_paid_on and old.rent_paid_on is not null then
      raise exception 'The balance was already recorded.';
    end if;
    if new.status = 'checked-in' and old.status <> 'checked-in' and public.balance_owed(new) then
      raise exception 'This student still owes the rent balance. Collect it before checking them in.';
    end if;
    return new;
  end if;
  if old.user_id = auth.uid() then
    if new.rent_paid_on is distinct from old.rent_paid_on then raise exception 'Only the hostel records the rent balance.'; end if;
    if new.room_no is distinct from old.room_no or new.room is distinct from old.room then raise exception 'Only the custodian gives rooms.'; end if;
    if new.status is distinct from old.status and not ((old.status = 'paid' and new.status = 'cancelled') or (old.status = 'completed' and new.status = 'rated')) then
      raise exception 'You cannot change this booking like that.';
    end if;
    return new;
  end if;
  raise exception 'Not your booking.';
end $$;

-- A tenant is only marked "in" once the balance on their booking is paid. (A second lock, in case the booking and the
-- tenant are changed separately.)
create or replace function public.guard_tenant_checkin() returns trigger
language plpgsql as $$
declare b bookings;
begin
  if not public.from_app() or public.is_admin() then return new; end if;
  if new.status = 'in' and old.status is distinct from 'in' and new.booking_id is not null then
    select * into b from bookings where id = new.booking_id;
    if b.id is not null and public.balance_owed(b) then
      raise exception 'This student still owes the rent balance. Collect it before checking them in.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_tenant_checkin on public.tenants;
create trigger guard_tenant_checkin before update on public.tenants for each row execute function public.guard_tenant_checkin();

/* ---------------------------------------------------------------- visitors: only staff sign people out */

-- Before, anyone holding a visitor's pass could sign that visitor out, so a visitor could fake leaving.
-- Now only the hostel's staff can, and the visitor page no longer offers it.
create or replace function public.visitor_sign_out(p_id text)
returns visitors
language plpgsql volatile security definer set search_path = public as $$
declare v visitors; hid text;
begin
  select hostel_id into hid from visitors where id = p_id;
  if hid is null or not public.staff_of(hid) then raise exception 'Only the hostel staff can sign a visitor out.'; end if;
  update visitors set tout = to_char(now() at time zone 'Africa/Kampala', 'HH24:MI')
  where id = p_id and tout is null and date >= (now() at time zone 'Africa/Kampala')::date - 1
  returning * into v;
  if v.id is null then raise exception 'This visit has already ended.'; end if;
  return v;
end $$;
revoke execute on function public.visitor_sign_out(text) from public, anon;
grant execute on function public.visitor_sign_out(text) to authenticated;
