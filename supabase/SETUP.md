# Nestly Supabase Setup Guide

Follow these exact steps to configure your Supabase backend for Nestly before running the application in live mode.

## Step 1: Run Migrations in Order
In your Supabase Dashboard SQL Editor, run the migration files sequentially:
1. `supabase/migrations/0001_tables.sql` — Creates profiles, hostels, rooms, bookings, tenants, visitors, reviews, flags, audit logs, and invites[cite: 38].
2. `supabase/migrations/0002_security.sql` — Enables Row Level Security (RLS), security guard triggers, and counting triggers.
3. `supabase/migrations/0003_storage.sql` — Creates storage buckets and access rules for hostel photos and owner documents.
4. `supabase/migrations/0004_starting_data.sql` — Inserts initial system defaults and universities[cite: 40].
5. `supabase/migrations/0005_stage2.sql` — Adds admin notifications and room counting logic[cite: 40].
6. `supabase/migrations/0006_stage3.sql` — Adds cancelled arrival cleanup triggers[cite: 40].
7. `supabase/migrations/0007_payments.sql` — Adds subscription payments and financial audit tables[cite: 30].
8. `supabase/migrations/0008_live_updates.sql` — Enables Realtime updates on core tables and visitor cleanup[cite: 40].
9. `supabase/migrations/0009_rent_balance.sql` — Enforces rent balance rules and check-in triggers[cite: 30].

## Step 2: Sample Data (Optional for Testing)
To populate test hostels, rooms, and accounts:
- Run `supabase/sample_data.sql` in the SQL Editor[cite: 40].
- When launching to production, run `supabase/remove_sample_data.sql`[cite: 40].

## Step 3: Edge Functions
Deploy the custodian invite function:
1. Navigate to Supabase Dashboard > Edge Functions.
2. Deploy a new function named `accept-invite` using `supabase/functions/accept-invite/index.ts`[cite: 14, 40].

## Step 4: Authentication Redirect URLs
In Authentication > URL Configuration > Redirect URLs, add your site origin URL (e.g., `https://nestly-ug.vercel.app` or `http://localhost:5173`) so email confirmations and password resets redirect correctly[cite: 23, 40].