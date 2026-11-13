import { BadgeCheck, BedDouble, Check, ChevronLeft, Flag, Clock, MapPin, QrCode, ShieldCheck, Star } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { amenIcon } from '../../components/amenityIcons';
import { Card } from '../../components/Card';
import { SaveButton } from '../../components/HostelCard';
import { Pill } from '../../components/Pill';
import { EmptyState, ErrorState } from '../../components/States';
import { Art, Btn, Rating, Skeleton, Stars } from '../../components/ui';
import { AMENITIES } from '../../data/catalog';
import type { Hostel, Review } from '../../data/types';
import { ugx } from '../../lib/format';
import { useIsPhone } from '../../lib/useIsPhone';
import { bookingSem, getHostel, reportListing, semDates, semName, savedIds, universityById } from '../../services/api';
import { Overlay } from '../../components/Overlay';
import { useToast } from '../../components/Toast';
import { useMe, useUser } from '../../services/session';
import { useNeedAccount } from '../../components/AccountGate';
import { useData } from '../../services/useData';
import { BookingFlow, RoomList } from './BookingFlow';

/** Spread of star ratings that matches the hostel's average, for the summary bars. */
function distribution(avg: number, n: number) {
  const w = [1, 2, 3, 4, 5].map(k => Math.exp(-((k - avg) ** 2) / 0.9));
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map(x => Math.round((x / sum) * n)).reverse(); // 5 stars first
}

