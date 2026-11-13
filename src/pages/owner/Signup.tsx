import { ChevronLeft, ArrowRight, Check, Pencil, ShieldCheck, Smartphone } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { PasswordStrength, passwordOk } from '../../components/PasswordStrength';
import { Segmented } from '../../components/Segmented';
import { useToast } from '../../components/Toast';
import { Btn, Field, PasswordInput, TextInput } from '../../components/ui';
import { ApiError, docsOf, savePayout, signupOwner, submitOwner, subConfig, uploadDoc } from '../../services/api';
import { ugx } from '../../lib/format';
import { useUser } from '../../services/session';
import { useData } from '../../services/useData';
import { AuthLayout } from '../auth/AuthLayout';
import { Steps } from '../../components/Steps';
import { DocUpload, maskTo } from './shared';

const STEPS = ['Account', 'Identity', 'Payments', 'Review'];
const TITLES = ['List your hostel on Nestly', 'Show us who you are', 'Where do students pay you?', 'Check and send'];
const SUBS = ['Your own details first. You add the hostel next.', 'We check every owner so students only see real hostels. Only the Nestly team sees these.',
  'Booking fees go straight into this account. Nestly never holds your money.', 'We usually finish checking in 1 to 2 working days.'];

/** Owner sign-up. Progress is kept: an owner who leaves comes back to the step they stopped at. */
export function OwnerSignup() {
  const me = useUser();
  const docs = useData(async () => (me ? docsOf(me.id) : []), [me?.id]);
  const has = (k: string) => (docs.data ?? []).some(d => d.kind === k && !d.hostelId);
  const auto = !me ? 1 : !(has('national_id') && has('selfie')) ? 2 : !me.payout ? 3 : 4;
  const [step, setStep] = useState<number | null>(null);
  const at = step ?? (me?.ownerStatus === 'rejected' ? 2 : auto);
  return <AuthLayout title={TITLES[at - 1]!} sub={SUBS[at - 1]} back={at === 1 ? '/welcome' : undefined} onBack={at > 2 ? () => setStep(at - 1) : undefined} wide ownerLink={false}>
    <Steps steps={STEPS} at={at} />
    {at === 1 && <AccountStep onDone={() => setStep(2)} />}
    {at === 2 && me && <IdentityStep onBack={null} onDone={() => setStep(3)} />}
    {at === 3 && me && <PayoutStep onBack={() => setStep(2)} onDone={() => setStep(4)} />}
    {at === 4 && me && <ReviewStep go={setStep} />}
  </AuthLayout>;
}

function AccountStep({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ name: '', phone: '', email: '', password: '' });
  const [code, setCode] = useState<string | null>(null); const [typed, setTyped] = useState('');
  const [err, setErr] = useState<Record<string, string | null>>({}); const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => { setF({ ...f, [k]: e.target.value }); setErr({ ...err, [k]: null }); };
  function check() {
    const x = { name: f.name.trim().split(/\s+/).length < 2 ? 'Enter your first and last name.' : null,
      phone: !/^0?7\d{8}$/.test(f.phone.replace(/\s/g, '')) ? 'Enter a 10-digit number.' : null,
      email: !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email) ? 'Enter your email.' : null,
      password: !passwordOk(f.password) ? 'Use 8+ characters with letters and numbers.' : null };
    setErr(x); return !Object.values(x).some(Boolean);
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!code) { if (check()) setCode(String(100000 + Math.floor(Math.random() * 899999))); return; }
    if (typed.replace(/\s/g, '') !== code) return setErr({ code: 'That code is not right. Check the SMS and try again.' });
    setBusy(true);
    try { await signupOwner(f); onDone(); } catch (x) { const a = x as ApiError; setErr({ [a.field ?? 'code']: a.message }); setCode(null); } finally { setBusy(false); }
  }
  return <form className="stack" onSubmit={submit} noValidate>
    {!code ? <>
      <div className="f2">
        <Field id="ow-name" label="Full name, as on your ID" error={err.name}><TextInput id="ow-name" autoComplete="name" value={f.name} onChange={set('name')} error={err.name} placeholder="Grace Namuli" /></Field>
        <Field id="ow-phone" label="Phone (MTN or Airtel)" error={err.phone}><TextInput id="ow-phone" type="tel" inputMode="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} error={err.phone} placeholder="0772 123 456" /></Field>
        <Field id="ow-email" label="Email" error={err.email}><TextInput id="ow-email" type="email" inputMode="email" autoComplete="email" value={f.email} onChange={set('email')} error={err.email} placeholder="you@gmail.com" /></Field>
        <Field id="ow-pw" label="Password" error={err.password}><PasswordInput id="ow-pw" autoComplete="new-password" value={f.password} onChange={set('password')} error={err.password} /></Field>
        {!err.password && <div className="span"><PasswordStrength value={f.password} /></div>}
      </div>
      <Btn type="submit" block>Text me a code<ArrowRight size={18} /></Btn>
    </> : <>
      <div className="row"><span className="icon-tile primary"><Smartphone size={20} /></span><p>We sent a 6-digit code to <b>{f.phone}</b>.</p></div>
      <div className="banner primary small"><span>Demo code: <b className="num">{code}</b></span></div>
      <Field id="ow-code" label="Code" error={err.code}><TextInput id="ow-code" inputMode="numeric" autoComplete="one-time-code" value={typed} onChange={e => { setTyped(e.target.value); setErr({}); }} error={err.code} maxLength={7} placeholder="123456" /></Field>
      <div className="row"><Btn kind="secondary" onClick={() => setCode(null)}><ChevronLeft size={18} />Back</Btn><Btn type="submit" className="grow" loading={busy}>Confirm and continue</Btn></div>
    </>}
  </form>;
}

