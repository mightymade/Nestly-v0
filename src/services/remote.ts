/**
 * Keeps the app's in-memory data in step with Supabase.
 *
 * How it works:
 * 1. load(): after sign in (or as a guest) it reads every table this person is allowed to see.
 *    Row level security on the server decides what that is, so each role gets only its own slice.
 * 2. The functions in api.ts keep working on that in-memory copy exactly as in demo mode.
 * 3. push(): every commit() compares the copy with what was last loaded and writes the
 *    changed rows back. Only rows this person may change are sent; the server checks again.
 *
 * Server rules and triggers (supabase/migrations) are the real guard. This file only avoids
 * sending writes that would be refused anyway.
 */
import type { Config, DB, User, VerificationDoc } from '../data/types';
import { ymd } from '../lib/format';
import { ApiError } from './errors';
import { DOC_PREFIX, docLinks } from './files';
import { sb } from './supabase';

type Row = Record<string, unknown>;
const camel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** Columns of each table, in snake_case. Anything else on the app's objects is not saved. */
const COLS: Record<string, string[]> = {
  universities: ['id', 'name', 'short', 'domain', 'area', 'lat', 'lng', 'logo', 'sems', 'email_ok'],
  profiles: ['id', 'role', 'name', 'email', 'username', 'phone', 'photo', 'university_id', 'email_verified', 'verified_until', 'hostel_id', 'owner_status', 'owner_note', 'suspended', 'suspend_reason', 'joined', 'last_active', 'verify_via', 'student_no', 'id_status', 'id_note'],
  owner_accounts: ['owner_id', 'payout', 'sub_paid_until', 'sub_grace_until', 'sub_reminded_at', 'payout_pending', 'payout_pending_at', 'payout_review'],
  hostels: ['id', 'owner_id', 'name', 'uni', 'area', 'km', 'dir', 'rating', 'n_rev', 'owner_name', 'verified', 'fee', 'visit', 'floors', 'cols', 'amen', 'rooms', 'about', 'seed', 'photo_url', 'status', 'review_note', 'suspend_reason', 'paused_for', 'review_sections', 'blocks', 'location', 'rules', 'photos', 'sems', 'views', 'saves', 'submitted_at', 'listed_at'],
  reviews: ['id', 'hostel_id', 'user_id', 'booking_id', 'who', 'stars', 'when', 'text', 'reply', 'hidden'],
  bookings: ['id', 'user_id', 'hostel_id', 'room', 'room_no', 'sem', 'fee', 'status', 'paid_on', 'cancel_until', 'at', 'pay_ref', 'rent', 'rent_paid_on'],
  saved: ['user_id', 'hostel_id'],
  rooms: ['id', 'hostel_id', 'no', 'block', 'floor', 'type', 'beds', 'status', 'unavailable_reason', 'unavailable_since'],
  tenants: ['id', 'hostel_id', 'name', 'room', 'type', 'status', 'end', 'phone', 'user_id', 'room_id', 'bed', 'booking_id'],
  visitors: ['id', 'hostel_id', 'name', 'room', 'host', 'phone', 'tin', 'tout', 'via', 'date'],
  notices: ['id', 'hostel_id', 'text', 'by', 'at'],
  notifications: ['id', 'user_id', 'kind', 'title', 'text', 'at', 'read', 'to'],
  invites: ['code', 'hostel_id', 'invited_by', 'email', 'name', 'used', 'at', 'cancelled'],
  docs: ['id', 'owner_id', 'hostel_id', 'kind', 'file_name', 'url', 'uploaded_at', 'status', 'note'],
  flags: ['id', 'hostel_id', 'reported_by', 'reason', 'text', 'at', 'status', 'note', 'kind', 'review_id', 'booking_id', 'outcome', 'resolved_at'],
  sub_payments: ['id', 'owner_id', 'amount', 'months', 'at', 'via', 'ref', 'note'],
  config: ['id', 'sub_fee', 'per_hostel', 'grace_days'],
  audit: ['id', 'at', 'actor_id', 'actor_role', 'action', 'target', 'detail'],
};
/** The key that identifies a row. */
const KEY: Record<string, string[]> = { invites: ['code'], saved: ['user_id', 'hostel_id'], owner_accounts: ['owner_id'] };
const keyOf = (t: string, r: Row) => (KEY[t] ?? ['id']).map(k => String(r[k])).join('|');
/** Tables in the order writes must happen (a hostel before its rooms, a room before its tenants). */
const ORDER = ['universities', 'config', 'profiles', 'owner_accounts', 'hostels', 'rooms', 'bookings', 'tenants', 'reviews', 'saved', 'visitors', 'notices', 'invites', 'docs', 'flags', 'sub_payments', 'notifications', 'audit'];

