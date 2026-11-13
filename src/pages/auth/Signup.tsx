import { ArrowRight, Check, Mail, RefreshCw, Search } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { PasswordStrength, passwordOk } from '../../components/PasswordStrength';
import { useToast } from '../../components/Toast';
import { Btn, Field, PasswordInput, TextInput } from '../../components/ui';
import type { Mail as MailT } from '../../data/types';
import { allUniversities, ApiError, confirmEmail, emailMatchesUniversity, inbox, resendVerification, signupStudent, universityById } from '../../services/api';
import { useUser } from '../../services/session';
import { AuthLayout } from './AuthLayout';
import { Steps } from '../../components/Steps';
import { UniLogo } from '../../components/UniLogo';
import { takeNext } from '../../components/AccountGate';

export function Signup() {
  const me = useUser();
  // A signed-in student who has not confirmed yet lands straight on the inbox step.
  const [step, setStep] = useState(me && !me.emailVerified ? 3 : 1);
  const [uni, setUni] = useState(me?.universityId ?? '');
  const titles = ['Where do you study?', 'Create your account', 'Check your student inbox'];
  const subs = ['We show hostels near it first. You can look at other campuses later.', 'Use your student email so we know you study there.', ''];
  return <AuthLayout title={titles[step - 1]!} sub={subs[step - 1] || undefined} back={step === 1 ? '/welcome' : undefined} onBack={step === 2 ? () => setStep(1) : undefined} wide={step === 2}>
    <Steps steps={['University', 'Your details', 'Confirm email']} at={step} />
    {step === 1 && <PickUniversity value={uni} onChange={setUni} onNext={() => setStep(2)} />}
    {step === 2 && <Details uniId={uni} onBack={() => setStep(1)} onDone={() => setStep(3)} />}
    {step === 3 && <Verify />}
  </AuthLayout>;
}

function PickUniversity({ value, onChange, onNext }: { value: string; onChange: (v: string) => void; onNext: () => void }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => allUniversities().filter(u => (u.name + u.short + u.area).toLowerCase().includes(q.toLowerCase())), [q]);
  const many = allUniversities().length > 5;
  return <div className="stack">
    {many && <div className="input-wrap has-lead"><span className="lead"><Search size={18} /></span>
      <input className="input" placeholder="Search universities" value={q} onChange={e => setQ(e.target.value)} aria-label="Search universities" /></div>}
    <div className="uni-pick" role="radiogroup" aria-label="University">
      {list.map(u => <button key={u.id} type="button" role="radio" aria-checked={value === u.id} className={'pay-opt' + (value === u.id ? ' on' : '')} onClick={() => onChange(u.id)}>
        <UniLogo uni={u} size={40} />
        <span className="grow min0"><b className="clamp1" style={{ display: 'block' }}>{u.name}</b><span className="small muted clamp1" style={{ display: 'block' }}>{u.area} · {u.domain}</span></span>
        {value === u.id && <Check size={20} color="var(--primary)" />}</button>)}
      {!list.length && <p className="muted small">No university matches "{q}".</p>}
    </div>
    <Btn block disabled={!value} onClick={onNext}>Continue<ArrowRight size={18} /></Btn>
  </div>;
}