export function HostelPage() {
  const { id = '' } = useParams(); const me = useUser(); const phone = useIsPhone(); const nav = useNavigate(); const need = useNeedAccount();
  const { data, loading, error, reload } = useData(() => getHostel(id), [id]);
  const [sel, setSel] = useState<number | null>(null);
  const [booking, setBooking] = useState(false); const [flag, setFlag] = useState(false); const [flagRev, setFlagRev] = useState<Review | null>(null);
  const reportReview = (v: Review) => { if (need('report')) setFlagRev(v); };
  if (error && !data) return error === 'Hostel not found'
    ? <EmptyState icon={<MapPin size={24} />} title="Hostel not found" text="It may have been removed by the owner." action={<Link to="/s/explore" className="btn btn-secondary">Back to Explore</Link>} />
    : <ErrorState message={error} onRetry={reload} />;
  if (loading && !data) return phone ? <div className="m-main"><Skeleton rows={4} h={160} /></div> : <><div className="skel" style={{ height: 380 }} /><Skeleton rows={2} h={200} /></>;
  const h = data!.hostel;
  const room = sel ?? Math.max(0, h.rooms.findIndex(r => r.total > r.taken));
  const r = h.rooms[room]!; const sem = bookingSem(h); const bookable = !!sem && r.total > r.taken;
  const saved = me ? savedIds(me.id).includes(h.id) : false;
  const back = () => (window.history.length > 1 ? nav(-1) : nav('/s/explore'));
  const flow = <>{booking && <BookingFlow h={h} room={room} onRoom={setSel} onClose={() => setBooking(false)} />}{flag && <ReportListing hid={h.id} name={h.name} onClose={() => setFlag(false)} />}{flagRev && <ReportListing hid={h.id} name={h.name} review={flagRev} onClose={() => setFlagRev(null)} />}</>;
  const sections = <Sections h={h} reviews={data!.reviews} room={room} onRoom={setSel} onReport={reportReview} />;
  const badges = <div className="row wrap" style={{ gap: 8 }}>{h.verified && <Pill tone="primary"><BadgeCheck size={13} />Verified owner</Pill>}<Pill tone="neutral">Booking fee {ugx(h.fee)}</Pill></div>;

  if (phone) return <>
    <div className="m-hero"><Art hostel={h} />
      <button className="float left" onClick={back} aria-label="Back"><ChevronLeft size={22} /></button>
      <SaveButton userId={me?.id} hostel={h} saved={saved} className="float right" />
    </div>
    <div className="m-sheet-top"><main className="m-main" style={{ paddingBottom: 120 }}>
      <div className="stack-sm"><div className="row between start"><h1 style={{ fontSize: 24, lineHeight: '30px' }}>{h.name}</h1><Rating value={h.rating} count={h.nRev} /></div>
        <p className="row-sm muted small"><MapPin size={14} />{h.km} km from {universityById(h.uni)?.short} · {h.area}</p>{badges}</div>
      {sections}
      <button className="btn btn-text btn-sm" style={{ alignSelf: 'center', color: 'var(--muted)' }} onClick={() => need('report') && setFlag(true)}><Flag size={15} />Report this listing</button>
    </main></div>
    <div className="m-cta"><div><div className="price">{ugx(r.price)}<span> / sem</span></div><div className="small muted clamp1">{r.t}</div></div>
      <Btn disabled={!bookable} onClick={() => need('book') && setBooking(true)}>{sem ? 'Book now' : 'Not open'}</Btn></div>
    {flow}
  </>;

  const uniShort = universityById(h.uni)?.short;
  const left = h.rooms.reduce((n, x) => n + Math.max(0, x.total - x.taken), 0);
  return <>
    <header className="hp-head">
      <button className="round-btn" onClick={back} aria-label="Back to Explore"><ChevronLeft size={20} /></button>
      <div className="hp-titles">
        <div className="row-sm" style={{ gap: 10 }}><h1 className="clamp1">{h.name}</h1>
          {h.verified && <span className="hp-ver" title="The owner's identity and documents were checked by Nestly"><BadgeCheck size={16} />Verified</span>}</div>
        <p className="hp-meta"><Rating value={h.rating} count={h.nRev} /><span className="dotsep" /><span className="row-sm"><MapPin size={14} />{h.km} km from {uniShort}</span><span className="dotsep" /><span>{h.area}</span></p>
      </div>
      <button className="round-btn" onClick={() => need('report') && setFlag(true)} aria-label="Report this listing" title="Report this listing"><Flag size={18} /></button>
      <SaveButton userId={me?.id} hostel={h} saved={saved} className="round-btn" />
    </header>

    <div className="hp fill">
      <section className="card hp-media" aria-label="Photos and key facts">
        <Gallery h={h} />
        <div className="hp-facts">
          <Fact icon={<MapPin size={17} />} label="To campus" value={`${h.km} km`} />
          <Fact icon={<Star size={17} />} label="Rating" value={h.nRev ? `${h.rating.toFixed(1)} / 5` : 'New'} />
          <Fact icon={<BedDouble size={17} />} label="Rooms free" value={left === 0 ? 'Full' : String(left)} />
          <Fact icon={<Clock size={17} />} label="Visiting" value={h.visit.replace(/:00/g, '').replace(/ to /, ' to ')} />
        </div>
      </section>

      <section className="card hp-info" aria-label="About this hostel">
        <div className="hp-info-body scroll-y">
          <div className="hp-block"><h3>About</h3><p className="hp-about">{h.about}</p><p className="small muted">Run by {h.ownerName} · Visitors sign in with a QR code at the gate</p></div>
          <div className="hp-block"><h3>What's included</h3>
            <div className="hp-amen">{h.amen.map(a => { const I = amenIcon(a); return <span key={a}><I size={16} />{AMENITIES[a]}</span>; })}</div></div>
          <div className="hp-block"><div className="row between"><h3>Reviews</h3>{h.nRev ? <span className="row-sm small nowrap"><Stars n={Math.round(h.rating)} size={14} /><b className="ink">{h.rating.toFixed(1)}</b><span className="muted">({h.nRev})</span></span> : null}</div>
            {data!.reviews.length ? data!.reviews.slice(0, 3).map(v => <div className="hp-review" key={v.id}>
              <div className="row between"><b className="ink small">{v.who}</b><span className="row-sm"><span className="tiny muted">{v.when}</span><button className="rv-report" onClick={() => reportReview(v)} aria-label={`Report the review by ${v.who}`} title="Report this review"><Flag size={13} /></button></span></div>
              <Stars n={v.stars} size={13} /><p className="small">{v.text}</p>{v.reply && <p className="tiny muted"><b>Owner:</b> {v.reply}</p>}</div>)
              : <p className="small muted">No written reviews yet.</p>}
            <p className="tiny muted">Only students who stayed here can review.</p></div>
        </div>
      </section>

      <aside className="card hp-book" aria-label="Book this hostel">
        <div className="hp-book-body scroll-y">
        <div className="hp-price"><span className="hp-label">{r.t}</span><div className="price">{ugx(r.price)}<span> / semester</span></div></div>
        <div><span className="hp-label">Choose a room</span>
          <div className="hp-rooms" role="radiogroup" aria-label="Room type">{h.rooms.map((x, i) => {
            const l = x.total - x.taken, full = l <= 0;
            return <button key={x.t} role="radio" aria-checked={room === i} disabled={full} className={'hp-room' + (room === i ? ' on' : '')} onClick={() => setSel(i)}>
              <span className="radio" /><span className="min0"><b>{x.t}</b>
                <span className={'tiny ' + (full ? 'danger-t' : l <= 3 ? 'warn-t' : 'muted')}>{full ? 'Full this semester' : `${l} of ${x.total} rooms available`}</span>
                <span className="num strong hp-room-price">{ugx(x.price)} <span className="muted">/ sem</span></span></span></button>;
          })}</div></div>
        <div className="hp-sum">
          <div><span className="muted">Semester</span><span>{sem ? <>{semName(sem)}<span className="tiny muted" style={{ display: 'block', textAlign: 'right' }}>{semDates(sem)}</span></> : 'Not taking bookings'}</span></div>
          <div><span className="muted">Booking fee, pay now</span><span className="num">{ugx(h.fee)}</span></div>
          <div><span className="muted">Rent, pay at check-in</span><span className="num">{ugx(r.price)}</span></div>
        </div>
        <ol className="hp-steps">
          <li><span><b>Pay the booking fee</b> with Mobile Money to hold your room.</span></li>
          <li><span><b>The custodian confirms</b> and gives you a room number.</span></li>
          <li><span><b>Pay rent at check-in</b> and move in.</span></li>
        </ol>
        </div>
        <div className="hp-cta">
          <Btn block disabled={!bookable} onClick={() => need('book') && setBooking(true)}>{!sem ? 'Not taking bookings right now' : bookable ? `Book for ${ugx(h.fee)}` : 'This room type is full'}</Btn>
          <p className="hint row-sm" style={{ justifyContent: 'center' }}><ShieldCheck size={14} color="var(--success)" />Free cancellation for 48 hours</p>
        </div>
      </aside>
    </div>
    {flow}
  </>;
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="hp-fact"><span className="icon-tile sm primary">{icon}</span><span className="min0"><span className="tiny muted">{label}</span><b className="clamp1">{value}</b></span></div>;
}

