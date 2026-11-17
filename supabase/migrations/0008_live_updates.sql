-- Nestly database, part 8: live updates, and visitor logs kept no longer than 90 days.
-- Run it after 0007. It is safe to run more than once.
--
-- Supabase Realtime tells open screens when these tables change (a new booking, a visitor at the gate, a notification),
-- so they refresh within a second or two instead of waiting for the next minute. Row level security still applies:
-- people only hear about rows they are allowed to read.
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['notifications', 'bookings', 'tenants', 'visitors', 'hostels', 'rooms', 'reviews', 'notices', 'flags', 'docs', 'invites', 'sub_payments', 'owner_accounts'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Visitor logs are kept for 90 days, as the privacy policy says. Each new sign-in clears out logs older than that.
create or replace function public.forget_old_visitors() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from visitors where date < (now() at time zone 'Africa/Kampala')::date - 90;
  return null;
end $$;
drop trigger if exists forget_old_visitors on public.visitors;
create trigger forget_old_visitors after insert on public.visitors for each statement execute function public.forget_old_visitors();
