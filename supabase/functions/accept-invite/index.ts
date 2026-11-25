// Creates a custodian's account from an owner's invite code.
// It runs on Supabase (Edge Functions) because custodians may have no email inbox: the server can create
// an account that is already confirmed, which the browser is not allowed to do.
// Deploy: Supabase dashboard > Edge Functions > Deploy a new function > name it "accept-invite" > paste this file.
// Supabase provides SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to the function automatically.
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

export async function handle(req: Request, env: { url: string; serviceKey: string }): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Use POST.' }, 405);
  let input: { code?: string; name?: string; username?: string; password?: string };
  try { input = await req.json(); } catch { return reply({ error: 'Send the invite details.' }, 400); }
  const code = String(input.code ?? '').trim().toUpperCase();
  const name = String(input.name ?? '').trim();
  const username = String(input.username ?? '').trim().toLowerCase();
  const password = String(input.password ?? '');
  if (name.split(/\s+/).length < 2) return reply({ error: 'Enter your first and last name.', field: 'name' }, 400);
  if (!/^[a-z0-9._]{3,20}$/.test(username)) return reply({ error: 'Use 3 to 20 lowercase letters, numbers, dots or underscores.', field: 'username' }, 400);
  if (password.length < 8 || !/[a-z]/i.test(password) || !/\d/.test(password)) return reply({ error: 'Use 8+ characters with letters and numbers.', field: 'password' }, 400);

  const admin = createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  // At most 10 tries an hour from one network address, so nobody can guess invite codes.
  const ip = (req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '').split(',')[0]!.trim().slice(0, 64);
  if (ip) { const { data: ok } = await admin.rpc('rate_ok', { p_key: 'invite-ip:' + ip, p_max: 10, p_seconds: 3600 }); if (ok === false) return reply({ error: 'Too many tries from this network. Try again in an hour.' }, 429); }
  const { data: inv } = await admin.from('invites').select('*').ilike('code', code).maybeSingle();
  if (!inv) return reply({ error: 'That invite code is not valid.', field: 'code' }, 400);
  if (inv.used) return reply({ error: 'This invite has already been used.', field: 'code' }, 400);
  if (inv.cancelled) return reply({ error: 'The owner cancelled this invite.', field: 'code' }, 400);
  if (new Date(inv.at).getTime() < Date.now() - 7 * 86400000) return reply({ error: 'This invite has expired. Ask the owner to send it again.', field: 'code' }, 400);
  const { data: taken } = await admin.from('profiles').select('id').ilike('username', username).maybeSingle();
  if (taken) return reply({ error: 'That username is taken. Try another.', field: 'username' }, 400);

  // Use the email on the invite when there is one; otherwise make a private sign-in address from the username.
  const realEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(inv.email) && !inv.email.endsWith('@sms.nestly.app');
  const email = realEmail ? inv.email.toLowerCase() : `${username}@custodian.nestly.app`;
  const phone = realEmail ? null : inv.email.split('@')[0];
  const { data: made, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { role: 'custodian', invite: inv.code, hostel_id: inv.hostel_id, name, username, phone },
  });
  if (error || !made.user) {
    const msg = /already/i.test(error?.message ?? '') ? 'An account already uses the email on this invite. Ask the owner to invite you with your phone number instead.' : 'We could not create your account. Try again.';
    return reply({ error: msg }, 400);
  }
  // Tell the owner, and note it in the activity log.
  const { data: h } = await admin.from('hostels').select('name, owner_id').eq('id', inv.hostel_id).single();
  if (h?.owner_id) await admin.from('notifications').insert({ user_id: h.owner_id, kind: 'staff', title: `${name} joined ${h.name}`, text: 'They can now check students in and log visitors.', to: '/o/staff' });
  await admin.from('audit').insert({ actor_id: made.user.id, actor_role: 'custodian', action: 'Joined as custodian', target: h?.name ?? '', detail: `@${username}` });
  return reply({ email });
}

// @ts-ignore Deno is the runtime on Supabase.
if (typeof Deno !== 'undefined') Deno.serve(req => handle(req, { url: Deno.env.get('SUPABASE_URL')!, serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! }));
