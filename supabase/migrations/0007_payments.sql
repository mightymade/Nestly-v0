-- Nestly database, part 7: mobile money payments through Flutterwave (booking fees and owner subscriptions).
-- Run it after 0006. It is safe to run more than once.
--
-- How a payment works:
-- 1. The "payments" server function checks the request, notes the payment here as pending, and asks Flutterwave to charge the phone.
-- 2. The person approves the prompt on their phone (in test mode: enters the code 123456).
-- 3. The server function asks Flutterwave whether the money really arrived. Only then does finish_payment() confirm the
--    booking or the subscription. The browser can never mark anything as paid.

create table if not exists public.payments (
  tx_ref text primary key,
  kind text not null check (kind in ('booking', 'subscription')),
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount integer not null,
  currency text not null default 'UGX',
  booking_id text references public.bookings (id) on delete set null,
  hostel_id text references public.hostels (id) on delete set null,
  months integer,
  sem_end date,
  network text,
  phone text,
  status text not null default 'pending' check (status in ('pending', 'successful', 'failed')),
  flw_id text,
  flw_ref text,
  note text,                             -- why a payment failed, in plain words
  created_at timestamptz not null default now(),
  done_at timestamptz
);
alter table public.payments add column if not exists note text;
create index if not exists payments_user_idx on public.payments (user_id, created_at desc);
alter table public.payments enable row level security;
drop policy if exists "read own payments" on public.payments;
create policy "read own payments" on public.payments for select to authenticated using (user_id = auth.uid() or public.is_admin());
-- No insert, update or delete for anyone in the browser: only the server function writes payments.
grant select on public.payments to authenticated;

-- For later: an owner's Flutterwave subaccount, so booking fees can settle straight to them. Not used yet:
-- for now every fee lands in Nestly's Flutterwave balance and the team passes it on.
alter table public.owner_accounts add column if not exists flw_subaccount text;

-- Pending bookings (payment not finished) are not real bookings yet: nobody but the student sees them.
drop policy if exists "read bookings" on public.bookings;
create policy "read bookings" on public.bookings for select to authenticated
  using (user_id = auth.uid() or (status <> 'pending' and public.staff_of(hostel_id)));

/* ---------------------------------------------------------------- confirming a payment */

-- "14 Nov 2026"
create or replace function public.day_label(d timestamptz) returns text
language sql stable as $$ select to_char(d at time zone 'Africa/Kampala', 'FMDD Mon YYYY') $$;

