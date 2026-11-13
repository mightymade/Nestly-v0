import { CalendarDays, AlertTriangle, ArrowRight, Check, ChevronLeft, ChevronRight, Circle, FileCheck2, Home, ImagePlus, Info, ListChecks, MapPin, Pencil, Plus, Send, Sparkles, Star, Trash2, X, type LucideIcon } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, NavLink, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PickMap } from '../../components/maps';
import { MoneyInput } from '../../components/MoneyInput';
import { Dropdown } from '../../components/Dropdown';
import { Overlay } from '../../components/Overlay';
import { PageHeader } from '../../components/PageHeader';
import { Pill } from '../../components/Pill';
import { Segmented } from '../../components/Segmented';
import { EmptyState, ErrorState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { BackBar, Btn, Field, Skeleton, TextInput } from '../../components/ui';
import { AMENITIES } from '../../data/catalog';
import type { Hostel, Room, RoomType, Semester, VerificationDoc } from '../../data/types';
import { fitImage } from '../../lib/art';
import { bearing, compass, distanceKm, kmLabel, placeName, type LatLng } from '../../lib/geo';
import { ugx } from '../../lib/format';
import { useIsPhone } from '../../lib/useIsPhone';
import { bookingSem, hostelSems, semBookings, semDates, semName, allUniversities, ApiError, deleteRoom, generateRooms, getOwnerHostel, hostelChecklist, hostelPoint, saveHostelDraft, submitHostelForReview, universityById, updateRoom, updateRoomTypes, uploadDoc , uniSems } from '../../services/api';
import { useData } from '../../services/useData';
import { DocUpload, HostelPill, useOwner } from './shared';

type SecId = 'basics' | 'location' | 'photos' | 'types' | 'sems' | 'rooms' | 'amenities' | 'proof';
const SECS: { id: SecId; label: string; icon: LucideIcon }[] = [
  { id: 'basics', label: 'Basics', icon: Info }, { id: 'location', label: 'Location', icon: MapPin }, { id: 'photos', label: 'Photos', icon: ImagePlus },
  { id: 'types', label: 'Room types and prices', icon: Star }, { id: 'sems', label: 'Semester dates', icon: CalendarDays }, { id: 'rooms', label: 'Rooms', icon: Home }, { id: 'amenities', label: 'Amenities and rules', icon: Sparkles },
  { id: 'proof', label: 'Proof of ownership', icon: FileCheck2 },
];
type Ctx = { h: Hostel; rooms: Room[]; docs: VerificationDoc[]; occupied: Set<string> };

export function HostelEditor() {
  const { id = '' } = useParams(); const phone = useIsPhone(); const [params] = useSearchParams(); const nav = useNavigate(); const toast = useToast();
  const { me } = useOwner();
  const { data, loading, error, reload } = useData(() => getOwnerHostel(id), [id]);
  const [busy, setBusy] = useState(false);
  const sec = (params.get('s') as SecId | null) ?? (phone ? null : 'basics');
  if (error) return error === 'Hostel not found' ? <Navigate to="/o/hostels" replace /> : <ErrorState message={error} onRetry={reload} />;
  if (loading && !data) return phone ? <main className="m-main pushed"><Skeleton rows={4} h={70} /></main> : <><PageHeader title="Hostel" /><Skeleton rows={3} h={150} /></>;
  const { hostel: h, rooms, docs, occupied } = data!;
  if (h.ownerId !== me.id) return <Navigate to="/o/hostels" replace />;
  const ctx: Ctx = { h, rooms, docs, occupied };
  const check = hostelChecklist(h, rooms.length, docs.length > 0);
  const done = (k: string) => (k === 'sems' ? !!h.sems?.length : check.find(c => c.key === k)?.done);
  const left = check.filter(c => !c.done).length;
  const canSubmit = (h.status === 'draft' || h.status === 'changes_requested') && left === 0;
  const submit = async () => { setBusy(true); try { await submitHostelForReview(h.id); toast('Sent for review. We check listings within 1 to 2 working days.'); if (phone) nav(`/o/hostels/${h.id}`); } catch (x) { toast((x as ApiError).message); } finally { setBusy(false); } };
  const title = h.name || 'New hostel';
  const summary = (k: SecId) => {
    if (k === 'sems') { const open = bookingSem(h); return `${hostelSems(h).length} semesters · ${open ? `booking open for ${semName(open)}` : 'not taking bookings'}${h.sems?.length ? '' : ' · university dates'}`; }
    const c = check.find(x => x.key === k)!; if (!c.done && k !== 'types' && k !== 'rooms') return `Needed: ${c.label.toLowerCase()}`;
    return k === 'basics' ? `Booking fee ${ugx(h.fee)} · visitors ${h.visit.replace(/:00/g, '')}` : k === 'location' ? (h.location ? `${h.area}, ${kmLabel(h.km)} from ${universityById(h.uni)?.short}` : 'Needed: pin on the map')
      : k === 'photos' ? `${h.photos?.length ?? 0} photos` : k === 'types' ? (h.rooms.length ? `${h.rooms.length} types, from ${ugx(Math.min(...h.rooms.map(r => r.price)))}` : 'Needed: room types and prices')
      : k === 'rooms' ? (rooms.length ? `${rooms.length} rooms in ${new Set(rooms.map(r => r.block)).size} blocks` : 'Needed: rooms set up')
      : k === 'amenities' ? `${h.amen.length} amenities · ${h.rules?.length ?? 0} rules` : `${docs.length} ${docs.length === 1 ? 'document' : 'documents'} uploaded`;
  };
  const banner = h.status === 'changes_requested' ? <div className="banner warn"><AlertTriangle size={16} className="ic" /><span className="grow"><b>Changes requested:</b> {h.reviewNote}{!!h.reviewSections?.length && <span className="cr-secs">Fix: {h.reviewSections.map(id => { const x = SECS.find(y => y.id === id); return x ? <Link key={id} to={`?s=${id}`}>{x.label}</Link> : null; })}</span>}</span></div>
    : h.status === 'in_review' ? <div className="banner primary"><Info size={16} className="ic" /><span className="grow">Waiting for the Nestly team to check this listing. You can still make changes.</span></div>
    : h.status === 'suspended' ? <div className="banner warn"><AlertTriangle size={16} className="ic" /><span className="grow">{h.pausedFor === 'subscription' ? <><b>Paused, subscription not paid.</b> Students cannot see it. <Link to="/o/money">Pay on the Money page</Link> and it comes back straight away.</> : <><b>Paused by Nestly:</b> {h.suspendReason} Students cannot see it. Contact support@nestly.app.</>}</span></div> : null;
  const submitBtn = (h.status === 'draft' || h.status === 'changes_requested') && <Btn loading={busy} disabled={!canSubmit} onClick={submit} title={left ? `${left} sections left` : undefined}><Send size={16} />Submit for review</Btn>;
  const body = (s: SecId) => s === 'basics' ? <Basics {...ctx} /> : s === 'location' ? <Location {...ctx} /> : s === 'photos' ? <Photos {...ctx} /> : s === 'types' ? <Types {...ctx} /> : s === 'sems' ? <Sems {...ctx} />
    : s === 'rooms' ? <RoomsSec {...ctx} /> : s === 'amenities' ? <Amenities {...ctx} /> : <Proof {...ctx} />;

  if (phone) {
    const cur = SECS.find(s => s.id === sec);
    if (cur) {
      // After each section, point to the next one that still needs work, or offer to submit.
      const i = SECS.findIndex(s => s.id === cur.id); const next = [...SECS.slice(i + 1), ...SECS.slice(0, i)].find(s => !done(s.id));
      const after = h.status === 'live' || h.status === 'in_review' ? null : canSubmit
        ? <div className="he-next ready"><span className="small"><b className="ink">Every section is done.</b> Send it to the Nestly team to check.</span>{submitBtn}</div>
        : next && done(cur.id) ? <Link to={`/o/hostels/${h.id}?s=${next.id}`} className="he-next"><span className="small">Next: <b className="ink">{next.label}</b></span><ChevronRight size={18} /></Link> : null;
      return <><BackBar title={cur.label} to={`/o/hostels/${h.id}`} /><main className="m-main pushed he-m">{body(cur.id)}{after}</main></>;
    }
    return <><BackBar title={title} to="/o/hostels" /><main className="m-main pushed">
      <div className="row between" style={{ gap: 8 }}><HostelPill h={h} /><span className="small muted">{h.status === 'live' ? 'Changes to prices and rooms save straight away' : left ? `${left} of ${check.length} sections left` : 'Ready to submit'}</span></div>
      {banner}
      <div className="card m-list">{SECS.map(s => <Link key={s.id} to={`/o/hostels/${h.id}?s=${s.id}`}><span className={'icon-tile sm ' + (done(s.id) ? 'success' : '')}>{done(s.id) ? <Check size={17} /> : <s.icon size={17} />}</span>
        <span className="grow">{s.label}<span className="sub">{summary(s.id)}</span></span><ChevronRight size={18} className="chev" /></Link>)}</div>
      {submitBtn && <div className="row end">{submitBtn}</div>}
    </main></>;
  }
  const active = sec ?? 'basics';
  return <>
    <PageHeader title={title} actions={<><button className="round-btn" onClick={() => nav('/o/hostels')} aria-label="Back to hostels"><ChevronLeft size={19} /></button><HostelPill h={h} />{submitBtn}</>} />
    {banner}
    <div className="card settings fill he" style={{ overflow: 'hidden' }}>
      <nav className="settings-nav" aria-label="Listing sections">
        {SECS.map(s => <NavLink key={s.id} to={`/o/hostels/${h.id}?s=${s.id}`} className={() => (active === s.id ? 'active' : '')}>
          <s.icon size={18} />{s.label}{done(s.id) ? <Check size={15} className="he-ok" /> : <Circle size={9} className="he-no" />}</NavLink>)}
        <div className="he-left"><ListChecks size={16} />{h.status === 'live' ? 'Live. Price and room changes save straight away.' : left ? `${left} ${left === 1 ? 'section' : 'sections'} left before you can submit` : 'Ready to submit'}</div>
      </nav>
      <div className="settings-body he-body" key={active}>{body(active)}</div>
    </div>
  </>;
}

/* ---------- shared section frame: title, fields, and a save bar that only shows when something changed ---------- */
function Sec({ title, sub, dirty, busy, onSave, onReset, children, noSave }: { title: string; sub: string; dirty?: boolean; busy?: boolean; onSave?: () => void; onReset?: () => void; children: ReactNode; noSave?: boolean }) {
  const phone = useIsPhone();
  return <form className="he-sec" onSubmit={e => { e.preventDefault(); onSave?.(); }} noValidate>
    {!phone ? <div style={{ marginBottom: 4 }}><h2 style={{ fontSize: 20 }}>{title}</h2><p className="muted" style={{ marginTop: 4 }}>{sub}</p></div> : <p className="page-sub">{sub}</p>}
    {children}
    {!noSave && (phone ? <div className="m-save"><Btn type="submit" block disabled={!dirty} loading={busy}>Save</Btn></div>
      : (dirty || busy) && <div className="save-bar"><span className="grow small muted" style={{ alignSelf: 'center' }}>You have unsaved changes</span>{onReset && <Btn kind="secondary" onClick={onReset}>Discard</Btn>}<Btn type="submit" loading={busy}>Save changes</Btn></div>)}
  </form>;
}

/** Saving a live listing's name, photos or map pin needs a fresh check. Ask first. */
function useSave(h: Hostel) {
  const toast = useToast(); const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<null | (() => Promise<void>)>(null);
  async function run(patch: Partial<Hostel>) {
    setBusy(true);
    try { const r = await saveHostelDraft(h.id, patch); toast(r.sentToReview ? `Saved. ${h.name} is back in review and hidden from students until it is checked.` : 'Saved'); }
    catch (x) { toast((x as Error).message); } finally { setBusy(false); }
  }
  const save = (patch: Partial<Hostel>, reviewField: boolean) => (h.status === 'live' && reviewField ? setAsk(() => () => run(patch)) : run(patch));
  const dialog = ask && <Overlay title="Send this listing back to review?" onClose={() => setAsk(null)} width={460}
    footer={<><Btn kind="secondary" onClick={() => setAsk(null)}>Cancel</Btn><Btn onClick={async () => { const f = ask; setAsk(null); await f(); }}>Save and send to review</Btn></>}>
    <p>Students judge a hostel by its name, photos and location, so we check those again. <b className="ink">{h.name}</b> will be hidden from students until the check is done, usually within a day. Existing bookings are not affected.</p>
  </Overlay>;
  return { save, busy, dialog };
}

const to24 = (t: string) => { const m = /(\d{1,2}):(\d{2})\s*(am|pm)/i.exec(t); if (!m) return '08:00'; const h = (+m[1]! % 12) + (m[3]!.toLowerCase() === 'pm' ? 12 : 0); return `${String(h).padStart(2, '0')}:${m[2]}`; };
const to12 = (t: string) => { const [h, m] = t.split(':').map(Number) as [number, number]; return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`; };

function Basics({ h }: Ctx) {
  const [from0, to0] = h.visit.split(/\s+to\s+/);
  const init = { name: h.name, uni: h.uni, about: h.about, from: to24(from0 ?? ''), to: to24(to0 ?? ''), fee: h.fee ? String(h.fee) : '' };
  const [f, setF] = useState(init); const [err, setErr] = useState<Record<string, string | null>>({});
  const { save, busy, dialog } = useSave(h);
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setF({ ...f, [k]: e.target.value }); setErr({ ...err, [k]: null }); };
  const go = () => {
    const x = { name: f.name.trim().length < 3 ? 'Enter the hostel’s name.' : null,
      fee: !(+f.fee >= 1000) ? 'Enter the booking fee, like 50,000.' : +f.fee > 1_000_000 ? 'A booking fee above 1,000,000 looks wrong.' : null,
      about: f.about.trim().length < 20 ? 'Write at least a sentence about the hostel.' : null, to: f.to <= f.from ? 'Closing time must be after opening time.' : null };
    setErr(x); if (Object.values(x).some(Boolean)) return;
    save({ name: f.name.trim(), uni: f.uni, about: f.about.trim(), visit: `${to12(f.from)} to ${to12(f.to)}`, fee: +f.fee }, f.name.trim() !== h.name);
  };
  return <Sec title="Basics" sub="What students see first." dirty={dirty} busy={busy} onSave={go} onReset={() => setF(init)}>
    <div className="field-grid">
      <Field id="b-name" label="Hostel name" error={err.name}><TextInput id="b-name" value={f.name} onChange={set('name')} error={err.name} placeholder="Hillview Hostel" maxLength={40} /></Field>
      <div className="field"><span className="label">Nearest university</span>
        <Dropdown variant="field" label="Nearest university" value={f.uni} onChange={uni => setF({ ...f, uni })} options={allUniversities().map(u => ({ value: u.id, label: u.short, sub: u.name }))} /></div>
      <Field id="b-fee" label="Booking fee" error={err.fee} hint="Paid when booking. It comes off the first rent payment.">
        <MoneyInput id="b-fee" value={f.fee} onChange={fee => { setF({ ...f, fee }); setErr({ ...err, fee: null }); }} error={err.fee} placeholder="50,000" max={1_000_000} /></Field>
    </div>
    <div className="field"><label htmlFor="b-about">Short description</label>
      <textarea id="b-about" className={'input' + (err.about ? ' bad' : '')} rows={3} maxLength={300} value={f.about} onChange={set('about')} placeholder="How far is it from campus on foot? What makes it a good place to stay?" />
      <div className="row between">{err.about ? <span className="err">{err.about}</span> : <span className="hint">Plain words. Students read this on their phones.</span>}<span className="hint num">{f.about.length}/300</span></div></div>
    <div className="field"><span className="label">Visiting hours</span>
      <div className="row" style={{ gap: 10 }}><input type="time" className="input" value={f.from} onChange={set('from')} aria-label="Visitors from" /><span className="muted">to</span>
        <input type="time" className={'input' + (err.to ? ' bad' : '')} value={f.to} onChange={set('to')} aria-label="Visitors until" /></div>
      {err.to && <span className="err">{err.to}</span>}</div>
    {dialog}
  </Sec>;
}

function Location({ h }: Ctx) {
  const uni = universityById(h.uni);
  const start = hostelPoint(h);
  const [pin, setPin] = useState<LatLng | null>(start); const [area, setArea] = useState(h.area); const [named, setNamed] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { save, busy, dialog } = useSave(h);
  const moved = !!pin && (!start || Math.abs(pin.lat - start.lat) > 1e-6 || Math.abs(pin.lng - start.lng) > 1e-6);
  const dirty = moved || area.trim() !== h.area;
  const km = pin && uni ? distanceKm(uni, pin) : null;
  const place = async (p: LatLng) => {
    setPin(p); setErr(null);
    const n = await placeName(p); if (n) { setArea(n); setNamed(true); }
  };
  const go = () => {
    if (!pin) return setErr('Put the pin on the hostel first.');
    if (!area.trim()) return setErr('Enter the area name students will see, like Kampala Road, Mukono.');
    if (km !== null && km > 15) return setErr(`That spot is ${km.toFixed(0)} km from ${uni?.short}. Check the pin or the nearest university in Basics.`);
    save({ location: { lat: pin.lat, lng: pin.lng }, area: area.trim() }, moved);
  };
  return <Sec title="Location" sub="Search for the road or tap the map, then drag the pin onto the hostel gate." dirty={dirty} busy={busy} onSave={go} onReset={() => { setPin(start); setArea(h.area); setErr(null); }}>
    {uni && <PickMap value={pin} onChange={place} center={uni} reference={{ lat: uni.lat, lng: uni.lng, label: uni.short, logo: uni.logo }} height={340} />}
    <div className="pick-facts">{pin && km !== null ? <>
      <span><b className="num">{kmLabel(km)}</b> {compass(bearing(uni!, pin))} of {uni?.short}</span>
      <span>Students see this distance.</span></> : <span>No pin yet.</span>}</div>
    <Field id="l-area" label="Area name" error={null} hint={named ? 'Filled in from the map. Change it if students know the place by another name.' : 'The road or area students know, like Kampala Road, Mukono.'}>
      <TextInput id="l-area" value={area} onChange={e => { setArea(e.target.value); setNamed(false); setErr(null); }} placeholder="Kampala Road, Mukono" maxLength={60} /></Field>
    {err && <span className="err" role="alert">{err}</span>}
    {dialog}
  </Sec>;
}

function Photos({ h }: Ctx) {
  const init = h.photos ?? [];
  const [list, setList] = useState<string[]>(init); const [loading, setLoading] = useState(0); const [err, setErr] = useState<string | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const { save, busy, dialog } = useSave(h);
  const dirty = JSON.stringify(list) !== JSON.stringify(init);
  async function add(files: FileList | null) {
    if (!files) return; setErr(null);
    const room = 10 - list.length; const pick = Array.from(files).slice(0, room);
    if (files.length > room) setErr(`Only 10 photos are allowed. ${files.length - room} were left out.`);
    setLoading(pick.length);
    for (const f of pick) {
      if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size > 8 * 1024 * 1024) { setErr('Use JPG or PNG photos under 8 MB.'); setLoading(n => n - 1); continue; }
      try { const url = await fitImage(f, 1000); setList(l => [...l, url]); } catch (x) { setErr((x as Error).message); }
      setLoading(n => n - 1);
    }
    if (input.current) input.current.value = '';
  }
  const move = (i: number, j: number) => setList(l => { if (j < 0 || j >= l.length) return l; const c = l.slice(); const [x] = c.splice(i, 1); c.splice(j, 0, x!); return c; });
  return <Sec title="Photos" sub="Up to 10. The first photo is the cover. Drag to change the order." dirty={dirty} busy={busy} onSave={() => save({ photos: list }, true)} onReset={() => setList(init)}>
    <div className="ph-grid">
      {list.map((src, i) => <div key={src.slice(-40) + i} className={'ph' + (drag === i ? ' drag' : '')} draggable onDragStart={() => setDrag(i)} onDragEnd={() => setDrag(null)}
        onDragOver={e => { e.preventDefault(); if (drag !== null && drag !== i) { move(drag, i); setDrag(i); } }}>
        <img src={src} alt={`Photo ${i + 1}`} />{i === 0 && <span className="ph-cover">Cover</span>}
        <div className="ph-acts"><button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label="Move earlier"><ChevronLeft size={15} /></button>
          <button type="button" onClick={() => move(i, i + 1)} disabled={i === list.length - 1} aria-label="Move later"><ChevronRight size={15} /></button>
          <button type="button" onClick={() => setList(l => l.filter((_, k) => k !== i))} aria-label={`Remove photo ${i + 1}`}><Trash2 size={14} /></button></div>
      </div>)}
      {Array.from({ length: loading }, (_, i) => <div key={'l' + i} className="ph loading"><span className="prog"><i className="indet" /></span><span className="tiny muted">Uploading...</span></div>)}
      {list.length + loading < 10 && <button type="button" className="ph add" onClick={() => input.current?.click()}><ImagePlus size={22} /><span className="small strong">Add photos</span><span className="tiny muted">{10 - list.length} left</span></button>}
    </div>
    {err && <span className="err" role="alert">{err}</span>}
    <p className="tiny muted">Show the rooms, bathrooms and the outside. At least 3 photos are needed to submit.</p>
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={e => add(e.target.files)} />
    {dialog}
  </Sec>;
}

type TypeRow = { t: string; sc: boolean; beds: number; price: string; rooms: string };
const TYPE_NAMES = ['Single, self-contained', 'Double, self-contained', 'Single, shared bathroom', 'Double, shared bathroom'];
function Types({ h, rooms }: Ctx) {
  const toast = useToast(); const hasRooms = rooms.length > 0;
  const init: TypeRow[] = h.rooms.map(r => ({ t: r.t, sc: r.sc, beds: r.beds ?? 1, price: String(r.price), rooms: String(Math.round(r.total / (r.beds ?? 1))) }));
  const [rows, setRows] = useState(init); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const dirty = JSON.stringify(rows) !== JSON.stringify(init);
  const upd = (i: number, p: Partial<TypeRow>) => setRows(r => r.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const prices = rows.map(r => +r.price).filter(n => n > 0);
  async function go() {
    if (rows.some(r => !r.t.trim() || !(+r.price > 0) || (!hasRooms && !(+r.rooms > 0)))) return setErr('Every row needs a name, a price and a number of rooms.');
    if (new Set(rows.map(r => r.t.trim().toLowerCase())).size !== rows.length) return setErr('Each room type needs a different name.');
    setErr(null); setBusy(true);
    const types: RoomType[] = rows.map(r => { const name = r.t.trim(); const n = hasRooms ? rooms.filter(x => x.type === name).length : +r.rooms;
      return { t: name, sc: r.sc, beds: r.beds, price: +r.price, total: n * r.beds, taken: 0 }; });
    await updateRoomTypes(h.id, types); setBusy(false); toast('Room types saved');
  }
  return <Sec title="Room types and prices" sub="Prices are per semester. Changing prices does not send a live listing back to review." dirty={dirty} busy={busy} onSave={go} onReset={() => setRows(init)}>
    <datalist id="type-names">{TYPE_NAMES.map(n => <option key={n} value={n} />)}</datalist>
    <div className="tr-list">{rows.map((r, i) => <div key={i} className="tr">
      <div className="tr-top"><TextInput list="type-names" value={r.t} onChange={e => upd(i, { t: e.target.value, sc: /self-contained/i.test(e.target.value) || r.sc, beds: /double/i.test(e.target.value) ? 2 : /single/i.test(e.target.value) ? 1 : r.beds })} placeholder="Single, self-contained" aria-label="Room type name" />
        <button type="button" className="icon-btn" onClick={() => setRows(x => x.filter((_, k) => k !== i))} aria-label="Remove this room type"><X size={16} /></button></div>
      <div className="tr-grid">
        <label className="check small"><input type="checkbox" checked={r.sc} onChange={e => upd(i, { sc: e.target.checked })} />Own bathroom</label>
        <Segmented label="Beds per room" value={String(r.beds)} onChange={v => upd(i, { beds: +v })} options={[{ value: '1', label: '1 bed' }, { value: '2', label: '2 beds' }]} />
        <MoneyInput value={r.price} onChange={price => upd(i, { price })} aria-label="Price per semester" placeholder="950,000" />
        {hasRooms ? <span className="small muted">{rooms.filter(x => x.type === r.t).length} rooms set up</span>
          : <div className="input-wrap"><input className="input" inputMode="numeric" value={r.rooms} onChange={e => upd(i, { rooms: e.target.value.replace(/\D/g, '') })} aria-label="Number of rooms" placeholder="Rooms" /></div>}
      </div>
    </div>)}</div>
    <Btn kind="secondary" size="sm" onClick={() => setRows(r => [...r, { t: '', sc: false, beds: 1, price: '', rooms: '' }])}><Plus size={15} />Add a room type</Btn>
    {err && <span className="err" role="alert">{err}</span>}
    <div className="tr-preview"><span className="tiny muted">Students see</span><span className="price">{prices.length ? <>From {ugx(Math.min(...prices))}<span> / sem</span></> : 'No price yet'}</span></div>
  </Sec>;
}

function RoomsSec({ h, rooms, occupied }: Ctx) {
  const toast = useToast();
  const [g, setG] = useState({ block: (h.blocks?.length ? String.fromCharCode(Math.max(...h.blocks.map(b => b.charCodeAt(0))) + 1) : 'A'), type: h.rooms[0]?.t ?? '', count: '8', floor: '1' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState<Room | null>(null); const [del, setDel] = useState<Room | null>(null);
  const blocks = Array.from(new Set(rooms.map(r => r.block)));
  async function gen() {
    const t = h.rooms.find(x => x.t === g.type); if (!t) return setErr('Add room types first.');
    if (!(+g.count > 0 && +g.count <= 40)) return setErr('Add between 1 and 40 rooms at a time.');
    setBusy(true); setErr(null);
    try { await generateRooms(h.id, g.block, g.type, +g.count, +g.floor || 1, t.beds ?? 1); toast(`${g.count} rooms added to block ${g.block.toUpperCase()}`); setG({ ...g, block: String.fromCharCode(g.block.toUpperCase().charCodeAt(0) + 1) }); }
    catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  }
  return <Sec title="Rooms" sub="Each real room, so custodians can give students a room when they arrive. Only you can add or remove rooms." noSave>
    {!h.rooms.length ? <EmptyState bare icon={<Home size={24} />} title="Add room types first" text="Rooms are made from your room types and prices." action={<Link to={`/o/hostels/${h.id}?s=types`} className="btn btn-secondary btn-sm">Room types<ArrowRight size={15} /></Link>} />
      : <div className="gen">
        <b className="small ink">Add rooms</b>
        <div className="gen-grid">
          <Field id="g-block" label="Block"><TextInput id="g-block" value={g.block} onChange={e => setG({ ...g, block: e.target.value.toUpperCase() })} maxLength={3} /></Field>
          <div className="field"><span className="label">Room type</span><Dropdown variant="field" label="Room type" value={g.type} onChange={type => setG({ ...g, type })} options={h.rooms.map(r => ({ value: r.t, label: r.t }))} /></div>
          <Field id="g-count" label="How many"><TextInput id="g-count" inputMode="numeric" value={g.count} onChange={e => setG({ ...g, count: e.target.value.replace(/\D/g, '') })} /></Field>
          <Field id="g-floor" label="Floor"><TextInput id="g-floor" inputMode="numeric" value={g.floor} onChange={e => setG({ ...g, floor: e.target.value.replace(/\D/g, '') })} /></Field>
        </div>
        <div className="row between wrap" style={{ gap: 8 }}><span className="tiny muted">Numbers follow on, like {g.block || 'A'}-01 to {g.block || 'A'}-{String(+g.count || 1).padStart(2, '0')}.</span><Btn size="sm" loading={busy} onClick={gen}><Plus size={15} />Add rooms</Btn></div>
        {err && <span className="err" role="alert">{err}</span>}
      </div>}
    {blocks.map(b => { const list = rooms.filter(r => r.block === b); return <div key={b} className="rl-block">
      <h3 className="rm-bhead">Block {b}<span>{list.length} rooms · {list.reduce((a, r) => a + r.beds, 0)} beds</span></h3>
      <div className="rl">{list.map(r => <div key={r.id} className="rl-row">
        <span className="vroom">{r.no}</span><span className="grow small clamp1">{r.type}</span><span className="tiny muted nowrap">Floor {r.floor}</span>
        {occupied.has(r.id) ? <Pill tone="primary">In use</Pill> : r.status === 'unavailable' ? <Pill tone="danger">Not available</Pill> : null}
        <button type="button" className="icon-btn" onClick={() => setEdit(r)} aria-label={`Edit ${r.no}`}><Pencil size={15} /></button>
        <button type="button" className="icon-btn" onClick={() => setDel(r)} disabled={occupied.has(r.id)} title={occupied.has(r.id) ? 'Someone is in this room' : undefined} aria-label={`Delete ${r.no}`}><Trash2 size={15} /></button>
      </div>)}</div></div>; })}
    {edit && <EditRoom r={edit} types={h.rooms} onClose={() => setEdit(null)} />}
    {del && <Overlay title={`Delete room ${del.no}?`} onClose={() => setDel(null)} width={420}
      footer={<><Btn kind="secondary" onClick={() => setDel(null)}>Keep it</Btn><Btn kind="danger" onClick={async () => { try { await deleteRoom(del.id); toast(`${del.no} deleted`); } catch (x) { toast((x as Error).message); } setDel(null); }}><Trash2 size={15} />Delete room</Btn></>}>
      <p>Room <b className="ink">{del.no}</b> will be removed. Students see one fewer {del.type.toLowerCase()} {del.beds > 1 ? 'room' : 'bed'}.</p></Overlay>}
  </Sec>;
}
function EditRoom({ r, types, onClose }: { r: Room; types: RoomType[]; onClose: () => void }) {
  const toast = useToast(); const [f, setF] = useState({ no: r.no, block: r.block, floor: String(r.floor), type: r.type }); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); setErr(null); try { await updateRoom(r.id, { no: f.no.trim().toUpperCase(), block: f.block.trim().toUpperCase(), floor: +f.floor || 1, type: f.type, beds: types.find(t => t.t === f.type)?.beds ?? r.beds }); toast('Room saved'); onClose(); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); } };
  return <Overlay title={`Edit ${r.no}`} onClose={onClose} width={440} footer={<><Btn kind="secondary" onClick={onClose}>Cancel</Btn><Btn loading={busy} onClick={go}>Save room</Btn></>}>
    <div className="stack">
      <div className="field-grid"><Field id="er-no" label="Room number" error={err}><TextInput id="er-no" value={f.no} onChange={e => setF({ ...f, no: e.target.value })} error={err} /></Field>
        <Field id="er-b" label="Block"><TextInput id="er-b" value={f.block} onChange={e => setF({ ...f, block: e.target.value })} maxLength={3} /></Field>
        <Field id="er-f" label="Floor"><TextInput id="er-f" inputMode="numeric" value={f.floor} onChange={e => setF({ ...f, floor: e.target.value.replace(/\D/g, '') })} /></Field></div>
      <div className="field"><span className="label">Room type</span><Dropdown variant="field" label="Room type" value={f.type} onChange={type => setF({ ...f, type })} options={types.map(t => ({ value: t.t, label: t.t }))} /></div>
    </div></Overlay>;
}

const addDays = (d: string, n: number) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
/** When students move in and out, and which semester takes bookings. Not a review field: saves straight away. */
function Sems({ h }: Ctx) {
  const uni = universityById(h.uni);
  const start = hostelSems(h);
  const [list, setList] = useState<Semester[]>(start); const [err, setErr] = useState<string | null>(null);
  const { save, busy, dialog } = useSave(h);
  const dirty = JSON.stringify(list) !== JSON.stringify(start);
  const upd = (i: number, p: Partial<Semester>) => { setList(l => l.map((s, j) => (j === i ? { ...s, ...p } : s))); setErr(null); };
  const add = () => { const last = list[list.length - 1]; const st = last ? addDays(last.end, 56) : addDays(new Date().toISOString().slice(0, 10), 30); setList([...list, { start: st, end: addDays(st, 18 * 7), open: false }]); };
  function go() {
    const s = list.slice().sort((a, b) => a.start.localeCompare(b.start));
    for (const [i, x] of s.entries()) {
      if (!x.start || !x.end) return setErr('Fill in the move-in and move-out date for every semester.');
      if (x.end <= x.start) return setErr(`${semName(x)}: move-out must be after move-in.`);
      if (+new Date(x.end) - +new Date(x.start) < 8 * 7 * 86400000) return setErr(`${semName(x)} is shorter than 8 weeks. Check the dates.`);
      if (i > 0 && x.start <= s[i - 1]!.end) return setErr(`${semName(s[i - 1]!)} and ${semName(x)} overlap.`);
    }
    if (new Set(s.map(semName)).size !== s.length) return setErr('Two semesters have the same months. Remove one.');
    save({ sems: s }, false); setList(s);
  }
  const today = new Date().toISOString().slice(0, 10);
  return <Sec title="Semester dates" sub="When students move in and out. Students book one semester at a time, and only semesters you open take bookings." dirty={dirty} busy={busy} onSave={go} onReset={() => { setList(start); setErr(null); }}>
    {!h.sems?.length && <div className="banner primary small"><Info size={16} className="ic" /><span className="grow">{uniSems(h.uni) ? `These are ${uni?.short ?? 'the university'}'s dates, set by Nestly.` : 'These are sample dates. Your university has not set its calendar yet.'} Change them if your move-in days are different, then save.</span>
      <Btn size="sm" kind="secondary" onClick={() => save({ sems: list }, false)}>Use these dates</Btn></div>}
    <div className="sem-list">{list.map((s, i) => { const n = semBookings(h.id, s); const past = s.end < today;
      return <div key={i} className={'sem-card' + (s.open && !past ? ' open' : '') + (past ? ' past' : '')}>
        <div className="sem-top"><b className="ink">{s.start && s.end && s.end > s.start ? semName(s) : 'New semester'}</b>
          {past ? <Pill tone="neutral">Ended</Pill> : s.open ? <Pill tone="success">Taking bookings</Pill> : <Pill tone="neutral">Closed</Pill>}
          <span className="grow" />{n > 0 && <span className="tiny muted">{n} booked</span>}
          <button type="button" className="icon-btn" disabled={n > 0} onClick={() => setList(list.filter((_, j) => j !== i))} aria-label="Remove semester" title={n > 0 ? 'Students have booked this semester' : 'Remove'}><Trash2 size={16} /></button></div>
        <div className="sem-dates">
          <Field id={`sm-a${i}`} label="Move-in"><TextInput id={`sm-a${i}`} type="date" value={s.start} onChange={e => upd(i, { start: e.target.value })} /></Field>
          <Field id={`sm-b${i}`} label="Move-out"><TextInput id={`sm-b${i}`} type="date" value={s.end} min={s.start || undefined} onChange={e => upd(i, { end: e.target.value })} /></Field>
        </div>
        <label className="check small"><input type="checkbox" checked={s.open} disabled={past} onChange={e => upd(i, { open: e.target.checked })} /><span>Students can book this semester{s.start && s.end > s.start ? ` (${semDates(s)})` : ''}</span></label>
      </div>; })}</div>
    {list.length < 4 && <Btn kind="secondary" size="sm" onClick={add} style={{ alignSelf: 'flex-start' }}><Plus size={15} />Add semester</Btn>}
    {err && <span className="err" role="alert">{err}</span>}
    <p className="tiny muted">If more than one semester is open, students book the earliest one first. Dates you set here show on your listing and on each booking.</p>
    {dialog}
  </Sec>;
}

