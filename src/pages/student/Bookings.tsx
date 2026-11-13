import { CalendarDays, Compass, Copy, Receipt, Repeat, Star, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Overlay } from '../../components/Overlay';
import { PageHeader } from '../../components/PageHeader';
import { Pill, type Tone } from '../../components/Pill';
import { Segmented } from '../../components/Segmented';
import { EmptyState, ErrorState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { Art, Btn, Skeleton } from '../../components/ui';
import type { Booking, BookingStatus, Hostel } from '../../data/types';
import { copyText, ugx } from '../../lib/format';
import { cancelBooking, hasBookingFor, listBookings, NEXT_SEM, rateBooking } from '../../services/api';
import { useMe } from '../../services/session';
import { useData } from '../../services/useData';
import { BookingFlow } from './BookingFlow';

type B = Booking & { hostel: Hostel };
const LABEL: Record<BookingStatus, [string, Tone]> = { paid: ['Paid', 'primary'], 'checked-in': ['Checked in', 'success'], completed: ['Completed', 'neutral'], rated: ['Rated', 'neutral'], cancelled: ['Cancelled', 'danger'] };
const ORDER: BookingStatus[] = ['paid', 'checked-in', 'completed', 'rated'];

function Tracker({ status }: { status: BookingStatus }) {
  const at = ORDER.indexOf(status);
  return <div className="tracker" aria-label={`Progress: ${LABEL[status][0]}`}>{['Paid', 'Checked in', 'Completed', 'Rated'].map((l, i) => <div key={l} className={'t' + (i <= at ? ' on' : '')}><i />{l}</div>)}</div>;
}

export function Bookings() {
  const me = useMe(); const toast = useToast();
  const { data, loading, error, reload } = useData(() => listBookings(me.id), [me.id]);
  const [tab, setTab] = useState<'up' | 'past'>('up');
  const [rate, setRate] = useState<B | null>(null); const [cancel, setCancel] = useState<B | null>(null);
  const [rebook, setRebook] = useState<B | null>(null); const [receipt, setReceipt] = useState<B | null>(null);
  const [dismissed, setDismissed] = useState(false);
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading && !data) return <><PageHeader title="Bookings" /><Skeleton rows={2} h={200} /></>;
  const list = data ?? [];
  const current = list.find(b => b.status === 'checked-in');
  const up = list.filter(b => b.status === 'paid' || b.status === 'checked-in');
  const past = list.filter(b => !['paid', 'checked-in'].includes(b.status));
  const shown = tab === 'up' ? up : past;
  const showRebook = current && !dismissed && !hasBookingFor(me.id, NEXT_SEM);

  const card = (b: B) => <article key={b.id} className="card card-pad stack">
    <div className="row start">
      <Link to={`/s/explore/${b.hostelId}`} style={{ width: 72, height: 72, borderRadius: 14, overflow: 'hidden', flex: 'none' }} aria-label={b.hostel.name}><Art hostel={b.hostel} /></Link>
      <div className="grow stack-sm" style={{ gap: 2 }}>
        <div className="row between start"><h3 className="clamp1">{b.hostel.name}</h3><Pill tone={LABEL[b.status][1]}>{LABEL[b.status][0]}</Pill></div>
        <span className="small">{b.room}{b.roomNo ? ` · Room ${b.roomNo}` : ''}</span><span className="small muted">{b.sem}</span></div></div>
    {b.status === 'cancelled' ? <div className="banner primary small">{b.hostel.name} sends your {ugx(b.fee)} back to your mobile money. If it has not arrived in 3 days, report it on the hostel page.</div> : <Tracker status={b.status} />}
    <div className="divider" />
    <div className="row wrap" style={{ gap: 8 }}>
      <Btn kind="secondary" size="sm" onClick={() => setReceipt(b)}><Receipt size={15} />Receipt</Btn>
      {b.status === 'completed' && <Btn size="sm" onClick={() => setRate(b)}><Star size={15} />Rate your stay</Btn>}
      {b.status === 'paid' && <Btn kind="danger" size="sm" onClick={() => setCancel(b)}><XCircle size={15} />Cancel</Btn>}
      {b.status === 'paid' && b.cancelUntil && <span className="hint">Free to cancel until {b.cancelUntil}</span>}
    </div>
  </article>;

  return <>
    <PageHeader title="Bookings" />
    {showRebook && <div className="hero-card stack"><div className="row start"><span className="icon-tile" style={{ background: 'rgba(255,255,255,.2)', color: '#fff' }}><Repeat size={20} /></span>
      <div className="grow"><h2>Staying at {current.hostel.name} next semester?</h2><p className="sub small" style={{ marginTop: 4 }}>Keep a room for {NEXT_SEM} before it opens to other students.</p></div></div>
      <div className="row wrap" style={{ gap: 8 }}><Btn kind="light" onClick={() => setRebook(current)}>Yes, book again</Btn>
        <button className="btn" style={{ color: '#fff', background: 'rgba(255,255,255,.14)' }} onClick={() => { setDismissed(true); toast('Okay. Your room will open to other students.'); }}>No, I am moving</button></div></div>}
    <Segmented label="Bookings" value={tab} onChange={setTab} options={[{ value: 'up', label: 'Upcoming', count: up.length }, { value: 'past', label: 'Past', count: past.length }]} />
    {!shown.length ? <EmptyState icon={<CalendarDays size={24} />} title={tab === 'up' ? 'Nothing booked yet' : 'No past stays'} text={tab === 'up' ? 'When you book a room it shows up here with its receipt.' : 'Your finished and cancelled bookings show up here.'}
      action={tab === 'up' ? <Link to="/s/explore" className="btn btn-primary"><Compass size={18} />Find a room</Link> : undefined} />
      : <div className="cards-2">{shown.map(card)}</div>}
    {rate && <RateSheet b={rate} onClose={() => setRate(null)} />}
    {cancel && <Overlay title="Cancel this booking?" onClose={() => setCancel(null)} width={440}
      footer={<><Btn kind="secondary" className="grow" onClick={() => setCancel(null)}>Keep booking</Btn><Btn kind="danger" className="grow" onClick={async () => { await cancelBooking(cancel.id); setCancel(null); toast('Booking cancelled. The owner sends your fee back.'); }}>Cancel booking</Btn></>}>
      <p>Your room at <b className="ink">{cancel.hostel.name}</b> will be released. The owner sends your <b className="ink">{ugx(cancel.fee)}</b> back to your mobile money within 3 days. Nestly does not hold your money.</p></Overlay>}
    {receipt && <ReceiptSheet b={receipt} onClose={() => setReceipt(null)} />}
    {rebook && <RebookFlow b={rebook} onClose={() => setRebook(null)} />}
  </>;
}

