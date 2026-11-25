import { ArrowRight, Camera, Check, Clock, IdCard, Mail, RefreshCw, Search, ShieldCheck, Smile, XCircle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PasswordStrength, passwordOk } from '../../components/PasswordStrength';
import { useToast } from '../../components/Toast';
import { Btn, Field, PasswordInput, TextInput } from '../../components/ui';
import type { Mail as MailT } from '../../data/types';
import { live } from '../../services/supabase';
import { resendConfirmation, allUniversities, ApiError, confirmEmail, emailMatchesUniversity, inbox, resendVerification, signupStudent, signupStudentWithId, submitStudentId, uniEmailOk, universityById } from '../../services/api';
import { fitImage } from '../../lib/art';
import { Segmented } from '../../components/Segmented';
import { useUser } from '../../services/session';
import { AuthLayout } from './AuthLayout';
import { Captcha, captchaOn } from '../../components/Captcha';
import { Steps } from '../../components/Steps';
import { UniLogo } from '../../components/UniLogo';
import { takeNext } from '../../components/AccountGate';

export function Signup() {
  const me = useUser();
  // A signed-in student who has not confirmed yet lands straight on the inbox step.
  const [step, setStep] = useState(me && !me.emailVerified ? 3 : 1);
  const [uni, setUni] = useState(me?.universityId ?? ''); const [sentTo, setSentTo] = useState('');
  // Students use their university email only where those emails are known to arrive; everywhere else, the student ID.
  const [via, setVia] = useState<'email' | 'id'>(me?.verifyVia === 'id' || (me?.universityId && !uniEmailOk(me.universityId)) ? 'id' : 'email');
  const idStep = step === 3 && me?.verifyVia === 'id';
  const byId = step === 3 ? (me ? me.verifyVia === 'id' : via === 'id') : via === 'id';
  const titles = ['Where do you study?', 'Create your account', idStep ? (me?.idStatus === 'needs_photo' || me?.idStatus === 'rejected' ? 'Add your student ID' : 'Student ID check') : byId ? 'Confirm your email' : 'Check your student inbox'];
  const subs = ['We show hostels near it first. You can look at other campuses later.', via === 'id' ? 'Use any email you check. Our team checks your student ID.' : 'Use your student email so we know you study there.', ''];
  return <AuthLayout title={titles[step - 1]!} sub={subs[step - 1] || undefined} back={step === 1 ? '/welcome' : undefined} onBack={step === 2 ? () => setStep(1) : undefined} wide={step === 2}>
    <Steps steps={['University', 'Your details', byId ? 'ID check' : 'Confirm email']} at={step} />
    {step === 1 && <PickUniversity value={uni} onChange={setUni} onNext={() => { setVia(uniEmailOk(uni) ? 'email' : 'id'); setStep(2); }} />}
    {step === 2 && <Details uniId={uni} via={via} setVia={setVia} onBack={() => setStep(1)} onDone={email => { setSentTo(email); setStep(3); }} />}
    {idStep ? <IdStatus /> : step === 3 && (live ? <CheckEmail email={sentTo || me?.email || ''} idRoute={byId} onRestart={() => setStep(2)} onUseId={byId ? undefined : () => { setVia('id'); setStep(2); }} /> : <Verify />)}
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

const PHOTO_OK = ['image/jpeg', 'image/png', 'image/webp'];
type PhotoKind = 'card' | 'selfie';
const PHOTO_TEXT: Record<PhotoKind, { label: string; alt: string; empty: string; how: string; check: string }> = {
  card: { label: 'Photo of your student ID', alt: 'Your student ID', empty: 'Take or choose a photo', how: 'The front of the card, flat and in good light', check: 'Check that the name, number and expiry date are easy to read.' },
  selfie: { label: 'Selfie holding your student ID', alt: 'Your selfie with your student ID', empty: 'Take a selfie', how: 'Hold the card next to your face. Both must be clear.', check: 'Check that your face and the card are both clear.' },
};
/** Picks a photo (the student ID or a selfie holding it), shrinks it in the browser and shows a preview. */
function IdPhoto({ kind = 'card', value, onChange, error }: { kind?: PhotoKind; value: { name: string; url: string } | null; onChange: (v: { name: string; url: string } | null) => void; error?: string | null }) {
  const T = PHOTO_TEXT[kind]; const fid = `su-${kind}`;
  const input = useRef<HTMLInputElement>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  async function pick(f?: File) {
    if (!f) return; setErr(null);
    if (!PHOTO_OK.includes(f.type)) return setErr('Use a JPG or PNG photo.');
    if (f.size > 8 * 1024 * 1024) return setErr('That photo is over 8 MB. Take a smaller one.');
    setBusy(true); try { onChange({ name: f.name, url: await fitImage(f, 1200, 0.8) }); } catch { setErr('We could not read that photo. Try another.'); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  }
  const shown = err || error;
  return <div className="field"><label htmlFor={fid}>{T.label}</label>
    <input ref={input} id={fid} type="file" accept="image/jpeg,image/png,image/webp" capture={kind === 'selfie' ? 'user' : 'environment'} hidden onChange={e => pick(e.target.files?.[0])} />
    {value ? <div className="doc-has"><div className="doc-thumb"><img src={value.url} alt={T.alt} /></div>
        <div className="min0 grow"><b className="clamp1 small ink">{value.name}</b><span className="tiny muted" style={{ whiteSpace: 'normal' }}>{T.check}</span></div>
        <button type="button" className="btn btn-secondary btn-sm doc-replace" onClick={() => input.current?.click()} aria-label="Change photo" title="Change"><RefreshCw size={14} /><span className="lbl">Change</span></button></div>
      : <button type="button" className={'doc-drop' + (shown ? ' bad' : '')} onClick={() => input.current?.click()} disabled={busy} aria-describedby={shown ? `${fid}-err` : undefined}
          onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); pick(e.dataTransfer.files[0]); }}>
          {kind === 'selfie' ? <Smile size={22} /> : <Camera size={22} />}<span className="small strong">{busy ? 'Reading photo...' : T.empty}</span><span className="tiny muted">{T.how}</span></button>}
    {shown ? <span className="err" id={`${fid}-err`} role="alert">{shown}</span> : <span className="hint row-sm"><ShieldCheck size={13} />Only our team sees it, and we delete it once it is checked.</span>}
  </div>;
}