-- Confirms a payment once Flutterwave says the money arrived. Safe to call twice: the second call does nothing.
-- Only the server function (service role) can call it.
create or replace function public.finish_payment(p_tx_ref text, p_flw_id text, p_flw_ref text, p_amount integer, p_currency text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  p payments; b bookings; h hostels; u profiles; a owner_accounts;
  base date; until date; cover date; ref text; n int;
begin
  select * into p from payments where tx_ref = p_tx_ref for update;
  if p.tx_ref is null then raise exception 'Unknown payment.'; end if;
  if p.status = 'successful' then return jsonb_build_object('result', 'paid', 'kind', p.kind, 'already', true, 'booking_id', p.booking_id, 'hostel_id', p.hostel_id); end if;
  if p_amount < p.amount or upper(p_currency) <> p.currency then
    update payments set status = 'failed', flw_id = p_flw_id, flw_ref = p_flw_ref, done_at = now(), note = 'The amount paid was not right.' where tx_ref = p_tx_ref;
    if p.kind = 'booking' then delete from bookings where id = p.booking_id and status = 'pending'; end if;
    return jsonb_build_object('result', 'failed', 'kind', p.kind, 'reason', 'The amount paid was not right.');
  end if;
  select * into u from profiles where id = p.user_id;

  if p.kind = 'booking' then
    update bookings set status = 'paid', pay_ref = p_flw_ref, paid_on = day_label(now()), at = now(),
      cancel_until = to_char((now() + interval '48 hours') at time zone 'Africa/Kampala', 'FMDD Mon')
    where id = p.booking_id and status = 'pending' returning * into b;
    if b.id is null then raise exception 'The booking for this payment is missing.'; end if;
    select * into h from hostels where id = b.hostel_id;
    -- The student now waits for the custodian to give them a room.
    insert into tenants (id, hostel_id, name, phone, type, status, room, "end", user_id, booking_id)
    values ('t' || substr(md5(gen_random_uuid()::text), 1, 10), b.hostel_id, u.name, coalesce(nullif(p.phone, ''), u.phone, ''), b.room, 'due', '',
            coalesce(to_char(p.sem_end, 'FMDD Mon YYYY'), ''), u.id, b.id);
    insert into notifications (user_id, kind, title, text, "to") values
      (u.id, 'booking', 'Booking confirmed', h.name || ', ' || b.sem || '. Ref ' || b.id || '.', '/s/bookings');
    if h.owner_id is not null then
      insert into notifications (user_id, kind, title, text, "to") values
        (h.owner_id, 'booking', 'New booking at ' || h.name, u.name || ' booked a ' || lower(b.room) || ' room for ' || b.sem || '.', '/o/bookings');
    end if;
    insert into notifications (user_id, kind, title, text, "to")
      select id, 'tenant', u.name || ' needs a room', 'Booked a ' || lower(b.room) || ' room. Give them a room on the Rooms page.', '/c/rooms'
      from profiles where role = 'custodian' and hostel_id = b.hostel_id and not suspended;
    update payments set status = 'successful', flw_id = p_flw_id, flw_ref = p_flw_ref, done_at = now() where tx_ref = p_tx_ref;
    return jsonb_build_object('result', 'paid', 'kind', 'booking', 'booking_id', b.id, 'hostel_id', b.hostel_id, 'cancel_until', b.cancel_until);
  end if;

  -- A subscription: the months paid start from the first unpaid month.
  select * into a from owner_accounts where owner_id = p.user_id for update;
  -- Never paid: the subscription started the day the first hostel went live (same rule as the app).
  base := coalesce(a.sub_paid_until,
    (select min((listed_at at time zone 'Africa/Kampala')::date) - 1 from hostels where owner_id = p.user_id and status in ('live', 'suspended')),
    (date_trunc('month', now() at time zone 'Africa/Kampala') + interval '1 month - 1 day')::date);
  until := (date_trunc('month', base) + make_interval(months => p.months + 1) - interval '1 day')::date;
  cover := (date_trunc('month', base) + interval '1 month')::date;
  ref := 'SUB-' || upper(right(p.user_id::text, 4)) || '-' || to_char(cover, 'YYYYMM');
  update owner_accounts set sub_paid_until = until, sub_grace_until = null where owner_id = p.user_id;
  insert into sub_payments (owner_id, amount, months, via, ref, note, tx_ref) values (p.user_id, p_amount, p.months, 'app', ref, 'Flutterwave ' || coalesce(p_flw_ref, ''), p_tx_ref);
  update hostels set status = 'live', paused_for = null, suspend_reason = null
    where owner_id = p.user_id and status = 'suspended' and paused_for = 'subscription';
  get diagnostics n = row_count;
  insert into notifications (user_id, kind, title, text, "to") values (p.user_id, 'money', 'Subscription paid',
    'Thank you. You are paid until ' || to_char(until, 'FMDD Mon YYYY') || '.' || case when n > 0 then ' Your hostels are back on Explore.' else '' end, '/o/money');
  insert into audit (actor_id, actor_role, action, target, detail) values (p.user_id, 'owner', 'Paid subscription', u.name, p.months || ' month' || case when p.months > 1 then 's' else '' end);
  update payments set status = 'successful', flw_id = p_flw_id, flw_ref = p_flw_ref, done_at = now() where tx_ref = p_tx_ref;
  return jsonb_build_object('result', 'paid', 'kind', 'subscription', 'paid_until', until);
end $$;

-- Marks a payment as failed and removes the booking that was waiting for it.
create or replace function public.fail_payment(p_tx_ref text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare p payments;
begin
  update payments set status = 'failed', done_at = now() where tx_ref = p_tx_ref and status = 'pending' returning * into p;
  if p.kind = 'booking' then delete from bookings where id = p.booking_id and status = 'pending'; end if;
  select * into p from payments where tx_ref = p_tx_ref;
  return jsonb_build_object('result', case p.status when 'successful' then 'paid' else 'failed' end, 'kind', p.kind, 'hostel_id', p.hostel_id);
end $$;

revoke execute on function public.finish_payment(text, text, text, integer, text), public.fail_payment(text) from public, anon, authenticated;
grant execute on function public.finish_payment(text, text, text, integer, text), public.fail_payment(text) to service_role;
