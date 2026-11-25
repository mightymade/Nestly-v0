// Mobile money payments through Flutterwave (API v4): booking fees (students) and the monthly subscription (owners).
// One function does four jobs, chosen by the request:
//   { action: "start", ... }      signed in: checks the request, notes a pending payment, asks Flutterwave to charge the phone
//   { action: "otp", ... }        signed in: sends the code Flutterwave asked for (test mode always asks for 123456)
//   { action: "confirm", ... }    asks Flutterwave how the charge is doing, then confirms or cancels it
//   anything else with "data"     Flutterwave's webhook: the same check, in case the person closed the app
// Nothing is ever marked paid on the word of the browser or of a webhook: Flutterwave is always asked directly.
// Prices always come from the database.
//
// Deploy: Supabase dashboard > Edge Functions > Deploy a new function > name it "payments" > paste this file.
// Then turn OFF "Verify JWT" for it (Flutterwave's webhook has no Supabase login; this file checks logins itself).
// Secrets (Edge Functions > Secrets): FLW_CLIENT_ID and FLW_CLIENT_SECRET, from Flutterwave > API keys.
// Optional: FLW_BASE_URL (default: Flutterwave's sandbox, https://developersandbox-api.flutterwave.com).
// Supabase provides SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY automatically.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';

type Env = { url: string; serviceKey: string; clientId: string; clientSecret: string; base?: string; tokenUrl?: string; scenario?: string };
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = (error: string, status = 400, field?: string) => reply({ error, field }, status);

/* ---------- semesters: the same rules as the app (src/services/api.ts) ---------- */
type Sem = { start: string; end: string; open?: boolean };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DEFAULT_SEMS: Sem[] = [{ start: '2027-01-11', end: '2027-05-14', open: true }, { start: '2027-08-09', end: '2027-12-10', open: false }];
const ugandaToday = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
const semName = (s: Sem) => { const a = new Date(s.start + 'T00:00:00Z'), b = new Date(s.end + 'T00:00:00Z');
  return `${MON[a.getUTCMonth()]}${a.getUTCFullYear() !== b.getUTCFullYear() ? ` ${a.getUTCFullYear()}` : ''} to ${MON[b.getUTCMonth()]} ${b.getUTCFullYear()}`; };
function bookingSem(hostelSems: Sem[] | null, uniSems: Sem[] | null): Sem | null {
  const today = ugandaToday(); let list: Sem[];
  if (hostelSems?.length) list = hostelSems;
  else if (uniSems?.length) { let opened = false; list = uniSems.map(s => { const open = !opened && s.end >= today; if (open) opened = true; return { ...s, open }; }); }
  else list = DEFAULT_SEMS;
  return list.slice().sort((x, y) => x.start.localeCompare(y.start)).find(s => s.open && s.end >= today) ?? null;
}