/** App object to table row: snake_case names, only real columns, empty values sent as null so they clear. */
function toRow(t: string, o: Record<string, unknown>): Row {
  const r: Row = {};
  for (const c of COLS[t]!) { const v = o[camel(c)]; r[c] = v === undefined ? null : v; }
  return r;
}
/** Table row to app object: camelCase names, nulls dropped so optional fields stay optional. */
function fromRow<T = never>(r: Row): T {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) if (v !== null && k !== 'seq') o[camel(k)] = v;
  return o as T;
}

/** The signed-in person's id, or null for a guest. */
export let authUid: string | null = null;
let snap = new Map<string, Map<string, string>>();
let me: User | null = null;

/** Turns the in-memory data into table rows, ready to compare or save. */
function rowsOf(db: DB): Record<string, Row[]> {
  const ownerFields = (u: User) => ({ ownerId: u.id, payout: u.payout, subPaidUntil: u.subPaidUntil, subGraceUntil: u.subGraceUntil, subRemindedAt: u.subRemindedAt,
    payoutPending: u.payoutPending, payoutPendingAt: u.payoutPendingAt, payoutReview: u.payoutReview ?? false });
  return {
    universities: db.universities.map(u => toRow('universities', u as never)),
    config: [toRow('config', { id: 1, ...db.config })],
    profiles: db.users.map(u => toRow('profiles', u as never)),
    owner_accounts: db.users.filter(u => u.role === 'owner' && ownerAccountIds.has(u.id)).map(u => toRow('owner_accounts', ownerFields(u))),
    hostels: db.hostels.map(h => toRow('hostels', h as never)),
    rooms: db.rooms.map(r => toRow('rooms', r as never)),
    bookings: db.bookings.map(b => toRow('bookings', b as never)),
    tenants: db.tenants.map(x => toRow('tenants', x as never)),
    reviews: db.reviews.map(x => toRow('reviews', x as never)),
    saved: Object.entries(db.saved).flatMap(([userId, ids]) => ids.map(hostelId => ({ user_id: userId, hostel_id: hostelId }))),
    visitors: db.visitors.map(x => toRow('visitors', x as never)),
    notices: db.notices.map(x => toRow('notices', x as never)),
    invites: db.invites.map(x => toRow('invites', x as never)),
    docs: db.docs.map(x => toRow('docs', { ...x, url: docStored.get(x.id) ?? x.url } as never)),
    flags: db.flags.map(x => toRow('flags', x as never)),
    sub_payments: db.subPayments.map(x => toRow('sub_payments', x as never)),
    notifications: db.notifications.map(x => toRow('notifications', x as never)),
    audit: db.audit.map(x => toRow('audit', x as never)),
  };
}
/** Documents kept in private storage: document id to the stored value ("storage:path"). On screen, url holds a short-lived link instead. */
const docStored = new Map<string, string>();
/** Swaps stored document paths for links that can be shown. PDFs get `link` and an empty url, as screens treat no url as a PDF. */
export async function presentDocs(docs: VerificationDoc[]) {
  const mine = docs.filter(d => d.url.startsWith(DOC_PREFIX)); if (!mine.length) return;
  const links = await docLinks(mine.map(d => d.url));
  for (const d of mine) {
    docStored.set(d.id, d.url); const l = links.get(d.url);
    if (/\.pdf$/i.test(d.fileName)) { d.url = ''; d.link = l; } else d.url = l ?? '';
  }
}
/** What the database holds as a document's file (a storage path), whatever link the screen shows. */
export const storedDocUrl = (d: VerificationDoc) => docStored.get(d.id) ?? d.url;
/** Owners whose private account row this person can see (themselves, or everyone for admins). */
let ownerAccountIds = new Set<string>();

