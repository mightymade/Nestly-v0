import { ChevronLeft, AlertTriangle, CheckCircle2, Check, ClipboardCheck, FileText, MapPin, MessageSquareWarning, ShieldCheck, X, ZoomIn } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CampusMap } from '../../components/CampusMap';
import { Overlay } from '../../components/Overlay';
import { PageHeader } from '../../components/PageHeader';
import { Pill } from '../../components/Pill';
import { Segmented } from '../../components/Segmented';
import { EmptyState, ErrorState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { Art, Avatar, Btn, Skeleton } from '../../components/ui';
import { AMENITIES } from '../../data/catalog';
import type { VerificationDoc } from '../../data/types';
import { timeAgo, ugx } from '../../lib/format';
import { useIsPhone } from '../../lib/useIsPhone';
import { ApiError, approveListing, approveOwner, bookingSem, hostelSems, listReviewQueue, minPrice, rejectOwner, requestChanges, semDates, semName, uniSems, universityById } from '../../services/api';
import { useData } from '../../services/useData';
import { maskTo } from '../owner/shared';

type Q = Awaited<ReturnType<typeof listReviewQueue>>;
type OwnerItem = Q['owners'][number]; type ListingItem = Q['listings'][number];
const DOC_NAME: Record<VerificationDoc['kind'], string> = { national_id: 'National ID', selfie: 'Selfie', ownership: 'Proof of ownership', trading_licence: 'Trading licence' };
export const waited = (iso: string) => { const m = Math.max(1, Math.round((Date.now() - +new Date(iso)) / 60000)); return m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} ${Math.round(m / 1440) === 1 ? 'day' : 'days'}`; };

export function AdminReviews() {
  const phone = useIsPhone(); const [params, setParams] = useSearchParams();
  const { data, loading, error, reload } = useData(() => listReviewQueue(), []);
  const tab = (params.get('tab') as 'owners' | 'listings') ?? 'owners';
  const [sel, setSel] = useState<string | null>(null);
  const setTab = (t: string) => { setSel(null); setParams({ tab: t }, { replace: true }); };
  const owners = data?.owners ?? [], listings = data?.listings ?? [];
  const items = tab === 'owners' ? owners.map(o => ({ id: o.user.id, title: o.user.name, sub: `${o.user.phone ?? ''} · ${o.hostels.length} ${o.hostels.length === 1 ? 'hostel' : 'hostels'} drafted`, since: o.since, avatar: o.user.name }))
    : listings.map(l => ({ id: l.hostel.id, title: l.hostel.name, sub: `${l.owner?.name ?? ''} · ${universityById(l.hostel.uni)?.short}`, since: l.since, avatar: l.hostel.name }));
  const current = sel ?? (phone ? null : items[0]?.id ?? null);
  const o = owners.find(x => x.user.id === current); const l = listings.find(x => x.hostel.id === current);
  const tabs = <Segmented label="Review type" value={tab} onChange={setTab} options={[{ value: 'owners', label: 'Owners', count: owners.length }, { value: 'listings', label: 'Listings', count: listings.length }]} />;
  const queue = error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <Skeleton rows={3} h={64} />
    : !items.length ? <EmptyState bare icon={<ClipboardCheck size={24} />} title="Nothing to review" text={tab === 'owners' ? 'New owners show up here when they send their ID.' : 'Listings show up here when an owner submits them.'} />
    : <div className="rv-q">{items.map(i => <button key={i.id} className={'rv-item' + (current === i.id ? ' on' : '')} onClick={() => setSel(i.id)}>
        <Avatar user={{ name: i.avatar }} size={38} /><span className="min0 grow"><b className="ink clamp1">{i.title}</b><span className="tiny muted clamp1">{i.sub}</span></span>
        <span className="tiny warn-t strong nowrap">{waited(i.since)}</span></button>)}</div>;
  const review = o ? <OwnerReview key={o.user.id} o={o} onDone={() => setSel(null)} /> : l ? <ListingReview key={l.hostel.id} l={l} onDone={() => setSel(null)} /> : null;

  if (phone) {
    if (review) return <><button className="rv-back" onClick={() => setSel(null)}><ChevronLeft size={18} />Back to the queue</button>{review}</>;
    return <><PageHeader title="Reviews" />{tabs}{queue}</>;
  }
  return <>
    <PageHeader title="Reviews" />
    <div className="rv-split fill">
      <section className="card card-pad fill-card" aria-label="Queue"><div style={{ marginBottom: 12 }}>{tabs}</div><div className="card-body scroll-y">{queue}</div></section>
      <section className="card card-pad scroll-y rv-main" aria-label="Review">{review ?? <EmptyState bare icon={<ClipboardCheck size={24} />} title="Choose something to review" text="Items are listed oldest first." />}</section>
    </div>
  </>;
}

function DocView({ d }: { d: VerificationDoc }) {
  const [zoom, setZoom] = useState(false);
  return <figure className="rv-doc">
    <button onClick={() => d.url && setZoom(true)} aria-label={`Open ${DOC_NAME[d.kind]} larger`} disabled={!d.url}>{d.url ? <><img src={d.url} alt={DOC_NAME[d.kind]} /><span className="zoom"><ZoomIn size={15} /></span></> : <span className="pdf"><FileText size={28} />PDF file</span>}</button>
    <figcaption><b className="small ink">{DOC_NAME[d.kind]}</b><span className="tiny muted clamp1">{d.fileName}</span></figcaption>
    {zoom && <Overlay title={DOC_NAME[d.kind]} onClose={() => setZoom(false)} width={820}><img src={d.url} alt={DOC_NAME[d.kind]} style={{ width: '100%', borderRadius: 12 }} /></Overlay>}
  </figure>;
}

/** A short list of what to check, each marked fine or worth a second look. */
function Checks({ items }: { items: { ok: boolean; text: string }[] }) {
  const bad = items.filter(i => !i.ok).length;
  return <div className="rv-checks" aria-label="Checks">
    <span className={'tiny strong ' + (bad ? 'warn-t' : 'ok-t')}>{bad ? `${bad} ${bad === 1 ? 'thing needs' : 'things need'} a closer look` : 'Everything we can check looks fine'}</span>
    <ul>{items.map(i => <li key={i.text} className={i.ok ? 'ok' : 'bad'}>{i.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}<span>{i.text}</span></li>)}</ul></div>;
}
const sameName = (a?: string, b?: string) => !!a && !!b && a.trim().toLowerCase().replace(/\s+/g, ' ') === b.trim().toLowerCase().replace(/\s+/g, ' ');

const REASONS = ['ID photo is blurry', 'Name does not match ID', 'Selfie does not match ID photo', 'Payment account is in another name'];
function OwnerReview({ o, onDone }: { o: OwnerItem; onDone: () => void }) {
  const toast = useToast(); const [rej, setRej] = useState(false); const [busy, setBusy] = useState(false);
  const u = o.user;
  const approve = async () => { setBusy(true); await approveOwner(u.id); toast(`${u.name} approved. They can now publish and receive bookings.`); setBusy(false); onDone(); };
  return <div className="rv-body">
    <div className="row between start wrap" style={{ gap: 12 }}><div className="row-sm"><Avatar user={u} size={48} /><div><h2 style={{ fontSize: 20 }}>{u.name}</h2><p className="small muted">{u.email}</p></div></div>
      <div className="row rv-acts" style={{ gap: 8 }}><Btn kind="secondary" onClick={() => setRej(true)}><X size={16} />Reject</Btn><Btn loading={busy} onClick={approve}><Check size={16} />Approve</Btn></div></div>
    <Checks items={[
      { ok: !!u.payout && sameName(u.payout.name, u.name), text: !u.payout ? 'No payment account given' : sameName(u.payout.name, u.name) ? 'Payment account is in their own name' : `Payment account is in another name: ${u.payout.name}` },
      { ok: o.docs.some(d => d.kind === 'national_id'), text: o.docs.some(d => d.kind === 'national_id') ? 'National ID uploaded' : 'No National ID uploaded' },
      { ok: o.docs.some(d => d.kind === 'selfie'), text: o.docs.some(d => d.kind === 'selfie') ? 'Selfie uploaded, compare it with the ID photo' : 'No selfie uploaded' },
    ]} />
    <div className="rv-facts">
      <div><span className="tiny muted">Phone</span><b className="small ink">{u.phone} <Pill tone="success">Confirmed</Pill></b></div>
      <div><span className="tiny muted">Students pay into</span><b className="small ink">{u.payout ? `${maskTo(u.payout.method, u.payout.to)}, ${u.payout.name}` : 'Not given'}</b>{u.payout && u.payout.name.trim().toLowerCase() !== u.name.trim().toLowerCase() && <span className="tiny warn-t strong">Different name from the account</span>}</div>
      <div><span className="tiny muted">Sent</span><b className="small ink">{timeAgo(o.since)}</b></div>
    </div>
    <h3 className="rv-h">ID and selfie</h3>
    <div className="rv-docs">{o.docs.length ? o.docs.map(d => <DocView key={d.id} d={d} />) : <p className="muted small">No documents uploaded.</p>}</div>
    <p className="tiny muted row-sm"><ShieldCheck size={13} />Check that the name matches the account and the selfie matches the ID photo.</p>
    {o.hostels.length > 0 && <><h3 className="rv-h">Hostels they have started</h3><div className="stack-sm">{o.hostels.map(h => <div key={h.id} className="staff-row"><span className="vroom">{h.status === 'in_review' ? 'In review' : h.status}</span><b className="ink small grow clamp1">{h.name || 'Untitled'}</b></div>)}</div></>}
    {rej && <ReasonDialog title={`Reject ${u.name.split(' ')[0]}?`} intro="The owner sees this reason and can fix it and send again." quick={REASONS} cta="Reject"
      onClose={() => setRej(false)} onSend={async r => { await rejectOwner(u.id, r); toast(`${u.name} was told what to fix`); onDone(); }} />}
  </div>;
}

function ListingReview({ l, onDone }: { l: ListingItem; onDone: () => void }) {
  const toast = useToast(); const [ch, setCh] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const h = l.hostel; const uni = universityById(h.uni)!;
  const sems = hostelSems(h); const open = bookingSem(h); const owner = l.owner;
  const odd = h.rooms.filter(r => r.price < 100_000 || r.price > 10_000_000);
  const shortSem = sems.find(x => +new Date(x.end) - +new Date(x.start) < 8 * 7 * 86400000);
  const checks = [
    { ok: (h.photos?.length ?? 0) >= 3, text: `${h.photos?.length ?? 0} ${(h.photos?.length ?? 0) === 1 ? 'photo' : 'photos'}${(h.photos?.length ?? 0) < 3 ? ', at least 3 are needed' : ''}` },
    { ok: !!h.location, text: h.location ? `Pinned ${h.km} km from ${uni.short}` : 'No pin on the map' },
    { ok: !odd.length && h.rooms.length > 0, text: !h.rooms.length ? 'No room types or prices' : odd.length ? `${odd[0]!.t} at ${ugx(odd[0]!.price)} looks wrong` : 'Prices look normal for a semester' },
    { ok: h.fee >= 5000 && h.fee <= Math.max(5000, minPrice(h) / 2), text: `Booking fee ${ugx(h.fee)}${h.fee < 5000 ? ' looks too low' : h.fee > minPrice(h) / 2 ? ' is high next to the rent' : ''}` },
    { ok: !!open && !shortSem, text: !open ? 'No semester open for booking' : shortSem ? `${semName(shortSem)} is shorter than 8 weeks` : `Taking bookings for ${semName(open)}${h.sems?.length ? '' : uniSems(h.uni) ? ', university dates' : ', sample dates'}` },
    { ok: !!owner?.payout && sameName(owner.payout.name, owner.name), text: !owner?.payout ? 'Owner has no payment account' : sameName(owner.payout.name, owner.name) ? `Students pay ${owner.name} directly` : `Students would pay ${owner.payout.name}, not ${owner.name}` },
    { ok: l.docs.length > 0, text: l.docs.length ? 'Proof of ownership uploaded' : 'No proof of ownership' },
  ];
  const approve = async () => { setBusy(true); setErr(null); try { await approveListing(h.id); toast(`${h.name} is live on Explore`); onDone(); } catch (x) { setErr((x as ApiError).message); } finally { setBusy(false); } };
  return <div className="rv-body">
    <div className="row between start wrap" style={{ gap: 12 }}><div><h2 style={{ fontSize: 20 }}>{h.name}</h2><p className="small muted">{h.area} · by {l.owner?.name} {l.owner?.ownerStatus !== 'approved' && <Pill tone="warn">Owner not approved yet</Pill>}</p></div>
      <div className="row rv-acts" style={{ gap: 8 }}><Btn kind="secondary" onClick={() => setCh(true)}><MessageSquareWarning size={16} />Request changes</Btn><Btn loading={busy} onClick={approve}><Check size={16} />Approve and publish</Btn></div></div>
    {err && <div className="banner warn"><span>{err}</span></div>}
    <Checks items={checks} />
    <h3 className="rv-h">What students will see</h3>
    <div className="rv-preview">
      <div className="rv-photo">{h.photos?.length ? <img src={h.photos[0]} alt="" /> : <Art hostel={h} />}{(h.photos?.length ?? 0) > 1 && <span className="hp-count">{h.photos!.length} photos</span>}</div>
      <div className="stack-sm min0">
        <div className="row-sm"><MapPin size={14} color="var(--primary)" /><span className="small">{h.km} km from {uni.short}</span></div>
        <p className="price">From {ugx(minPrice(h))}<span> / sem</span></p>
        <p className="small">{h.about}</p>
        <div className="review-list">{h.rooms.map(r => <div key={r.t} className="review-row"><div className="min0"><b className="small ink">{r.t}</b><span className="tiny muted">{Math.round(r.total / (r.beds ?? 1))} rooms · {r.beds ?? 1} {r.beds === 2 ? 'beds' : 'bed'} each</span></div><span className="num small strong">{ugx(r.price)}</span></div>)}</div>
        <div className="amen-chips">{h.amen.map(a => <span key={a} className="amen-chip">{AMENITIES[a]}</span>)}</div>
        {!!h.rules?.length && <p className="tiny muted">Rules: {h.rules.join(' · ')}</p>}
        <p className="tiny muted">{l.rooms} rooms set up · visiting {h.visit} · booking fee {ugx(h.fee)}</p>
      </div>
    </div>
    <h3 className="rv-h">Semester dates</h3>
    <div className="review-list">{sems.map(x => <div key={x.start} className="review-row"><div className="min0"><b className="small ink">{semName(x)}</b><span className="tiny muted">{semDates(x)}</span></div>
      {x.end < new Date().toISOString().slice(0, 10) ? <Pill tone="neutral">Ended</Pill> : x.open ? <Pill tone="success">Taking bookings</Pill> : <Pill tone="neutral">Closed</Pill>}</div>)}</div>
    <p className="tiny muted">{h.sems?.length ? 'The owner set these dates.' : uniSems(h.uni) ? `${uni.short}'s calendar. The owner has not set their own.` : `Sample dates. ${uni.short} has no calendar yet; add one under Universities.`}</p>
    <h3 className="rv-h">Map pin</h3>
    <div className="rv-map"><CampusMap uni={uni} hostels={[h]} active={null} setActive={() => {}} hover={null} setHover={() => {}} badge={false} /></div>
    <h3 className="rv-h">Proof of ownership</h3>
    <div className="rv-docs">{l.docs.length ? l.docs.map(d => <DocView key={d.id} d={d} />) : <p className="muted small">No document uploaded.</p>}</div>
    {ch && <ChangesDialog pre={checks} onClose={() => setCh(false)} onSend={async (r, secs) => { await requestChanges(h.id, r, secs); toast('Sent to the owner'); onDone(); }} />}
  </div>;
}