function ReceiptSheet({ b, onClose }: { b: B; onClose: () => void }) {
  const toast = useToast();
  return <Overlay title="Receipt" onClose={onClose} width={440}><div className="receipt">
    <div className="tiny muted" style={{ textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>Reference</div>
    <div className="row between"><span className="ref num" style={{ userSelect: 'all' }}>{b.id}</span><Btn kind="secondary" size="sm" onClick={async () => toast((await copyText(b.id)) ? 'Reference copied' : 'Could not copy. Select the text instead.')}><Copy size={14} />Copy</Btn></div>
    <hr />
    <div className="sum"><span className="muted">Hostel</span><span>{b.hostel.name}</span></div>
    <div className="sum"><span className="muted">Room</span><span>{b.room}</span></div>
    <div className="sum"><span className="muted">Semester</span><span>{b.sem}</span></div>
    <div className="sum"><span className="muted">Paid on</span><span>{b.paidOn}</span></div>
    <div className="sum total"><span>Booking fee</span><span className="num">{ugx(b.fee)}</span></div>
  </div></Overlay>;
}

function RebookFlow({ b, onClose }: { b: B; onClose: () => void }) {
  const [room, setRoom] = useState(Math.max(0, b.hostel.rooms.findIndex(r => r.t === b.room)));
  return <BookingFlow h={b.hostel} room={room} onRoom={setRoom} onClose={onClose} />;
}

function RateSheet({ b, onClose }: { b: B; onClose: () => void }) {
  const me = useMe(); const toast = useToast();
  const [n, setN] = useState(0); const [text, setText] = useState(''); const [busy, setBusy] = useState(false);
  const words = ['Tap a star', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];
  const [first, last] = me.name.split(' ');
  return <Overlay title="Rate your stay" onClose={onClose} width={460}
    footer={<Btn block disabled={!n} loading={busy} onClick={async () => { setBusy(true); await rateBooking(b.id, n, text.trim(), `${first} ${last?.[0] ?? ''}.`); toast('Rating posted. Thank you.'); onClose(); }}>Post rating</Btn>}>
    <div className="stack"><p className="muted" style={{ textAlign: 'center' }}>{b.hostel.name} · {b.sem}</p>
      <div className="row" style={{ justifyContent: 'center', gap: 6 }} role="radiogroup" aria-label="Stars">{[1, 2, 3, 4, 5].map(i => <button key={i} role="radio" aria-checked={n === i} onClick={() => setN(i)} aria-label={`${i} stars`} className="icon-btn" style={{ width: 48, height: 48 }}>
        <Star size={34} style={{ color: i <= n ? 'var(--star)' : 'var(--bar-muted)', fill: i <= n ? 'var(--star)' : 'transparent' }} /></button>)}</div>
      <p style={{ textAlign: 'center' }} className="strong">{words[n]}</p>
      <div className="field"><label htmlFor="rate-text">What should other students know?</label><textarea id="rate-text" className="input" value={text} onChange={e => setText(e.target.value)} placeholder="Water, security, noise, how fast things get fixed" /></div>
      <p className="hint">You can rate each stay once. The owner can reply but cannot remove it.</p></div></Overlay>;
}
