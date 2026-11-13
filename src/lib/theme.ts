import { storage } from './storage';

export type ThemePref = 'light' | 'dark' | 'system';
const KEY = 'nestly.theme';

/**
 * Light or dark mode is saved per account, so one person's choice does not carry over to another account
 * on the same device. With no choice saved (and on screens with no settings, such as the custodian's phone),
 * the app uses light mode. The custodian's phone screens follow the device instead.
 */
let user: string | null = null;
let forceSystem = false;
const key = () => (user ? `${KEY}.${user}` : KEY);

/**
 * Signed-out pages are always light. Signed-in accounts start light until they pick something in Settings.
 * The custodian on a phone has no Settings page, so their screens follow the device.
 */
export function getThemePref(): ThemePref {
  if (forceSystem) return 'system';
  if (!user) return 'light';
  return storage.get<ThemePref>(key(), 'light');
}

export function applyTheme(pref: ThemePref = getThemePref()) {
  const dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#12141C' : '#F2F4FA');
}

export function setThemePref(pref: ThemePref) { storage.set(key(), pref); applyTheme(pref); }

/** Called when someone signs in or out (null = signed out, always light). `system` forces the device setting. */
export function setThemeUser(id: string | null, system = false) { user = id; forceSystem = system; applyTheme(); }

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (getThemePref() === 'system') applyTheme('system'); });
