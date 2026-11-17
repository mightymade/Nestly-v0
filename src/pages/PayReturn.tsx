import { AlertTriangle, Check, Clock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Btn, Logo } from '../components/ui';
import { dayLabel } from '../lib/format';
import { ApiError, confirmPayment, hostelById, type PayResult } from '../services/api';
import { useUser } from '../services/session';

/**
 * Where people land if a payment needed Flutterwave's own page (live data only; mobile money usually does not).
 * The address carries ?tx_ref=... The server checks the payment with Flutterwave before anything is confirmed,
 * so changing the address does nothing.
 */
export function PayReturn() {
  const [q] = useSearchParams(); const nav = useNavigate(); const me = useUser();
  const txRef = q.get('tx_ref') ?? '';
  const [res, setRes] = useState<PayResult | null>(null); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(true);
  const check = () => {
    setBusy(true); setErr(null);
    confirmPayment({ txRef }).then(setRes).catch(e => setErr((e as ApiError).message)).finally(() => setBusy(false));
  };
  useEffect(() => { if (txRef) check(); else setBusy(false); }, [txRef]); // eslint-disable-line react-hooks/exhaustive-deps

  const owner = me?.role === 'owner'; const home = owner ? '/o/money' : '/s/bookings';
  const h = res?.hostelId ? hostelById(res.hostelId) : undefined;
  const card = (icon: JSX.Element, title: string, text: string, actions: JSX.Element) => <main className="visit-page"><div className="visit-missing pay-result" aria-live="polite">
    <Logo />{icon}<h1>{title}</h1><p className="muted">{text}</p>{actions}</div></main>;

  if (!txRef) return card(<span className="icon-tile warn pr-icon"><AlertTriangle size={26} /></span>, 'No payment to check', 'This page opens after paying on Flutterwave.',
    <Link to={me ? home : '/welcome'} className="btn btn-secondary">Go back</Link>);
  if (busy) return card(<span className="boot-dot" />, 'Checking your payment', 'This takes a few seconds. Do not close this page.', <></>);
  if (err) return card(<span className="icon-tile warn pr-icon"><AlertTriangle size={26} /></span>, 'We could not check the payment', err,
    <><Btn block onClick={check}>Check again</Btn><Link to={home} className="btn btn-text">Go back</Link></>);
  if (res?.result === 'paid' && res.kind === 'subscription') return card(<span className="success-tile"><Check size={32} /></span>, 'Subscription paid',
    `Thank you. You are paid until ${dayLabel(res.paidUntil)}. Hostels paused for payment are back on Explore.`, <Btn block onClick={() => nav('/o/money')}>Back to Money</Btn>);
  if (res?.result === 'paid') return card(<span className="success-tile"><Check size={32} /></span>, h ? `You are booked at ${h.name}` : 'Room booked',
    `Reference ${res.bookingId}.${res.cancelUntil ? ` Free cancellation until ${res.cancelUntil}.` : ''} The custodian will give you a room before you arrive.`,
    <Btn block onClick={() => nav('/s/bookings')}>See my bookings</Btn>);
  if (res?.result === 'pending') return card(<span className="icon-tile primary pr-icon"><Clock size={26} /></span>, 'Still waiting for the payment',
    'Approve the prompt on your phone if you have not. Then check again. You are not charged twice.', <><Btn block onClick={check}>Check again</Btn><Link to={home} className="btn btn-text">Go back</Link></>);
  const again = res?.kind === 'subscription' ? '/o/money' : res?.hostelId ? `/s/explore/${res.hostelId}` : home;
  return card(<span className="icon-tile warn pr-icon"><AlertTriangle size={26} /></span>, 'The payment did not go through',
    res?.error ? `${res.error} If money left your account, email support@nestly.app with the time you paid.` : 'You were not charged. You can try again.', <><Btn block onClick={() => nav(again)}>Try again</Btn><Link to={home} className="btn btn-text">Go back</Link></>);
}
