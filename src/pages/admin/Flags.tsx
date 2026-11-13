import { Building2, CheckCircle2, Flag, MessageSquareText, Phone, ShieldAlert, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Dropdown } from '../../components/Dropdown';
import { Overlay } from '../../components/Overlay';
import { PageHeader } from '../../components/PageHeader';
import { Pill } from '../../components/Pill';
import { SearchIcon } from '../../components/SearchIcon';
import { Segmented } from '../../components/Segmented';
import { EmptyState, ErrorState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { Btn, Skeleton, Stars } from '../../components/ui';
import type { FlagKind, FlagOutcome } from '../../data/types';
import { timeAgo, ugx } from '../../lib/format';
import { useIsPhone } from '../../lib/useIsPhone';
import { listFlags, OUTCOME_LABEL, resolveFlag, ROLE_LABEL } from '../../services/api';
import { useData } from '../../services/useData';
import { shortDate } from '../owner/shared';

type Item = Awaited<ReturnType<typeof listFlags>>[number];
type Kind = 'all' | FlagKind;
const KIND: Record<FlagKind, { label: string; icon: typeof Flag }> = { listing: { label: 'Listing', icon: Building2 }, review: { label: 'Review', icon: MessageSquareText }, payment: { label: 'Payment', icon: Wallet } };
/** Safety and money problems are looked at first. */
const urgent = (f: Item) => f.kind === 'payment' || /unsafe/i.test(f.reason);

export function AdminFlags() {
  const phone = useIsPhone();
  const { data, loading, error, reload } = useData(() => listFlags(), []);
  const [tab, setTab] = useState<'open' | 'resolved'>('open'); const [kind, setKind] = useState<Kind>('all');
  const [q, setQ] = useState(''); const [searching, setSearching] = useState(false);
  const [res, setRes] = useState<Item | null>(null);
  const all = data ?? [];
  const list = useMemo(() => all.filter(f => f.status === tab && (kind === 'all' || f.kind === kind)
    && `${f.hostel?.name ?? ''} ${f.reason} ${f.text} ${f.by?.name ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => tab === 'open' ? Number(urgent(b)) - Number(urgent(a)) || b.at.localeCompare(a.at) : (b.resolvedAt ?? b.at).localeCompare(a.resolvedAt ?? a.at)), [all, tab, kind, q]);
  const n = (k: Kind) => all.filter(f => f.status === tab && (k === 'all' || f.kind === k)).length;

  const body = error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <Skeleton rows={2} h={140} />
    : !list.length ? <EmptyState bare icon={tab === 'open' ? <CheckCircle2 size={24} /> : <Flag size={24} />} title={q ? 'No report matches' : tab === 'open' ? 'No open reports' : 'Nothing closed yet'}
        text={q ? 'Try another search.' : 'Students report listings, reviews and payment problems. Owners can report reviews.'} />
    : <div className="fl-list">{list.map(f => <FlagCard key={f.id} f={f} onResolve={() => setRes(f)} />)}</div>;

  const tabs = <Segmented label="Reports" value={tab} onChange={setTab} options={[{ value: 'open', label: 'Open', count: all.filter(f => f.status === 'open').length }, { value: 'resolved', label: 'Closed', count: all.filter(f => f.status === 'resolved').length }]} />;
  const kinds = <Dropdown label="Type" value={kind} onChange={setKind} align="right" options={[{ value: 'all', label: `All types (${n('all')})` }, ...(['listing', 'review', 'payment'] as FlagKind[]).map(k => ({ value: k, label: `${KIND[k].label}s (${n(k)})` }))]} />;
  const head = <div className={'vhead' + (searching ? ' searching' : '')}>{tabs}<span className="grow" /><SearchIcon value={q} onChange={setQ} open={searching} setOpen={setSearching} placeholder="Hostel, reason or person" /></div>;
  return <>
    <PageHeader title="Flags" search={false} actions={kinds} />
    {phone ? <>{head}{body}</> : <section className="card card-pad fill-card fill grow-y vcard-main">{head}<div className="card-body scroll-y">{body}</div></section>}
    {res && <ResolveDialog f={res} onClose={() => setRes(null)} />}
  </>;
}

function FlagCard({ f, onResolve }: { f: Item; onResolve: () => void }) {
  const K = KIND[f.kind]; const hot = f.status === 'open' && urgent(f);
  return <article className={'fl' + (hot ? ' hot' : '') + (f.status === 'resolved' ? ' done' : '')}>
    <div className="fl-top">
      <span className={'icon-tile sm ' + (hot ? 'danger' : 'primary')}><K.icon size={16} /></span>
      <div className="min0 grow"><span className="row-sm wrap"><b className="ink">{f.reason}</b><span className="tiny muted">{K.label}</span></span>
        <Link to={`/a/hostels?h=${f.hostelId}`} className="small clamp1">{f.hostel?.name ?? 'Hostel'}</Link></div>
      <span className="tiny muted nowrap">{timeAgo(f.at)}</span>
    </div>
    {f.kind === 'review' && f.review && <div className="fl-quote">
      <span className="row-sm"><Stars n={f.review.stars} size={13} /><b className="small ink">{f.review.who}</b><span className="tiny muted">{f.review.when}</span>{f.review.hidden && <Pill tone="neutral">Hidden</Pill>}</span>
      <p className="small">“{f.review.text}”</p>
      {f.review.reply && <p className="small fl-reply"><b>Owner replied:</b> {f.review.reply}</p>}
    </div>}
    {f.kind === 'payment' && f.booking && <div className="fl-facts">
      <span><span className="tiny muted">Booking</span><b className="num small">{f.booking.id}</b></span>
      <span><span className="tiny muted">Fee</span><b className="num small">{ugx(f.booking.fee)}</b></span>
      <span><span className="tiny muted">Paid</span><b className="small">{shortDate(f.booking.at ?? f.at)}</b></span>
      <span><span className="tiny muted">Reference</span><b className="num small">{f.booking.payRef ?? 'None'}</b></span>
    </div>}
    <p className="small">{f.kind === 'review' ? <><b>Why reported:</b> {f.text || 'No details given.'}</> : `“${f.text || 'No details given.'}”`}</p>
    <p className="tiny muted">Reported by {f.by?.name ?? 'a student'}{f.by ? `, ${f.by.role === 'student' ? (f.by.emailVerified ? 'verified student' : 'student') : ROLE_LABEL[f.by.role].toLowerCase()}` : ''}
      {f.others > 0 && <> · <Link to={`/a/hostels?h=${f.hostelId}`}>{f.others} other {f.others === 1 ? 'report' : 'reports'} about this hostel</Link></>}</p>
    {f.status === 'resolved' ? <div className="fl-out"><Pill tone={f.outcome === 'dismissed' ? 'neutral' : f.outcome === 'paused' ? 'danger' : 'success'}>{f.outcome ? OUTCOME_LABEL[f.outcome] : 'Closed'}</Pill>
        <span className="small">{f.note}</span>{f.resolvedAt && <span className="tiny muted nowrap">{timeAgo(f.resolvedAt)}</span>}</div>
      : <div className="row fl-acts">
        {f.kind === 'payment' && f.owner?.phone && <a className="btn btn-secondary btn-sm" href={`tel:${f.owner.phone.replace(/\s/g, '')}`}><Phone size={14} />Call owner</a>}
        <span className="grow" /><Btn size="sm" onClick={onResolve}><CheckCircle2 size={15} />Close report</Btn></div>}
  </article>;
}

const CHOICES: Record<FlagKind, { v: FlagOutcome; t: string; d: string; quick: string[] }[]> = {
  listing: [
    { v: 'warned', t: 'Warn the owner', d: 'They get your note. The listing stays up.', quick: ['Spoke to the owner, price corrected', 'Owner asked to update the photos'] },
    { v: 'paused', t: 'Pause the hostel', d: 'It leaves Explore now. Bookings already made stay valid.', quick: ['Unsafe for students until fixed', 'Fake listing'] },
    { v: 'dismissed', t: 'No action needed', d: 'You checked and the listing is accurate.', quick: ['Checked, the listing is accurate'] },
  ],
  review: [
    { v: 'hidden', t: 'Hide the review', d: 'Students stop seeing it. The owner\'s reply is hidden with it.', quick: ['Abusive language', 'No booking from this person'] },
    { v: 'warned', t: 'Warn the owner', d: 'For a rude or untrue owner reply.', quick: ['Keep replies polite and factual'] },
    { v: 'dismissed', t: 'Keep it up', d: 'Honest reviews stay, even bad ones.', quick: ['Honest review, stays up'] },
  ],
  payment: [
    { v: 'confirmed', t: 'Owner confirmed the payment', d: 'Nestly cannot refund. Use this once the owner accepts the money arrived.', quick: ['Owner found the payment, student is booked'] },
    { v: 'warned', t: 'Warn the owner', d: 'They get your note. Use when money arrived but staff asked for more.', quick: ['Custodian must not ask for extra money'] },
    { v: 'paused', t: 'Pause the hostel', d: 'For an owner who will not sort it out, or a pattern of reports.', quick: ['Owner did not respond in 3 days'] },
    { v: 'dismissed', t: 'No action needed', d: 'The payment never went through, so the student was not charged.', quick: ['Payment failed, student was not charged'] },
  ],
};

function ResolveDialog({ f, onClose }: { f: Item; onClose: () => void }) {
  const toast = useToast(); const opts = CHOICES[f.kind];
  const [o, setO] = useState<FlagOutcome>(opts[0]!.v); const [note, setNote] = useState(''); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const pick = opts.find(x => x.v === o)!;
  const go = async () => {
    if (!note.trim()) return setErr('Write a short note. It goes in the activity log and to the owner if you warn them.');
    setBusy(true);
    try { await resolveFlag(f.id, o, note); toast(`Report closed: ${OUTCOME_LABEL[o].toLowerCase()}`); onClose(); } catch (x) { setErr((x as Error).message); setBusy(false); }
  };
  return <Overlay title="Close this report" onClose={onClose} width={500} footer={<><Btn kind="secondary" onClick={onClose}>Cancel</Btn><Btn kind={o === 'paused' ? 'danger' : 'primary'} loading={busy} onClick={go}>{o === 'paused' ? 'Pause and close' : o === 'hidden' ? 'Hide and close' : 'Close report'}</Btn></>}>
    <div className="stack">
      <p className="small muted row-sm"><ShieldAlert size={15} />{f.reason} at {f.hostel?.name}. The person who reported it is told the result.</p>
      <div className="opt-cards" role="radiogroup" aria-label="What did you do">{opts.map(x => <button key={x.v} role="radio" aria-checked={o === x.v} className={'opt-card' + (o === x.v ? ' on' : '')} onClick={() => { setO(x.v); setNote(''); setErr(null); }}>
        <span className="opt-dot" /><span className="min0"><b className="ink">{x.t}</b><span className="tiny muted">{x.d}</span></span></button>)}</div>
      <div className="chips">{pick.quick.map(qq => <button key={qq} className={'chip' + (note === qq ? ' on' : '')} onClick={() => { setNote(qq); setErr(null); }}>{qq}</button>)}</div>
      <div className="field"><textarea className={'input' + (err ? ' bad' : '')} rows={3} value={note} onChange={e => { setNote(e.target.value); setErr(null); }} placeholder="What did you find, and what did you do?" maxLength={240} aria-label="Note" />{err && <span className="err">{err}</span>}</div>
    </div></Overlay>;
}
