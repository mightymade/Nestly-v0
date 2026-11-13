import { Tag, Camera, Check, ChevronRight, FileCheck2, GraduationCap, HelpCircle, History, KeyRound, LogOut, Monitor, Moon, Palette, QrCode, ShieldCheck, Sun, Trash2, UserRound, Wallet, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, NavLink, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Card } from '../../components/Card';
import { PageHeader } from '../../components/PageHeader';
import { PasswordStrength, passwordOk } from '../../components/PasswordStrength';
import { Pill } from '../../components/Pill';
import { useToast } from '../../components/Toast';
import { Avatar, BackBar, Btn, Field, PasswordInput, TextInput, VerifiedName } from '../../components/ui';
import { PERMISSIONS } from '../../data/catalog';
import { resizeImage } from '../../lib/art';
import { getThemePref, setThemePref, type ThemePref } from '../../lib/theme';
import { useIsPhone } from '../../lib/useIsPhone';
import { MoneyInput } from '../../components/MoneyInput';
import { ugx } from '../../lib/format';
import { ownerHostelCounts, saveConfig, subConfig, ApiError, changePassword, docsOf, hostelById, logout, savePayout, universityById, updateProfile, usernameAvailable } from '../../services/api';
import { Segmented } from '../../components/Segmented';
import { useData } from '../../services/useData';
import { maskTo } from '../owner/shared';
import { useMe } from '../../services/session';
import { GateQR } from '../custodian/shared';

const ALL = [
  { id: 'profile', label: 'Profile', icon: UserRound, sub: 'Photo, name and contact details' },
  { id: 'password', label: 'Password', icon: KeyRound, sub: 'Change your password' },
  { id: 'payout', label: 'Payment account', icon: Wallet, sub: 'Where students pay booking fees' },
  { id: 'documents', label: 'Documents', icon: FileCheck2, sub: 'Your ID and ownership papers' },
  { id: 'pricing', label: 'Subscription price', icon: Tag, sub: 'What owners pay Nestly each month' },
  { id: 'appearance', label: 'Appearance', icon: Palette, sub: 'Light, dark or match your device' },
  { id: 'access', label: 'My access', icon: ShieldCheck, sub: 'What your role can and cannot do' },
] as const;
type SectionId = typeof ALL[number]['id'];
const sectionsFor = (role: string) => ALL.filter(s => s.id === 'pricing' ? role === 'admin' : role === 'owner' || (s.id !== 'payout' && s.id !== 'documents'));

