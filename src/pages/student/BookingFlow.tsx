import { CalendarCheck, Check, ChevronLeft, Copy, GraduationCap, Lock, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Overlay } from '../../components/Overlay';
import { useToast } from '../../components/Toast';
import { Art, Btn, Field, TextInput } from '../../components/ui';
import type { Booking, Hostel } from '../../data/types';
import { copyText, ugx } from '../../lib/format';
import { ApiError, bookingSem, createBooking, hasBookingFor, semDates, semName } from '../../services/api';
import { useMe } from '../../services/session';

export function RoomList({ h, sel, onSel }: { h: Hostel; sel: number; onSel: (i: number) => void }) {
  return <div className="stack-sm" role="radiogroup" aria-label="Room type">{h.rooms.map((r, i) => {
    const left = r.total - r.taken, full = left <= 0;
    return <button key={r.t} className={'room' + (sel === i ? ' on' : '')} role="radio" aria-checked={sel === i} disabled={full} onClick={() => onSel(i)}>
      <span className="radio" />
      <span className="room-text">
        <b className="ink room-name">{r.t}</b>
        <span className={'room-left ' + (full ? 'danger-t' : left <= 3 ? 'warn-t' : 'muted')}>{full ? 'Full this semester' : `${left} of ${r.total} rooms available`}</span>
        <span className="avail"><i style={{ width: `${(r.taken / r.total) * 100}%` }} /></span>
        <span className="room-price num"><b className="ink">{ugx(r.price)}</b> <span className="muted">per semester</span></span>
      </span>
    </button>;
  })}</div>;
}

const STEPS = ['Room', 'Payment', 'Done'];
function Stepper({ at }: { at: number }) {
  return <div className="stepper" aria-label={`Step ${at + 1} of 3`}>{STEPS.map((l, i) => <div key={l} className={'st' + (i <= at ? ' on' : '')}><i />{l}</div>)}</div>;
}

