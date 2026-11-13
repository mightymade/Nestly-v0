# Nestly

A student hostel booking platform for Uganda Christian University and other Ugandan universities. Built as a UCU E-commerce group project.

This repository is the **front end**. Every screen works, but the data lives in the browser (localStorage), so the UI could be finished before the backend. The backend team replaces the fake data with real calls, one function at a time. See "For the backend team" below.

## Run it

You need Node.js 18 or newer.

```bash
npm install
npm run dev           # opens on http://localhost:5173
npm run build         # checks types, then builds into dist/
npm run build:single  # one self-contained HTML file in dist-single/, for sharing a preview
```

On Vercel it deploys as is. `vercel.json` sends every link to `index.html`, so deep links like `/s/explore/h1` work.

## Demo accounts

The password for every demo account is `nestly123`.

| Role | Log in with | What you can try |
|---|---|---|
| Student | `sarah.atim@ucu.ac.ug` | Explore, save, book, My hostel |
| Custodian | `peter.k` | Today, visitors, gate QR, rooms, check in |
| Owner | `grace.n` | 3 live hostels, money, subscription, staff |
| Owner waiting for approval | `daniel.o` | What a new owner sees |
| Admin | `admin` | Reviews, subscriptions, flags, universities |

- **Custodian invite code:** `HILL-4821`
- **Declined payment:** use a phone number ending in `0000` when paying, and the payment is declined so you can see the "Try again" path.
- **Start fresh:** the demo box on the login page has "Reset demo".
- **Guests:** anyone can browse Explore without an account. Saving, booking and reporting ask them to sign up.

## How the money works

The UI must never contradict this.

- Students pay the booking fee **straight to the owner's own** mobile money or bank account. Nestly never holds, refunds or forwards that money.
- Nestly earns only from a **monthly subscription** that owners pay. The admin sets the price (per hostel or per owner) and the grace period under Settings > Subscription price.
- Owners who don't pay can have their hostels paused. The hostels come back as soon as they pay.

## Folder structure

```
src/
  App.tsx            routes for every role, plus the public /visit/:hostelId page the gate QR opens
  main.tsx           starts the app
  layouts/           AppShell: sidebar on PC, bottom tabs on phone
  pages/
    auth/            welcome, login, student sign-up, custodian invite
    student/         Explore, hostel page, booking, saved, bookings, my hostel
    custodian/       today, visitors, tenants, rooms, notices, gate QR
    owner/           overview, hostels and the hostel editor, bookings, money, staff, owner sign-up
    admin/           overview, reviews, hostels, users, subscriptions, flags, universities, activity
    shared/          settings and help, used by every role
    VisitPage.tsx    what a visitor's phone shows after scanning the gate QR
  components/        shared UI: tables, dialogs, filters, maps, money input, toasts
  services/
    api.ts           THE ONLY place screens get or change data
    db.ts            the fake database in localStorage
    session.tsx      who is logged in
    useData.ts       loads data and reloads after a change
  data/
    types.ts         the shape of every record (User, Hostel, Booking ...)
    seed.ts          the demo data
    catalog.ts       fixed lists: universities, amenities, what each role can do
  lib/               small helpers: formatting, maps, theme, CSV, QR art
  styles/            plain CSS: tokens (colours, spacing), base, layout, components
```

## Rules for anyone changing the UI

1. **Screens only call `src/services/api.ts`.** Never read `db.ts` or localStorage from a page. This is what lets the backend be swapped in without touching screens.
2. **Plain English, no em dashes.** Money is written `UGX 45,000`, dates `13 Nov 2026`, semesters `Jan to May 2027`.
3. **One screen on PC.** From 900px wide and 620px tall, pages don't scroll; long lists scroll inside their card. Phones scroll normally.
4. **Use the shared pieces:** `PageHeader`, `DataTable`, `SearchIcon`, `Segmented`, `Dropdown`, `DateFilter`, `Overlay`, `MoneyInput`, `Pill`, `EmptyState`.
5. **Colours come from `styles/tokens.css`** so dark mode keeps working. Don't hard-code colours in components.

## Changing the demo data

The fake database is saved in the browser under the key `nestly.db.vNN` (see `KEY` at the top of `src/services/db.ts`).

When you change `src/data/seed.ts` or add a field to `src/data/types.ts`, **bump the number** (for example `v14` to `v15`). Browsers holding the old version then load the new seed instead of old data.

## For the backend team

Every exported function in `src/services/api.ts` has a short comment above it: what it does, what it takes in, and what it returns. That list is the contract.

- Replace the body of a function with a real API call, but **keep its name, inputs and outputs the same**. Then no screen needs to change.
- Functions are `async` and wait a little on purpose (`wait(...)`), so loading states already work.
- Errors are thrown as `ApiError(message, field?)`. Forms show `message` under the field named by `field`. Keep that pattern.
- `commit()` saves the fake database and tells screens to reload. A real backend can replace it with refetching.
- Things that are fake today and need real work:
  - logins and sessions
  - email sending
  - mobile money payments (MTN and Airtel)
  - owner subscriptions
  - file uploads (photos, IDs)
  - view and save counts
  - notifications
  - the activity log