export function SettingsPage({ base, home }: { base: string; home: string }) {
  const { section } = useParams(); const phone = useIsPhone(); const me = useMe(); const nav = useNavigate(); const [qr, setQr] = useState(false);
  const doLogout = async () => { await logout(); nav('/welcome', { replace: true }); };
  const SECTIONS = sectionsFor(me.role);
  const sec = SECTIONS.find(s => s.id === section);
  if (section && !sec) return <Navigate to={base} replace />;
  const body = (id: SectionId) => id === 'profile' ? <ProfileSection /> : id === 'password' ? <PasswordSection /> : id === 'appearance' ? <AppearanceSection /> : id === 'pricing' ? <PricingSection />
    : id === 'payout' ? <PayoutSection /> : id === 'documents' ? <DocumentsSection /> : <AccessSection />;
  const where = me.role === 'student' ? universityById(me.universityId)?.short : me.role === 'custodian' ? hostelById(me.hostelId ?? '')?.name : me.role === 'owner' ? 'Hostel owner' : 'Nestly team';
  const helpPath = { student: '/s/help', custodian: '/c/help', owner: '/o/help', admin: '/a/help' }[me.role];
  const pageTitle = me.role === 'student' ? 'Account' : 'Settings';

  if (phone) {
    if (sec) return <><BackBar title={sec.label} to={base} /><main className="m-main pushed" style={{ paddingBottom: 110 }}>{body(sec.id)}</main></>;
    const content = <>
      <div className="card profile-card">
        <Link to={`${base}/profile`} className="avatar-edit" aria-label="Change profile photo"><Avatar user={me} size={88} /><span className="cam"><Camera size={15} /></span></Link>
        <h2 style={{ fontSize: 20, marginTop: 6 }}><VerifiedName user={me} /></h2><p className="small muted">{me.role === 'student' ? 'Student' : me.role === 'custodian' ? 'Custodian' : me.role === 'owner' ? 'Owner' : 'Admin'} · {where}</p>
        {me.role === 'student' && !me.emailVerified && <Link to="/signup"><Pill tone="warn">Email not confirmed. Tap to confirm</Pill></Link>}
      </div>
      <div className="card m-list">{SECTIONS.filter(s => !(me.role === 'custodian' && s.id === 'appearance')).map(s => <Link key={s.id} to={`${base}/${s.id}`}><span className="icon-tile sm primary"><s.icon size={18} /></span>
        <span className="grow">{s.label}<span className="sub">{s.sub}</span></span><ChevronRight size={18} className="chev" /></Link>)}
        {me.role === 'admin' && <><Link to="/a/subscriptions"><span className="icon-tile sm primary"><Wallet size={18} /></span><span className="grow">Subscriptions<span className="sub">Owner payments to Nestly</span></span><ChevronRight size={18} className="chev" /></Link>
          <Link to="/a/universities"><span className="icon-tile sm primary"><GraduationCap size={18} /></span><span className="grow">Universities<span className="sub">Logos, email domains and semester dates</span></span><ChevronRight size={18} className="chev" /></Link>
          <Link to="/a/activity"><span className="icon-tile sm primary"><History size={18} /></span><span className="grow">Activity log<span className="sub">Every admin and custodian action</span></span><ChevronRight size={18} className="chev" /></Link></>}
        {me.role === 'custodian' && <button onClick={() => setQr(true)}><span className="icon-tile sm primary"><QrCode size={18} /></span><span className="grow">Gate QR code<span className="sub">Print it so visitors can sign in</span></span><ChevronRight size={18} className="chev" /></button>}
        <Link to={helpPath}><span className="icon-tile sm"><HelpCircle size={18} /></span><span className="grow">Help<span className="sub">Questions and support</span></span><ChevronRight size={18} className="chev" /></Link></div>
      <div className="card m-list"><button onClick={doLogout} style={{ color: 'var(--danger)' }}><span className="icon-tile sm danger"><LogOut size={18} /></span>Log out</button></div>
    </>;
    // Custodians, owners and admins reach settings from the gear, so it is a pushed screen with a back bar.
    if (me.role !== 'student') return <><BackBar title="Settings" to={home} /><main className="m-main pushed">{content}</main>{qr && <GateQR onClose={() => setQr(false)} />}</>;
    return content;
  }

  const active = sec?.id ?? 'profile';
  return <>
    <PageHeader title={pageTitle} />
    <div className="card settings fill" style={{ overflow: 'hidden' }}>
      <nav className="settings-nav" aria-label="Settings sections">
        {SECTIONS.map(s => <NavLink key={s.id} to={`${base}/${s.id}`} className={() => (active === s.id ? 'active' : '')}><s.icon size={18} />{s.label}</NavLink>)}
        <div className="divider" style={{ margin: '8px 0' }} />
        <button className="nav-link" style={{ height: 44, color: 'var(--danger)' }} onClick={doLogout}><LogOut size={18} />Log out</button>
      </nav>
      <div className="settings-body">{body(active)}</div>
    </div>
  </>;
}

function SectionHead({ title, sub }: { title: string; sub: string }) {
  const phone = useIsPhone();
  return phone ? <p className="page-sub" style={{ marginBottom: 8 }}>{sub}</p> : <div style={{ marginBottom: 8 }}><h2 style={{ fontSize: 20 }}>{title}</h2><p className="muted" style={{ marginTop: 4 }}>{sub}</p></div>;
}