function Amenities({ h }: Ctx) {
  const init = { amen: h.amen, rules: h.rules ?? [] };
  const [f, setF] = useState(init); const [rule, setRule] = useState('');
  const { save, busy, dialog } = useSave(h);
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
  const addRule = () => { const r = rule.trim(); if (r && !f.rules.includes(r)) setF({ ...f, rules: [...f.rules, r] }); setRule(''); };
  return <Sec title="Amenities and rules" sub="What the hostel has, and what tenants must follow." dirty={dirty} busy={busy} onSave={() => save({ amen: f.amen, rules: f.rules }, false)} onReset={() => setF(init)}>
    <div className="field"><span className="label">Amenities</span>
      <div className="chips">{Object.entries(AMENITIES).map(([k, l]) => { const on = f.amen.includes(k); return <button type="button" key={k} className={'chip' + (on ? ' on' : '')} aria-pressed={on}
        onClick={() => setF({ ...f, amen: on ? f.amen.filter(x => x !== k) : [...f.amen, k] })}>{on && <Check size={14} />}{l}</button>; })}</div></div>
    <div className="field"><span className="label">House rules</span>
      <ul className="rules-list">{f.rules.map(r => <li key={r}><span className="grow">{r}</span><button type="button" className="icon-btn" onClick={() => setF({ ...f, rules: f.rules.filter(x => x !== r) })} aria-label={`Remove rule: ${r}`}><X size={15} /></button></li>)}</ul>
      <div className="row" style={{ gap: 8 }}><input className="input" value={rule} onChange={e => setRule(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRule(); } }} placeholder="For example: no cooking in the rooms" maxLength={80} />
        <Btn kind="secondary" onClick={addRule} disabled={!rule.trim()}><Plus size={15} />Add</Btn></div></div>
    {dialog}
  </Sec>;
}