function Details({ uniId, via, setVia, onBack, onDone }: { uniId: string; via: 'email' | 'id'; setVia: (v: 'email' | 'id') => void; onBack: () => void; onDone: (email: string) => void }) {
  const uni = universityById(uniId)!;
  const emailOk = !!uni.emailOk; const byId = via === 'id' || !emailOk;
  const [f, setF] = useState({ name: '', email: '', password: '', agree: false, studentNo: '' });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [serverErr, setServerErr] = useState<{ field?: string; msg: string } | null>(null);
  const [busy, setBusy] = useState(false); const [captcha, setCaptcha] = useState(''); const [again, setAgain] = useState(0);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => { setF({ ...f, [k]: k === 'agree' ? e.target.checked : e.target.value }); if (serverErr?.field === k) setServerErr(null); };
  const errs: Record<string, string | null> = {
    name: f.name.trim().split(/\s+/).length < 2 ? 'Enter your first and last name.' : null,
    email: !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email) ? (byId ? 'Enter your email address.' : 'Enter your student email.') : !byId && !emailMatchesUniversity(f.email, uniId) ? `It must end with ${uni.domain}.` : null,
    studentNo: byId && !/^[A-Z0-9/-]{4,30}$/.test(f.studentNo.trim().toUpperCase()) ? 'Enter your student number as it is on your ID.' : null,
    password: !passwordOk(f.password) ? 'Use 8+ characters with letters and numbers.' : null,
    agree: !f.agree ? 'Please accept to continue.' : null,
  };
  const show = (k: string) => (touched[k] && errs[k]) || (serverErr?.field === k ? serverErr.msg : null);
  async function submit(e: FormEvent) {
    e.preventDefault(); setTouched({ name: true, email: true, password: true, agree: true, studentNo: true });
    if (Object.values(errs).some(Boolean)) return;
    if (captchaOn && !captcha) return setServerErr({ msg: 'Please complete the check that you are not a robot.' });
    setBusy(true);
    try {
      const captchaToken = captcha || undefined;
      if (byId) await signupStudentWithId({ uniId, name: f.name, email: f.email, password: f.password, studentNo: f.studentNo, captchaToken });
      else await signupStudent({ uniId, name: f.name, email: f.email, password: f.password, captchaToken });
      onDone(f.email.trim().toLowerCase());
    }
    catch (x) { const a = x as ApiError; setServerErr({ field: a.field, msg: a.message }); setAgain(n => n + 1); }
    finally { setBusy(false); }
  }
  const blur = (k: string) => () => setTouched(t => ({ ...t, [k]: true }));
  return <form className="stack" onSubmit={submit} noValidate>
    <div className="uni-line"><UniLogo uni={uni} size={28} /><span className="grow"><b>{uni.name}</b></span><button type="button" onClick={onBack}>Change</button></div>
    {emailOk ? <div className="stack-sm"><Segmented label="How we check you are a student" full value={via} onChange={v => { setVia(v); setServerErr(null); }}
      options={[{ value: 'email', label: <><Mail size={15} />University email</> }, { value: 'id', label: <><IdCard size={15} />Student ID</> }]} />
      <p className="tiny muted">{byId ? 'For students who cannot get emails on their university address. After confirming your email, you add a photo of your student ID and a selfie holding it. Our team checks them, usually within a day.' : `Fastest. You confirm by opening a link we send to your ${uni.domain} address.`}</p></div>
      : <div className="banner primary" style={{ alignItems: 'flex-start' }}><IdCard size={18} className="ic" /><span className="grow small">Emails to <b>{uni.domain}</b> addresses often do not arrive, so we check your <b>student ID</b> instead. Sign up with an email you check, confirm it, then add a photo of your ID and a selfie holding it.</span></div>}
    <div className="f2">
      <Field id="su-name" label="Full name" error={show('name')}><TextInput id="su-name" autoComplete="name" value={f.name} onChange={set('name')} onBlur={blur('name')} error={show('name')} placeholder="Sarah Atim" /></Field>
      <Field id="su-email" label={byId ? 'Email' : 'Student email'} error={show('email')} hint={byId ? 'Gmail or any address you use' : <>Ends with <b>{uni.domain}</b></>}>
        <TextInput id="su-email" type="email" autoComplete="email" inputMode="email" value={f.email} onChange={set('email')} onBlur={blur('email')} error={show('email')} placeholder={byId ? 'name@gmail.com' : `name@${uni.domain}`} /></Field>
      {byId && <Field id="su-sno" label="Student number" error={show('studentNo')} hint="As printed on your student ID">
        <TextInput id="su-sno" autoComplete="off" autoCapitalize="characters" value={f.studentNo} onChange={set('studentNo')} onBlur={blur('studentNo')} error={show('studentNo')} placeholder="S24B13/001" /></Field>}
      <div className="span stack" style={{ gap: 8 }}><Field id="su-pw" label="Password" error={touched.password && f.password && errs.password ? errs.password : null}>
        <PasswordInput id="su-pw" autoComplete="new-password" value={f.password} onChange={set('password')} onBlur={blur('password')} error={touched.password ? errs.password : null} /></Field>
        {!(touched.password && errs.password) && <PasswordStrength value={f.password} />}</div>
    </div>
    <label className={'check small' + (show('agree') ? ' bad' : '')} style={{ alignItems: 'flex-start' }}><input type="checkbox" checked={f.agree} onChange={set('agree')} aria-invalid={!!show('agree') || undefined} />
      <span>I agree to the Nestly <Link to="/terms" target="_blank">terms of use</Link> and <Link to="/privacy" target="_blank">privacy policy</Link>.{show('agree') && <b className="sr-only"> {show('agree')}</b>}</span></label>
    <Captcha onToken={setCaptcha} reset={again} />
    {serverErr && !serverErr.field && <p className="err" role="alert">{serverErr.msg}</p>}
    <Btn type="submit" block loading={busy}>Create account</Btn>
  </form>;
}

