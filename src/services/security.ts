/**
 * Sign-in safety: the device id sent with each login, two-step login (an authenticator app code), and asking
 * people to prove it is them again before risky actions.
 *
 * Live data uses Supabase Auth's TOTP factors. Demo mode imitates them so every screen can be tried:
 * the demo code is always 123456.
 */
import { storage } from '../lib/storage';
import { ApiError } from './errors';
import { live, sb } from './supabase';

/* ---------- device id: lets the server notice a new device and email the person ---------- */
export function deviceId(): string {
  let d = storage.get<string | null>('nestly.device', null);
  if (!d) { d = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)); storage.set('nestly.device', d); }
  return d;
}

/* ---------- what the current login token says ---------- */
let token: string | null = null;
const listeners = new Set<() => void>();
if (sb) {
  sb.auth.getSession().then(({ data }) => { token = data.session?.access_token ?? null; listeners.forEach(f => f()); });
  sb.auth.onAuthStateChange((_e, s) => { token = s?.access_token ?? null; listeners.forEach(f => f()); });
}
/** Calls back whenever the login token changes (sign-in, two-step code, refresh, sign-out). */
export function onTokenChange(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; }
function claims(): Record<string, unknown> | null {
  if (!token) return null;
  try { return JSON.parse(atob(token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))); } catch { return null; }
}
/** 'aal2' once the person passed two-step login in this session. Demo mode: always 'aal2'. */
export const aalNow = () => (live ? String(claims()?.aal ?? 'aal1') : 'aal2');
/** When the person last proved who they are (password or code), in seconds since 1970. */
export function lastAuthAt(): number {
  const amr = (claims()?.amr ?? []) as { timestamp?: number }[];
  return Math.max(0, ...amr.map(a => Number(a.timestamp ?? 0)));
}

/* ---------- two-step login ---------- */
// True between the password and the code, for accounts with two-step login. The app keeps them on the code page.
let pending = false;
export const codePending = () => pending;
export function setCodePending(v: boolean) { pending = v; listeners.forEach(f => f()); }
if (live && sb) sb.auth.getSession().then(async ({ data }) => { if (data.session) setCodePending(await codeNeeded()); }).catch(() => undefined);

const DEMO_KEY = 'nestly.demo2fa'; const DEMO_CODE = '123456';
const demoOn = (uid: string) => storage.get<string[]>(DEMO_KEY, []).includes(uid);
/** True when this account has two-step login turned on. */
export async function twoStepOn(uid: string): Promise<boolean> {
  if (!live) return demoOn(uid);
  const { data } = await sb!.auth.mfa.listFactors();
  return !!data?.totp?.some(f => f.status === 'verified');
}
/** After the password: does this login still need the authenticator code? */
export async function codeNeeded(): Promise<boolean> {
  if (!live) return false;
  const { data } = await sb!.auth.mfa.getAuthenticatorAssuranceLevel();
  return data?.currentLevel === 'aal1' && data?.nextLevel === 'aal2';
}
const SIX = /^\d{6}$/;
/** Checks the 6-digit code from the authenticator app. Upgrades the session to two-step (aal2). */
export async function verifyCode(code: string) {
  const c = code.replace(/\s/g, '');
  if (!SIX.test(c)) throw new ApiError('Enter the 6-digit code from your authenticator app.', 'code');
  if (!live) { if (c !== DEMO_CODE) throw new ApiError('That code is not right. In demo mode the code is 123456.', 'code'); setCodePending(false); return; }
  const { data } = await sb!.auth.mfa.listFactors();
  const f = data?.totp?.find(x => x.status === 'verified');
  if (!f) throw new ApiError('Two-step login is not set up on this account.', 'code');
  const { error } = await sb!.auth.mfa.challengeAndVerify({ factorId: f.id, code: c });
  if (error) throw new ApiError(/invalid|expired/i.test(error.message) ? 'That code is not right or has expired. Try the newest code.' : error.message, 'code');
  setCodePending(false);
}
/** Starts setting up two-step login. Returns a QR code picture and the secret to type in by hand. */
export async function startTwoStep(): Promise<{ factorId: string; qr: string; secret: string }> {
  if (!live) return { factorId: 'demo', qr: '', secret: 'DEMO DEMO DEMO DEMO' };
  // Remove an unfinished earlier attempt, or Supabase refuses a second one with the same name.
  const { data: list } = await sb!.auth.mfa.listFactors();
  for (const f of list?.all ?? []) if (f.status === 'unverified') await sb!.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await sb!.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Nestly ' + new Date().toISOString().slice(0, 10) });
  if (error || !data) throw new ApiError(error?.message ?? 'Could not start two-step login. Try again.');
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}
/** Finishes setting up: the first code from the app proves it works. */
export async function finishTwoStep(uid: string, factorId: string, code: string) {
  const c = code.replace(/\s/g, '');
  if (!SIX.test(c)) throw new ApiError('Enter the 6-digit code from your authenticator app.', 'code');
  if (!live) { if (c !== DEMO_CODE) throw new ApiError('That code is not right. In demo mode the code is 123456.', 'code'); storage.set(DEMO_KEY, [...storage.get<string[]>(DEMO_KEY, []), uid]); return; }
  const { error } = await sb!.auth.mfa.challengeAndVerify({ factorId, code: c });
  if (error) throw new ApiError(/invalid|expired/i.test(error.message) ? 'That code is not right. Check the time on your phone and try the newest code.' : error.message, 'code');
}
/** Turns two-step login off (needs a recent code). */
export async function removeTwoStep(uid: string) {
  if (!live) { storage.set(DEMO_KEY, storage.get<string[]>(DEMO_KEY, []).filter(x => x !== uid)); return; }
  const { data } = await sb!.auth.mfa.listFactors();
  for (const f of data?.all ?? []) { const { error } = await sb!.auth.mfa.unenroll({ factorId: f.id }); if (error) throw new ApiError(error.message); }
}

/* ---------- prove it is you again ---------- */
type Prompt = (mode: 'code' | 'password', error?: string) => Promise<string | null>;
let prompt: Prompt | null = null;
/** The app's dialog registers itself here (components/Reauth.tsx). */
export const setReauthPrompt = (p: Prompt | null) => { prompt = p; };
/**
 * Before a risky action (approving, rejecting, pausing accounts, changing payouts): if the person has not entered
 * their password or code in the last 14 minutes, ask for it. The database checks the same thing, so this only
 * saves a failed attempt. Throws if they cancel.
 */
export async function freshAuth(uid: string, email: string) {
  if (!live || Date.now() / 1000 - lastAuthAt() < 14 * 60) return;
  if (!prompt) throw new ApiError('For your safety, log in again, then try once more.');
  const mode = (await twoStepOn(uid)) ? 'code' : 'password';
  let err: string | undefined;
  for (;;) {
    const secret = await prompt(mode, err);
    if (secret === null) throw new ApiError('Cancelled. Nothing was changed.');
    try {
      if (mode === 'code') await verifyCode(secret);
      else { const { error } = await sb!.auth.signInWithPassword({ email, password: secret }); if (error) throw new ApiError('That password is not right.'); }
      return;
    } catch (x) { err = (x as Error).message; }
  }
}
