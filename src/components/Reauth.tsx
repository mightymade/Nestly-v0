import { KeyRound, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { logout } from '../services/api';
import { setReauthPrompt } from '../services/security';
import { live } from '../services/supabase';
import { useUser } from '../services/session';
import { useToast } from './Toast';
import { Overlay } from './Overlay';
import { Btn, Field, PasswordInput, TextInput } from './ui';

type Ask = { mode: 'code' | 'password'; error?: string; done: (v: string | null) => void };

/**
 * Asks "Is it you?" before risky actions when the last password or code is more than 14 minutes old, and signs
 * admins out after 30 minutes without activity. Mounted once for the whole app.
 */
export function ReauthHost() {
  const [ask, setAsk] = useState<Ask | null>(null);
  useEffect(() => {
    setReauthPrompt((mode, error) => new Promise(done => setAsk({ mode, error, done })));
    return () => setReauthPrompt(null);
  }, []);
  return <>{ask && <ReauthDialog key={ask.error ?? 'first'} ask={ask} onDone={v => { setAsk(null); ask.done(v); }} />}<AdminIdleLock /></>;
}

function ReauthDialog({ ask, onDone }: { ask: Ask; onDone: (v: string | null) => void }) {
  const [v, setV] = useState('');
  const go = (e?: FormEvent) => { e?.preventDefault(); if (v.trim()) onDone(v.trim()); };
  return <Overlay title="Is it you?" onClose={() => onDone(null)} width={420}
    footer={<><Btn kind="secondary" onClick={() => onDone(null)}>Cancel</Btn><Btn onClick={() => go()}><ShieldCheck size={16} />Continue</Btn></>}>
    <form className="stack" onSubmit={go} noValidate>
      <p className="muted small">For your safety, confirm it is you before this change. You will not be asked again for 15 minutes.</p>
      {ask.mode === 'code'
        ? <Field id="ra-code" label="Code from your authenticator app" error={ask.error ?? null}>
            <TextInput id="ra-code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={v} onChange={e => setV(e.target.value)} error={ask.error ?? null} placeholder="123 456" autoFocus /></Field>
        : <Field id="ra-pw" label="Your password" error={ask.error ?? null}>
            <PasswordInput id="ra-pw" autoComplete="current-password" value={v} onChange={e => setV(e.target.value)} error={ask.error ?? null} autoFocus /></Field>}
      <span className="hint row-sm"><KeyRound size={13} />The database checks this too, so nobody can skip it.</span>
    </form></Overlay>;
}

/** Admins are signed out after 30 minutes without using the page. */
function AdminIdleLock() {
  const me = useUser(); const toast = useToast(); const last = useRef(Date.now());
  const admin = me?.role === 'admin';
  useEffect(() => {
    if (!admin) return;
    const bump = () => { last.current = Date.now(); };
    const ev = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    ev.forEach(e => window.addEventListener(e, bump, { passive: true }));
    const t = setInterval(async () => {
      if (Date.now() - last.current > 30 * 60000) { clearInterval(t); await logout(); toast(live ? 'Signed out after 30 minutes without activity. Log in again.' : 'Demo: signed out after 30 minutes without activity.'); }
    }, 30000);
    return () => { ev.forEach(e => window.removeEventListener(e, bump)); clearInterval(t); };
  }, [admin, toast]);
  return null;
}
