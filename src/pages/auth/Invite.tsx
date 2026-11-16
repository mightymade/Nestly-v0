import { ArrowRight, Building2, Check } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { live } from '../../services/supabase';
import { PasswordStrength, passwordOk } from '../../components/PasswordStrength';
import { useToast } from '../../components/Toast';
import { Art, Btn, Field, PasswordInput, TextInput } from '../../components/ui';
import { acceptInvite, ApiError, lookupInvite, usernameAvailable } from '../../services/api';
import { AuthLayout } from './AuthLayout';
import { Steps } from '../../components/Steps';

type Inv = Awaited<ReturnType<typeof lookupInvite>>;

export function Invite() {
  const [inv, setInv] = useState<Inv | null>(null);
  return <AuthLayout title={inv ? 'Set up your account' : 'Join as a custodian'} sub={inv ? undefined : 'Enter the invite code the hostel owner sent you.'} back={inv ? undefined : '/welcome'} onBack={inv ? () => setInv(null) : undefined} wide={!!inv} ownerLink={false} centered>
    <Steps steps={['Invite code', 'Your account']} at={inv ? 2 : 1} />
    {inv ? <Account inv={inv} /> : <Code onFound={setInv} />}
  </AuthLayout>;
}

function Code({ onFound }: { onFound: (i: Inv) => void }) {
  // The owner's invite link carries the code (/invite?code=SOSO-7128): fill it in and check it straight away.
  const [params] = useSearchParams(); const fromLink = (params.get('code') ?? '').trim().toUpperCase();
  const [code, setCode] = useState(fromLink); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  async function check(c: string) {
    if (!c.trim()) return setErr('Enter your invite code.');
    setBusy(true); setErr(null);
    try { onFound(await lookupInvite(c)); } catch (x) { setErr((x as ApiError).message); } finally { setBusy(false); }
  }
  useEffect(() => { if (fromLink) void check(fromLink); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const go = (e: FormEvent) => { e.preventDefault(); void check(code); };
  return <form className="stack" onSubmit={go} noValidate>
    <Field id="inv-code" label="Invite code" error={err} hint={live ? 'It looks like SOSO-7128. The hostel owner sends it to you.' : 'It looks like HILL-4821. Demo code: HILL-4821'}>
      <TextInput id="inv-code" value={code} onChange={e => setCode(e.target.value.toUpperCase())} error={err} autoCapitalize="characters" autoComplete="off" spellCheck={false} style={{ height: 56, fontSize: 20, textAlign: 'center', letterSpacing: '.18em', fontWeight: 800 }} placeholder="XXXX-0000" /></Field>
    <Btn type="submit" block loading={busy}>Check code<ArrowRight size={18} /></Btn>
  </form>;
}

function Account({ inv }: { inv: Inv }) {
  const nav = useNavigate(); const toast = useToast();
  const [f, setF] = useState({ name: inv.name, username: '', password: '' });
  const [avail, setAvail] = useState<null | boolean>(null);
  const [err, setErr] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const u = f.username.trim(); if (!/^[a-z0-9._]{3,20}$/i.test(u)) { setAvail(null); return; }
    let live = true; const t = setTimeout(() => usernameAvailable(u, '').then(a => live && setAvail(a)), 350);
    return () => { live = false; clearTimeout(t); };
  }, [f.username]);
  async function go(e: FormEvent) {
    e.preventDefault();
    const x: Record<string, string | null> = {
      name: f.name.trim().split(/\s+/).length < 2 ? 'Enter your first and last name.' : null,
      username: !/^[a-z0-9._]{3,20}$/i.test(f.username) ? 'Use 3 to 20 letters, numbers, dots or underscores.' : avail === false ? 'That username is taken.' : null,
      password: !passwordOk(f.password) ? 'Use 8+ characters with letters and numbers.' : null,
    };
    setErr(x); if (Object.values(x).some(Boolean)) return;
    setBusy(true);
    try { await acceptInvite(inv.code, f); toast(`Welcome to ${inv.hostel.name}`); nav('/c/today', { replace: true }); }
    catch (y) { const a = y as ApiError; setErr({ [a.field ?? 'form']: a.message }); } finally { setBusy(false); }
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return <form className="stack" onSubmit={go} noValidate>
    <div className="inv-card"><div className="thumb"><Art hostel={inv.hostel} /></div>
      <div className="min0"><span><b>{inv.invitedBy}</b> invited you to look after</span><b className="row-sm ink"><Building2 size={14} />{inv.hostel.name}</b><span className="tiny muted clamp1">Login email: {inv.email}</span></div></div>
    <div className="f2">
      <Field id="iv-name" label="Full name" error={err.name}><TextInput id="iv-name" value={f.name} onChange={set('name')} error={err.name} autoComplete="name" /></Field>
      <Field id="iv-user" label="Username" error={err.username} hint={avail === true ? <span className="ok-text"><Check size={13} /> Available</span> : avail === false ? <span className="err">Taken. Try another.</span> : 'Log in with this or your email.'}>
        <TextInput id="iv-user" value={f.username} onChange={e => setF({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') })} error={err.username} autoComplete="username" placeholder="agnes.n" /></Field>
      <div className="span stack" style={{ gap: 10 }}><Field id="iv-pw" label="Password" error={err.password}><PasswordInput id="iv-pw" placeholder="••••••••" value={f.password} onChange={set('password')} error={err.password} autoComplete="new-password" /></Field>
        {!err.password && <PasswordStrength value={f.password} />}</div>
    </div>
    {err.form && <span className="err">{err.form}</span>}
    <Btn type="submit" block loading={busy}>Create account</Btn>
    <p className="tiny muted center">By creating an account you agree to the <Link to="/terms" target="_blank">terms of use</Link> and <Link to="/privacy" target="_blank">privacy policy</Link>.</p>
  </form>;
}