/* ---------- Flutterwave v4 ---------- */
let token: { value: string; until: number } | null = null;
/** An access token from Flutterwave's login server, kept until a minute before it expires. */
async function accessToken(env: Env): Promise<string> {
  if (token && token.until > Date.now()) return token.value;
  const r = await fetch(env.tokenUrl ?? 'https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.clientId, client_secret: env.clientSecret, grant_type: 'client_credentials' }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('Flutterwave did not accept the client ID and secret.');
  token = { value: j.access_token, until: Date.now() + (Number(j.expires_in ?? 300) - 60) * 1000 };
  return token.value;
}
/** Live keys go to production; without FLW_BASE_URL the function talks to Flutterwave's sandbox. */
const isSandbox = (env: Env) => !env.base || /sandbox/i.test(env.base);
/**
 * Sandbox only (developer.flutterwave.com/v4/docs/testing, "Mobile Money"): the sandbox's default mobile money flow is a
 * phone notification that no real phone receives, so the charge stays pending. "scenario:auth_redirect" makes Flutterwave
 * return a test approval page instead; Nestly opens it and the person comes back to /pay/return.
 * FLW_SCENARIO in the function secrets overrides this. Live keys never send a scenario.
 */
const scenarioOf = (env: Env) => (isSandbox(env) ? (env.scenario?.trim() || 'scenario:auth_redirect') : '');
async function flw(env: Env, method: string, path: string, body?: unknown, base?: string, extra: Record<string, string> = {}) {
  const id = crypto.randomUUID();
  const r = await fetch((base ?? env.base ?? 'https://developersandbox-api.flutterwave.com') + path, {
    method, headers: { Authorization: `Bearer ${await accessToken(env)}`, 'Content-Type': 'application/json', 'X-Trace-Id': id, 'X-Idempotency-Key': id, ...extra },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  // One line per call in Supabase > Edge Functions > payments > Logs, to see what Flutterwave answered. No keys or phone numbers.
  console.log(`flutterwave ${method} ${path.replace(/\?.*$/, '')} -> http ${r.status}, ${j.status ?? '-'}, charge ${j.data?.status ?? '-'}, next ${j.data?.next_action?.type ?? '-'}${j.status !== 'success' ? `, says: ${JSON.stringify(j.error ?? j.message ?? j).slice(0, 300)}` : ''}`);
  return { ok: r.ok && j.status === 'success', data: j.data, message: (j.error?.message ?? j.message) as string | undefined };
}
/** Reads a charge. Flutterwave's own sandbox guide reads charges from a second address, so that one is tried if the first fails. */
async function getCharge(env: Env, id: string) {
  const path = `/charges/${encodeURIComponent(id)}`;
  const v = await flw(env, 'GET', path);
  if (v.ok || env.base) return v;
  return flw(env, 'GET', path, undefined, 'https://api.flutterwave.cloud/developersandbox');
}
/** What the person has to do next, in a form the app can show: approve on the phone, type a code, or open a page. */
function nextStep(charge: Record<string, any>) {
  const n = charge?.next_action ?? {};
  if (n.type === 'requires_otp') return { type: 'otp', note: n.requires_otp?.note ?? 'Enter the code sent to your phone.' };
  if (n.type === 'redirect_url') return { type: 'redirect', url: n.redirect_url?.url };
  if (n.type === 'requires_pin') return { type: 'otp', note: 'Enter your mobile money PIN.' };
  return { type: 'approve', note: n.payment_instruction?.note ?? 'Approve the payment on your phone.' };
}
/** Asks Flutterwave how a charge is doing, then confirms or cancels it in the database. */
async function settle(db: SupabaseClient, env: Env, txRef: string) {
  const { data: p } = await db.from('payments').select('*').eq('tx_ref', txRef).maybeSingle();
  if (!p) return { result: 'failed', error: 'We could not find this payment.' };
  if (p.status !== 'pending') {
    // Already settled (the app asked twice, or the webhook came first): report what happened.
    const { data: b } = p.booking_id ? await db.from('bookings').select('cancel_until').eq('id', p.booking_id).maybeSingle() : { data: null };
    const { data: a } = p.kind === 'subscription' ? await db.from('owner_accounts').select('sub_paid_until').eq('owner_id', p.user_id).maybeSingle() : { data: null };
    return { result: p.status === 'successful' ? 'paid' : 'failed', kind: p.kind, booking_id: p.booking_id, hostel_id: p.hostel_id, reason: p.note ?? undefined,
      cancel_until: b?.cancel_until, paid_until: a?.sub_paid_until };
  }
  if (!p.flw_id) return { result: 'pending', kind: p.kind, hostel_id: p.hostel_id };
  const v = await getCharge(env, p.flw_id); const c = v.data;
  if (v.ok && c?.reference === txRef && c.status === 'succeeded') {
    const { data, error } = await db.rpc('finish_payment', { p_tx_ref: txRef, p_flw_id: String(c.id), p_flw_ref: String(c.id), p_amount: Math.floor(Number(c.amount)), p_currency: String(c.currency) });
    if (error) return { result: 'failed', error: error.message };
    return data;
  }
  if (v.ok && c?.reference === txRef && (c.status === 'failed' || c.status === 'voided')) { const { data } = await db.rpc('fail_payment', { p_tx_ref: txRef }); return data; }
  return { result: 'pending', kind: p.kind, hostel_id: p.hostel_id, next: v.ok ? nextStep(c) : undefined };
}

export async function handle(req: Request, env: Env): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail('Use POST.', 405);
  const db = createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let input: Record<string, any>;
  try { input = await req.json(); } catch { return fail('Send the payment details.'); }
  if (!env.clientId || !env.clientSecret) return fail('Payments are not set up yet. Add FLW_CLIENT_ID and FLW_CLIENT_SECRET to the function secrets.', 500);

  // Flutterwave's webhook. It is only a hint: the charge is looked up with Flutterwave before anything changes.
  if (!input.action && input.data) {
    const ref = String(input.data.reference ?? input.data.tx_ref ?? '');
    if (ref) await settle(db, env, ref).catch(() => undefined);
    return reply({ ok: true });
  }
  if (input.action === 'confirm') {
    const txRef = String(input.tx_ref ?? ''); if (!txRef) return fail('Missing payment reference.');
    try { return reply(await settle(db, env, txRef)); } catch (e) { return fail((e as Error).message, 502); }
  }

  // Everything else needs the person's Supabase login.
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: who } = await db.auth.getUser(jwt);
  if (!who?.user) return fail('Log in again, then try paying.', 401);
  const { data: me } = await db.from('profiles').select('*').eq('id', who.user.id).single();
  if (!me || me.suspended) return fail('Your account is paused. Contact support@nestly.app.', 403);

  if (input.action === 'otp') {
    const txRef = String(input.tx_ref ?? ''); const code = String(input.otp ?? '').trim();
    const { data: p } = await db.from('payments').select('*').eq('tx_ref', txRef).eq('user_id', me.id).maybeSingle();
    if (!p || p.status !== 'pending' || !p.flw_id) return fail('This payment is no longer waiting for a code.');
    if (!/^\d{4,8}$/.test(code)) return fail('Enter the code from your phone.', 400, 'otp');
    const r = await flw(env, 'PUT', `/charges/${encodeURIComponent(p.flw_id)}`, { authorization: { type: 'otp', otp: { code } } });
    if (!r.ok) return fail(r.message ? `That code did not work: ${r.message}` : 'That code did not work. Try again.', 400, 'otp');
    try { return reply(await settle(db, env, txRef)); } catch (e) { return fail((e as Error).message, 502); }
  }
  if (input.action !== 'start') return fail('Unknown action.');

  const phone = String(input.phone ?? '').replace(/[\s-]/g, '');
  const local = phone.replace(/^\+?256/, '').replace(/^0/, '');
  if (!/^7\d{8}$/.test(local)) return fail('Enter a mobile money number, like 0772 123 456 or +256 772 123 456.', 400, 'phone');
  const network = input.network === 'airtel' ? 'airtel' : 'mtn';
  const back = String(input.back ?? ''); if (!/^https?:\/\/[^/\s]+$/.test(back)) return fail('Missing the address to come back to.');
  const txRef = 'nst' + crypto.randomUUID().replace(/-/g, '');
  let amount = 0;
  const pay: Record<string, unknown> = { tx_ref: txRef, user_id: me.id, network, phone, kind: input.kind };

  // At most 10 payment starts in 10 minutes per person.
  const { data: okRate } = await db.rpc('rate_ok', { p_key: 'pay:' + me.id, p_max: 10, p_seconds: 600 });
  if (okRate === false) return fail('Too many payment tries. Wait a few minutes.', 429);
  if (input.kind === 'booking') {
    if (me.role !== 'student') return fail('Only students book rooms.', 403);
    if (!me.email_verified) return fail(me.verify_via === 'id' ? 'Your student ID is not approved yet. You can book once it is.' : 'Confirm your student email before booking.');
    const { data: h } = await db.from('hostels').select('*').eq('id', String(input.hostel_id ?? '')).maybeSingle();
    if (!h || h.status !== 'live') return fail('This hostel is not taking bookings right now.');
    const { data: uni } = await db.from('universities').select('sems').eq('id', h.uni).maybeSingle();
    const sem = bookingSem(h.sems, uni?.sems ?? null); if (!sem) return fail(`${h.name} is not taking bookings right now.`);
    const SEM = semName(sem);
    const type = (h.rooms ?? [])[Number(input.room)]; if (!type) return fail('Pick a room type.');
    if ((type.taken ?? 0) >= (type.total ?? 0)) return fail('Someone just took the last room of this type. Pick another.');
    // Forget earlier attempts that were never paid, then check for a real booking this semester.
    const { data: old } = await db.from('payments').select('tx_ref').eq('user_id', me.id).eq('kind', 'booking').eq('status', 'pending');
    for (const o of old ?? []) await db.rpc('fail_payment', { p_tx_ref: o.tx_ref });
    const { count } = await db.from('bookings').select('id', { count: 'exact', head: true }).eq('user_id', me.id).eq('sem', SEM).neq('status', 'cancelled');
    if (count) return fail('You already have a booking for this semester.');
    // Holds the bed under a lock, so two students cannot both take the last one (finding F5).
    const { data: b, error } = await db.rpc('start_booking', { p_user: me.id, p_hostel: h.id, p_type: type.t, p_sem: SEM, p_fee: h.fee, p_tx: txRef, p_method: network });
    if (error) return fail(/last room|not taking|Pick a room/.test(error.message) ? error.message : 'We could not start the booking. Try again.', /last room/.test(error.message) ? 409 : 500);
    amount = h.fee;
    Object.assign(pay, { amount, booking_id: b.id, hostel_id: h.id, sem_end: sem.end });
  } else if (input.kind === 'subscription') {
    if (me.role !== 'owner' || me.owner_status !== 'approved') return fail('Only approved owners pay a subscription.', 403);
    const months = Number(input.months); if (!Number.isInteger(months) || months < 1 || months > 12) return fail('Choose between 1 and 12 months.');
    const { data: cfg } = await db.from('config').select('*').eq('id', 1).single();
    const { count: hostels } = await db.from('hostels').select('id', { count: 'exact', head: true }).eq('owner_id', me.id).in('status', ['live', 'suspended']);
    if (!hostels) return fail('You have no hostels on Explore yet, so there is nothing to pay.');
    const fee = cfg.per_hostel ? cfg.sub_fee * Math.max(1, hostels ?? 0) : cfg.sub_fee;
    amount = fee * months;
    Object.assign(pay, { amount, months });
  } else return fail('Unknown payment.');

  const { error: pe } = await db.from('payments').insert(pay);
  if (pe) return fail('We could not start the payment. Try again.', 500);
  const [first, ...rest] = String(me.name ?? '').trim().split(/\s+/);
  let res;
  try {
    const scenario = scenarioOf(env); if (scenario) console.log(`sandbox scenario: ${scenario}`);
    res = await flw(env, 'POST', '/orchestration/direct-charges', {
      amount, currency: 'UGX', reference: txRef, redirect_url: `${back}/pay/return?tx_ref=${txRef}`,
      payment_method: { type: 'mobile_money', mobile_money: { country_code: '256', network: network.toUpperCase(), phone_number: local } },
      customer: { email: me.email, name: { first: first || 'Nestly', last: rest.join(' ') || 'User' }, phone: { country_code: '256', number: local } },
      meta: { kind: String(input.kind), user_id: me.id },
    }, undefined, scenario ? { 'X-Scenario-Key': scenario } : {});
  } catch (e) { res = { ok: false, data: null, message: (e as Error).message }; }
  if (!res.ok || !res.data?.id) {
    await db.rpc('fail_payment', { p_tx_ref: txRef });
    return fail(`Flutterwave could not start the payment: ${res.message ?? 'no answer'}. Try again.`, 502);
  }
  await db.from('payments').update({ flw_id: String(res.data.id) }).eq('tx_ref', txRef);
  if (res.data.status === 'succeeded' || res.data.status === 'failed') return reply({ tx_ref: txRef, ...(await settle(db, env, txRef)) });
  return reply({ tx_ref: txRef, result: 'pending', next: nextStep(res.data) });
}

// @ts-ignore Deno is the runtime on Supabase.
if (typeof Deno !== 'undefined') Deno.serve(req => handle(req, {
  // @ts-ignore Deno
  url: Deno.env.get('SUPABASE_URL')!, serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  // @ts-ignore Deno
  clientId: Deno.env.get('FLW_CLIENT_ID') ?? '', clientSecret: Deno.env.get('FLW_CLIENT_SECRET') ?? '', base: Deno.env.get('FLW_BASE_URL') ?? undefined,
  // @ts-ignore Deno
  scenario: Deno.env.get('FLW_SCENARIO') ?? undefined,
}));