function SaveBar({ dirty, busy, onReset, label = 'Save changes' }: { dirty: boolean; busy: boolean; onReset?: () => void; label?: string }) {
  const phone = useIsPhone();
  if (phone) return <div className="m-save"><Btn type="submit" block disabled={!dirty} loading={busy}>{label}</Btn></div>;
  if (!dirty && !busy) return null;
  return <div className="save-bar"><span className="grow small muted" style={{ alignSelf: 'center' }}>You have unsaved changes</span>{onReset && <Btn kind="secondary" onClick={onReset}>Discard</Btn>}<Btn type="submit" loading={busy}>{label}</Btn></div>;
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const phone = useIsPhone();
  if (phone) return <div className="card card-pad stack" style={{ marginBottom: 12 }}>{children}</div>;
  return <div className="set-row"><div><b className="ink">{label}</b>{hint && <p className="hint" style={{ marginTop: 4 }}>{hint}</p>}</div><div className="stack" style={{ minWidth: 0 }}>{children}</div></div>;
}

function ProfileSection() {
  const me = useMe(); const toast = useToast(); const fileRef = useRef<HTMLInputElement>(null);
  // Students have a fixed school email and university. Everyone else logs in with a username or email they can change.
  const isCust = me.role !== 'student';
  const init = { name: me.name, username: me.username ?? '', email: me.email, phone: me.phone ?? '' };
  const [f, setF] = useState(init); const [busy, setBusy] = useState(false); const [photoBusy, setPhotoBusy] = useState(false);
  const [err, setErr] = useState<Record<string, string | null>>({});
  const [avail, setAvail] = useState<boolean | null>(null);
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
  useEffect(() => {
    if (!isCust || f.username === me.username || !/^[a-z0-9._]{3,20}$/.test(f.username)) { setAvail(null); return; }
    let live = true; const t = setTimeout(() => usernameAvailable(f.username, me.id).then(a => live && setAvail(a)), 350);
    return () => { live = false; clearTimeout(t); };
  }, [f.username, isCust, me.id, me.username]);
  async function pickPhoto(file?: File) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) return toast('That photo is over 8 MB. Pick a smaller one.', { tone: 'danger' });
    setPhotoBusy(true);
    try { const photo = await resizeImage(file); await updateProfile(me.id, { photo }); toast('Profile photo updated'); }
    catch (x) { toast((x as Error).message, { tone: 'danger' }); } finally { setPhotoBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    const x: Record<string, string | null> = {
      name: f.name.trim().split(/\s+/).length < 2 ? 'Enter your first and last name.' : null,
      username: isCust && !/^[a-z0-9._]{3,20}$/.test(f.username) ? 'Use 3 to 20 lowercase letters, numbers, dots or underscores.' : avail === false ? 'That username is taken.' : null,
      phone: f.phone && !/^0?7\d{8}$/.test(f.phone.replace(/\s/g, '')) ? 'Enter a 10-digit number, like 0772 123 456.' : null,
    };
    setErr(x); if (Object.values(x).some(Boolean)) return;
    setBusy(true);
    try {
      const patch: Parameters<typeof updateProfile>[1] = { name: f.name.trim(), phone: f.phone.trim() };
      if (isCust) { patch.username = f.username; patch.email = f.email.trim(); }
      await updateProfile(me.id, patch);
      toast(isCust && f.email !== me.email ? 'Saved. We sent a confirmation to your new email.' : 'Profile saved');
    } catch (y) { const a = y as ApiError; setErr({ [a.field ?? 'name']: a.message }); } finally { setBusy(false); }
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: k === 'username' ? e.target.value.toLowerCase().replace(/\s/g, '') : e.target.value });
  return <form onSubmit={save} noValidate>
    <SectionHead title="Profile" sub={{ student: 'Hostel owners and custodians see your name and photo when you book.', custodian: 'Tenants and the owner see your name and photo.', owner: 'Students and your custodians see your name. The Nestly team uses your phone to reach you.', admin: 'Other Nestly admins see your name in the activity log.' }[me.role]} />
    <Row label="Profile photo" hint="A clear photo of your face. JPG or PNG, up to 8 MB.">
      <div className="photo-edit"><span className="avatar-edit"><Avatar user={me} size={84} /><button type="button" className="cam" onClick={() => fileRef.current?.click()} aria-label="Upload photo"><Camera size={15} /></button></span>
        <div className="stack-sm"><div className="row wrap" style={{ gap: 8 }}>
          <Btn kind="secondary" size="sm" loading={photoBusy} onClick={() => fileRef.current?.click()}><Camera size={15} />{me.photo ? 'Change photo' : 'Upload photo'}</Btn>
          {me.photo && <Btn kind="secondary" size="sm" onClick={async () => { await updateProfile(me.id, { photo: undefined }); toast('Photo removed'); }}><Trash2 size={15} />Remove</Btn>}</div>
          <span className="hint">We crop it to a square.</span></div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => pickPhoto(e.target.files?.[0])} aria-label="Upload profile photo" /></div>
    </Row>
    <Row label="Your details" hint={isCust ? 'Your username and email both work for logging in.' : 'Your student email is how we know you are a student.'}>
      <div className="field-grid">
        <Field id="pf-name" label="Full name" error={err.name}><TextInput id="pf-name" value={f.name} onChange={set('name')} error={err.name} autoComplete="name" /></Field>
        {isCust
          ? <Field id="pf-user" label="Username" error={err.username} hint={avail === true ? <span className="ok-text">Available</span> : avail === false ? <span className="err">Taken. Try another.</span> : undefined}>
              <div className="input-wrap has-lead"><span className="lead">@</span><TextInput id="pf-user" value={f.username} onChange={set('username')} error={err.username} autoComplete="username" /></div></Field>
          : <Field id="pf-phone" label="Mobile money number" error={err.phone}><TextInput id="pf-phone" type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} error={err.phone} autoComplete="tel" /></Field>}
        {isCust
          ? <Field id="pf-email" label="Email" error={err.email} hint={f.email !== me.email ? 'We will send a link to confirm the new address.' : undefined}><TextInput id="pf-email" type="email" value={f.email} onChange={set('email')} error={err.email} autoComplete="email" /></Field>
          : <Field id="pf-email" label="Student email" hint={me.emailVerified ? `Confirmed until ${me.verifiedUntil}` : undefined}>
              <div className="input-wrap has-trail"><TextInput id="pf-email" value={me.email} readOnly /><span className="trail" style={{ color: me.emailVerified ? 'var(--success)' : 'var(--warn)', width: 36, display: 'grid', placeItems: 'center' }}>{me.emailVerified ? <Check size={18} /> : <X size={18} />}</span></div>
              {!me.emailVerified && <Link to="/signup" className="btn btn-primary btn-sm" style={{ width: 'fit-content' }}>Confirm my email</Link>}</Field>}
        {isCust
          ? <Field id="pf-phone" label="Phone" error={err.phone}><TextInput id="pf-phone" type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} error={err.phone} autoComplete="tel" /></Field>
          : <Field id="pf-uni" label="University"><TextInput id="pf-uni" value={universityById(me.universityId)?.name ?? ''} readOnly /></Field>}
      </div>
      {!isCust && <p className="hint">To change your student email or university, contact Nestly support.</p>}
    </Row>
    <SaveBar dirty={dirty} busy={busy} onReset={() => { setF(init); setErr({}); }} />
  </form>;
}

