import { ShieldCheck, Smartphone } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Btn, Field, Logo, TextInput, ActionButton } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { ApiError, logout } from '../../services/api';
import { reload } from '../../services/db';
import { aalNow, codePending, finishTwoStep, startTwoStep, twoStepOn, verifyCode } from '../../services/security';
import { live } from '../../services/supabase';
import { useUser } from '../../services/session';

/** Enter the 6-digit code from the authenticator app (after the password, or to confirm a risky action). */
export function CodeForm({ onDone, cta = 'Continue' }: { onDone: () => void | Promise<void>; cta?: string }) {
  const [code, setCode] = useState(''); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  async function go(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await verifyCode(code); await reload(); await onDone(); } catch (x) { setErr((x as ApiError).message); } finally { setBusy(false); }
  }
  return <form className="stack" onSubmit={go} noValidate>
    <div className="check-mail"><span className="icon-tile primary"><Smartphone size={20} /></span><p>Open your authenticator app (Google Authenticator, Microsoft Authenticator or similar) and enter the 6-digit code for Nestly.{!live && ' Demo mode: the code is 123456.'}</p></div>
    <Field id="ts-code" label="6-digit code" error={err}><TextInput id="ts-code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={e => setCode(e.target.value)} error={err} placeholder="123 456" autoFocus /></Field>
    <Btn type="submit" block loading={busy}><ShieldCheck size={17} />{cta}</Btn>
  </form>;
}

/** Sets up two-step login: scan the QR code with an authenticator app, then type the first code. */
export function SetupForm({ uid, onDone }: { uid: string; onDone: () => void | Promise<void> }) {
  const [f, setF] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState(''); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { startTwoStep().then(setF).catch(x => setErr((x as Error).message)); }, []);
  async function go(e: FormEvent) {
    e.preventDefault(); if (!f) return; setBusy(true); setErr(null);
    try { await finishTwoStep(uid, f.factorId, code); await reload(); await onDone(); } catch (x) { setErr((x as ApiError).message); } finally { setBusy(false); }
  }
  return <form className="stack" onSubmit={go} noValidate>
    <ol className="small stack-sm" style={{ paddingLeft: 16, margin: 0 }}>
      <li>Install an authenticator app on your phone, such as Google Authenticator or Microsoft Authenticator.</li>
      <li>In the app, add an account and scan this code. If you cannot scan, type the key below it.</li>
      <li>Type the 6-digit code the app shows.</li>
    </ol>
    <div className="center" style={{ padding: 8 }}>
      {f?.qr ? <img src={f.qr} alt="QR code to add Nestly to your authenticator app" width={180} height={180} style={{ background: '#fff', borderRadius: 12, padding: 8 }} />
        : !live ? <p className="small muted">Demo mode: no QR code. The code is always 123456.</p> : <p className="small muted">Preparing your code...</p>}
      {f?.secret && live && <p className="tiny muted" style={{ wordBreak: 'break-all' }}>Key: <code>{f.secret}</code></p>}
    </div>
    <Field id="ts-first" label="6-digit code from the app" error={err}><TextInput id="ts-first" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={e => setCode(e.target.value)} error={err} placeholder="123 456" /></Field>
    <Btn type="submit" block loading={busy} disabled={!f}><ShieldCheck size={17} />Turn on two-step login</Btn>
    <p className="tiny muted">Keep your phone safe. If you lose it, another Nestly admin can reset two-step login for you.</p>
  </form>;
}

/**
 * After the password: accounts with two-step login enter their code here. Admins must use two-step login, so an
 * admin without it sets it up here first. Everyone else is sent home.
 */
export function TwoStepPage() {
  const me = useUser(); const nav = useNavigate(); const toast = useToast();
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => { if (me) twoStepOn(me.id).then(setOn); }, [me]);
  if (!me) return <Navigate to="/login" replace />;
  const needed = codePending() || (me.role === 'admin' && aalNow() !== 'aal2');
  const home = homeOf(me);
  if (!needed) return <Navigate to={home} replace />;
  const done = () => { toast('Two-step login done. Welcome.'); nav(home, { replace: true }); };
  return <main className="visit-page"><div className="visit-missing" style={{ maxWidth: 440, textAlign: 'left' }}>
    <Logo /><h1 style={{ fontSize: 24 }}>{on === false ? 'Set up two-step login' : 'Enter your code'}</h1>
    <p className="muted small">{on === false ? 'Admins can see everyone’s documents and approve owners, so a password alone is not enough. Set up an authenticator app to continue.' : 'Your account uses two-step login. Enter the code from your phone to finish logging in.'}</p>
    {on === null ? <p className="muted small">Checking...</p> : on ? <CodeForm onDone={done} cta="Log in" /> : <SetupForm uid={me.id} onDone={done} />}
    <ActionButton type="button" className="btn btn-text btn-sm" onClick={() => logout()}>Use another account</ActionButton>
  </div></main>;
}
const homeOf = (u: { role: string; ownerStatus?: string }) => u.role === 'student' ? '/s/explore' : u.role === 'custodian' ? '/c/today' : u.role === 'admin' ? '/a/overview' : u.ownerStatus === 'incomplete' ? '/owner/signup' : '/o/overview';