/**
 * Whether this person may write a row. Mirrors the server's rules so we don't send writes that would be refused,
 * like a student's local "views" count on a hostel. `fresh` is true for a new row.
 */
function mayWrite(t: string, r: Row, fresh: boolean): boolean {
  if (!me) return false;
  const admin = me.role === 'admin'; const uid = me.id;
  const myHostel = (hid: unknown) => me!.role === 'custodian' ? me!.hostelId === hid : ownsHostel(hid);
  switch (t) {
    case 'universities': case 'config': return admin;
    case 'profiles': return admin || r.id === uid;
    case 'owner_accounts': return admin || r.owner_id === uid;
    case 'hostels': return admin || r.owner_id === uid || (me.role === 'custodian' && me.hostelId === r.id);
    case 'rooms': case 'tenants': case 'visitors': case 'notices': return admin || myHostel(r.hostel_id);
    case 'invites': return admin || ownsHostel(r.hostel_id);
    case 'bookings': return !fresh && (admin || r.user_id === uid || myHostel(r.hostel_id));
    case 'reviews': return fresh ? r.user_id === uid : admin || ownsHostel(r.hostel_id);
    case 'saved': return r.user_id === uid;
    case 'docs': return admin || r.owner_id === uid;
    case 'flags': return fresh ? r.reported_by === uid : admin;
    case 'sub_payments': return fresh && admin;
    case 'notifications': return fresh || r.user_id === uid;
    case 'audit': return fresh && r.actor_id === uid;
    default: return false;
  }
}
let hostelOwners = new Map<string, string>();
const ownsHostel = (hid: unknown) => !!me && hostelOwners.get(String(hid)) === me.id;

function takeSnapshot(db: DB) {
  snap = new Map(Object.entries(rowsOf(db)).map(([t, rows]) => [t, new Map(rows.map(r => [keyOf(t, r), JSON.stringify(r)]))]));
  hostelOwners = new Map(db.hostels.map(h => [h.id, h.ownerId ?? '']));
}

/** A plain-English message for a database error. Messages from Nestly's own rules are already plain English. */
export function friendly(e: { message?: string; code?: string } | null): string {
  const m = e?.message ?? 'Something went wrong. Try again.';
  if (/row-level security|permission denied/i.test(m)) return 'You do not have permission to do that.';
  if (/duplicate key/i.test(m)) return 'That already exists.';
  if (/violates foreign key/i.test(m)) return 'Something this depends on was removed. Refresh and try again.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'No connection. Check your internet and try again.';
  return m;
}
const RemoteError = ApiError;

