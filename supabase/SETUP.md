# Setting up Supabase for Nestly

Do these steps once, in order. You only need the Supabase dashboard and a browser.

## 1. Create the database

In Supabase, open **SQL Editor > New query**. Then, one file at a time:

1. Open the file from `supabase/migrations/` and copy all of it.
2. Paste it into the query box and click **Run**. You should see "Success. No rows returned".

Run the files in this order:

1. `0001_tables.sql`: the tables
2. `0002_security.sql`: who can see and change what
3. `0003_storage.sql`: buckets for hostel photos and owner documents
4. `0004_starting_data.sql`: the four universities and the subscription price
5. `0005_stage2.sql`: fair room counts, lists in the right order, and messages to admins
6. `0006_stage3.sql`: the visitor page at the gate, removing custodians, cancelled bookings, reviews and documents
7. `0007_payments.sql`: mobile money payments through Flutterwave
8. `0008_live_updates.sql`: screens update by themselves, and visitor logs are deleted after 90 days
9. `0009_rent_balance.sql`: the booking fee counts toward the rent, a student checks in only after paying the balance, and only staff can sign visitors out

If one fails, stop and send the error message. Don't run the next file.

If you already ran the earlier files, run only the ones you have not run yet. When a new numbered file appears in a later update, run only the new one.

### Optional: sample data

To see the site full of hostels, owners, students and bookings (the same as the demo), run `supabase/sample_data.sql` once after the migration files.

- Every sample account's password is `nestly123`. Try `grace.n` (owner), `daniel.o` (owner waiting for approval), `peter.k` (custodian) and `sarah.atim@ucu.ac.ug` (student).
- There is no sample admin. Use your own account (step 6).
- Anyone who knows these logins can use them, so **run `supabase/remove_sample_data.sql` before real students use the site.** It removes only the sample hostels and accounts.

## 2. Tell Supabase where the app lives

Open **Authentication > URL Configuration**:

- **Site URL:** `http://localhost:5173` for now. When the app is on Vercel, change it to the Vercel address, for example `https://nestly.vercel.app`.
- **Redirect URLs:** add all three:
  - `http://localhost:5173/**`
  - `http://127.0.0.1:5173/**`
  - `https://YOUR-VERCEL-ADDRESS/**`

Email links (confirm your email, reset your password) only bring people back to addresses on this list.

## 3. Email sign-up settings

Open **Authentication > Sign In / Providers > Email** and check that:

- **Enable Email provider** is on.
- **Confirm email** is on. This is how students prove they study at the university.
- **Minimum password length** is `8`.

## 4. Send emails to real people (custom SMTP)

Supabase's built-in email only sends to your own team's addresses, about 2 an hour, so students would never get their confirmation link. Free-tier projects also can't change the email wording without their own SMTP. The simplest free fix is a Gmail account.

1. On the Gmail account you want emails sent from, turn on **2-Step Verification** (Google Account > Security).
2. Make an **App password** (Google Account > Security > App passwords). Name it "Nestly" and copy the 16-letter password.
3. In Supabase, open **Authentication > Emails > SMTP Settings**, turn on **Enable custom SMTP**, and fill in:

   | Setting | Value |
   |---|---|
   | Sender email | your Gmail address |
   | Sender name | `Nestly` |
   | Host | `smtp.gmail.com` |
   | Port | `465` |
   | Username | your Gmail address |
   | Password | the 16-letter app password |

4. Open **Authentication > Rate Limits** and raise "emails per hour" to `100`.

Gmail allows about 500 emails a day, which is plenty for a class project. If you get your own domain later, Brevo or Resend are better for a real launch.

## 5. Add the custodian invite function

Custodians join with an invite code and may have no email inbox. A small server function creates their account.

1. Open **Edge Functions > Deploy a new function > Via Editor**.
2. Name it exactly `accept-invite`.
3. Delete the sample code, then paste in everything from `supabase/functions/accept-invite/index.ts`.
4. Click **Deploy**.

You don't need to add any settings. Supabase gives the function the keys it needs.

## 5b. Take payments with Flutterwave (test mode)

Booking fees and owner subscriptions are paid by MTN or Airtel mobile money through Flutterwave (API v4). The person gets a prompt on their phone; in the sandbox they type the code `123456` instead. No real money moves.

1. Sign up for a Flutterwave **developer sandbox** account: https://onboarding.flutterwave.com/signup/steps/670fd6ca31db5a18fd7d03a7 (the normal sign-up does not list Uganda; the sandbox does not ask).
2. In the sandbox dashboard, open **API keys** and copy the **Client ID** and **Client Secret**.
3. In Supabase, open **Edge Functions > Deploy a new function > Via Editor**, name it exactly `payments`, paste everything from `supabase/functions/payments/index.ts`, and click **Deploy**.
4. Open the `payments` function's **Details** and turn **off** "Verify JWT" (Enforce JWT verification). Flutterwave's messages have no Nestly login; the function checks logins itself.
5. Open **Edge Functions > Secrets** and add two:

   | Name | Value |
   |---|---|
   | `FLW_CLIENT_ID` | the Client ID |
   | `FLW_CLIENT_SECRET` | the Client Secret |

6. Optional but useful: in the sandbox dashboard, open **Test webhooks** and set the URL to `https://YOUR-PROJECT.supabase.co/functions/v1/payments` (your Project URL plus `/functions/v1/payments`). Then a payment is confirmed even if the person closes Nestly before it finishes. The function never trusts what a webhook says: it always asks Flutterwave itself.

**Try it:** log in as a student, book a room, pay with any Uganda number (like `0772 123 456`), and type `123456` when Nestly asks for the code. You are booked.

**Where the money goes:** every fee lands in Nestly's Flutterwave balance. Sending booking fees straight to each owner (Flutterwave "subaccounts") is not set up yet, because owners would need bank accounts registered with Flutterwave.

## 6. Make yourself the admin

1. Run the app (see "Run the app" below) and sign up through **I own a hostel** with your own email. Confirm the email.
2. In **SQL Editor**, run this, using your email:

   ```sql
   update public.profiles set role = 'admin', owner_status = null where email = 'you@example.com';
   ```

3. Log out of the app and log in again. You land on the admin Overview.

## 7. Run the app

The file `.env` in the project holds your Supabase address and public key. It's in `.gitignore`, so it never goes to GitHub.

```bash
npm install
npm run dev
```

To run on the demo data instead, start it with `VITE_DATA=demo npm run dev`, or remove `.env`.

**On Vercel:** go to Project > Settings > Environment Variables and add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` with the same values as `.env`. Then redeploy.

## Keys: what is safe where

| Key | Where it's used | Safe to share? |
|---|---|---|
| Project URL | `.env`, Vercel | Yes |
| anon / publishable key | `.env`, Vercel | Yes. It's built for browsers, and the security rules do the protecting. |
| service_role / secret key | only inside Supabase functions | **Never.** Don't put it in `.env`, GitHub or chat. |
| Flutterwave Client Secret | only in Supabase function secrets | **Never.** |
| database password | nowhere in the app | **Never.** |
