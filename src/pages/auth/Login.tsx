import { Building2, ChevronDown, GraduationCap, KeyRound, LogIn, RotateCcw, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Overlay } from '../../components/Overlay';
import { useToast } from '../../components/Toast';
import { Btn, Field, PasswordInput, TextInput } from '../../components/ui';
import { ApiError, login, requestPasswordReset } from '../../services/api';
import { resetDemo } from '../../services/api';
import { AuthLayout } from './AuthLayout';
import { takeNext } from '../../components/AccountGate';

export function Login() {
  const nav = useNavigate(); const toast = useToast();
  const [idv, setId] = useState(''); const [pw, setPw] = useState('');
  const [err, setErr] = useState<{ field?: string; msg: string } | null>(null);
  const [busy, setBusy] = useState(false); const [forgot, setForgot] = useState(false); const [demo, setDemo] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!idv.trim()) return setErr({ field: 'id', msg: 'Enter your email or username.' });
    if (!pw) return setErr({ field: 'password', msg: 'Enter your password.' });
    setBusy(true); setErr(null);
    try { const u = await login(idv, pw); const next = takeNext(); nav(u.role === 'student' ? next ?? '/s/explore' : u.role === 'custodian' ? '/c/today' : u.role === 'admin' ? '/a/overview' : u.ownerStatus === 'incomplete' ? '/owner/signup' : '/o/overview', { replace: true }); }
    catch (x) { const a = x as ApiError; setErr({ field: a.field, msg: a.message }); } finally { setBusy(false); }
  }
  const fill = (a: string) => { setId(a); setPw('nestly123'); setErr(null); setDemo(false); };
  return <AuthLayout title="Log in" sub="Students use their student email. Custodians and owners can use their username." back="/welcome" ownerLink={false}>
    <form className="stack" onSubmit={submit} noValidate>
      <Field id="login-id" label="Email or username" error={err?.field === 'id' ? err.msg : null}>
        <TextInput id="login-id" autoComplete="username" value={idv} onChange={e => setId(e.target.value)} error={err?.field === 'id' ? err.msg : null} placeholder="you@ucu.ac.ug or username" /></Field>
      <div className="rel"><Field id="login-pw" label="Password" error={err?.field === 'password' ? err.msg : null}>
        <PasswordInput id="login-pw" autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} error={err?.field === 'password' ? err.msg : null} /></Field>
        <button type="button" className="field-aside" onClick={() => setForgot(true)}>Forgot password?</button></div>
      <Btn type="submit" block loading={busy}><LogIn size={18} />Log in</Btn>
      <p className="small muted login-alt">New here? <Link to="/signup">Create a student account</Link><span aria-hidden="true">·</span><Link to="/owner/signup">List a hostel</Link></p>
    </form>
    <div className="demo-box stack-sm">
      <button className="row between w-full" onClick={() => setDemo(d => !d)} aria-expanded={demo}><span className="label">Try a demo account</span><span className="dd-pill on-surface" style={{ pointerEvents: 'none' }}>Choose<span className="chev"><ChevronDown size={15} /></span></span></button>
      {demo && <div className="demo-grid">
        {([['Student', 'sarah.atim@ucu.ac.ug', GraduationCap], ['Custodian', 'peter.k', KeyRound], ['Hostel owner', 'grace.n', Building2], ['Owner in review', 'daniel.o', Building2], ['Nestly admin', 'admin', ShieldCheck]] as const).map(([role, id, I]) =>
          <button key={id} type="button" className="demo-acc" onClick={() => fill(id)}><I size={15} /><span className="min0"><b>{role}</b><span>{id}</span></span></button>)}
        <button type="button" className="demo-acc reset" onClick={() => { resetDemo(); toast('Demo data reset'); }}><RotateCcw size={15} /><span className="min0"><b>Reset demo</b><span>Start again</span></span></button>
      </div>}
      <p className="tiny muted">Demo password: nestly123</p>
    </div>
    {forgot && <ForgotPassword onClose={() => setForgot(false)} />}
  </AuthLayout>;
}

function ForgotPassword({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState(''); const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null); const [sent, setSent] = useState(false);
  async function go(e: FormEvent) { e.preventDefault(); setBusy(true); setErr(null); try { await requestPasswordReset(email); setSent(true); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); } }
  return <Overlay title="Reset your password" onClose={onClose} width={440}>
    {sent ? <div className="center"><p>If <b>{email}</b> has a Nestly account, a reset link is on its way. It expires in 1 hour.</p><Btn block onClick={onClose}>Back to log in</Btn></div>
      : <form className="stack" onSubmit={go} noValidate><p className="muted">Enter the email on your account and we will send you a link to set a new password.</p>
        <Field id="fp-email" label="Email" error={err}><TextInput id="fp-email" type="email" value={email} onChange={e => setEmail(e.target.value)} error={err} autoComplete="email" /></Field>
        <Btn type="submit" block loading={busy}>Send reset link</Btn></form>}
  </Overlay>;
}
