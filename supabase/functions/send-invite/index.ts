// Emails a custodian their invite: a link that opens the invite screen with the code filled in, and the code itself.
// Only the owner of the invite's hostel can send it, and only while the invite is unused, not cancelled and under 7 days old.
// It sends through the same Gmail account Supabase Auth uses (see SETUP.md, section 4), on port 465.
// Deploy: Supabase dashboard > Edge Functions > Deploy a new function > name it "send-invite" > paste this file.
// Secrets (Edge Functions > Secrets): GMAIL_USER, GMAIL_APP_PASSWORD (the same 16-letter app password as the SMTP settings),
// and SITE_URL (for example https://nestly-ug.vercel.app). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export const isRealEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && !e.endsWith('@sms.nestly.app');

/** Turns an SMTP error into a short reason the owner (and whoever reads the logs) can act on. */
export function mailProblem(e: unknown): string {
  const m = String((e as Error)?.message ?? e);
  if (/535|username and password|badcredentials|invalid login/i.test(m)) return 'Gmail refused the app password';
  if (/5\.7\.9|application-specific/i.test(m)) return 'Gmail needs an app password, not the normal password';
  if (/534|web browser|5\.7\.14/i.test(m)) return 'Gmail wants the account owner to sign in once in a browser';
  if (/550|5\.7\.1|blocked|spam|unsolicited/i.test(m)) return 'Gmail blocked the message';
  if (/5\.4\.5|quota|limit/i.test(m)) return 'Gmail daily sending limit reached';
  if (/421|try again later|temporar/i.test(m)) return 'Gmail asked us to try again later';
  if (/timed out|timeout/i.test(m)) return 'Gmail did not answer in time';
  if (/connect|refused|dns|network/i.test(m)) return 'could not reach Gmail';
  return 'Gmail gave an error';
}

export type Mail = { to: string; subject: string; text: string; html: string };
export type Env = { url: string; serviceKey: string; site: string; send: (m: Mail) => Promise<void> };

/** The invite email, in plain text and simple HTML. */
export function inviteMail(o: { to: string; name: string; hostel: string; owner: string; code: string; site: string }): Mail {
  const first = o.name.split(' ')[0];
  const link = `${o.site.replace(/\/$/, '')}/invite?code=${encodeURIComponent(o.code)}`;
  const text = `Hello ${first},\n\n${o.owner} has invited you to work as custodian at ${o.hostel} on Nestly.\n\nOpen this link to set up your account:\n${link}\n\nIf it asks for a code, use ${o.code}. The invite works for 7 days.\n\nIf you were not expecting this, you can ignore this email.\n\nNestly`;
  const html = `<!doctype html><html><body style="margin:0;background:#F2F4FA;font-family:Arial,Helvetica,sans-serif;color:#1A1C29">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border-radius:16px;padding:28px">
<tr><td style="padding-bottom:20px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="vertical-align:middle"><img src="${esc(o.site.replace(/\/$/, ''))}/email-logo.png" width="36" height="36" alt="Nestly" style="display:block;border:0;border-radius:8px"></td><td style="vertical-align:middle;padding-left:10px;font-size:20px;font-weight:bold;color:#1A1C29">Nestly</td></tr></table></td></tr>
<tr><td style="font-size:16px;line-height:24px">Hello ${esc(first)},<br><br>${esc(o.owner)} has invited you to work as custodian at <b>${esc(o.hostel)}</b> on Nestly.</td></tr>
<tr><td style="padding:24px 0"><a href="${esc(link)}" style="display:inline-block;background:#4F5BEA;color:#fff;text-decoration:none;font-weight:bold;padding:14px 22px;border-radius:12px">Set up my account</a></td></tr>
<tr><td style="font-size:14px;line-height:21px;color:#3B3F51">If it asks for a code, use<div style="font-size:24px;font-weight:bold;letter-spacing:2px;color:#1A1C29;padding:8px 0">${esc(o.code)}</div>The invite works for 7 days.</td></tr>
<tr><td style="font-size:12px;line-height:18px;color:#676C82;padding-top:20px;border-top:1px solid #E3E6EF">If you were not expecting this, you can ignore this email.</td></tr>
</table></td></tr></table></body></html>`;
  return { to: o.to, subject: `You're invited to ${o.hostel} on Nestly`, text, html };
}

