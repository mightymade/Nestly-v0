// Makes a backup of every Nestly table as one JSON file in the private "backups" storage bucket, named by date,
// and keeps the newest 30. The free Supabase plan has no backups, so this is the safety net.
// It is started once a day by the scheduled job in SETUP.md, section 8, which sends the CRON_SECRET header.
// To restore into a new project, see SETUP.md, section 9 (scripts/restore.mjs).
// Deploy: Edge Functions > Deploy a new function > name it "backup" > paste this file. Turn OFF "Verify JWT".
// Secret: CRON_SECRET (the same one as send-mail).
// Note: it backs up the tables, not the uploaded files. Hostel photos and documents stay in Storage.
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

export const TABLES = ['universities', 'config', 'profiles', 'owner_accounts', 'hostels', 'rooms', 'bookings', 'payments', 'tenants', 'reviews', 'saved',
  'visitors', 'notices', 'invites', 'docs', 'flags', 'sub_payments', 'notifications', 'audit', 'security_reports'];

export async function handle(req: Request, env: { url: string; serviceKey: string; secret: string }): Promise<Response> {
  if (req.method !== 'POST') return new Response('Use POST.', { status: 405 });
  if (!env.secret || req.headers.get('x-cron-secret') !== env.secret) return new Response('Not allowed.', { status: 401 });
  const db = createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  await db.storage.createBucket('backups', { public: false }).catch(() => undefined);
  const out: Record<string, unknown[]> = {};
  for (const t of TABLES) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from(t).select('*').range(from, from + 999);
      if (error) throw new Error(`${t}: ${error.message}`);
      rows.push(...(data ?? [])); if (!data || data.length < 1000) break;
    }
    out[t] = rows;
  }
  const name = `nestly-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
  const body = new Blob([JSON.stringify({ made: new Date().toISOString(), tables: out })], { type: 'application/json' });
  const { error } = await db.storage.from('backups').upload(name, body, { contentType: 'application/json' });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  // Keep the newest 30 backups.
  const { data: files } = await db.storage.from('backups').list('', { limit: 1000, sortBy: { column: 'name', order: 'desc' } });
  const old = (files ?? []).filter(f => f.name.startsWith('nestly-')).slice(30).map(f => f.name);
  if (old.length) await db.storage.from('backups').remove(old);
  return new Response(JSON.stringify({ saved: name, rows: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])) }), { headers: { 'Content-Type': 'application/json' } });
}

// @ts-ignore Deno is the runtime on Supabase.
if (typeof Deno !== 'undefined') Deno.serve(req => handle(req, { url: Deno.env.get('SUPABASE_URL')!, serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, secret: Deno.env.get('CRON_SECRET') ?? '' }));
