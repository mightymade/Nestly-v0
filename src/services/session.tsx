import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '../data/types';
import { sessionUser } from './api';
import { reload, subscribe } from './db';
import { authUid } from './remote';
import { live, sb } from './supabase';

const Ctx = createContext<User | null>(null);
/** Tables that refresh open screens as soon as they change (see supabase/migrations/0008_live_updates.sql). */
const LIVE_TABLES = ['notifications', 'bookings', 'tenants', 'visitors', 'hostels', 'rooms', 'reviews', 'notices', 'flags', 'docs', 'invites', 'sub_payments', 'owner_accounts'];

/**
 * Keeps the signed-in user in sync with the data.
 * In live mode it first loads from Supabase (showing a short loading screen), then reloads whenever someone
 * signs in or out, including in another tab or after opening an email link.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(live ? null : sessionUser);
  const [ready, setReady] = useState(!live);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => subscribe(() => setUser(sessionUser())), []);
  useEffect(() => {
    if (!live) return;
    reload().then(() => { setUser(sessionUser()); setReady(true); }).catch(e => setFailed(e.message ?? 'Could not reach Nestly.'));
    const { data } = sb!.auth.onAuthStateChange((_event, s) => {
      // Supabase asks that no other Supabase call runs inside this callback, so the reload waits a tick.
      const id = s?.user.id ?? null;
      if (id !== authUid) setTimeout(() => { void reload(); }, 0);
    });
    // Live updates: Supabase Realtime says when a table this person can see changes (a new booking, a visitor at the gate,
    // a notification), and the data reloads a moment later. Several changes at once cause one reload.
    let soon: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => { if (soon) clearTimeout(soon); soon = setTimeout(() => { soon = null; void reload().catch(() => undefined); }, 1200); };
    const channel = sb!.channel('nestly-live');
    for (const table of LIVE_TABLES) channel.on('postgres_changes', { event: '*', schema: 'public', table }, refresh);
    channel.subscribe();
    // A safety net if live updates are off or the connection drops: reload every minute, and when the person comes back to the tab.
    const t = setInterval(() => { if (document.visibilityState === 'visible') void reload().catch(() => undefined); }, 60000);
    const back = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', back);
    return () => { data.subscription.unsubscribe(); clearInterval(t); document.removeEventListener('visibilitychange', back); void sb!.removeChannel(channel); if (soon) clearTimeout(soon); };
  }, []);
  if (failed) return <div className="boot"><b>Nestly could not load</b><p>{failed}</p><button className="btn btn-primary" onClick={() => location.reload()}>Try again</button></div>;
  if (!ready) return <div className="boot" aria-busy="true"><span className="boot-dot" /><p>Loading Nestly...</p></div>;
  return <Ctx.Provider value={user}>{children}</Ctx.Provider>;
}
export const useUser = () => useContext(Ctx);
export const useMe = () => { const u = useContext(Ctx); if (!u) throw new Error('Not signed in'); return u; };
