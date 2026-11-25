// Logs people in. Every password login in the app goes through here so the server can:
//  - turn a username into its email without ever showing the email to the browser (finding F1),
//  - slow down password guessing: 5 wrong passwords for one account in 15 minutes locks it for 15 minutes,
//    and 30 tries from one network address in 15 minutes are refused,
//  - pass the CAPTCHA answer on to Supabase, which checks it (when CAPTCHA is turned on),
//  - record each try for the admins' security signals, and email the person when a new device signs in.
// Deploy: Supabase dashboard > Edge Functions > Deploy a new function > name it "login" > paste this file.
// Turn OFF "Verify JWT" for it (people are not logged in yet). SUPABASE_URL, SUPABASE_ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY are provided automatically.
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
export const clientIp = (req: Request) => (req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '').split(',')[0]!.trim().slice(0, 64);
const shortAgent = (ua: string) => {
  const b = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'a browser';
  const o = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone or iPad' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'an unknown system';
  return `${b} on ${o}`;
};
const NO_MATCH = 'That email or username and password do not match. Try again or reset your password.';

export async function handle(req: Request, env: { url: string; serviceKey: string; anonKey: string }): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Use POST.' }, 405);
  let input: { login?: string; password?: string; device?: string; captchaToken?: string };
  try { input = await req.json(); } catch { return reply({ error: 'Send your login details.' }, 400); }
  const login = String(input.login ?? '').trim().toLowerCase().slice(0, 120);
  const password = String(input.password ?? '');
  const device = String(input.device ?? '').replace(/[^a-z0-9-]/gi, '').slice(0, 64);
  const ip = clientIp(req); const agent = shortAgent(req.headers.get('user-agent') ?? '');
  if (!login || !password) return reply({ error: 'Enter your email or username and your password.', field: 'id' }, 400);

  const admin = createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  // Too many tries? Count failures for this account, and all tries from this address.
  const since = new Date(Date.now() - 15 * 60000).toISOString();
  // The three checks before the password do not depend on each other, so they run at the same time.
  const [{ count: fails }, okIp, email] = await Promise.all([
    admin.from('login_events').select('id', { count: 'exact', head: true }).ilike('login', login).eq('ok', false).gte('at', since),
    ip ? admin.rpc('rate_ok', { p_key: 'login-ip:' + ip, p_max: 30, p_seconds: 900 }).then(r => r.data) : Promise.resolve(true),
    // Username to email, on the server only.
    login.includes('@') ? Promise.resolve(login) : admin.rpc('email_for_login', { p_login: login }).then(r => (r.data as string | null) ?? ''),
  ]);
  if ((fails ?? 0) >= 5) return reply({ error: 'Too many wrong passwords. Wait 15 minutes, or reset your password.', field: 'password', locked: true }, 429);
  if (okIp === false) return reply({ error: 'Too many tries from this network. Wait 15 minutes.' }, 429);
  const anon = createClient(env.url, env.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const res = email ? await anon.auth.signInWithPassword({ email, password, options: input.captchaToken ? { captchaToken: String(input.captchaToken) } : undefined }) : null;
  const err = res?.error; const user = res?.data.user;
  if (!res || err || !user || !res.data.session) {
    const captcha = /captcha/i.test(err?.message ?? '');
    if (!captcha) await admin.from('login_events').insert({ login, ok: false, ip, device, agent });
    if (captcha) return reply({ error: 'Please complete the check that you are not a robot, then try again.', captcha: true }, 400);
    if (/confirm/i.test(err?.message ?? '')) return reply({ error: 'Confirm your email first. Open the link we sent you when you signed up.', field: 'id' }, 400);
    if (/rate|too many/i.test(err?.message ?? '')) return reply({ error: 'Too many tries. Wait a few minutes.' }, 429);
    return reply({ error: NO_MATCH, field: 'password' }, 400);
  }
  // Recording the login and the new-device email happen after the reply, so the person does not wait for them.
  const after = (async () => {
    const { data: seen } = await admin.from('login_events').select('device').eq('user_id', user.id).eq('ok', true).limit(200);
    await admin.from('login_events').insert({ user_id: user.id, login, ok: true, ip, device, agent });
    if (seen && seen.length && device && !seen.some(s => s.device === device)) {
      const { data: p } = await admin.from('profiles').select('name').eq('id', user.id).maybeSingle();
      const when = new Date().toLocaleString('en-GB', { timeZone: 'Africa/Kampala', dateStyle: 'medium', timeStyle: 'short' });
      await admin.rpc('queue_mail', { p_to: user.email ?? '', p_subject: 'New sign-in to your Nestly account',
        p_body: `Hello ${String(p?.name ?? '').split(' ')[0] || 'there'},\n\nYour Nestly account was just used to sign in on ${agent}, on ${when} (Uganda time).\n\nIf this was you, you can ignore this email.\nIf it was not you, reset your password now from the login page, and tell us at the Nestly security page.\n\nNestly` });
    }
  })().catch(() => undefined);
  // @ts-ignore EdgeRuntime exists on Supabase: it keeps the function alive until `after` finishes.
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(after); else await after;
  return reply({ access_token: res.data.session.access_token, refresh_token: res.data.session.refresh_token });
}

// @ts-ignore Deno is the runtime on Supabase.
if (typeof Deno !== 'undefined') Deno.serve(req => handle(req, { url: Deno.env.get('SUPABASE_URL')!, serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, anonKey: Deno.env.get('SUPABASE_ANON_KEY')! }));
