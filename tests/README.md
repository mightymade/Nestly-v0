# Nestly tests

Two scripts check the prototype in a real browser (Playwright), on real data (Supabase), with fictitious accounts and mock payments only.

| Script | What it checks | Output |
|---|---|---|
| `run-tests.cjs` | The 10 Phase 3 test cases (T01 to T10): 7 positive, 2 validation, 1 access control | `evidence/results.json`, `evidence/results.md`, one screenshot per step |
| `usability-checks.cjs` | 48 screens at phone (360 x 740) and laptop (1366 x 768) size: sideways scrolling, unnamed controls, tap targets, WCAG 2.1 A and AA rules (axe-core), keyboard focus on the login page, and Explore load time on slow 4G | `evidence/usability.json` |

## What you need

- Node.js 18 or newer, and `npm install` done in the project folder
- Playwright and axe-core come with `npm ci`; download the browser once with `npx playwright install chromium`
- `psql` (PostgreSQL client), because the tests also check the database
- A Supabase project (or a local copy) with migrations 0001 to 0009 and `supabase/sample_data.sql` loaded, plus an admin account `admin` / `nestly123`
- The payments function deployed in sandbox mode (see `supabase/SETUP.md`)
- For T02 (email confirmation) the confirmation emails must be readable: on a local copy, set `MAIL_LOG` to the email catcher's log file

## Run

```bash
npm run dev                         # the app, on http://127.0.0.1:5173
BASE=http://127.0.0.1:5173 PGURL=postgres://postgres@localhost:54322/postgres MAIL_LOG=/path/to/mail.jsonl node tests/run-tests.cjs

npm run build && npx vite preview --port 4174
BASE=http://127.0.0.1:4174 node tests/usability-checks.cjs
```

Run `run-tests.cjs` on freshly loaded sample data: several tests change it (an owner is approved, a review is posted, a booking is cancelled).

## Accounts used (all fictitious, password `nestly123`)

| Role | Login |
|---|---|
| Student | `sarah.atim@ucu.ac.ug`, `tonny.kato20@ucu.ac.ug`, `ruth.nakku10@ucu.ac.ug`, `prossy.nalwoga2@ucu.ac.ug` |
| New student made by T02 | `brenda.<random>@ucu.ac.ug` / `nestly123x` |
| Custodian | `peter.k` (Hillview Hostel) |
| Owner | `grace.n`; `daniel.o` (waiting for approval) |
| Admin | `admin` |

## Mock payments

Payments go to Flutterwave's sandbox (or a local stand-in). No real money moves. In the local stand-in, a phone number ending in `0001` is declined, and the code is always `123456`.