function Gallery({ h }: { h: Hostel }) {
  const [shot, setShot] = useState(0); const count = h.photos?.length || 3;
  return <div className="hp-gallery">
    <div className="hp-main"><Art hostel={h} alt={shot} key={shot} /><span className="hp-count">{shot + 1} / {count}</span></div>
    <div className="hp-thumbs" style={{ gridTemplateColumns: `repeat(${Math.min(count, 4)}, 1fr)` }}>{Array.from({ length: Math.min(count, 4) }, (_, i) => i).map(i => <button key={i} className={'hp-thumb' + (shot === i ? ' on' : '')} onClick={() => setShot(i)} aria-label={`Photo ${i + 1}`} aria-pressed={shot === i}><Art hostel={h} alt={i} /></button>)}</div>
  </div>;
}

function Sections({ h, reviews, room, onRoom, onReport }: { h: Hostel; reviews: Review[]; room: number; onRoom: (i: number) => void; onReport: (v: Review) => void }) {
  const dist = distribution(h.rating, h.nRev);
  const maxD = Math.max(...dist, 1);
  return <>
    <Card title="About" subtitle={`Run by ${h.ownerName}`}>
      <p>{h.about}</p>
      <div className="row wrap" style={{ gap: 20, marginTop: 14 }}><span className="row-sm small"><span className="icon-tile sm"><Clock size={16} /></span>Visiting hours {h.visit}</span>
        <span className="row-sm small"><span className="icon-tile sm"><QrCode size={16} /></span>Visitors sign in with a QR code</span></div>
    </Card>
    <Card title="Rooms" subtitle="Pick a room type to see its price"><RoomList h={h} sel={room} onSel={onRoom} /></Card>
    <Card title="Amenities" subtitle={`${h.amen.length} included`}>
      <div className="amen-grid">{h.amen.map(a => { const I = amenIcon(a); return <div key={a}><span className="icon-tile sm primary"><I size={17} /></span>{AMENITIES[a]}</div>; })}</div>
    </Card>
    <Card title="Reviews" subtitle="Only students who stayed here can review">
      <div className="reviews-sum">
        <div><div className="big num">{h.rating.toFixed(1)}</div><Stars n={Math.round(h.rating)} /><p className="small muted" style={{ marginTop: 4 }}>{h.nRev} reviews</p></div>
        <div className="stack-sm">{dist.map((c, i) => <div key={i} className="dist-row"><span className="row-sm" style={{ gap: 2 }}>{5 - i}</span><span className="bar"><i style={{ width: `${(c / maxD) * 100}%` }} /></span><span className="num">{c}</span></div>)}</div>
      </div>
      <div>{reviews.length ? reviews.map(v => <div className="review" key={v.id}>
        <div className="row between wrap"><span className="row-sm"><b className="ink">{v.who}</b><Pill tone="success"><Check size={12} />Stayed here</Pill></span><span className="row-sm"><span className="small muted">{v.when}</span><button className="rv-report" onClick={() => onReport(v)} aria-label={`Report the review by ${v.who}`} title="Report this review"><Flag size={14} /></button></span></div>
        <Stars n={v.stars} /><p>{v.text}</p>{v.reply && <div className="reply"><b className="ink">Owner reply:</b> {v.reply}</div>}</div>)
        : <p className="muted row-sm" style={{ paddingTop: 16 }}><Star size={15} />No written reviews yet.</p>}</div>
    </Card>
  </>;
}