function IdentityStep({ onDone }: { onBack: null; onDone: () => void }) {
  const me = useUser()!;
  const { data } = useData(async () => docsOf(me.id).filter(d => !d.hostelId), [me.id]);
  const doc = (k: string) => (data ?? []).find(d => d.kind === k);
  const ok = !!doc('national_id') && !!doc('selfie');
  return <div className="stack">
    {me.ownerStatus === 'rejected' && me.ownerNote && <div className="banner warn"><span><b>Please fix this:</b> {me.ownerNote}</span></div>}
    <div className="doc-pair">
      <DocUpload label="National ID, front side" hint="All four corners, no glare." doc={doc('national_id')} accept="image/jpeg,image/png" onFile={async (n, u) => { await uploadDoc(me.id, 'national_id', n, u); }} />
      <DocUpload label="A selfie" hint="Clear face, good light." doc={doc('selfie')} accept="image/jpeg,image/png" onFile={async (n, u) => { await uploadDoc(me.id, 'selfie', n, u); }} />
    </div>
    <p className="tiny muted row-sm"><ShieldCheck size={14} />Kept private under Uganda's Data Protection and Privacy Act, 2019.</p>
    <Btn block disabled={!ok} onClick={onDone}>Continue<ArrowRight size={18} /></Btn>
  </div>;
}

function PayoutStep({ onDone }: { onBack: () => void; onDone: () => void }) {
  const me = useUser()!;
  const [f, setF] = useState(me.payout ?? { method: 'mtn' as const, to: me.phone ?? '', name: me.name, bank: '' });
  const [err, setErr] = useState<Record<string, string | null>>({}); const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    try { await savePayout(me.id, f); onDone(); } catch (x) { const a = x as ApiError; setErr({ [a.field ?? 'to']: a.message }); } finally { setBusy(false); }
  }
  return <form className="stack" onSubmit={submit} noValidate>
    <Segmented full label="Payment method" value={f.method} onChange={m => setF({ ...f, method: m })} options={[{ value: 'mtn', label: 'MTN MoMo' }, { value: 'airtel', label: 'Airtel Money' }, { value: 'bank', label: 'Bank' }]} />
    {f.method === 'bank' && <Field id="po-bank" label="Bank"><TextInput id="po-bank" value={f.bank ?? ''} onChange={e => setF({ ...f, bank: e.target.value })} placeholder="Stanbic, Centenary, dfcu..." /></Field>}
    <Field id="po-to" label={f.method === 'bank' ? 'Account number' : 'Mobile money number'} error={err.to}>
      <TextInput id="po-to" inputMode={f.method === 'bank' ? 'numeric' : 'tel'} value={f.to} onChange={e => { setF({ ...f, to: e.target.value }); setErr({}); }} error={err.to} /></Field>
    <Field id="po-name" label="Name on the account" hint="Must match the name on your ID." error={err.name}><TextInput id="po-name" value={f.name} onChange={e => { setF({ ...f, name: e.target.value }); setErr({}); }} error={err.name} /></Field>
    <Btn type="submit" block loading={busy}>Continue<ArrowRight size={18} /></Btn>
  </form>;
}

function ReviewStep({ go }: { go: (s: number) => void }) {
  const me = useUser()!; const nav = useNavigate(); const toast = useToast(); const [busy, setBusy] = useState(false);
  const { data } = useData(async () => docsOf(me.id).filter(d => !d.hostelId), [me.id]);
  const rows: [string, string, number][] = [
    ['You', `${me.name} · ${me.phone ?? ''} (confirmed) · ${me.email}`, 1],
    ['ID and selfie', (data ?? []).map(d => d.fileName).join(', ') || 'Missing', 2],
    ['Students pay into', me.payout ? `${maskTo(me.payout.method, me.payout.to)}, ${me.payout.name}` : 'Missing', 3],
  ];
  async function send() { setBusy(true); await submitOwner(me.id); toast('Sent. We will let you know when you are approved.'); nav('/o/overview', { replace: true }); }
  return <div className="stack">
    <div className="review-list">{rows.map(([k, v, s]) => <div key={k} className="review-row"><div className="min0"><span className="tiny muted">{k}</span><b className="ink small clamp1">{v}</b></div>
      {s > 1 && <button className="btn btn-text btn-sm" onClick={() => go(s)}><Pencil size={14} />Edit</button>}</div>)}</div>
    <p className="small muted row-sm" style={{ alignItems: 'flex-start' }}><Check size={15} color="var(--success)" style={{ flex: 'none', marginTop: 2 }} /><span>You can add your hostel straight after this. Nestly costs {ugx(subConfig().subFee)} a month {subConfig().perHostel ? 'for each live hostel' : 'once a hostel is live'}, and booking fees always go straight to you.</span></p>
    <Btn block loading={busy} onClick={send}>Send for review</Btn>
  </div>;
}