/** Reads everything this person may see. Returns a fresh copy of the app's data. */
export async function load(empty: () => DB): Promise<DB> {
  const c = sb!;
  const { data: s } = await c.auth.getSession(); authUid = s.session?.user.id ?? null;
  const all = async (t: string, q?: (x: ReturnType<ReturnType<typeof c.from>['select']>) => unknown) => {
    let query = c.from(t).select('*') as ReturnType<ReturnType<typeof c.from>['select']>;
    if (q) query = q(query) as typeof query;
    const { data, error } = await query; if (error) throw new RemoteError(friendly(error)); return (data ?? []) as Row[];
  };
  const signed = !!authUid; const yesterday = ymd(new Date(Date.now() - 86400000));
  // Lists keep the order rows were added in (the "seq" number), like the demo data.
  // Reviews, notices, reports and saved hostels show the newest first.
  const inOrder = (t: string) => all(t, q => q.order('seq'));
  const newestFirst = (t: string) => all(t, q => q.order('seq', { ascending: false }));
  const [unis, cfg, hostels, reviews] = await Promise.all([inOrder('universities'), all('config'), inOrder('hostels'), newestFirst('reviews')]);
  const [profiles, accounts, bookings, saved, rooms, tenants, visitors, notices, notes, invites, docs, flags, subs, audit] = signed
    ? await Promise.all([inOrder('profiles'), all('owner_accounts'), inOrder('bookings'), newestFirst('saved'), inOrder('rooms'), inOrder('tenants'),
        all('visitors', q => q.gte('date', yesterday).order('seq')), newestFirst('notices'), all('notifications', q => q.order('at', { ascending: false }).limit(150)),
        inOrder('invites'), inOrder('docs'), newestFirst('flags'), all('sub_payments', q => q.order('at', { ascending: false })), all('audit', q => q.order('at', { ascending: false }).limit(400))])
    : Array.from({ length: 14 }, () => [] as Row[]);
  const db = empty();
  db.universities = unis.map(r => fromRow(r));
  if (cfg[0]) { const x = fromRow<Config & { id: number }>(cfg[0]); db.config = { subFee: x.subFee, perHostel: x.perHostel, graceDays: x.graceDays }; }
  db.hostels = hostels.map(r => fromRow(r)); db.reviews = reviews.map(r => fromRow(r));
  const acc = new Map(accounts.map(a => [a.owner_id as string, fromRow<Record<string, unknown>>(a)]));
  ownerAccountIds = new Set(acc.keys());
  db.users = profiles.map(p => { const u = fromRow<User>(p); const a = acc.get(u.id); if (a) { delete a.ownerId; Object.assign(u, a); } u.password = ''; return u; });
  // A booking whose payment is not finished is not a booking yet (the payments server function owns it).
  db.bookings = bookings.filter(r => r.status !== 'pending').map(r => fromRow(r)); db.rooms = rooms.map(r => fromRow(r)); db.tenants = tenants.map(r => fromRow(r));
  db.visitors = visitors.map(r => fromRow(r)); db.notices = notices.map(r => fromRow(r)); db.notifications = notes.map(r => fromRow(r));
  db.invites = invites.map(r => fromRow(r)); db.docs = docs.map(r => fromRow(r)); db.flags = flags.map(r => fromRow(r));
  db.subPayments = subs.map(r => fromRow(r)); db.audit = audit.map(r => fromRow(r));
  db.saved = {}; for (const r of saved) (db.saved[r.user_id as string] ??= []).push(r.hostel_id as string);
  await presentDocs(db.docs);
  me = db.users.find(u => u.id === authUid) ?? null;
  takeSnapshot(db);
  return db;
}