function Proof({ h, docs }: Ctx) {
  const { me } = useOwner();
  const [kind, setKind] = useState<'title' | 'licence' | 'lc1'>('title');
  const LABEL = { title: 'Land title', licence: 'Trading licence', lc1: 'Letter from the LC1 chairperson' };
  return <Sec title="Proof of ownership" sub="Shows the hostel is yours to rent out. Only the Nestly team sees this." noSave>
    <Segmented full label="Document type" value={kind} onChange={setKind} options={[{ value: 'title', label: 'Land title' }, { value: 'licence', label: 'Trading licence' }, { value: 'lc1', label: 'LC1 letter' }]} />
    <DocUpload label={LABEL[kind]} hint="A clear photo or scan of the whole page. The owner’s name must be readable." doc={docs.find(d => d.kind === (kind === 'licence' ? 'trading_licence' : 'ownership'))}
      onFile={async (n, u) => { await uploadDoc(me.id, kind === 'licence' ? 'trading_licence' : 'ownership', `${LABEL[kind]}: ${n}`, u, h.id); }} />
    {docs.length > 0 && <p className="small muted row-sm"><FileCheck2 size={15} color="var(--success)" />{docs.length} {docs.length === 1 ? 'document' : 'documents'} uploaded for this hostel.</p>}
  </Sec>;
}