const FLAG_REASONS = ['Fake listing', 'Wrong price', 'Photos do not match', 'Unsafe place', 'Payment not received', 'Something else'];
const REVIEW_REASONS = ['Abusive language', 'Not a real tenant', 'Shares private details', 'Something else'];
/** Report a listing, a payment problem, or one review. */
function ReportListing({ hid, name, review, onClose }: { hid: string; name: string; review?: Review; onClose: () => void }) {
  const me = useMe(); const toast = useToast();
  const [why, setWhy] = useState(''); const [text, setText] = useState(''); const [busy, setBusy] = useState(false);
  const pay = why === 'Payment not received';
  const go = async () => { setBusy(true); await reportListing(me.id, hid, why, text, review ? { kind: 'review', reviewId: review.id } : pay ? { kind: 'payment' } : {}); toast('Thank you. The Nestly team will look into it.'); onClose(); };
  return <Overlay title={review ? 'Report this review' : 'Report a problem'} onClose={onClose} width={460} footer={<><Btn kind="secondary" onClick={onClose}>Cancel</Btn><Btn loading={busy} disabled={!why || (pay && !text.trim())} onClick={go}><Flag size={15} />Send report</Btn></>}>
    <div className="stack">{review ? <div className="hp-review"><b className="small ink">{review.who}</b><p className="small">{review.text}</p></div>
      : <p className="small muted">Tell the Nestly team what is wrong with {name}. The owner does not see who reported it.</p>}
      <div className="chips">{(review ? REVIEW_REASONS : FLAG_REASONS).map(r => <button key={r} className={'chip' + (why === r ? ' on' : '')} aria-pressed={why === r} onClick={() => setWhy(r)}>{r}</button>)}</div>
      {pay && <p className="tiny muted">Nestly does not hold your money; the fee went straight to the owner. We contact them and follow it up with you.</p>}
      <div className="field"><label htmlFor="fl-t">{pay ? 'When did you pay, and how?' : 'What happened? (optional)'}</label><textarea id="fl-t" className="input" rows={3} maxLength={300} value={text} onChange={e => setText(e.target.value)}
        placeholder={pay ? 'For example: I paid UGX 40,000 by MTN on 6 Nov, reference MP261106.1203' : 'For example: the custodian asked for more than the price shown'} /></div>
    </div></Overlay>;
}