let chain: Promise<void> = Promise.resolve();
/** Writes every change since the last load or push. Writes run one batch at a time, in order. */
export function push(db: DB): Promise<void> {
  const run = chain.then(() => pushNow(db)); chain = run.catch(() => undefined); return run;
}
async function pushNow(db: DB) {
  if (!sb || !authUid) return;
  me = db.users.find(u => u.id === authUid) ?? me;
  const now = rowsOf(db); const c = sb;
  const writes: { t: string; inserts: Row[]; updates: Row[]; deletes: Row[]; full: Row[] }[] = [];
  for (const t of ORDER) {
    const before = snap.get(t) ?? new Map<string, string>(); const rows = now[t] ?? [];
    const seen = new Set<string>(); const inserts: Row[] = []; const updates: Row[] = []; const full: Row[] = [];
    for (const r of rows) {
      const k = keyOf(t, r); seen.add(k); const old = before.get(k);
      if (old === undefined) { if (mayWrite(t, r, true)) inserts.push(r); }
      else if (old !== JSON.stringify(r) && mayWrite(t, r, false)) {
        // Send only the columns that changed (plus the key), so someone else's recent edit to other fields is not overwritten.
        const was = JSON.parse(old) as Row; const patch: Row = {};
        for (const c of Object.keys(r)) if (JSON.stringify(r[c]) !== JSON.stringify(was[c]) || (KEY[t] ?? ['id']).includes(c)) patch[c] = r[c];
        updates.push(patch); full.push(r);
      }
    }
    const deletes = [...before.entries()].filter(([k]) => !seen.has(k)).map(([, j]) => JSON.parse(j) as Row).filter(r => mayWrite(t, r, false));
    if (inserts.length || updates.length || deletes.length) writes.push({ t, inserts, updates, deletes, full });
  }
  if (!writes.length) return;
  const keys = (t: string) => KEY[t] ?? ['id'];
  for (const w of writes) {
    // Server-kept counts and dates are left out of updates so the browser never overwrites them.
    const strip = (r: Row) => { const x = { ...r }; if (w.t === 'hostels') { delete x.views; delete x.saves; delete x.rating; delete x.n_rev; } return x; };
    // New rows: empty fields are left out so the database fills in its defaults (like "not hidden").
    const noNulls = (r: Row) => Object.fromEntries(Object.entries(strip(r)).filter(([, v]) => v !== null));
    if (w.inserts.length) { const { error } = await c.from(w.t).insert(w.inserts.map(noNulls), { defaultToNull: false }); if (error) throw new RemoteError(friendly(error)); }
    for (const r of w.updates) {
      const patch = strip(r); if (Object.keys(patch).every(k => keys(w.t).includes(k))) continue;
      let q = c.from(w.t).update(patch); for (const k of keys(w.t)) q = q.eq(k, r[k] as string);
      const { error } = await q; if (error) throw new RemoteError(friendly(error));
    }
  }
  for (const w of writes.slice().reverse()) for (const r of w.deletes) {
    let q = c.from(w.t).delete(); for (const k of keys(w.t)) q = q.eq(k, r[k] as string);
    const { error } = await q; if (error) throw new RemoteError(friendly(error));
  }
  // The server fills in some hostel fields itself (status of a new listing, booked counts, ratings).
  // Read back every hostel these writes touched, so the screen shows what is really saved.
  const touched = new Set<string>();
  for (const w of writes) for (const r of [...w.inserts, ...w.full, ...w.deletes]) {
    if (w.t === 'hostels') touched.add(String(r.id));
    else if (['rooms', 'tenants', 'bookings', 'reviews'].includes(w.t) && r.hostel_id) touched.add(String(r.hostel_id));
  }
  if (touched.size) {
    const { data } = await c.from('hostels').select('*').in('id', [...touched]);
    for (const row of data ?? []) {
      const h = db.hostels.find(x => x.id === row.id) as unknown as Record<string, unknown> | undefined; if (!h) continue;
      const fresh = fromRow<Record<string, unknown>>(row);
      for (const k of Object.keys(h)) if (!(k in fresh)) delete h[k];
      Object.assign(h, fresh);
    }
  }
  takeSnapshot(db);
}
/** Treats the data as it is now as saved. Used after load, once the app has tidied it (distances, bed counts). */
export function rebase(db: DB) { takeSnapshot(db); }

/** Forgets snapshot state, used when signing out. */
export function resetRemote() { authUid = null; me = null; snap = new Map(); ownerAccountIds = new Set(); docStored.clear(); }
/** A new 15-minute link for a private document, made when someone opens it (the first link may have expired). */
export async function freshDocLink(d: VerificationDoc): Promise<string | undefined> {
  const stored = storedDocUrl(d); if (!stored.startsWith(DOC_PREFIX)) return d.url || d.link;
  return (await docLinks([stored])).get(stored);
}
