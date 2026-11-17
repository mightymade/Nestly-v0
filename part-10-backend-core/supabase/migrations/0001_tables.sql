-- Nestly database, part 1 of 4: tables.
-- Run the four files in order in the Supabase SQL editor (Dashboard > SQL editor > New query).
-- Names follow src/data/types.ts in snake_case, so the app can map rows to its types directly.

create extension if not exists pgcrypto;

-- Universities students can pick. Calendars are the default semester dates for hostels near them.
create table public.universities (
  id text primary key,
  name text not null,
  short text not null,
  domain text not null unique,          -- student email domain, like ucu.ac.ug
  area text not null default '',
  lat double precision not null default 0,
  lng double precision not null default 0,
  logo text,                             -- small square image as a data URL
  sems jsonb                             -- [{ "start": "2027-01-11", "end": "2027-05-14" }]
);

-- One row per account. Created automatically when someone signs up (see 0002).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'student' check (role in ('student', 'custodian', 'owner', 'admin')),
  name text not null default '',
  email text not null,
  username text,
  phone text,
  photo text,
  university_id text references public.universities (id),
  email_verified boolean not null default false,
  verified_until date,
  hostel_id text,                        -- custodians: the hostel they work at
  owner_status text check (owner_status in ('incomplete', 'pending', 'approved', 'rejected')),
  owner_note text,
  suspended boolean not null default false,
  suspend_reason text,
  joined timestamptz not null default now(),
  last_active timestamptz
);
create unique index profiles_username_key on public.profiles (lower(username)) where username is not null;

-- Owner details only the owner and admins may see: where students pay them, and their Nestly subscription.
create table public.owner_accounts (
  owner_id uuid primary key references public.profiles (id) on delete cascade,
  payout jsonb,                          -- { "method": "mtn" | "airtel" | "bank", "to": "...", "name": "...", "bank": "..." }
  sub_paid_until date,
  sub_grace_until date,
  sub_reminded_at timestamptz
);

create table public.hostels (
  id text primary key default ('h' || substr(md5(gen_random_uuid()::text), 1, 10)),
  owner_id uuid references public.profiles (id) on delete set null,
  name text not null default '',
  uni text not null references public.universities (id),
  area text not null default '',
  km double precision not null default 0,
  dir double precision,
  rating numeric(2, 1) not null default 0,
  n_rev integer not null default 0,
  owner_name text not null default '',
  verified boolean not null default false,
  fee integer not null default 0,        -- booking fee in UGX
  visit text not null default '8:00 am to 9:00 pm',
  floors integer not null default 3,
  cols integer not null default 4,
  amen jsonb not null default '[]',
  rooms jsonb not null default '[]',     -- room types: [{ t, sc, price, total, taken, beds }]
  about text not null default '',
  seed integer not null default 0,
  photo_url text,
  status text not null default 'draft' check (status in ('draft', 'in_review', 'live', 'changes_requested', 'suspended')),
  review_note text,
  suspend_reason text,
  paused_for text check (paused_for in ('admin', 'subscription')),
  review_sections jsonb,
  blocks jsonb,
  location jsonb,                        -- { "lat": 0.35, "lng": 32.75 }
  rules jsonb,
  photos jsonb,                          -- public URLs in the hostel-photos bucket
  sems jsonb,                            -- [{ start, end, open }]
  views integer not null default 0,
  saves integer not null default 0,
  submitted_at timestamptz,
  listed_at timestamptz,
  created_at timestamptz not null default now()
);
create index hostels_owner_idx on public.hostels (owner_id);
create index hostels_uni_status_idx on public.hostels (uni, status);
alter table public.profiles add constraint profiles_hostel_fk foreign key (hostel_id) references public.hostels (id) on delete set null;