export function ReasonDialog({ title, intro, quick, cta, onClose, onSend, placeholder = 'Write a short reason' }: { title: string; intro: string; quick: string[]; cta: string; onClose: () => void; onSend: (r: string) => Promise<void>; placeholder?: string }) {
  const [r, setR] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const go = async () => { if (!r.trim()) return setErr('A reason is needed.'); setBusy(true); try { await onSend(r.trim()); } catch (x) { setErr((x as Error).message); setBusy(false); } };
  return <Overlay title={title} onClose={onClose} width={480} footer={<><Btn kind="secondary" onClick={onClose}>Cancel</Btn><Btn kind="danger" loading={busy} onClick={go}>{cta}</Btn></>}>
    <div className="stack"><p className="muted small">{intro}</p>
      <div className="chips">{quick.map(q => <button key={q} className={'chip' + (r === q ? ' on' : '')} onClick={() => { setR(q); setErr(null); }}>{q}</button>)}</div>
      <div className="field"><textarea className={'input' + (err ? ' bad' : '')} rows={3} value={r} onChange={e => { setR(e.target.value); setErr(null); }} placeholder={placeholder} maxLength={240} aria-label="Reason" />{err && <span className="err">{err}</span>}</div>
    </div></Overlay>;
}

const SECTIONS: [string, string][] = [['photos', 'Photos'], ['location', 'Map pin'], ['types', 'Room types and prices'], ['sems', 'Semester dates'], ['basics', 'Basics and booking fee'], ['proof', 'Proof of ownership'], ['amenities', 'Amenities and rules']];
/** Ask for changes: tick what is wrong so the owner is sent straight to it, then say why. */
function ChangesDialog({ pre, onClose, onSend }: { pre: { ok: boolean; text: string }[]; onClose: () => void; onSend: (note: string, sections: string[]) => Promise<void> }) {
  // The checks are in this order: photos, pin, prices, fee, semesters, payment account, proof.
  const guess = ['photos', 'location', 'types', 'basics', 'sems', '', 'proof'].filter((id, i) => id && pre[i] && !pre[i]!.ok);
  const [secs, setSecs] = useState<string[]>([...guess]); const [note, setNote] = useState(''); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const toggle = (id: string) => { setSecs(x => x.includes(id) ? x.filter(y => y !== id) : [...x, id]); setErr(null); };
  const go = async () => {
    if (!secs.length) return setErr('Tick at least one part to fix.');
    if (!note.trim()) return setErr('Say what is wrong, so the owner knows what to do.');
    setBusy(true); try { await onSend(note.trim(), secs); } catch (x) { setErr((x as Error).message); setBusy(false); }
  };
  return <Overlay title="What should the owner change?" onClose={onClose} width={500} footer={<><Btn kind="secondary" onClick={onClose}>Cancel</Btn><Btn loading={busy} onClick={go}>Send to owner</Btn></>}>
    <div className="stack">
      <p className="muted small">The owner gets a link straight to each part you tick.</p>
      <div className="chips">{SECTIONS.map(([id, label]) => <button key={id} className={'chip' + (secs.includes(id) ? ' on' : '')} aria-pressed={secs.includes(id)} onClick={() => toggle(id)}>{secs.includes(id) && <Check size={14} />}{label}</button>)}</div>
      <div className="field"><textarea className={'input' + (err ? ' bad' : '')} rows={3} value={note} onChange={e => { setNote(e.target.value); setErr(null); }} placeholder="For example: add photos of the bathrooms and the double rooms" maxLength={240} aria-label="What to change" />{err && <span className="err">{err}</span>}</div>
      {pre.some(p => !p.ok) && <div className="chips">{pre.filter(p => !p.ok).map(p => <button key={p.text} className="chip" onClick={() => { setNote(n => (n ? n + ' ' : '') + p.text + '.'); setErr(null); }}>+ {p.text}</button>)}</div>}
    </div></Overlay>;
}