function Details({ uniId, onBack, onDone }: { uniId: string; onBack: () => void; onDone: () => void }) {
  const uni = universityById(uniId)!;
  const [f, setF] = useState({ name: '', email: '', password: '', agree: false });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [serverErr, setServerErr] = useState<{ field?: string; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => { setF({ ...f, [k]: k === 'agree' ? e.target.checked : e.target.value }); if (serverErr?.field === k) setServerErr(null); };
  const errs: Record<string, string | null> = {
    name: f.name.trim().split(/\s+/).length < 2 ? 'Enter your first and last name.' : null,
    email: !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email) ? 'Enter your student email.' : !emailMatchesUniversity(f.email, uniId) ? `It must end with ${uni.domain}.` : null,
    password: !passwordOk(f.password) ? 'Use 8+ characters with letters and numbers.' : null,
    agree: !f.agree ? 'Please accept to continue.' : null,
  };
  const show = (k: string) => (touched[k] && errs[k]) || (serverErr?.field === k ? serverErr.msg : null);
  async function submit(e: FormEvent) {
    e.preventDefault(); setTouched({ name: true, email: true, password: true, agree: true });
    if (Object.values(errs).some(Boolean)) return;
    setBusy(true);
    try { await signupStudent({ uniId, ...f }); onDone(); }
    catch (x) { const a = x as ApiError; setServerErr({ field: a.field, msg: a.message }); }
    finally { setBusy(false); }
  }
  const blur = (k: string) => () => setTouched(t => ({ ...t, [k]: true }));
  return <form className="stack" onSubmit={submit} noValidate>
    <div className="uni-line"><UniLogo uni={uni} size={28} /><span className="grow"><b>{uni.name}</b></span><button type="button" onClick={onBack}>Change</button></div>
    <div className="f2">
      <Field id="su-name" label="Full name" error={show('name')}><TextInput id="su-name" autoComplete="name" value={f.name} onChange={set('name')} onBlur={blur('name')} error={show('name')} placeholder="Sarah Atim" /></Field>
      <Field id="su-email" label="Student email" error={show('email')} hint={<>Ends with <b>{uni.domain}</b></>}>
        <TextInput id="su-email" type="email" autoComplete="email" inputMode="email" value={f.email} onChange={set('email')} onBlur={blur('email')} error={show('email')} placeholder={`name@${uni.domain}`} /></Field>
      <div className="span stack" style={{ gap: 10 }}><Field id="su-pw" label="Password" error={touched.password && f.password && errs.password ? errs.password : null}>
        <PasswordInput id="su-pw" autoComplete="new-password" value={f.password} onChange={set('password')} onBlur={blur('password')} error={touched.password ? errs.password : null} /></Field>
        {!(touched.password && errs.password) && <PasswordStrength value={f.password} />}</div>
    </div>
    <label className={'check small' + (show('agree') ? ' bad' : '')} style={{ alignItems: 'flex-start' }}><input type="checkbox" checked={f.agree} onChange={set('agree')} aria-invalid={!!show('agree') || undefined} />
      <span>I agree to the Nestly terms and privacy policy.{show('agree') && <b className="sr-only"> {show('agree')}</b>}</span></label>
    <Btn type="submit" block loading={busy}>Create account</Btn>
  </form>;
}

function Verify() {
  const me = useUser()!; const nav = useNavigate(); const toast = useToast();
  const [mails, setMails] = useState<MailT[]>([]);
  const [busy, setBusy] = useState(false); const [cool, setCool] = useState(30);
  useEffect(() => { inbox(me.email).then(setMails); }, [me.email]);
  useEffect(() => { if (cool <= 0) return; const t = setTimeout(() => setCool(c => c - 1), 1000); return () => clearTimeout(t); }, [cool]);
  async function confirm(token: string) {
    setBusy(true);
    try { await confirmEmail(token); toast('Email confirmed. Welcome to Nestly.'); nav(takeNext() ?? '/s/explore', { replace: true }); }
    catch (x) { toast((x as Error).message); } finally { setBusy(false); }
  }
  async function resend() { await resendVerification(me.id); setMails(await inbox(me.email)); setCool(30); toast('New link sent. The old one no longer works.'); }
  const m = mails[0];
  return <div className="stack">
    <p className="small">We sent a link to <b>{me.email}</b>. Open it to confirm you are a student. It works for 24 hours.</p>
    <div className="mail-demo">
      <div className="bar"><Mail size={14} />Demo inbox · {me.email}</div>
      {m ? <div className="body"><span className="tiny muted">From Nestly · {m.when}</span><h3>{m.subject}</h3><p>{m.body}</p>
        <Btn loading={busy} onClick={() => confirm(m.token!)}>Confirm my email</Btn></div>
        : <div className="body"><p className="muted">Waiting for the email...</p></div>}
    </div>
    <div className="row between wrap" style={{ gap: 8 }}><Btn kind="secondary" size="sm" disabled={cool > 0} onClick={resend}><RefreshCw size={15} />{cool > 0 ? `Send again in ${cool}s` : 'Send again'}</Btn>
      <button type="button" className="btn btn-text btn-sm" onClick={() => nav(takeNext() ?? '/s/explore', { replace: true })}>Skip and browse hostels<ArrowRight size={15} /></button></div>
    <p className="tiny muted">Booking stays locked until you confirm.</p>
  </div>;
}
