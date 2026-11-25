import { useEffect, useRef } from 'react';
import { live } from '../services/supabase';

/**
 * Cloudflare Turnstile: a quiet "are you a person?" check on sign-up, login and password reset, so bots cannot
 * create fake accounts, guess passwords or use up the daily email allowance. Most people never see a puzzle.
 * Only shown when VITE_TURNSTILE_SITE_KEY is set (see SETUP.md). Supabase checks the answer on its side.
 */
export const captchaKey = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) ?? '';
export const captchaOn = live && !!captchaKey;

type Turnstile = { render: (el: HTMLElement, o: Record<string, unknown>) => string; reset: (id: string) => void; remove: (id: string) => void };
declare global { interface Window { turnstile?: Turnstile } }
let loading: Promise<void> | null = null;
function loadScript() {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise<void>((ok, fail) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; s.async = true;
    s.onload = () => ok(); s.onerror = () => { loading = null; fail(new Error('Could not load the check.')); };
    document.head.appendChild(s);
  });
  return loading;
}

/** Renders the check and reports its answer (or '' when it expires). Change `reset` to ask for a new answer. */
export function Captcha({ onToken, reset = 0 }: { onToken: (t: string) => void; reset?: number }) {
  const box = useRef<HTMLDivElement>(null); const wid = useRef<string | null>(null);
  const cb = useRef(onToken); cb.current = onToken;
  useEffect(() => {
    if (!captchaOn) return;
    let gone = false;
    loadScript().then(() => {
      if (gone || !box.current || !window.turnstile) return;
      wid.current = window.turnstile.render(box.current, {
        sitekey: captchaKey, theme: 'light', size: 'flexible',
        callback: (t: string) => cb.current(t), 'expired-callback': () => cb.current(''), 'error-callback': () => cb.current(''),
      });
    }).catch(() => undefined);
    return () => { gone = true; if (wid.current && window.turnstile) window.turnstile.remove(wid.current); wid.current = null; };
  }, []);
  useEffect(() => { if (reset && wid.current && window.turnstile) { window.turnstile.reset(wid.current); cb.current(''); } }, [reset]);
  if (!captchaOn) return null;
  return <div ref={box} className="captcha" aria-label="Check that you are a person" />;
}
