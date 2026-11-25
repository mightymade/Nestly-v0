/**
 * The app's in-memory data.
 * - Demo mode: everything lives in this browser's localStorage, seeded with sample data.
 * - Live mode (Supabase set up): loaded from Supabase after sign in, and every commit() writes
 *   the changes back (see remote.ts). Screens and api.ts work the same either way.
 */
import { seed } from '../data/seed';
import type { DB } from '../data/types';
import { storage } from '../lib/storage';
import { load, push, rebase, resetRemote } from './remote';
import { live } from './supabase';

const KEY = 'nestly.db.v17';
/** An empty database, the starting point before live data loads. */
export const emptyDb = (): DB => ({
  users: [], bookings: [], saved: {}, reviews: [], visitors: [], tenants: [], rooms: [], notices: [], invites: [], mail: [],
  hostels: [], notifications: [], universities: [], docs: [], payouts: [], audit: [], flags: [], subPayments: [],
  config: { subFee: 50000, perHostel: true, graceDays: 7 },
});
let db: DB = live ? emptyDb() : storage.get<DB | null>(KEY, null) ?? seed();
const listeners = new Set<() => void>();
const tell = () => listeners.forEach(l => l());

export const getDb = () => db;
/**
 * Saves changes and tells every screen to refresh. In live mode it also writes the changes to Supabase;
 * if the server refuses, the data is reloaded so the screen shows what is really saved, and the error is thrown.
 */
export async function commit() {
  if (!live) { storage.set(KEY, db); tell(); return; }
  tell();
  try { await push(db); tell(); }
  catch (e) { await reload().catch(() => undefined); throw e; }
}
export function subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
let afterLoad: (() => void) | null = null;
/** Lets the API tidy fresh data (bed counts, distances) without db.ts importing it. */
export function onFreshData(fn: () => void) { afterLoad = fn; fn(); }
/** Demo only: wipes the sample data back to the start. */
export function resetDemo() { if (live) return; db = seed(); afterLoad?.(); void commit(); }

/** Live mode: reads everything this person may see from Supabase and refreshes every screen. */
export async function reload() {
  if (!live) return;
  db = await load(emptyDb); afterLoad?.(); rebase(db); tell();
}
/** Live mode: clears the data when someone signs out, then loads what guests can see. */
export async function clearAndReload() { resetRemote(); db = emptyDb(); tell(); await reload(); }