function PasswordSection() {
  const me = useMe(); const toast = useToast();
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const [err, setErr] = useState<Record<string, string | null>>({}); const [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    const x = { current: !f.current ? 'Enter your current password.' : null, next: !passwordOk(f.next) ? 'Use at least 8 characters with letters and numbers.' : null, confirm: f.confirm !== f.next ? 'The new passwords do not match.' : null };
    setErr(x); if (Object.values(x).some(Boolean)) return;
    setBusy(true);
    try { await changePassword(me.id, f.current, f.next); setF({ current: '', next: '', confirm: '' }); toast('Password changed'); }
    catch (y) { const a = y as ApiError; setErr({ [a.field ?? 'current']: a.message }); } finally { setBusy(false); }
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return <form onSubmit={save} noValidate>
    <SectionHead title="Password" sub="Pick something you do not use on other sites." />
    <Row label="Current password" hint="Forgot it? Log out and choose Forgot password on the log in screen."><Field id="pw-cur" label="Current password" error={err.current}><PasswordInput id="pw-cur" value={f.current} onChange={set('current')} error={err.current} autoComplete="current-password" /></Field></Row>
    <Row label="New password"><Field id="pw-new" label="New password" error={err.next}><PasswordInput id="pw-new" value={f.next} onChange={set('next')} error={err.next} autoComplete="new-password" /></Field>
      <PasswordStrength value={f.next} />
      <Field id="pw-conf" label="Confirm new password" error={err.confirm}><PasswordInput id="pw-conf" value={f.confirm} onChange={set('confirm')} error={err.confirm} autoComplete="new-password" /></Field></Row>
    <SaveBar dirty={!!(f.current || f.next || f.confirm)} busy={busy} label="Change password" />
  </form>;
}

const THEMES: { id: ThemePref; label: string; icon: typeof Sun }[] = [{ id: 'light', label: 'Light', icon: Sun }, { id: 'dark', label: 'Dark', icon: Moon }, { id: 'system', label: 'Match device', icon: Monitor }];
function Mini({ dark }: { dark: boolean }) {
  const c = dark ? { bg: '#12141C', card: '#1B1E29', line: '#2A2E3D', p: '#6B76FF' } : { bg: '#F2F4FA', card: '#FFFFFF', line: '#ECEEF4', p: '#4F5BEA' };
  return <div style={{ background: c.bg, display: 'grid', gridTemplateColumns: '30% 1fr', gap: 5, padding: 6, height: '100%' }}>
    <div style={{ background: c.card, borderRadius: 6, padding: 5, display: 'flex', flexDirection: 'column', gap: 4 }}><i style={{ height: 6, borderRadius: 3, background: c.p }} /><i style={{ height: 4, borderRadius: 3, background: c.line }} /><i style={{ height: 4, borderRadius: 3, background: c.line }} /></div>
    <div style={{ display: 'grid', gap: 5, gridTemplateRows: '1fr 1fr' }}><div style={{ borderRadius: 6, background: `linear-gradient(135deg, ${c.p}, #3D49D4)` }} /><div style={{ borderRadius: 6, background: c.card }} /></div></div>;
}
/** Admin only: the subscription price. This is Nestly's only income. */
function PricingSection() {
  const toast = useToast(); const now = subConfig();
  const [fee, setFee] = useState(String(now.subFee)); const [per, setPer] = useState(now.perHostel ? 'hostel' : 'owner'); const [grace, setGrace] = useState(String(now.graceDays));
  const [err, setErr] = useState<Record<string, string | null>>({}); const [busy, setBusy] = useState(false);
  const owners = ownerHostelCounts();
  const price = +fee || 0; const perHostel = per === 'hostel';
  const expected = (unit: number, ph: boolean) => owners.reduce((a, n) => a + (ph ? unit * Math.max(1, n) : unit), 0);
  const nowTotal = expected(now.subFee, now.perHostel), newTotal = expected(price, perHostel);
  const changed = price !== now.subFee || perHostel !== now.perHostel || +grace !== now.graceDays;
  const biggest = Math.max(1, ...owners);
  async function save() {
    setBusy(true); setErr({});
    try { await saveConfig({ subFee: price, perHostel, graceDays: +grace }); toast('Subscription price saved'); }
    catch (x) { const a = x as ApiError; setErr({ [a.field ?? 'subFee']: a.message }); } finally { setBusy(false); }
  }
  return <div>
    <SectionHead title="Subscription price" sub="What hostel owners pay Nestly each month. This is Nestly's only income; booking fees go straight to owners." />
    <Row label="Price" hint="In Uganda shillings, for one month.">
      <Field id="pr-fee" label="Monthly price" error={err.subFee}><MoneyInput id="pr-fee" value={fee} onChange={v => { setFee(v); setErr({}); }} error={err.subFee} /></Field>
      <Segmented full label="Charge" value={per} onChange={setPer} options={[{ value: 'hostel', label: 'Per hostel' }, { value: 'owner', label: 'Per owner' }]} />
      <p className="hint">{perHostel ? `An owner with ${biggest} hostels pays ${ugx(price * biggest)}. Fairer: bigger owners get more from Nestly, so they pay more.` : `Every owner pays ${ugx(price)}, however many hostels they list.`}</p>
    </Row>
    <Row label="Time to pay late" hint="Days after the due date before you can pause an owner's listings.">
      <Segmented full label="Days" value={grace} onChange={v => { setGrace(v); setErr({}); }} options={['0', '3', '7', '14'].map(d => ({ value: d, label: d === '0' ? 'None' : `${d} days` }))} />
      {err.graceDays && <span className="err">{err.graceDays}</span>}
    </Row>
    <Row label="What this means" hint="Based on the owners on Nestly today.">
      <div className="review-list"><div className="review-row"><div className="min0"><span className="tiny muted">Expected each month</span><b className="small ink num">{ugx(newTotal)}</b></div>
        {changed && newTotal !== nowTotal && <span className={'small strong ' + (newTotal > nowTotal ? 'ok-t' : 'danger-t')}>{newTotal > nowTotal ? '+' : ''}{ugx(newTotal - nowTotal)}</span>}</div>
        <div className="review-row"><div className="min0"><span className="tiny muted">Owners paying</span><b className="small ink num">{owners.length}</b></div></div></div>
      <p className="hint">New prices apply from each owner's next payment. Owners get a message before the price changes.</p>
      <div className="row end"><Btn loading={busy} disabled={!changed} onClick={save}>Save price</Btn></div>
    </Row>
  </div>;
}

function AppearanceSection() {
  const toast = useToast(); const [pref, setPref] = useState<ThemePref>(getThemePref);
  const pick = (p: ThemePref) => { setPref(p); setThemePref(p); toast(p === 'system' ? 'Following your device setting' : `${p === 'dark' ? 'Dark' : 'Light'} mode on`); };
  return <div>
    <SectionHead title="Appearance" sub="Choose how Nestly looks on this device." />
    <Row label="Theme" hint="Dark mode is easier on the eyes at night.">
      <div className="theme-opts" role="radiogroup" aria-label="Theme">{THEMES.map(t => <button key={t.id} role="radio" aria-checked={pref === t.id} className={'theme-opt' + (pref === t.id ? ' on' : '')} onClick={() => pick(t.id)}>
        <div className="theme-prev" style={{ gridTemplateColumns: t.id === 'system' ? '1fr 1fr' : '1fr' }}>{t.id === 'system' ? <><Mini dark={false} /><Mini dark /></> : <Mini dark={t.id === 'dark'} />}</div>
        <span className="lbl"><span className="row-sm"><t.icon size={15} />{t.label}</span>{pref === t.id && <Check size={16} color="var(--primary)" />}</span></button>)}</div>
    </Row>
  </div>;
}

function AccessSection() {
  const me = useMe(); const p = PERMISSIONS[me.role];
  return <div className="stack">
    <SectionHead title="My access" sub={`What a ${me.role} can and cannot do on Nestly. These rules are checked by the server, not just hidden in the app.`} />
    <div className="access-cols">
      <Card title="You can" className="soft"><ul>{p.can.map(c => <li key={c}><span className="icon-tile sm success" style={{ width: 26, height: 26, borderRadius: 8 }}><Check size={15} /></span>{c}</li>)}</ul></Card>
      <Card title="You cannot" className="soft"><ul>{p.cant.map(c => <li key={c}><span className="icon-tile sm danger" style={{ width: 26, height: 26, borderRadius: 8 }}><X size={15} /></span>{c}</li>)}</ul></Card>
    </div>
  </div>;
}

function PayoutSection() {
  const me = useMe(); const toast = useToast();
  const init = me.payout ?? { method: 'mtn' as const, to: me.phone ?? '', name: me.name, bank: '' };
  const [f, setF] = useState(init); const [pw, setPw] = useState(''); const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Record<string, string | null>>({});
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
  async function submit(e: FormEvent) {
    e.preventDefault(); if (!pw) return setErr({ password: 'Enter your password to change where money goes.' });
    setBusy(true); setErr({});
    try { await savePayout(me.id, f, pw); setPw(''); toast('Saved. New booking fees go straight to this account.'); }
    catch (x) { const a = x as ApiError; setErr({ [a.field ?? 'to']: a.message }); } finally { setBusy(false); }
  }
  return <form onSubmit={submit} noValidate>
    <SectionHead title="Payment account" sub={`Students pay booking fees straight into this account. Nestly never holds your money. Now: ${me.payout ? maskTo(me.payout.method, me.payout.to) : 'no account yet'}.`} />
    <Row label="Method"><Segmented full label="Payment method" value={f.method} onChange={m => setF({ ...f, method: m })} options={[{ value: 'mtn', label: 'MTN MoMo' }, { value: 'airtel', label: 'Airtel Money' }, { value: 'bank', label: 'Bank' }]} /></Row>
    {f.method === 'bank' && <Row label="Bank"><Field id="ps-bank" label="Bank"><TextInput id="ps-bank" value={f.bank ?? ''} onChange={e => setF({ ...f, bank: e.target.value })} /></Field></Row>}
    <Row label={f.method === 'bank' ? 'Account number' : 'Number'}><Field id="ps-to" label={f.method === 'bank' ? 'Account number' : 'Mobile money number'} error={err.to}><TextInput id="ps-to" value={f.to} onChange={e => setF({ ...f, to: e.target.value })} error={err.to} /></Field>
      <Field id="ps-name" label="Name on the account" error={err.name}><TextInput id="ps-name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} error={err.name} /></Field></Row>
    {dirty && <Row label="Confirm it is you" hint="Changing where money goes needs your password."><Field id="ps-pw" label="Your password" error={err.password}><PasswordInput id="ps-pw" value={pw} onChange={e => setPw(e.target.value)} error={err.password} autoComplete="current-password" /></Field></Row>}
    <SaveBar dirty={dirty} busy={busy} onReset={() => { setF(init); setPw(''); }} />
  </form>;
}

function DocumentsSection() {
  const me = useMe();
  const { data } = useData(async () => docsOf(me.id), [me.id]);
  const docs = data ?? [];
  const NAMES: Record<string, string> = { national_id: 'National ID', selfie: 'Selfie', ownership: 'Proof of ownership', trading_licence: 'Trading licence' };
  return <div>
    <SectionHead title="Documents" sub="What you sent for checking. Only the Nestly team can see these." />
    <div className="stack-sm">{docs.length ? docs.map(d => <div key={d.id} className="doc-has">
      <div className="doc-thumb">{d.url ? <img src={d.url} alt="" /> : <FileCheck2 size={24} />}</div>
      <div className="min0 grow"><b className="small ink clamp1">{NAMES[d.kind]}{d.hostelId ? `, ${hostelById(d.hostelId)?.name ?? ''}` : ''}</b><span className="tiny muted clamp1">{d.fileName}</span>{d.note && <span className="tiny danger-t">{d.note}</span>}</div>
      <Pill tone={d.status === 'accepted' ? 'success' : d.status === 'rejected' ? 'danger' : 'warn'}>{d.status === 'accepted' ? 'Accepted' : d.status === 'rejected' ? 'Rejected' : 'Waiting'}</Pill>
    </div>) : <p className="muted">No documents yet.</p>}</div>
    <p className="tiny muted" style={{ marginTop: 12 }}>To replace a hostel's proof of ownership, open the hostel and go to Proof of ownership.</p>
  </div>;
}
