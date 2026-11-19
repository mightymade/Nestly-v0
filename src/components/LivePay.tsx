import { Smartphone } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ugx } from '../lib/format';
import { ApiError, confirmPayment, sendPaymentCode, type PayResult } from '../services/api';
import { Btn, Field, TextInput } from './ui';
import { testPayments } from '../services/supabase';

const NET = { mtn: 'MTN MoMo', airtel: 'Airtel Money' } as const;
/** How long to keep checking before asking the person to check again themselves. */
const GIVE_UP_MS = 3 * 60 * 1000;

/**
 * A mobile money payment with real data (Flutterwave). Starts the charge, asks for a code if Flutterwave wants one
 * (test mode always asks: 123456), then checks every few seconds until the money arrives or the payment fails.
 * The caller puts it inside its own dialog and decides what happens when it is paid or fails.
 */
export function LivePay({ start, amount, phone, method, onPaid, onFailed, onLater, laterNote }: {
  start: () => Promise<PayResult>; amount: number; phone: string; method: 'mtn' | 'airtel';
  onPaid: (r: PayResult) => void; onFailed: (message: string, field?: string) => void;
  /** Lets the person close the dialog after a long wait. The payment keeps going in the background. */
  onLater?: () => void; laterNote?: string;
}) {
  const [p, setP] = useState<PayResult | null>(null); const [otp, setOtp] = useState(''); const [otpErr, setOtpErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [stale, setStale] = useState(false);
  const began = useRef(0); const done = useRef(false);
  const settle = (r: PayResult) => {
    if (done.current) return;
    if (r.result === 'paid') { done.current = true; onPaid(r); }
    else if (r.result === 'failed') { done.current = true; onFailed(r.error ? `${r.error} If money left your account, email support@nestly.app.` : 'The payment did not go through. You were not charged.'); }
    else setP(x => ({ ...r, txRef: r.txRef ?? x?.txRef }));
  };
  useEffect(() => {
    if (began.current) return; began.current = Date.now();
    start().then(settle).catch(e => { done.current = true; onFailed((e as ApiError).message, (e as ApiError).field); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // While waiting for approval on the phone, check every 4 seconds.
  const waiting = p?.result === 'pending' && p.next?.type !== 'otp' && !stale;
  useEffect(() => {
    if (!waiting || !p?.txRef) return;
    const t = setInterval(() => {
      if (Date.now() - began.current > GIVE_UP_MS) { setStale(true); return; }
      confirmPayment({ txRef: p.txRef! }).then(settle).catch(() => undefined);
    }, 4000);
    return () => clearInterval(t);
  }, [waiting, p?.txRef]); // eslint-disable-line react-hooks/exhaustive-deps

  async function sendCode(e: FormEvent) {
    e.preventDefault(); if (!p?.txRef) return; setBusy(true); setOtpErr(null);
    try { settle(await sendPaymentCode(p.txRef, otp)); } catch (x) { setOtpErr((x as ApiError).message); } finally { setBusy(false); }
  }
  async function checkNow() {
    if (!p?.txRef) return; setBusy(true); began.current = Date.now(); setStale(false);
    try { settle(await confirmPayment({ txRef: p.txRef })); } catch (x) { setOtpErr((x as ApiError).message); } finally { setBusy(false); }
  }

  const head = <div className="phone-wait"><div className="ph"><Smartphone size={22} /></div></div>;
  if (!p) return <div className="center">{head}<h2>Starting the payment</h2><p className="muted">Connecting to {NET[method]}...</p></div>;
  if (p.next?.type === 'otp') return <form className="center stack" onSubmit={sendCode} noValidate>{head}
    <h2>Enter the code</h2><p className="muted">{p.next.note ?? 'Enter the code sent to your phone.'}</p>
    <Field id="pay-otp" label="Code" error={otpErr}><TextInput id="pay-otp" inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={e => { setOtp(e.target.value.replace(/\D/g, '')); setOtpErr(null); }} error={otpErr} maxLength={8} autoFocus /></Field>
    <Btn type="submit" block loading={busy} disabled={otp.length < 4}>Confirm {ugx(amount)}</Btn>
    {testPayments && <p className="hint">Test mode: the code is always 123456.</p>}</form>;
  return <div className="center stack">{head}
    <h2>{stale ? 'Still waiting for the payment' : 'Check your phone and enter your PIN'}</h2>
    <p className="muted">{stale ? 'We have not heard back yet. Approve the prompt if you have not, then check again. You are never charged twice.' : (p.next?.note ?? `Approve ${ugx(amount)} on the ${NET[method]} prompt sent to ${phone}.`)}</p>
    {otpErr && <span className="err" role="alert">{otpErr}</span>}
    {stale ? <><Btn block loading={busy} onClick={checkNow}>Check again</Btn>{onLater && <><Btn kind="secondary" block onClick={onLater}>Close, I will check later</Btn>{laterNote && <p className="hint">{laterNote}</p>}</>}</> : <p className="hint">This page updates by itself.</p>}
  </div>;
}