export async function handle(req: Request, env: Env): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Use POST.' }, 405);
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  let input: { code?: string };
  try { input = await req.json(); } catch { return reply({ error: 'Send the invite code.' }, 400); }
  const code = String(input.code ?? '').trim().toUpperCase();

  const admin = createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  // Who is asking? Only a logged-in, approved owner of the invite's hostel may send it.
  const { data: who } = await admin.auth.getUser(token);
  if (!who?.user) return reply({ error: 'Log in again, then try once more.' }, 401);
  const { data: me } = await admin.from('profiles').select('id, name, role, owner_status, suspended').eq('id', who.user.id).maybeSingle();
  if (!me || me.role !== 'owner' || me.owner_status !== 'approved' || me.suspended) return reply({ error: 'Only an approved owner can send invites.' }, 403);
  // At most 20 invite emails an hour per owner.
  const { data: okRate } = await admin.rpc('rate_ok', { p_key: 'invite:' + me.id, p_max: 20, p_seconds: 3600 });
  if (okRate === false) return reply({ error: 'You have sent many invites in the last hour. Try again later.' }, 429);
  const { data: inv } = await admin.from('invites').select('*').eq('code', code).maybeSingle();
  const { data: h } = inv ? await admin.from('hostels').select('id, name, owner_id').eq('id', inv.hostel_id).maybeSingle() : { data: null };
  if (!inv || !h || h.owner_id !== me.id) return reply({ error: 'That invite was not found.' }, 404);
  if (inv.used) return reply({ error: 'This invite has already been used.' }, 400);
  if (inv.cancelled) return reply({ error: 'This invite was cancelled.' }, 400);
  if (new Date(inv.at).getTime() < Date.now() - 7 * 86400000) return reply({ error: 'This invite has expired. Renew it first.' }, 400);
  if (!isRealEmail(inv.email)) return reply({ error: 'This invite has a phone number, not an email. Share it on WhatsApp instead.' }, 400);

  try {
    await env.send(inviteMail({ to: inv.email, name: inv.name, hostel: h.name, owner: me.name, code: inv.code, site: env.site }));
  } catch (e) {
    console.error('send-invite failed', e);
    return reply({ error: `We could not send the email (${mailProblem(e)}). Share the invite on WhatsApp instead.`, reason: mailProblem(e) }, 502);
  }
  await admin.from('audit').insert({ actor_id: me.id, actor_role: 'owner', action: 'Emailed custodian invite', target: h.name, detail: `${inv.name} (${inv.email})` });
  return reply({ sent: inv.email });
}

// @ts-ignore Deno is the runtime on Supabase.
if (typeof Deno !== 'undefined') {
  // @ts-ignore Deno
  const env = (k: string) => Deno.env.get(k) ?? '';
  // @ts-ignore Deno is the runtime on Supabase.
  Deno.serve(req => handle(req, {
    url: env('SUPABASE_URL'), serviceKey: env('SUPABASE_SERVICE_ROLE_KEY'), site: env('SITE_URL') || 'https://nestly-ug.vercel.app',
    send: async m => {
      const { SMTPClient } = await import('https://deno.land/x/denomailer@1.6.0/mod.ts');
      const client = new SMTPClient({ connection: { hostname: 'smtp.gmail.com', port: 465, tls: true, auth: { username: env('GMAIL_USER'), password: env('GMAIL_APP_PASSWORD') } } });
      // Give Gmail 20 seconds. Closing the connection can fail after the email has already gone, so that error is ignored.
      let timer = 0;
      const timeout = new Promise<never>((_, no) => { timer = setTimeout(() => no(new Error('timed out waiting for Gmail')), 20000); });
      try { await Promise.race([client.send({ from: `Nestly <${env('GMAIL_USER')}>`, to: m.to, subject: m.subject, content: m.text, html: m.html }), timeout]); }
      finally { clearTimeout(timer); await Promise.resolve().then(() => client.close()).catch(() => undefined); }
    },
  }));
}
