// Restores a Nestly backup (made by the "backup" server function) into a Supabase project.
// Use it on a NEW, empty project where migrations 0001 to 0012 have been run, never on the live one by mistake.
//
//   SUPABASE_URL=https://xxxx.supabase.co SERVICE_KEY=<service role key of that project> node scripts/restore.mjs nestly-2026-11-25-03-00-00.json
//
// Accounts (logins) live in Supabase Auth, which the backup cannot copy. People in the backup get a profile back
// only if an account with the same id exists; others are skipped and listed at the end.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const [file] = process.argv.slice(2);
const url = process.env.SUPABASE_URL, key = process.env.SERVICE_KEY;
if (!file || !url || !key) { console.error('Usage: SUPABASE_URL=... SERVICE_KEY=... node scripts/restore.mjs <backup.json>'); process.exit(1); }
const { tables } = JSON.parse(readFileSync(file, 'utf8'));
const db = createClient(url, key, { auth: { persistSession: false } });
const ORDER = ['universities', 'config', 'profiles', 'owner_accounts', 'hostels', 'rooms', 'bookings', 'payments', 'tenants', 'reviews', 'saved',
  'visitors', 'notices', 'invites', 'docs', 'flags', 'sub_payments', 'notifications', 'audit', 'security_reports'];
const skipped = [];
for (const t of ORDER) {
  const rows = tables[t] ?? []; let ok = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const part = rows.slice(i, i + 200);
    const { error } = await db.from(t).upsert(part);
    if (!error) { ok += part.length; continue; }
    for (const r of part) { const { error: e } = await db.from(t).upsert(r); if (e) skipped.push(`${t} ${r.id ?? r.owner_id ?? ''}: ${e.message}`); else ok++; }
  }
  console.log(`${t}: ${ok} of ${rows.length} rows`);
}
if (skipped.length) { console.log(`\n${skipped.length} rows skipped:`); skipped.slice(0, 50).forEach(s => console.log(' ', s)); }
