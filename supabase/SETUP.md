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
10. `0010_student_id.sql`: students can sign up with any email and a student ID, which an admin checks
11. `0011_student_id_v2.sql`: the student ID check asks for a selfie too, only approved accounts hold a student number, and each university says whether its emails arrive
12. `0012_security.sql`: security hardening (see section 8). Admins need two-step login after this, so read section 8 before running it on the live project

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

## 5a. Add the student ID sign-up function

Many university mail servers (UCU's included) block emails sent from a Gmail account, so students there never get the confirmation link. The student ID route works around this:

1. The student signs up with any email they check (for example Gmail), their student number and a password.
2. They confirm that email from the link (Gmail delivers it), then log in.
3. They add a photo of their student ID and a selfie holding it.
4. An admin approves or rejects it under **Reviews > Students**, entering the card's expiry date. Booking opens until that date, for at most one year. Both photos are deleted as soon as the admin decides.

Set it up:

1. Run `0010_student_id.sql` and `0011_student_id_v2.sql` (step 4).
2. Open **Edge Functions > Deploy a new function > Via Editor**, name it exactly `student-signup`, paste in everything from `supabase/functions/student-signup/index.ts`, and click **Deploy**. If it is already there, open it, paste the new code and deploy again.
3. Check that your site's `/confirmed` address is in **Authentication > URL Configuration > Redirect URLs** (step 2 already adds it).
4. Open **Authentication > Rate Limits** and raise **Rate limit for sending emails** to about 100 an hour, so a busy sign-up day is not blocked. Gmail allows about 500 a day.

**Which universities use which route.** After 0011, every university uses the student ID route. In the app, open **Admin > Universities**, open a university and tick **Our emails reach ... addresses** only after you have seen its student emails arrive. The same box shows how many university email sign-ups were confirmed and how many never were, to help you decide. If a student on the email route never gets the link, the "check your inbox" screen offers the student ID route instead.

## 5c. Email custodian invites

When an owner invites a custodian with an email address, Nestly emails them the invite link and code. It sends through the same Gmail account as section 4.

1. Open **Edge Functions > Deploy a new function > Via Editor**, name it exactly `send-invite`, paste in everything from `supabase/functions/send-invite/index.ts`, and click **Deploy**.
2. Open **Edge Functions > Secrets** and add:

   | Name | Value |
   |---|---|
   | `GMAIL_USER` | the Gmail address from section 4 |
   | `GMAIL_APP_PASSWORD` | the same 16-letter app password from section 4 (no spaces) |
   | `SITE_URL` | your site, for example `https://nestly-ug.vercel.app` |

3. Test it: log in as an owner, open **Staff > Invite a custodian**, and invite your own second email address.

If the email cannot be sent, the owner sees why and can still share the invite on WhatsApp.

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

3. Log out of the app and log in again. After 0012, the app asks you to set up two-step login first (an authenticator app on your phone), then you land on the admin Overview.

## 7. Run the app

The file `.env` in the project holds your Supabase address and public key. It's in `.gitignore`, so it never goes to GitHub.

```bash
npm install
npm run dev
```

To run on the demo data instead, start it with `VITE_DATA=demo npm run dev`, or remove `.env`.

**On Vercel:** go to Project > Settings > Environment Variables and add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` with the same values as `.env`. Then redeploy.

## 8. Security set-up (after 0012)

Do these in order. Each one is free.

### 8.1 Deploy the new and changed server functions

In **Edge Functions**, deploy or redeploy each one by pasting its file:

| Function | File | Verify JWT |
|---|---|---|
| `login` (new) | `supabase/functions/login/index.ts` | **off** |
| `send-mail` (new) | `supabase/functions/send-mail/index.ts` | **off** |
| `backup` (new) | `supabase/functions/backup/index.ts` | **off** |
| `student-signup` | `supabase/functions/student-signup/index.ts` | as before |
| `send-invite` | `supabase/functions/send-invite/index.ts` | as before |
| `accept-invite` | `supabase/functions/accept-invite/index.ts` | as before |
| `payments` | `supabase/functions/payments/index.ts` | **off** (as before) |

In **Edge Functions > Secrets**, add `CRON_SECRET`: any long random text (for example, 40 letters and numbers from a password generator). Keep `GMAIL_USER`, `GMAIL_APP_PASSWORD` and `SITE_URL` from section 5c.

In **SQL Editor**, tell Nestly its address so links in security emails work:

```sql
update public.config set site_url = 'https://nestly-ug.vercel.app' where id = 1;
```

### 8.2 Scheduled jobs

In **Database > Extensions**, turn on `pg_cron` and `pg_net`. Then in **SQL Editor** run this, after replacing `YOUR-PROJECT-REF` (from your project URL) and `YOUR-CRON-SECRET` (from 8.1):

```sql
select cron.schedule('nestly-send-mail', '* * * * *', $$
  select net.http_post(url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/send-mail',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "YOUR-CRON-SECRET"}'::jsonb, body := '{}'::jsonb) $$);
select cron.schedule('nestly-backup', '0 0 * * *', $$
  select net.http_post(url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/backup',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "YOUR-CRON-SECRET"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 60000) $$);
select cron.schedule('nestly-payouts', '15 * * * *', $$ select public.apply_due_payouts() $$);
select cron.schedule('nestly-clean-up', '30 1 * * *', $$ select public.purge_old_data() $$);
```

These send security emails every minute, back up the tables at 3 am Uganda time, start payout changes whose 24 hours are up, and delete old data (visitor logs after 30 days, login records after 90 days, accounts never confirmed after 30 days). To check them: `select * from cron.job_run_details order by start_time desc limit 20;`

### 8.3 CAPTCHA (stops bots at sign-up, login and password reset)

1. At [dash.cloudflare.com](https://dash.cloudflare.com), sign up free, open **Turnstile > Add widget**, name it Nestly, add your site's domain (`nestly-ug.vercel.app`, plus `localhost` for testing), choose **Managed**.
2. Copy the **Site key** into Vercel: **Project > Settings > Environment Variables** > `VITE_TURNSTILE_SITE_KEY`. Redeploy.
3. Copy the **Secret key** into Supabase: **Authentication > Attack Protection > Enable CAPTCHA protection**, provider **Turnstile**, paste it, save.

Do step 3 only after step 2 is live, or nobody can log in.

### 8.4 Two-step login

**Authentication > Multi-Factor** should show TOTP (authenticator app) enabled; it is on by default. After 0012, admin powers only work after the admin passes two-step login, and approving, rejecting or pausing accounts needs a password or code from the last 15 minutes. Owners can turn it on in **Settings > Two-step login**. If an admin loses their phone, another admin removes the factor in **Authentication > Users > (the user) > Remove MFA factors**.

### 8.5 GitHub

In the repository, open **Settings > Code security** and turn on **Dependabot alerts** and **Dependabot security updates**. The `.github` folder already has the Dependabot settings and a **Checks** workflow that, on every push, checks libraries for known security holes, looks for secrets written in the code, and builds the site. **Secret scanning** with push protection is free only for public repositories; for a private repository the Checks workflow is the fallback.

### 8.6 Practise a restore (do it once, then each semester)

1. In **Storage > backups**, download the newest `nestly-....json`.
2. Create a second, empty Supabase project. Run migrations `0001` to `0012` in it.
3. On your computer, in the Nestly folder: `SUPABASE_URL=https://NEW-REF.supabase.co SERVICE_KEY=<new project's service role key> node scripts/restore.mjs nestly-....json`
4. Check the row counts it prints against the old project, then delete the test project.

Logins live in Supabase Auth and are not in the backup: after a real disaster, people reset their passwords. Uploaded files stay in Storage.

### 8.7 The law

Before real users join, register Nestly with the **Personal Data Protection Office (PDPO)** at [pdpo.go.ug](https://pdpo.go.ug), as the Data Protection and Privacy Act, 2019 requires. The privacy policy page already lists what Nestly keeps and for how long.

## Keys: what is safe where

| Key | Where it's used | Safe to share? |
|---|---|---|
| Project URL | `.env`, Vercel | Yes |
| anon / publishable key | `.env`, Vercel | Yes. It's built for browsers, and the security rules do the protecting. |
| service_role / secret key | only inside Supabase functions | **Never.** Don't put it in `.env`, GitHub or chat. |
| Flutterwave Client Secret | only in Supabase function secrets | **Never.** |
| database password | nowhere in the app | **Never.** |
