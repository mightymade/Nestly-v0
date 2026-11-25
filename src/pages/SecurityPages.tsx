import { CheckCircle2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Btn, Field, Logo, TextInput } from '../components/ui';
import { ApiError, cancelPayoutByLink, reportSecurityProblem } from '../services/api';
import { useUser } from '../services/session';

/** Anyone can report a security problem here, without an account. Linked from security.txt and the privacy policy. */
export function SecurityReportPage() {
  const [text, setText] = useState(''); const [contact, setContact] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false);
  async function go(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await reportSecurityProblem(text, contact); setSent(true); } catch (x) { setErr((x as ApiError).message); } finally { setBusy(false); }
  }
  return <main className="visit-page"><div className="visit-missing" style={{ maxWidth: 560, textAlign: 'left' }}>
    <Link to="/" aria-label="Nestly home"><Logo /></Link>
    <h1 style={{ fontSize: 24 }}>Report a security problem</h1>
    {sent ? <div className="stack"><div className="banner success"><CheckCircle2 size={18} className="ic" /><span className="grow">Thank you. The Nestly team has it and will look at it soon.</span></div>
        <Link to="/" className="btn btn-secondary">Back to Nestly</Link></div>
      : <form className="stack" onSubmit={go} noValidate>
        <p className="muted small">Found a way to see someone else's information, get round a rule, or break something? Tell us here. Please do not test on real people's accounts, do not take or share their data, and give us time to fix it before telling others. We will not take action against anyone who reports a problem honestly this way.</p>
        <div className="field"><label htmlFor="sr-text">What did you find?</label>
          <textarea id="sr-text" className={'input' + (err ? ' bad' : '')} rows={7} value={text} onChange={e => setText(e.target.value)} placeholder="What you did, what happened, and which page or link." aria-invalid={!!err || undefined} aria-describedby={err ? 'sr-err' : undefined} />
          {err && <span className="err" id="sr-err" role="alert">{err}</span>}</div>
        <Field id="sr-contact" label="How can we reach you? (optional)" hint="An email or phone number, if you want a reply."><TextInput id="sr-contact" value={contact} onChange={e => setContact(e.target.value)} /></Field>
        <Btn type="submit" loading={busy}><ShieldAlert size={16} />Send to the Nestly team</Btn>
        <p className="tiny muted row-sm"><ShieldCheck size={13} />Only Nestly admins can read reports.</p>
      </form>}
  </div></main>;
}

/** The "this was not me" link from the payout-change email. Works without logging in. */
export function PayoutCancelPage() {
  const [params] = useSearchParams(); const me = useUser();
  const [state, setState] = useState<'working' | 'cancelled' | 'invalid' | 'error'>('working'); const [msg, setMsg] = useState('');
  useEffect(() => {
    const t = params.get('t') ?? '';
    cancelPayoutByLink(t).then(setState).catch(x => { setMsg((x as Error).message); setState('error'); });
  }, [params]);
  return <main className="visit-page"><div className="visit-missing" style={{ maxWidth: 480 }}>
    <Logo />
    {state === 'working' && <p className="muted">Cancelling the payout change...</p>}
    {state === 'cancelled' && <><h1 style={{ fontSize: 24 }}>Change cancelled</h1>
      <p className="muted">Your payout account stays as it was, and the Nestly team has been told. Someone may know your password, so change it now.</p>
      <Link to={me ? (me.role === 'owner' ? '/o/settings/password' : '/') : '/login'} className="btn btn-primary">{me ? 'Change my password' : 'Log in to change my password'}</Link></>}
    {state === 'invalid' && <><h1 style={{ fontSize: 24 }}>This link no longer works</h1>
      <p className="muted">The change was already cancelled, already started, or replaced by a newer one. If you did not ask for a change, log in, check your payout account and change your password, or report it to us.</p>
      <div className="row" style={{ gap: 8, justifyContent: 'center' }}><Link to="/login" className="btn btn-primary">Log in</Link><Link to="/security" className="btn btn-secondary">Report it</Link></div></>}
    {state === 'error' && <><h1 style={{ fontSize: 24 }}>Something went wrong</h1><p className="muted">{msg} Try the link again in a minute.</p></>}
  </div></main>;
}