export function BookingFlow({ h, room, onRoom, onClose }: { h: Hostel; room: number; onRoom: (i: number) => void; onClose: () => void }) {
  const semObj = bookingSem(h); const SEM = semObj ? semName(semObj) : '';
  const me = useMe(); const nav = useNavigate(); const toast = useToast();
  const [step, setStep] = useState<'room' | 'pay' | 'wait' | 'done'>('room');
  const [method, setMethod] = useState<'mtn' | 'airtel'>('mtn');
  const [phone, setPhone] = useState(me.phone ?? '');
  const [err, setErr] = useState<string | null>(null); const [fail, setFail] = useState<string | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const r = h.rooms[room]!;

  if (!me.emailVerified) return <Overlay title="Confirm your student email" onClose={onClose} width={440}><div className="center">
    <span className="icon-tile primary" style={{ width: 60, height: 60, borderRadius: 18 }}><GraduationCap size={26} /></span>
    <p>Only current students can book on Nestly. Open the link we sent to <b>{me.email}</b>. It takes about a minute.</p>
    <Btn block onClick={() => nav('/signup')}>Confirm my email</Btn></div></Overlay>;
  if (step !== 'done' && hasBookingFor(me.id, SEM)) return <Overlay title="You already have a booking" onClose={onClose} width={440}><div className="center">
    <span className="icon-tile warn" style={{ width: 60, height: 60, borderRadius: 18 }}><CalendarCheck size={26} /></span>
    <p>You already booked a room for {SEM}. You can hold one booking per semester. Cancel it first if you want to switch.</p>
    <Btn kind="secondary" block onClick={() => nav('/s/bookings')}>See my bookings</Btn></div></Overlay>;

  async function pay() {
    setErr(null); setFail(null); setStep('wait');
    try { setBooking(await createBooking(me.id, h.id, room, phone, method)); setStep('done'); }
    catch (x) { const a = x as ApiError; if (a.field === 'phone') setErr(a.message); else setFail(a.message); setStep('pay'); }
  }

  if (step === 'room') return <Overlay title="Book a room" onClose={onClose}
    footer={<Btn block onClick={() => setStep('pay')}>Continue to payment</Btn>}>
    <Stepper at={0} />
    <div className="stack">
      <div className="row"><div style={{ width: 56, height: 56, borderRadius: 14, overflow: 'hidden', flex: 'none' }}><Art hostel={h} /></div><div><b className="ink">{h.name}</b><div className="small muted">{SEM}{semObj ? ` · ${semDates(semObj)}` : ""}</div></div></div>
      <RoomList h={h} sel={room} onSel={onRoom} />
      <div className="receipt"><div className="sum"><span className="muted">Booking fee, paid now</span><b className="num ink">{ugx(h.fee)}</b></div>
        <div className="sum"><span className="muted">Rent, paid to the owner later</span><span className="num">{ugx(r.price)}</span></div></div>
    </div></Overlay>;

  if (step === 'pay') return <Overlay title="Pay the booking fee" onClose={onClose}
    footer={<><Btn kind="secondary" onClick={() => setStep('room')}><ChevronLeft size={16} />Back</Btn><Btn className="grow" onClick={pay}>{fail ? 'Try again' : `Pay ${ugx(h.fee)}`}</Btn></>}>
    <Stepper at={1} />
    <div className="stack">
      {fail && <div className="banner danger small" role="alert"><span className="grow">{fail}</span></div>}
      <div className="stack-sm" role="radiogroup" aria-label="Payment method">
        <button className={'pay-opt' + (method === 'mtn' ? ' on' : '')} role="radio" aria-checked={method === 'mtn'} onClick={() => setMethod('mtn')}><span className="brand-tile mtn">MTN</span><span className="grow"><b className="ink">MTN Mobile Money</b><br /><span className="small muted">Approve with your MoMo PIN</span></span>{method === 'mtn' && <Check size={18} color="var(--primary)" />}</button>
        <button className={'pay-opt' + (method === 'airtel' ? ' on' : '')} role="radio" aria-checked={method === 'airtel'} onClick={() => setMethod('airtel')}><span className="brand-tile airtel">airtel</span><span className="grow"><b className="ink">Airtel Money</b><br /><span className="small muted">Approve with your Airtel PIN</span></span>{method === 'airtel' && <Check size={18} color="var(--primary)" />}</button>
      </div>
      <Field id="pay-phone" label="Mobile money number" error={err} hint="You will get a prompt on this phone to approve.">
        <TextInput id="pay-phone" type="tel" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} error={err} placeholder={method === 'mtn' ? '0772 123 456' : '0752 123 456'} /></Field>
      <div className="receipt"><div className="sum"><span className="muted">{h.name}</span><span>{r.t}</span></div><div className="sum total"><span>Total now</span><span className="num">{ugx(h.fee)}</span></div></div>
      <p className="hint row-sm" style={{ justifyContent: 'center', textAlign: 'center' }}><Lock size={13} />Paid straight to {h.name}. Test mode, no real money moves yet.</p>
    </div></Overlay>;

  if (step === 'wait') return <Overlay title="Waiting for approval" onClose={() => {}} dismissable={false} width={440}>
    <Stepper at={1} />
    <div className="center"><div className="phone-wait"><div className="ph"><Smartphone size={22} /></div></div>
      <h2>Check your phone and enter your PIN</h2><p className="muted">Approve {ugx(h.fee)} on the {method === 'mtn' ? 'MTN MoMo' : 'Airtel Money'} prompt sent to {phone}.</p></div></Overlay>;

  return <Overlay title="Room booked" onClose={onClose} footer={<Btn block onClick={() => nav('/s/bookings')}>See my bookings</Btn>}>
    <Stepper at={2} />
    <div className="center"><span className="success-tile"><Check size={32} /></span><h2>You are booked at {h.name}</h2><p className="muted">{r.t} · {SEM}</p>
      <div className="receipt">
        <div className="tiny muted" style={{ textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>Reference</div>
        <div className="row between"><span className="ref num">{booking?.id}</span>
          <Btn kind="secondary" size="sm" onClick={async () => toast((await copyText(booking?.id ?? '')) ? 'Reference copied' : 'Could not copy. Select the text instead.')}><Copy size={14} />Copy</Btn></div>
        <hr />
        <div className="sum"><span className="muted">Paid to</span><span>{h.name}, directly</span></div>
        <div className="sum"><span className="muted">Paid with</span><span>{method === 'mtn' ? 'MTN MoMo' : 'Airtel Money'}</span></div>
        <div className="sum"><span className="muted">Amount</span><span className="num">{ugx(h.fee)}</span></div>
        <div className="sum"><span className="muted">Free cancellation until</span><span>{booking?.cancelUntil}</span></div>
      </div>
      <p className="small muted">A receipt was sent to {me.email}.</p></div></Overlay>;
}
