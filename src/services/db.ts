/**
 * Fake database for the UI-only phase. Everything lives in the browser.
 * When the backend arrives, only services/api.ts changes; screens keep calling the same functions.
 */
import { seed } from '../data/seed';
import type { DB } from '../data/types';
import { storage } from '../lib/storage';

const KEY = 'nestly.db.v14';
let db: DB = storage.get<DB | null>(KEY, null) ?? seed();
const listeners = new Set<() => void>();

export const getDb = () => db;
export function commit() { storage.set(KEY, db); listeners.forEach(l => l()); }
export function subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
let afterLoad: (() => void) | null = null;
/** Lets the API tidy fresh demo data (bed counts) without db.ts importing it. */
export function onFreshData(fn: () => void) { afterLoad = fn; fn(); }
export function resetDemo() { db = seed(); afterLoad?.(); commit(); }