create table public.reviews (
  id text primary key default ('v' || substr(md5(gen_random_uuid()::text), 1, 10)),
  hostel_id text not null references public.hostels (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  booking_id text,
  who text not null,
  stars integer not null check (stars between 1 and 5),
  "when" text not null default '',
  text text not null default '',
  reply text,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index reviews_hostel_idx on public.reviews (hostel_id);

create table public.bookings (
  id text primary key default ('NST-' || (30000 + floor(random() * 69999))::int),
  user_id uuid not null references public.profiles (id) on delete cascade,
  hostel_id text not null references public.hostels (id) on delete cascade,
  room text not null,                    -- room type name
  room_no text,
  sem text not null,
  fee integer not null,
  status text not null default 'paid' check (status in ('pending', 'paid', 'checked-in', 'completed', 'rated', 'cancelled')),
  paid_on text not null default '',
  cancel_until text,
  at timestamptz not null default now(),
  pay_ref text,
  tx_ref text unique,                    -- Flutterwave transaction reference
  method text
);
create index bookings_user_idx on public.bookings (user_id);
create index bookings_hostel_idx on public.bookings (hostel_id);

create table public.saved (
  user_id uuid not null references public.profiles (id) on delete cascade,
  hostel_id text not null references public.hostels (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, hostel_id)
);

create table public.rooms (
  id text primary key default ('r' || substr(md5(gen_random_uuid()::text), 1, 10)),
  hostel_id text not null references public.hostels (id) on delete cascade,
  no text not null,
  block text not null default 'A',
  floor integer not null default 1,
  type text not null,
  beds integer not null default 1,
  status text not null default 'ready' check (status in ('ready', 'unavailable')),
  unavailable_reason text,
  unavailable_since timestamptz
);
create index rooms_hostel_idx on public.rooms (hostel_id);

create table public.tenants (
  id text primary key default ('t' || substr(md5(gen_random_uuid()::text), 1, 10)),
  hostel_id text not null references public.hostels (id) on delete cascade,
  name text not null,
  room text not null default '',
  type text not null default '',
  status text not null default 'due' check (status in ('in', 'due', 'out')),
  "end" text not null default '',
  phone text not null default '',
  user_id uuid references public.profiles (id) on delete set null,
  room_id text references public.rooms (id) on delete set null,
  bed integer,
  booking_id text references public.bookings (id) on delete set null
);
create index tenants_hostel_idx on public.tenants (hostel_id);

create table public.visitors (
  id text primary key default ('vs' || substr(md5(gen_random_uuid()::text), 1, 12)),
  hostel_id text not null references public.hostels (id) on delete cascade,
  name text not null,
  room text not null,
  host text,
  phone text,
  tin text not null,                     -- "14:05"
  tout text,
  via text not null default 'QR' check (via in ('QR', 'Custodian')),
  date date not null default current_date
);
create index visitors_hostel_date_idx on public.visitors (hostel_id, date);

create table public.notices (
  id text primary key default ('n' || substr(md5(gen_random_uuid()::text), 1, 10)),
  hostel_id text not null references public.hostels (id) on delete cascade,
  text text not null,
  by text not null default '',
  at timestamptz not null default now()
);

create table public.notifications (
  id text primary key default ('nt' || substr(md5(gen_random_uuid()::text), 1, 12)),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  text text not null default '',
  at timestamptz not null default now(),
  read boolean not null default false,
  "to" text not null default '/'
);
create index notifications_user_idx on public.notifications (user_id, at desc);

create table public.invites (
  code text primary key,
  hostel_id text not null references public.hostels (id) on delete cascade,
  invited_by text not null default '',
  email text not null default '',
  name text not null default '',
  used boolean not null default false,
  at timestamptz not null default now(),
  cancelled boolean not null default false
);

create table public.docs (
  id text primary key default ('d' || substr(md5(gen_random_uuid()::text), 1, 10)),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  hostel_id text references public.hostels (id) on delete cascade,
  kind text not null check (kind in ('national_id', 'selfie', 'ownership', 'trading_licence')),
  file_name text not null,
  url text not null,                     -- path in the private docs bucket
  uploaded_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  note text
);

create table public.flags (
  id text primary key default ('f' || substr(md5(gen_random_uuid()::text), 1, 10)),
  hostel_id text not null references public.hostels (id) on delete cascade,
  reported_by uuid not null references public.profiles (id) on delete cascade,
  reason text not null,
  text text not null default '',
  at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'resolved')),
  note text,
  kind text not null default 'listing' check (kind in ('listing', 'review', 'payment')),
  review_id text references public.reviews (id) on delete set null,
  booking_id text references public.bookings (id) on delete set null,
  outcome text check (outcome in ('dismissed', 'warned', 'hidden', 'paused', 'confirmed')),
  resolved_at timestamptz
);

create table public.sub_payments (
  id text primary key default ('sp' || substr(md5(gen_random_uuid()::text), 1, 12)),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  amount integer not null,
  months integer not null default 1,
  at timestamptz not null default now(),
  via text not null default 'app' check (via in ('app', 'recorded')),
  ref text not null,
  note text,
  tx_ref text unique
);

-- Platform settings. Always exactly one row, id 1.
create table public.config (
  id integer primary key default 1 check (id = 1),
  sub_fee integer not null default 50000,
  per_hostel boolean not null default true,
  grace_days integer not null default 7
);

create table public.audit (
  id text primary key default ('a' || substr(md5(gen_random_uuid()::text), 1, 12)),
  at timestamptz not null default now(),
  actor_id uuid references public.profiles (id) on delete set null,
  actor_role text not null default '',
  action text not null,
  target text not null default '',
  detail text not null default ''
);
create index audit_at_idx on public.audit (at desc);
