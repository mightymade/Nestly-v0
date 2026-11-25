// Creates a student account on the student ID route: any email (for example Gmail) plus the student number.
// It checks the details first so the student gets a clear message, then signs them up the normal way, which sends
// a confirmation link to their email (Gmail delivers it; only some university mail servers block it).
// After confirming, the student adds a photo of their student ID and a selfie holding it, and an admin approves
// them in Reviews before they can book.
// Deploy: Supabase dashboard > Edge Functions > Deploy a new function > name it "student-signup" > paste this file.
// Supabase provides SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY to the function automatically.
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

export async function handle(req: Request, env: { url: string; serviceKey: string; anonKey: string }): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Use POST.' }, 405);
  let input: { uniId?: string; name?: string; email?: string; password?: string; studentNo?: string; phone?: string; redirectTo?: string; captchaToken?: string };
  try { input = await req.json(); } catch { return reply({ error: 'Send your details.' }, 400); }
  const uniId = String(input.uniId ?? '');
  const name = String(input.name ?? '').trim().replace(/\s+/g, ' ');
  const email = String(input.email ?? '').trim().toLowerCase();
  const password = String(input.password ?? '');
  const studentNo = String(input.studentNo ?? '').trim().toUpperCase();
  const phone = String(input.phone ?? '').trim() || null;
  if (name.split(' ').length < 2 || name.length > 80) return reply({ error: 'Enter your first and last name.', field: 'name' }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 120) return reply({ error: 'Enter a valid email address.', field: 'email' }, 400);
  if (!/^[A-Z0-9/-]{4,30}$/.test(studentNo)) return reply({ error: 'Enter your student number as it is on your student ID.', field: 'studentNo' }, 400);
  if (password.length < 8 || !/[a-z]/i.test(password) || !/\d/.test(password)) return reply({ error: 'Use 8+ characters with letters and numbers.', field: 'password' }, 400);

  const admin = createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  // At most 5 sign-ups an hour from one network address.
  const ip = (req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '').split(',')[0]!.trim().slice(0, 64);
  if (ip) { const { data: ok } = await admin.rpc('rate_ok', { p_key: 'signup-ip:' + ip, p_max: 5, p_seconds: 3600 }); if (ok === false) return reply({ error: 'Too many sign-ups from this network. Try again in an hour.' }, 429); }
  const { data: uni } = await admin.from('universities').select('id, short').eq('id', uniId).maybeSingle();
  if (!uni) return reply({ error: 'Choose your university first.' }, 400);
  // Only an approved account holds a student number, so a pending or rejected claim never locks anyone out.
  const { data: taken } = await admin.from('profiles').select('id').eq('university_id', uniId).ilike('student_no', studentNo).eq('id_status', 'approved').maybeSingle();
  if (taken) return reply({ error: 'This student number is already verified on another account. If it is yours, contact support@nestly.app.', field: 'studentNo' }, 400);
  const { data: used } = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
  if (used) return reply({ error: 'An account with this email already exists. Log in instead.', field: 'email' }, 400);

  // A normal sign-up: Supabase emails a confirmation link. The database trigger (migration 0011) checks the
  // details again and starts the account as waiting for photos.
  const anon = createClient(env.url, env.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const redirectTo = typeof input.redirectTo === 'string' && /^https?:\/\//.test(input.redirectTo) ? input.redirectTo : undefined;
  const { data: made, error } = await anon.auth.signUp({ email, password,
    options: { emailRedirectTo: redirectTo, captchaToken: input.captchaToken ? String(input.captchaToken) : undefined, data: { role: 'student', verify: 'id', university_id: uniId, name, phone, student_no: studentNo } } });
  if (error || !made.user) {
    if (/rate|seconds/i.test(error?.message ?? '')) return reply({ error: 'Too many sign-ups just now. Wait a minute and try again.' }, 429);
    if (/captcha/i.test(error?.message ?? '')) return reply({ error: 'Please complete the check that you are not a robot, then try again.', captcha: true }, 400);
    const dup = /already|registered|exists/i.test(error?.message ?? '');
    return reply({ error: dup ? 'An account with this email already exists. Log in instead.' : 'We could not create your account. Try again.', field: dup ? 'email' : undefined }, 400);
  }
  if (!made.user.identities?.length) return reply({ error: 'An account with this email already exists. Log in instead.', field: 'email' }, 400);
  await admin.from('audit').insert({ actor_id: made.user.id, actor_role: 'student', action: 'Signed up with a student ID', target: uni.short, detail: name });
  return reply({ email });
}

// @ts-ignore Deno is the runtime on Supabase.
if (typeof Deno !== 'undefined') Deno.serve(req => handle(req, { url: Deno.env.get('SUPABASE_URL')!, serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, anonKey: Deno.env.get('SUPABASE_ANON_KEY')! }));