/** Live mode: the confirmation email is real, so this just says where it went and lets them ask again. */
export function CheckEmail({ email, onRestart, back = '/s/explore', idRoute, onUseId }: { email: string; onRestart: () => void; back?: string; idRoute?: boolean; onUseId?: () => void }) {
  const toast = useToast(); const nav = useNavigate();
  const [cool, setCool] = useState(45); const [busy, setBusy] = useState(false); const [captcha, setCaptcha] = useState(''); const [again, setAgain] = useState(0);
  useEffect(() => { if (cool <= 0) return; const t = setTimeout(() => setCool(c => c - 1), 1000); return () => clearTimeout(t); }, [cool]);
  async function resend() {
    if (captchaOn && !captcha) return toast('Please complete the check that you are not a robot first.');
    setBusy(true); try { await resendConfirmation(email, back, captcha || undefined); setCool(60); toast('Sent again. Check your inbox and spam folder.'); } catch (x) { toast((x as Error).message); } finally { setBusy(false); setAgain(n => n + 1); }
  }
  return <div className="stack">
    <div className="check-mail"><span className="icon-tile primary"><Mail size={20} /></span><p>We sent a link to <b>{email}</b>. Open it to confirm your email, then log in.{idRoute ? ' Next you add a photo of your student ID and a selfie holding it.' : ''}</p></div>
    <p className="small muted">Not there after a minute? Check spam or promotions.</p>
    {onUseId && <div className="banner warn" style={{ alignItems: 'flex-start' }}><IdCard size={18} className="ic" /><span className="grow small">Still nothing after a few minutes? Some university mail servers block our emails. <button type="button" className="btn btn-text btn-sm" style={{ padding: 0, minHeight: 0, height: "auto", display: "inline" }} onClick={onUseId}>Use your student ID instead</button></span></div>}
    {cool <= 0 && <Captcha onToken={setCaptcha} reset={again} />}
    <div className="row between wrap" style={{ gap: 8 }}>
      <Btn kind="secondary" size="sm" loading={busy} disabled={cool > 0} onClick={resend}><RefreshCw size={15} />{cool > 0 ? `Send again in ${cool}s` : 'Send again'}</Btn>
      <button type="button" className="btn btn-text btn-sm" onClick={onRestart}>Wrong email? Change it</button></div>
    {back === '/s/explore' && <button type="button" className="btn btn-text btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => nav(takeNext() ?? '/s/explore', { replace: true })}>Browse hostels while you wait<ArrowRight size={15} /></button>}
  </div>;
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

/**
 * Student ID route, after the email is confirmed: the student adds a photo of their ID and a selfie holding it,
 * then waits for the admin's check. After a rejection they see why and can send new photos (and fix the number).
 */
function IdStatus() {
  const me = useUser()!; const nav = useNavigate(); const toast = useToast();
  type P = { name: string; url: string } | null;
  const [card, setCard] = useState<P>(null); const [selfie, setSelfie] = useState<P>(null); const [sno, setSno] = useState(me.studentNo ?? '');
  const [busy, setBusy] = useState(false); const [tried, setTried] = useState(false); const [err, setErr] = useState<{ field?: string; msg: string } | null>(null);
  const browse = () => nav(takeNext() ?? '/s/explore', { replace: true });
  if (me.emailVerified) return <div className="stack">
    <div className="check-mail"><span className="icon-tile success"><Check size={20} /></span><p>Your student ID <b>{me.studentNo}</b> is approved. You can book a room.</p></div>
    <Btn block onClick={browse}>Find a hostel<ArrowRight size={18} /></Btn></div>;
  if (me.idStatus === 'pending') return <div className="stack">
    <div className="check-mail"><span className="icon-tile primary"><Clock size={20} /></span><p>Thanks. Our team is checking your student ID <b>{me.studentNo}</b>, usually within a day. We will notify you when it is approved.</p></div>
    <p className="small muted">You can browse and save hostels now. Booking opens once your ID is approved.</p>
    <Btn block onClick={browse}>Browse hostels<ArrowRight size={18} /></Btn>
  </div>;
  const snoErr = !/^[A-Z0-9/-]{4,30}$/.test(sno.trim().toUpperCase()) ? 'Enter your student number as it is on your ID.' : null;
  async function send(e: FormEvent) {
    e.preventDefault(); setTried(true); setErr(null);
    if (snoErr || !card || !selfie) return;
    setBusy(true);
    try { await submitStudentId(me.id, sno, card, selfie); toast('Sent. We will check it soon.'); }
    catch (x) { const a = x as ApiError; setErr({ field: a.field, msg: a.message }); } finally { setBusy(false); }
  }
  const rejected = me.idStatus === 'rejected';
  return <form className="stack" onSubmit={send} noValidate>
    {rejected ? <div className="banner warn" style={{ alignItems: 'flex-start' }}><XCircle size={18} className="ic" /><span className="grow"><b>We could not accept your student ID.</b> {me.idNote}{/[.!?]$/.test(me.idNote ?? '') ? '' : '.'} Send new photos below.</span></div>
      : <div className="check-mail"><span className="icon-tile success"><Check size={20} /></span><p>Your email is confirmed. Last step: two photos so our team can check you are a student.</p></div>}
    <Field id="id-sno" label="Student number" error={(tried && snoErr) || (err?.field === 'studentNo' ? err.msg : null)} hint="As printed on your student ID">
      <TextInput id="id-sno" autoComplete="off" autoCapitalize="characters" value={sno} onChange={e => { setSno(e.target.value); if (err?.field === 'studentNo') setErr(null); }} error={(tried && snoErr) || (err?.field === 'studentNo' ? err.msg : null)} /></Field>
    <div className="min0"><IdPhoto kind="card" value={card} onChange={p => setCard(p)} error={tried && !card ? 'Add a photo of the front of your student ID.' : null} /></div>
    <div className="min0"><IdPhoto kind="selfie" value={selfie} onChange={p => setSelfie(p)} error={tried && !selfie ? 'Add a selfie holding your student ID.' : null} /></div>
    {err && err.field !== 'studentNo' && <p className="err" role="alert">{err.msg}</p>}
    <Btn type="submit" block loading={busy}>Send for checking</Btn>
    <button type="button" className="btn btn-text btn-sm" style={{ alignSelf: 'flex-start' }} onClick={browse}>Browse hostels for now<ArrowRight size={15} /></button>
  </form>;
}
