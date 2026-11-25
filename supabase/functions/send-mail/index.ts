// Sends the security emails waiting in the outbox table: payout changes, new sign-ins and similar.
// It sends through the same Gmail account as Supabase Auth (SETUP.md, section 4), at most 20 per run.
// It is started every minute by the scheduled job in SETUP.md, section 8, which sends the CRON_SECRET header.
// Deploy: Edge Functions > Deploy a new function > name it "send-mail" > paste this file. Turn OFF "Verify JWT".
// Secrets: GMAIL_USER, GMAIL_APP_PASSWORD (as for send-invite) and CRON_SECRET (any long random text).
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

export type Mail = { to: string; subject: string; text: string };
export type Env = { url: string; serviceKey: string; secret: string; send: (m: Mail) => Promise<void> };

export async function handle(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'POST') return new Response('Use POST.', { status: 405 });
  if (!env.secret || req.headers.get('x-cron-secret') !== env.secret) return new Response('Not allowed.', { status: 401 });
  const db = createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: rows } = await db.from('outbox').select('*').is('sent_at', null).is('error', null).order('id').limit(20);
  let sent = 0, failed = 0;
  for (const r of rows ?? []) {
    try { await env.send({ to: r.to_email, subject: r.subject, text: r.body }); await db.from('outbox').update({ sent_at: new Date().toISOString() }).eq('id', r.id); sent++; }
    catch (e) { await db.from('outbox').update({ error: String((e as Error).message ?? e).slice(0, 300) }).eq('id', r.id); failed++; }
  }
  return new Response(JSON.stringify({ sent, failed }), { headers: { 'Content-Type': 'application/json' } });
}

// @ts-ignore Deno is the runtime on Supabase.
if (typeof Deno !== 'undefined') {
  // @ts-ignore Deno
  const env = (k: string) => Deno.env.get(k) ?? '';
  // @ts-ignore Deno is the runtime on Supabase.
  Deno.serve(req => handle(req, {
    url: env('SUPABASE_URL'), serviceKey: env('SUPABASE_SERVICE_ROLE_KEY'), secret: env('CRON_SECRET'),
    send: async m => {
      const { SMTPClient } = await import('https://deno.land/x/denomailer@1.6.0/mod.ts');
      const client = new SMTPClient({ connection: { hostname: 'smtp.gmail.com', port: 465, tls: true, auth: { username: env('GMAIL_USER'), password: env('GMAIL_APP_PASSWORD') } } });
      // Give Gmail 20 seconds. Closing the connection can fail after the email has already gone, so that error is ignored.
      let timer = 0;
      const timeout = new Promise<never>((_, no) => { timer = setTimeout(() => no(new Error('timed out waiting for Gmail')), 20000); });
      try { await Promise.race([client.send({ from: `Nestly <${env('GMAIL_USER')}>`, to: m.to, subject: m.subject, content: m.text }), timeout]); }
      finally { clearTimeout(timer); await Promise.resolve().then(() => client.close()).catch(() => undefined); }
    },
  }));
}
