/**
 * The only file the screens talk to for data. Each function is async and waits a little,
 * like a real network call, so loading states are designed from day one.
 * Swap the bodies for Supabase calls later; keep the names and return shapes.
 */
import type { Config, FlagKind, FlagOutcome, SubPayment, Semester, AuditEntry, Booking, Flag, Hostel, HostelStatus, Mail, Notification, Room, RoomType, Tenant, University, User, VerificationDoc } from '../data/types';
import { nowTime, sleep } from '../lib/format';
import { storage } from '../lib/storage';
import { commit, getDb, onFreshData } from './db';
import { bearing, distanceKm, offset, type LatLng } from '../lib/geo';

const SESSION = 'nestly.session';
const wait = (ms = 450) => sleep(ms);
const id = (p: string) => p + Math.random().toString(36).slice(2, 8);
const isoNow = () => new Date().toISOString();
const todayIso = () => new Date().toISOString().slice(0, 10);
/** The semester students are asked to book again for on the Bookings page. */
export const NEXT_SEM = 'Jan to May 2027';
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const d0 = (s: string) => new Date(s + 'T00:00:00');
/** "Jan to May 2027". Named from the dates, so the same semester has the same name at every hostel. */
export const semName = (s: Semester) => { const a = d0(s.start), b = d0(s.end); return `${MON[a.getMonth()]}${a.getFullYear() !== b.getFullYear() ? ` ${a.getFullYear()}` : ''} to ${MON[b.getMonth()]} ${b.getFullYear()}`; };
/** "11 Jan to 14 May 2027" */
export const semDates = (s: Semester) => { const f = (x: Date) => `${x.getDate()} ${MON[x.getMonth()]}`; const a = d0(s.start), b = d0(s.end); return `${f(a)}${a.getFullYear() !== b.getFullYear() ? ` ${a.getFullYear()}` : ''} to ${f(b)} ${b.getFullYear()}`; };
/** UCU's calendar, used until the owner sets their own dates. */
const DEFAULT_SEMS: Semester[] = [{ start: '2027-01-11', end: '2027-05-14', open: true }, { start: '2027-08-09', end: '2027-12-10', open: false }];
/** A university's calendar as semesters. The first one that has not ended is open for booking. */
export function uniSems(uid?: string): Semester[] | null {
  const u = getDb().universities.find(x => x.id === uid); if (!u?.sems?.length) return null;
  const today = todayIso(); let opened = false;
  return u.sems.slice().sort((x, y) => x.start.localeCompare(y.start)).map(s => { const open = !opened && s.end >= today; if (open) opened = true; return { ...s, open }; });
}
/** The hostel's own dates, else its university's calendar, else the UCU default. */
export const hostelSems = (h: Hostel) => (h.sems?.length ? h.sems : uniSems(h.uni) ?? DEFAULT_SEMS).slice().sort((x, y) => x.start.localeCompare(y.start));
/** Bookings already made for one semester at a hostel. */
export const semBookings = (hid: string, s: Semester) => getDb().bookings.filter(b => b.hostelId === hid && b.sem === semName(s) && b.status !== 'cancelled').length;
/** The semester students can book at this hostel now: the first open one that has not ended. */
export const bookingSem = (h: Hostel) => { const today = new Date().toISOString().slice(0, 10); return hostelSems(h).find(s => s.open && s.end >= today) ?? null; };

export class ApiError extends Error { constructor(msg: string, public field?: string) { super(msg); } }

const safe = (u: User): User => ({ ...u, password: '' });
function notify(userId: string | undefined, n: Omit<Notification, 'id' | 'userId' | 'at' | 'read'>) {
  if (!userId) return;
  getDb().notifications.unshift({ id: id('nt'), userId, at: isoNow(), read: false, ...n });
}
const custodiansOf = (hostelId: string) => getDb().users.filter(u => u.role === 'custodian' && u.hostelId === hostelId);

/* ---------- Auth ---------- */
export function sessionUser(): User | null {
  const uid = storage.get<string | null>(SESSION, null);
  const u = uid ? getDb().users.find(x => x.id === uid) : null;
  return u && !u.suspended ? safe(u) : null;
}
/** Logs someone in. Takes an email or username and a password. Returns the user, or throws ApiError with `field` set to "id" or "pw". */
export async function login(idOrEmail: string, password: string) {
  await wait(600);
  const key = idOrEmail.trim().toLowerCase();
  const u = getDb().users.find(x => x.email.toLowerCase() === key || x.username?.toLowerCase() === key);
  if (!u) throw new ApiError('We could not find an account with that email or username.', 'id');
  if (u.password !== password) throw new ApiError('That password is not right. Try again or reset it.', 'password');
  if (u.suspended) throw new ApiError('Your account is paused. Contact support@nestly.app.', 'id');
  u.lastActive = isoNow();
  storage.set(SESSION, u.id); commit();
  return safe(u);
}
/** Ends the session on this device. */
export async function logout() { await wait(200); storage.remove(SESSION); commit(); }
/** Sends a reset link if the email has an account. Always looks successful, so it never reveals who has an account. */
export async function requestPasswordReset(email: string) {
  await wait(500);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ApiError('Enter the email you signed up with.', 'email');
}

/** Every university Nestly supports, straight away (no loading). */
export const allUniversities = () => getDb().universities;
/** One university by id, or undefined. */
export function universityById(uid?: string) { return getDb().universities.find(u => u.id === uid); }
/** True when the email ends with that university's student domain, like @ucu.ac.ug. */
export function emailMatchesUniversity(email: string, uniId: string) {
  const u = universityById(uniId); const e = email.trim().toLowerCase();
  return !!u && (e.endsWith('@' + u.domain) || e.endsWith('.' + u.domain));
}
/** Every university, for the admin Universities page. */
export async function listUniversities() { await wait(200); return getDb().universities.slice(); }

function sendVerification(u: User) {
  const token = id('tok');
  const mail: Mail = { id: id('m'), to: u.email, token, when: nowTime(), subject: 'Confirm your student email',
    body: `Hi ${u.name.split(' ')[0]}, click the button below to confirm you are a student at ${universityById(u.universityId)?.name}. The link expires in 24 hours.` };
  getDb().mail.unshift(mail);
}
/** Creates a student account and emails a confirmation link. Takes university, name, email, optional phone and password. Returns the new user. */
export async function signupStudent(input: { uniId: string; name: string; email: string; phone?: string; password: string }) {
  await wait(700);
  const db = getDb(); const email = input.email.trim().toLowerCase();
  if (!emailMatchesUniversity(email, input.uniId)) throw new ApiError(`Use your ${universityById(input.uniId)?.short} student email. It must end with ${universityById(input.uniId)?.domain}.`, 'email');
  if (db.users.some(u => u.email.toLowerCase() === email)) throw new ApiError('An account with this email already exists. Log in instead.', 'email');
  const u: User = { id: id('u'), role: 'student', name: input.name.trim(), email, phone: input.phone || undefined, password: input.password, universityId: input.uniId, emailVerified: false };
  db.users.push(u); sendVerification(u); storage.set(SESSION, u.id); commit();
  return safe(u);
}
/** Sends the student email confirmation again. */
export async function resendVerification(userId: string) {
  await wait(500); const u = getDb().users.find(x => x.id === userId)!;
  getDb().mail = getDb().mail.filter(m => m.to !== u.email); sendVerification(u); commit();
}
/** Demo only: the emails "sent" to an address, so the demo inbox can show them. A real backend sends real email instead. */
export async function inbox(email: string) { await wait(250); return getDb().mail.filter(m => m.to === email); }
/** Confirms a student email from the link token. Returns the user. */
export async function confirmEmail(token: string) {
  await wait(600); const db = getDb();
  const m = db.mail.find(x => x.token === token); if (!m) throw new ApiError('This link has expired. Ask for a new one.');
  const u = db.users.find(x => x.email === m.to)!; u.emailVerified = true; u.verifiedUntil = '31 Aug 2027';
  db.mail = db.mail.filter(x => x.id !== m.id); commit(); return safe(u);
}

/** Checks a custodian invite code. Returns the invite and its hostel, or throws ApiError if it is wrong, used or expired. */
export async function lookupInvite(code: string) {
  await wait(500);
  const inv = getDb().invites.find(i => i.code.toUpperCase() === code.trim().toUpperCase());
  if (!inv) throw new ApiError('That invite code is not valid. Check it with the hostel owner.', 'code');
  if (inv.used) throw new ApiError('This invite has already been used.', 'code');
  return { ...inv, hostel: getDb().hostels.find(h => h.id === inv.hostelId)! };
}
/** Creates the custodian account from an invite code. Takes name, username and password. Returns the new user. */
export async function acceptInvite(code: string, input: { name: string; username: string; password: string }) {
  await wait(700); const db = getDb();
  const inv = db.invites.find(i => i.code.toUpperCase() === code.trim().toUpperCase());
  if (!inv || inv.used) throw new ApiError('This invite is no longer valid.');
  const uname = input.username.trim().toLowerCase();
  if (db.users.some(u => u.username?.toLowerCase() === uname)) throw new ApiError('That username is taken. Try another.', 'username');
  const viaSms = inv.email.endsWith('@sms.nestly.app');
  const u: User = { id: id('u'), role: 'custodian', name: input.name.trim(), username: uname, email: inv.email, phone: viaSms ? inv.email.split('@')[0] : undefined, password: input.password, emailVerified: true, hostelId: inv.hostelId, joined: isoNow(), lastActive: isoNow() };
  db.users.push(u); inv.used = true; storage.set(SESSION, u.id); commit(); return safe(u);
}

/* ---------- Profile and settings ---------- */
export async function usernameAvailable(name: string, selfId: string) {
  await wait(250); const n = name.trim().toLowerCase();
  return !getDb().users.some(u => u.id !== selfId && u.username?.toLowerCase() === n);
}
/** Saves profile changes: name, username, email, phone or photo. Returns nothing. */
export async function updateProfile(userId: string, patch: Partial<Pick<User, 'name' | 'username' | 'email' | 'phone' | 'photo'>>) {
  await wait(600); const db = getDb(); const u = db.users.find(x => x.id === userId)!;
  if (patch.username !== undefined) {
    const n = patch.username.trim().toLowerCase();
    if (!/^[a-z0-9._]{3,20}$/.test(n)) throw new ApiError('Use 3 to 20 letters, numbers, dots or underscores.', 'username');
    if (db.users.some(x => x.id !== userId && x.username?.toLowerCase() === n)) throw new ApiError('That username is taken.', 'username');
    patch.username = n;
  }
  if (patch.email !== undefined && patch.email !== u.email) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(patch.email)) throw new ApiError('Enter a full email address.', 'email');
    if (db.users.some(x => x.id !== userId && x.email === patch.email)) throw new ApiError('Another account uses this email.', 'email');
  }
  Object.assign(u, patch); commit(); return safe(u);
}
/** Changes the password after checking the current one. Throws ApiError on a wrong current password. */
export async function changePassword(userId: string, current: string, next: string) {
  await wait(700); const u = getDb().users.find(x => x.id === userId)!;
  if (u.password !== current) throw new ApiError('Your current password is not right.', 'current');
  if (current === next) throw new ApiError('Choose a password you have not used here before.', 'next');
  u.password = next; commit();
}

/* ---------- Hostels ---------- */
export const hostelById = (hid: string) => getDb().hostels.find(h => h.id === hid);
const isLive = (h: Hostel) => (h.status ?? 'live') === 'live';
/** Live hostels near a university, for Explore. */
export async function listHostels(uniId: string) { await wait(350); return getDb().hostels.filter(h => h.uni === uniId && isLive(h)); }
/** One hostel and its visible reviews, for the hostel page. Also counts a view. Throws if the hostel does not exist. */
export async function getHostel(hid: string) { await wait(300); const h = hostelById(hid); if (!h) throw new ApiError('Hostel not found'); h.views = (h.views ?? 0) + 1; return { hostel: h, reviews: getDb().reviews.filter(r => r.hostelId === hid && !r.hidden) }; }
/** The cheapest room type price per semester, or 0. */
export const minPrice = (h: Hostel) => (h.rooms.length ? Math.min(...h.rooms.map(r => r.price)) : 0);
/** How many rooms are still free across all room types. */
export const roomsLeft = (h: Hostel) => h.rooms.reduce((a, r) => a + r.total - r.taken, 0);

/** The ids of hostels a student saved. */
export function savedIds(userId: string) { return getDb().saved[userId] ?? []; }
/** Saves or unsaves a hostel for a student. Also counts saves for the owner. */
export async function toggleSaved(userId: string, hid: string) {
  const list = getDb().saved[userId] ?? (getDb().saved[userId] = []);
  const i = list.indexOf(hid); if (i >= 0) list.splice(i, 1); else { list.unshift(hid); const h = hostelById(hid); if (h) h.saves = (h.saves ?? 0) + 1; }
  commit(); return i < 0;
}
/** The live hostels a student saved. */
export async function listSaved(userId: string) { await wait(300); return (savedIds(userId).map(hostelById).filter(Boolean) as Hostel[]).filter(isLive); }

/* ---------- Bookings ---------- */
export async function listBookings(userId: string) {
  await wait(350);
  return getDb().bookings.filter(b => b.userId === userId).slice().reverse().map(b => ({ ...b, hostel: hostelById(b.hostelId)! }));
}
/** True when the student already has an active booking for that semester. */
export const hasBookingFor = (userId: string, sem: string) => getDb().bookings.some(b => b.userId === userId && b.sem === sem && b.status !== 'cancelled');
/** Books a room and takes the booking fee by mobile money. Takes student, hostel, room type index, phone and network. Returns the booking. The fee goes straight to the owner. Throws ApiError if the payment fails or the room is gone. */
export async function createBooking(userId: string, hid: string, roomIdx: number, phone: string, method: 'mtn' | 'airtel') {
  await wait(2200);
  const u = getDb().users.find(x => x.id === userId)!; const h = hostelById(hid)!; const r = h.rooms[roomIdx]!;
  if (!u.emailVerified) throw new ApiError('Confirm your student email before booking.');
  const sem = bookingSem(h); if (!sem) throw new ApiError(`${h.name} is not taking bookings right now.`);
  const SEM = semName(sem);
  if (hasBookingFor(userId, SEM)) throw new ApiError('You already have a booking for this semester.');
  if (r.taken >= r.total) throw new ApiError('Someone just took the last room of this type. Pick another.');
  const ph = phone.replace(/[\s-]/g, '');
  if (!/^07\d{8}$/.test(ph) && !/^\+?2567\d{8}$/.test(ph)) throw new ApiError('Enter a mobile money number, like 0772 123 456 or +256 772 123 456.', 'phone');
  // Demo: a number ending in 0000 is declined, so the "payment failed, try again" path can be shown.
  if (ph.endsWith('0000')) throw new ApiError('The payment was declined. You were not charged. Check your balance, then try again.');
  r.taken++;
  const d = new Date(); const until = new Date(d.getTime() + 48 * 3600e3);
  const b: Booking = { id: 'NST-' + (32100 + Math.floor(Math.random() * 800)), userId, hostelId: hid, room: r.t, sem: SEM, fee: h.fee, status: 'paid', at: d.toISOString(),
    payRef: `${method === 'mtn' ? 'MP' : 'AM'}${String(Date.now()).slice(-6)}.${Math.floor(1000 + Math.random() * 8999)}`,
    paidOn: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }), cancelUntil: until.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) };
  getDb().bookings.push(b);
  // The student now waits for the custodian to give them a room.
  getDb().tenants.push({ id: id('t'), hostelId: hid, name: u.name, phone: u.phone ?? phone, type: r.t, status: 'due', room: '', end: d0(sem.end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }), userId, bookingId: b.id });
  notify(userId, { kind: 'booking', title: 'Booking confirmed', text: `${h.name}, ${SEM}. Ref ${b.id}.`, to: '/s/bookings' });
  notify(h.ownerId, { kind: 'booking', title: `New booking at ${h.name}`, text: `${u.name} booked a ${r.t.toLowerCase()} room for ${SEM}.`, to: '/o/bookings' });
  custodiansOf(hid).forEach(c => notify(c.id, { kind: 'tenant', title: `${u.name} needs a room`, text: `Booked a ${r.t.toLowerCase()} room. Give them a room on the Rooms page.`, to: '/c/rooms' }));
  syncTypeCounts(hid); commit(); return b;
}
/** Cancels a booking and frees the room. The owner sends the fee back. Returns the booking. */
export async function cancelBooking(bid: string) {
  await wait(700); const b = getDb().bookings.find(x => x.id === bid)!;
  b.status = 'cancelled'; const r = hostelById(b.hostelId)!.rooms.find(x => x.t === b.room); if (r) r.taken--;
  getDb().tenants = getDb().tenants.filter(t => !(t.bookingId === b.id && t.status === 'due'));
  syncTypeCounts(b.hostelId); commit(); return b;
}
/** Adds the student's stars and review after a stay. */
export async function rateBooking(bid: string, stars: number, text: string, who: string) {
  await wait(600); const db = getDb(); const b = db.bookings.find(x => x.id === bid)!;
  db.reviews.unshift({ id: id('v'), hostelId: b.hostelId, who, stars, when: new Date().toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }), text: text || 'No comment.' });
  b.status = 'rated'; hostelById(b.hostelId)!.nRev++; commit();
}

/* ---------- My hostel (student) ---------- */
export function currentStay(userId: string) {
  const b = getDb().bookings.slice().reverse().find(x => x.userId === userId && x.status === 'checked-in');
  return b ? { booking: b, hostel: hostelById(b.hostelId)! } : null;
}
/** Where a student lives now: hostel, room, custodian contacts and notices. Returns null if they have not checked in anywhere. */
export async function myHostel(userId: string) {
  await wait(350); const stay = currentStay(userId); if (!stay) return null;
  const db = getDb();
  const t = db.tenants.find(x => x.bookingId === stay.booking.id);
  const endLabel = t && !t.end.startsWith('Left') ? t.end : stay.booking.sem.includes('2027') ? '15 May 2027' : '15 Dec 2026';
  const end = new Date(endLabel + ' 12:00');
  return { ...stay, notices: db.notices.filter(n => n.hostelId === stay.hostel.id),
    custodian: db.users.find(u => u.role === 'custodian' && u.hostelId === stay.hostel.id && !u.suspended),
    daysLeft: Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86400000)), endLabel,
    unreadNotices: db.notifications.filter(n => n.userId === userId && n.kind === 'notice' && !n.read).length };
}

/* ---------- Custodian ---------- */
/** Everything the custodian's Today screen needs: who is inside, who arrives, and rooms out of use. */
export async function custodianDay(hostelId: string) {
  await wait(300); const db = getDb(); const today = todayIso();
  const occ = occupancy(hostelId);
  const visits = db.visitors.filter(v => v.hostelId === hostelId && v.date === today);
  return {
    hostel: hostelById(hostelId)!,
    inside: visits.filter(v => !v.tout).sort((a, b) => a.tin.localeCompare(b.tin)),
    visitsToday: visits.length,
    arriving: db.tenants.filter(t => t.hostelId === hostelId && t.status === 'due').sort((a, b) => Number(!!a.roomId) - Number(!!b.roomId)),
    freeBeds: occ.filter(r => r.room.status === 'ready').reduce((a, r) => a + r.free, 0),
    offRooms: db.rooms.filter(r => r.hostelId === hostelId && r.status === 'unavailable')
      .map(r => ({ room: r, days: r.unavailableSince ? Math.floor((Date.now() - +new Date(r.unavailableSince)) / 86400000) : 0 })).sort((a, b) => b.days - a.days),
  };
}
/** Today's visitors at a hostel, newest first. */
export async function listVisitors(hostelId: string) { await wait(300); return getDb().visitors.filter(v => v.hostelId === hostelId).slice().reverse(); }
/** Signs a visitor in, from the gate QR or by the custodian. Takes name, room, who they visit and phone. Returns the visitor. */
export async function signInVisitor(hostelId: string, input: { name: string; room: string; host?: string; phone?: string }, via: 'QR' | 'Custodian') {
  await wait(500); const v = { id: id('vs'), hostelId, ...input, tin: nowTime(), tout: null, via, date: todayIso() }; getDb().visitors.push(v); commit(); return v;
}
/** Marks a visitor as left. */
export async function signOutVisitor(vid: string) { await wait(300); const v = getDb().visitors.find(x => x.id === vid)!; v.tout = nowTime(); commit(); }
/** Puts a visitor back inside, for the Undo button. */
export async function undoSignOut(vid: string) { await wait(150); const v = getDb().visitors.find(x => x.id === vid)!; v.tout = null; commit(); }
/** Every tenant of a hostel: arriving, staying and left. */
export async function listTenants(hostelId: string) { await wait(300); return getDb().tenants.filter(t => t.hostelId === hostelId); }
/** Checks a tenant in or out. */
export async function setTenantStatus(tid: string, status: 'in' | 'out') {
  await wait(400); const db = getDb(); const t = db.tenants.find(x => x.id === tid)!;
  if (status === 'in' && !t.roomId) throw new ApiError(`Give ${t.name.split(' ')[0]} a room first.`);
  t.status = status;
  const b = db.bookings.find(x => x.id === t.bookingId);
  if (status === 'in' && b) { b.status = 'checked-in'; b.roomNo = t.room; }
  if (status === 'out') {
    t.end = 'Left ' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    if (b && b.status === 'checked-in') b.status = 'completed';
    t.roomId = undefined; t.bed = undefined; // the bed is free again
  }
  syncTypeCounts(t.hostelId); commit(); return t;
}
/** Notices a custodian posted to a hostel. */
export async function listNotices(hostelId: string) { await wait(250); return getDb().notices.filter(n => n.hostelId === hostelId); }
/** Posts a notice to every tenant of a hostel and notifies them. */
export async function postNotice(hostelId: string, text: string, by: string) {
  await wait(500); const db = getDb(); db.notices.unshift({ id: id('n'), hostelId, text, by, at: isoNow() });
  db.tenants.filter(t => t.hostelId === hostelId && t.status === 'in' && t.userId).forEach(t => notify(t.userId, { kind: 'notice', title: `New notice at ${hostelById(hostelId)?.name}`, text, to: '/s/my-hostel' }));
  commit();
}

/* ---------- Notifications ---------- */
export async function listNotifications(userId: string) { await wait(200); return getDb().notifications.filter(n => n.userId === userId); }
/** Marks one notification as read. */
export async function markRead(nid: string) { const n = getDb().notifications.find(x => x.id === nid); if (n && !n.read) { n.read = true; commit(); } }
/** Marks all of a person's notifications as read. */
export async function markAllRead(userId: string) { await wait(150); getDb().notifications.forEach(n => { if (n.userId === userId) n.read = true; }); commit(); }


/* ---------- Quick search ---------- */
export type SearchHit = { id: string; title: string; sub: string; to: string; kind: 'page' | 'hostel' | 'tenant' | 'visitor' };
/** The search box in the page header. Searches what that role is allowed to see. Returns a short list of hits with links. */
export async function quickSearch(user: User, q: string): Promise<SearchHit[]> {
  await wait(120); const s = q.trim().toLowerCase(); const db = getDb();
  const PAGES: Record<User['role'], string[][]> = {
    student: [['Explore', '/s/explore'], ['Saved', '/s/saved'], ['Bookings', '/s/bookings'], ['My Hostel', '/s/my-hostel'], ['Account', '/s/account'], ['Help', '/s/help']],
    custodian: [['Today', '/c/today'], ['Visitors', '/c/visitors'], ['Tenants', '/c/tenants'], ['Rooms', '/c/rooms'], ['Notices', '/c/notices'], ['Settings', '/c/settings'], ['Help', '/c/help']],
    owner: [['Overview', '/o/overview'], ['Hostels', '/o/hostels'], ['Bookings', '/o/bookings'], ['Money', '/o/money'], ['Staff', '/o/staff'], ['Settings', '/o/settings'], ['Help', '/o/help']],
    admin: [['Overview', '/a/overview'], ['Reviews', '/a/reviews'], ['Hostels', '/a/hostels'], ['Users', '/a/users'], ['Flags', '/a/flags'], ['Subscriptions', '/a/subscriptions'], ['Universities', '/a/universities'], ['Activity log', '/a/activity'], ['Settings', '/a/settings']],
  };
  const pages: SearchHit[] = PAGES[user.role].map(([t, to]) => ({ id: to!, title: t!, sub: 'Page', to: to!, kind: 'page' as const }));
  const mine = user.role === 'owner' ? db.hostels.filter(h => h.ownerId === user.id) : [];
  const extra: SearchHit[] = user.role === 'student'
    ? db.hostels.filter(isLive).map(h => ({ id: h.id, title: h.name, sub: `${h.area} · ${universityById(h.uni)?.short}`, to: `/s/explore/${h.id}`, kind: 'hostel' as const }))
    : user.role === 'owner'
    ? [...mine.map(h => ({ id: h.id, title: h.name, sub: `Your hostel · ${STATUS_LABEL[h.status ?? 'live']}`, to: `/o/hostels/${h.id}`, kind: 'hostel' as const })),
       ...db.bookings.filter(b => mine.some(h => h.id === b.hostelId)).map(b => ({ id: b.id, title: db.users.find(u => u.id === b.userId)?.name ?? b.id, sub: `Booking ${b.id} · ${hostelById(b.hostelId)?.name}`, to: '/o/bookings', kind: 'tenant' as const }))]
    : user.role === 'admin'
    ? [...db.hostels.map(h => ({ id: h.id, title: h.name, sub: `Hostel · ${STATUS_LABEL[h.status ?? 'live']}`, to: `/a/hostels?h=${h.id}`, kind: 'hostel' as const })),
       ...db.users.filter(u => u.role !== 'admin').map(u => ({ id: u.id, title: u.name, sub: `${ROLE_LABEL[u.role]} · ${u.email}`, to: `/a/users?u=${u.id}`, kind: 'tenant' as const }))]
    : [...db.tenants.filter(t => t.hostelId === user.hostelId).map(t => ({ id: t.id, title: t.name, sub: `Tenant · Room ${t.room}`, to: '/c/tenants', kind: 'tenant' as const })),
       ...db.visitors.filter(v => v.hostelId === user.hostelId).map(v => ({ id: v.id, title: v.name, sub: `Visitor · ${v.room} · in ${v.tin}`, to: '/c/visitors', kind: 'visitor' as const }))];
  const all = [...pages, ...extra];
  return s ? all.filter(x => (x.title + ' ' + x.sub).toLowerCase().includes(s)).slice(0, 12) : pages;
}

/* =====================================================================
   Rooms and beds
   ===================================================================== */
export type RoomState = 'occupied' | 'partly' | 'free' | 'reserved' | 'unavailable';
/** A room with who sleeps in each bed and how many beds are free. */
export type RoomOcc = { room: Room; beds: (Tenant | null)[]; free: number; state: RoomState };

/** Who sleeps where, worked out from tenants. Arrivals with a room count as reserved. */
function occupancy(hostelId: string): RoomOcc[] {
  const db = getDb();
  const ts = db.tenants.filter(t => t.hostelId === hostelId && t.roomId && t.status !== 'out');
  return db.rooms.filter(r => r.hostelId === hostelId).sort((a, b) => a.no.localeCompare(b.no)).map(room => {
    const beds: (Tenant | null)[] = Array.from({ length: room.beds }, (_, i) => ts.find(t => t.roomId === room.id && (t.bed ?? 0) === i) ?? null);
    const free = beds.filter(b => !b).length; const taken = room.beds - free;
    const state: RoomState = room.status === 'unavailable' ? 'unavailable' : taken === 0 ? 'free'
      : beds.some(b => b?.status === 'due') && beds.every(b => !b || b.status === 'due') ? 'reserved' : free > 0 ? 'partly' : 'occupied';
    return { room, beds, free, state };
  });
}
/** Keeps the room-type counts students see ("8 left") in step with real beds, for hostels that have rooms set up. */
function syncTypeCounts(hostelId: string) {
  const db = getDb(); const h = hostelById(hostelId); if (!h) return;
  const rooms = db.rooms.filter(r => r.hostelId === hostelId); if (!rooms.length) return;
  const ts = db.tenants.filter(t => t.hostelId === hostelId && t.status !== 'out');
  h.rooms.forEach(rt => {
    const mine = rooms.filter(r => r.type === rt.t);
    rt.total = mine.filter(r => r.status === 'ready').reduce((a, r) => a + r.beds, 0);
    rt.taken = Math.min(rt.total, ts.filter(t => t.type === rt.t).length);
  });
}
function audit(action: string, target: string, detail = '') {
  const me = sessionUser(); if (!me) return;
  getDb().audit.unshift({ id: id('a'), at: isoNow(), actorId: me.id, actorRole: me.role, action, target, detail });
}
const adminIds = () => getDb().users.filter(u => u.role === 'admin').map(u => u.id);

/** Every room of a hostel with its beds, plus students waiting for a room. */
export async function listRoomsWithOccupancy(hostelId: string) {
  await wait(300); const db = getDb();
  return { rooms: occupancy(hostelId), waiting: db.tenants.filter(t => t.hostelId === hostelId && t.status === 'due' && !t.roomId), hostel: hostelById(hostelId)! };
}
/** Takes a room out of use (with a reason) or puts it back. */
export async function setRoomAvailability(roomId: string, ready: boolean, reason?: string) {
  await wait(300); const db = getDb(); const r = db.rooms.find(x => x.id === roomId)!; const h = hostelById(r.hostelId)!;
  if (!ready && !reason?.trim()) throw new ApiError('Say why the room cannot be used.', 'reason');
  if (!ready && occupancy(r.hostelId).find(o => o.room.id === roomId)!.free < r.beds) throw new ApiError('Move the people in this room first.');
  r.status = ready ? 'ready' : 'unavailable';
  if (ready) { r.unavailableReason = undefined; r.unavailableSince = undefined; } else { r.unavailableReason = reason!.trim(); r.unavailableSince = isoNow(); }
  audit(ready ? 'Room ready' : 'Room not available', `${h.name}, ${r.no}`, ready ? 'Back in use' : r.unavailableReason!);
  syncTypeCounts(r.hostelId); commit();
}
/** Gives a tenant a bed in a room. */
export async function assignRoom(tenantId: string, roomId: string, bed: number) {
  await wait(400); const db = getDb(); const t = db.tenants.find(x => x.id === tenantId)!; const r = db.rooms.find(x => x.id === roomId)!;
  const o = occupancy(r.hostelId).find(x => x.room.id === roomId)!;
  if (r.status !== 'ready') throw new ApiError('That room is not available.');
  if (o.beds[bed]) throw new ApiError('That bed was just taken. Pick another.');
  t.roomId = r.id; t.bed = bed; t.room = r.no;
  notify(t.userId, { kind: 'tenant', title: `Your room is ${r.no}`, text: `${hostelById(r.hostelId)?.name} has a room ready for you.`, to: '/s/bookings' });
  audit('Gave a room', `${hostelById(r.hostelId)?.name}, ${r.no}`, t.name);
  syncTypeCounts(r.hostelId); commit(); return t;
}
/** Moves a tenant to another bed, with a reason. */
export async function moveTenant(tenantId: string, roomId: string, bed: number, reason: string) {
  await wait(400); const db = getDb(); const t = db.tenants.find(x => x.id === tenantId)!; const r = db.rooms.find(x => x.id === roomId)!;
  if (!reason.trim()) throw new ApiError('Say why they are moving.', 'reason');
  const o = occupancy(r.hostelId).find(x => x.room.id === roomId)!;
  if (r.status !== 'ready' || o.beds[bed]) throw new ApiError('That bed is not free.');
  const from = t.room; t.roomId = r.id; t.bed = bed; t.room = r.no;
  const b = db.bookings.find(x => x.id === t.bookingId); if (b && b.status === 'checked-in') b.roomNo = r.no;
  audit('Moved tenant', `${hostelById(r.hostelId)?.name}, ${from} to ${r.no}`, `${t.name}: ${reason.trim()}`);
  syncTypeCounts(r.hostelId); commit(); return t;
}

/* =====================================================================
   Owner
   ===================================================================== */
/** Nestly's share of each booking fee. PLACEHOLDER: the group must confirm the real rate before launch. */
const ugxPlain = (n: number) => `UGX ${n.toLocaleString('en-US')}`;
/** Nestly earns from owners' monthly subscriptions only. Booking fees go straight to the owner. The price is set by an admin. */
const SUBSCRIPTION_FEE = 50_000;
/** The subscription price settings the admin chose. */
export const subConfig = (): Config => getDb().config ?? { subFee: SUBSCRIPTION_FEE, perHostel: true, graceDays: 7 };
const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const DAY = 86400000;
/** Hostels an owner pays for: listed ones, including ones that are paused. */
export const billableHostels = (ownerId: string) => getDb().hostels.filter(h => h.ownerId === ownerId && (h.status === 'live' || h.status === 'suspended')).length;
/** paid: fine. due: due within 7 days. grace: past due but inside the grace period. late: past the grace period. off: not an approved owner. */
export type SubState = 'paid' | 'due' | 'grace' | 'late' | 'off';
/** Plain words for each subscription state. */
export const SUB_STATE_LABEL: Record<SubState, string> = { paid: 'Paid', due: 'Due soon', grace: 'In grace period', late: 'Late', off: 'Not started' };
const monthLabel = (y: number, m: number) => new Date(y, m, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
/** Where an owner's subscription stands: price, paid until, next due date, grace period and receipts. */
function subscriptionOf(u: User) {
  const cfg = subConfig(); const now = new Date(); const live = u.ownerStatus === 'approved';
  const hostels = billableHostels(u.id); const fee = cfg.perHostel ? cfg.subFee * Math.max(1, hostels) : cfg.subFee;
  const paidUntil = u.subPaidUntil ? new Date(u.subPaidUntil + 'T23:59:59') : endOfMonth(now);
  const due = new Date(paidUntil.getFullYear(), paidUntil.getMonth() + 1, 1);
  const overdue = live && now > paidUntil; const daysLeft = Math.ceil((+due - +now) / DAY);
  const extra = u.subGraceUntil ? new Date(u.subGraceUntil + 'T23:59:59') : null;
  const graceEnd = new Date(Math.max(+due + cfg.graceDays * DAY - 1, extra ? +extra : 0));
  const state: SubState = !live ? 'off' : !overdue ? (daysLeft <= 7 ? 'due' : 'paid') : now <= graceEnd ? 'grace' : 'late';
  const daysLate = overdue ? Math.max(1, Math.floor((+now - +due) / DAY) + 1) : 0;
  const owed = overdue ? fee * Math.max(1, (now.getFullYear() - due.getFullYear()) * 12 + now.getMonth() - due.getMonth() + 1) : 0;
  const paid = getDb().subPayments?.filter(p => p.ownerId === u.id) ?? [];
  const history = paid.length ? paid.slice(0, 8).map(p => { const m = /(\d{4})(\d{2})$/.exec(p.ref); const label = m ? monthLabel(+m[1]!, +m[2]! - 1) : monthLabel(new Date(p.at).getFullYear(), new Date(p.at).getMonth());
      return { month: p.months > 1 ? `${label} and ${p.months - 1} more` : label, amount: p.amount, ref: p.ref, paidOn: p.at.slice(0, 10), via: p.via }; })
    : (() => { const out: { month: string; amount: number; ref: string; paidOn: string; via: SubPayment['via'] }[] = []; const start = u.joined ? new Date(u.joined) : new Date(now.getFullYear(), now.getMonth() - 5, 1);
      for (let m = new Date(paidUntil.getFullYear(), paidUntil.getMonth(), 1); m >= start && out.length < 6; m = new Date(m.getFullYear(), m.getMonth() - 1, 1))
        out.push({ month: monthLabel(m.getFullYear(), m.getMonth()), amount: fee, ref: `SUB-${u.id.slice(-4).toUpperCase()}-${m.getFullYear()}${String(m.getMonth() + 1).padStart(2, '0')}`, paidOn: iso(new Date(m.getFullYear(), m.getMonth(), 1)), via: 'app' });
      return out; })();
  const paused = getDb().hostels.filter(h => h.ownerId === u.id && h.pausedFor === 'subscription').length;
  return { live, fee, hostels, paused, perHostel: cfg.perHostel, unit: cfg.subFee, paidUntil: iso(paidUntil), due: iso(due), overdue, daysLeft, daysLate, owed, state,
    graceEnd: iso(graceEnd), extraUntil: u.subGraceUntil, remindedAt: u.subRemindedAt, history };
}
/** Puts back listings that were paused only because the subscription was unpaid. */
function unpauseAfterPay(ownerId: string) {
  getDb().hostels.filter(h => h.ownerId === ownerId && h.status === 'suspended' && h.pausedFor === 'subscription').forEach(h => { h.status = 'live'; h.pausedFor = undefined; h.suspendReason = undefined; });
}
function addMonths(u: User, months: number, via: SubPayment['via'], note?: string) {
  const db = getDb(); const s = subscriptionOf(u);
  // Paying while behind starts from the first unpaid month.
  const from = new Date(s.paidUntil + 'T00:00:00'); const cover = new Date(from.getFullYear(), from.getMonth() + 1, 1);
  u.subPaidUntil = iso(endOfMonth(new Date(from.getFullYear(), from.getMonth() + months, 1))); u.subGraceUntil = undefined;
  const p: SubPayment = { id: id('sp'), ownerId: u.id, amount: s.fee * months, months, at: isoNow(), via, note,
    ref: `SUB-${u.id.slice(-4).toUpperCase()}-${cover.getFullYear()}${String(cover.getMonth() + 1).padStart(2, '0')}` };
  db.subPayments = [p, ...(db.subPayments ?? [])]; unpauseAfterPay(u.id); return p;
}
/** The owner pays their subscription by mobile money for a number of months. Paused hostels come back. Returns the new subscription state. */
export async function paySubscription(ownerId: string, months = 1) {
  await wait(900); const u = getDb().users.find(x => x.id === ownerId)!;
  addMonths(u, months, 'app');
  audit('Paid subscription', u.name, `${months} month${months > 1 ? 's' : ''}`); commit(); return subscriptionOf(u);
}

/* ---------- Subscriptions, admin side ---------- */
/** For the price setting: how many hostels each paying owner lists, so the page can work out expected income. */
export function ownerHostelCounts() { return getDb().users.filter(u => u.role === 'owner' && u.ownerStatus === 'approved').map(u => billableHostels(u.id)); }
/** For the universities page: live hostels near a university, and how many of them use its semester calendar. */
export function uniHostelCounts(uid: string) { const hs = getDb().hostels.filter(h => h.uni === uid && h.status === 'live'); return { live: hs.length, following: hs.filter(h => !h.sems?.length).length }; }
/** Wipes the demo data back to the start. Only for the demo box on the login page. */
export { resetDemo } from './db';
/** Every approved owner with their subscription state, hostels and last payment, for the admin Subscriptions page. */
export async function listSubscriptions() {
  await wait(300); const db = getDb();
  return db.users.filter(u => u.role === 'owner' && u.ownerStatus === 'approved').map(u => {
    const sub = subscriptionOf(u); const mine = db.hostels.filter(h => h.ownerId === u.id);
    return { user: safe(u), sub, live: mine.filter(h => h.status === 'live').length, paused: sub.paused, hostels: mine.filter(h => h.status !== 'draft'),
      last: (db.subPayments ?? []).find(p => p.ownerId === u.id) };
  });
}
/** Every subscription payment received, newest first, with the owner's name. */
export async function listSubPayments() {
  await wait(250); const db = getDb();
  return (db.subPayments ?? []).map(p => ({ ...p, owner: db.users.find(u => u.id === p.ownerId)?.name ?? 'Owner' }));
}
/** Nestly's own money: what came in this month and what owners should pay each month. */
export function subSummary() {
  const db = getDb(); const now = new Date(); const pays = db.subPayments ?? [];
  const inMonth = (y: number, m: number) => pays.filter(p => { const d = new Date(p.at); return d.getFullYear() === y && d.getMonth() === m; }).reduce((a, p) => a + p.amount, 0);
  const trend = Array.from({ length: 6 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1); return { label: d.toLocaleDateString('en-GB', { month: 'short' }), value: inMonth(d.getFullYear(), d.getMonth()) }; });
  const owners = db.users.filter(u => u.role === 'owner' && u.ownerStatus === 'approved').map(subscriptionOf);
  const count = (st: SubState) => owners.filter(s => s.state === st).length;
  return { month: trend[5]!.value, lastMonth: trend[4]!.value, trend, expected: owners.reduce((a, s) => a + s.fee, 0), owed: owners.reduce((a, s) => a + s.owed, 0),
    owners: owners.length, paid: count('paid'), due: count('due'), grace: count('grace'), late: count('late') };
}
/** Admin records a subscription payment made outside the app. Takes months and how they paid. Returns the new subscription state. */
export async function recordSubPayment(ownerId: string, months: number, note: string) {
  await wait(500); const u = getDb().users.find(x => x.id === ownerId)!;
  if (!Number.isInteger(months) || months < 1 || months > 12) throw new ApiError('Choose between 1 and 12 months.', 'months');
  if (!note.trim()) throw new ApiError('Say how they paid, like a receipt or mobile money reference.', 'note');
  const p = addMonths(u, months, 'recorded', note.trim());
  notify(u.id, { kind: 'money', title: 'Subscription payment received', text: `${ugxPlain(p.amount)} for ${months} month${months > 1 ? 's' : ''}. Thank you.`, to: '/o/money' });
  audit('Recorded subscription payment', u.name, `${ugxPlain(p.amount)}, ${note.trim()}`); commit(); return subscriptionOf(u);
}
/** Sends an owner a payment reminder by notification and email. */
export async function remindSubscription(ownerId: string) {
  await wait(400); const db = getDb(); const u = db.users.find(x => x.id === ownerId)!; const s = subscriptionOf(u);
  const text = s.overdue ? `Your Nestly subscription is ${s.daysLate} ${s.daysLate === 1 ? 'day' : 'days'} late. Pay ${ugxPlain(s.owed)} to keep your hostels on Nestly.` : `Your Nestly subscription of ${ugxPlain(s.fee)} is due soon.`;
  notify(u.id, { kind: 'money', title: s.overdue ? 'Your subscription is late' : 'Your subscription is due soon', text, to: '/o/money' });
  db.mail.unshift({ id: id('m'), to: u.email, subject: 'Your Nestly subscription', body: text, when: isoNow() });
  u.subRemindedAt = isoNow(); audit('Sent payment reminder', u.name, s.overdue ? `${s.daysLate} days late` : 'Due soon'); commit();
}
/** Gives an owner extra days before their listings can be paused. */
export async function giveMoreTime(ownerId: string, days: number) {
  await wait(400); const u = getDb().users.find(x => x.id === ownerId)!;
  u.subGraceUntil = iso(new Date(Date.now() + days * DAY));
  notify(u.id, { kind: 'money', title: `You have ${days} more days to pay`, text: 'Your hostels stay on Nestly while you pay your subscription.', to: '/o/money' });
  audit('Gave more time to pay', u.name, `${days} more days`); commit();
}
/** Takes an owner's live hostels off Explore until they pay. Bookings already made stay valid. */
export async function pauseForUnpaid(ownerId: string) {
  await wait(500); const db = getDb(); const u = db.users.find(x => x.id === ownerId)!;
  const hs = db.hostels.filter(h => h.ownerId === ownerId && h.status === 'live');
  hs.forEach(h => { h.status = 'suspended'; h.pausedFor = 'subscription'; h.suspendReason = 'Subscription not paid'; });
  notify(u.id, { kind: 'money', title: 'Your hostels are paused', text: 'Students cannot find them until you pay your subscription. They come back as soon as you pay. Bookings already made stay valid.', to: '/o/money' });
  audit('Paused for unpaid subscription', u.name, `${hs.length} ${hs.length === 1 ? 'hostel' : 'hostels'} off Explore`); commit(); return hs.length;
}
/** Saves the subscription price, per hostel or per owner, and the grace days. Tells owners if the price changed. */
export async function saveConfig(c: Config) {
  await wait(500);
  if (!Number.isFinite(c.subFee) || c.subFee < 1000) throw new ApiError('Enter a price of at least UGX 1,000.', 'subFee');
  if (!Number.isInteger(c.graceDays) || c.graceDays < 0 || c.graceDays > 30) throw new ApiError('Choose between 0 and 30 days.', 'graceDays');
  const before = subConfig(); getDb().config = { ...c };
  if (before.subFee !== c.subFee || before.perHostel !== c.perHostel) getDb().users.filter(u => u.role === 'owner' && u.ownerStatus === 'approved').forEach(u => {
    const s = subscriptionOf(u); notify(u.id, { kind: 'money', title: 'Your Nestly price is changing', text: `From your next payment you pay ${ugxPlain(s.fee)} a month.`, to: '/o/money' }); });
  audit('Changed subscription price', 'Nestly', `${ugxPlain(c.subFee)} ${c.perHostel ? 'per hostel' : 'per owner'} a month, ${c.graceDays} days to pay${before.subFee !== c.subFee ? ` (was ${ugxPlain(before.subFee)})` : ''}`); commit();
}
/** Plain words for each hostel status. */
export const STATUS_LABEL: Record<HostelStatus, string> = { draft: 'Draft', in_review: 'In review', live: 'Live', changes_requested: 'Changes requested', suspended: 'Paused' };
/** Plain words for each role. */
export const ROLE_LABEL: Record<User['role'], string> = { student: 'Student', custodian: 'Custodian', owner: 'Owner', admin: 'Admin' };
const ownerHostels = (ownerId: string) => getDb().hostels.filter(h => h.ownerId === ownerId);

function bedStats(h: Hostel) {
  const total = h.rooms.reduce((a, r) => a + r.total, 0); const taken = h.rooms.reduce((a, r) => a + r.taken, 0);
  return { total, taken, free: Math.max(0, total - taken) };
}
const weekStart = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };

/** Starts an owner account. Takes name, phone, email and password. Returns the new user, not yet approved. */
export async function signupOwner(input: { name: string; phone: string; email: string; password: string }) {
  await wait(700); const db = getDb(); const email = input.email.trim().toLowerCase();
  if (db.users.some(u => u.email.toLowerCase() === email)) throw new ApiError('An account with this email already exists. Log in instead.', 'email');
  if (!/^0?7\d{8}$/.test(input.phone.replace(/\s/g, ''))) throw new ApiError('Enter a 10-digit MTN or Airtel number.', 'phone');
  const u: User = { id: id('u'), role: 'owner', name: input.name.trim(), email, phone: input.phone, password: input.password, emailVerified: true, ownerStatus: 'incomplete', joined: isoNow() };
  db.users.push(u); storage.set(SESSION, u.id); commit(); return safe(u);
}
/** Saves an uploaded ID, selfie or proof of ownership. Takes the owner, kind, file name and file data. */
export async function uploadDoc(ownerId: string, kind: VerificationDoc['kind'], fileName: string, url: string, hostelId?: string) {
  await wait(900); const db = getDb();
  db.docs = db.docs.filter(d => !(d.ownerId === ownerId && d.kind === kind && d.hostelId === hostelId));
  const d: VerificationDoc = { id: id('d'), ownerId, hostelId, kind, fileName, url, uploadedAt: isoNow(), status: 'pending' };
  db.docs.push(d); commit(); return d;
}
/** The documents an owner uploaded. */
export const docsOf = (ownerId: string) => getDb().docs.filter(d => d.ownerId === ownerId);
/** Saves the bank or mobile money account students pay into. Asks for the password when changing an existing account. */
export async function savePayout(ownerId: string, payout: NonNullable<User['payout']>, password?: string) {
  await wait(500); const u = getDb().users.find(x => x.id === ownerId)!;
  if (password !== undefined && u.password !== password) throw new ApiError('That password is not right.', 'password');
  if (payout.method !== 'bank' && !/^0?7\d{8}$/.test(payout.to.replace(/\s/g, ''))) throw new ApiError('Enter a 10-digit mobile money number.', 'to');
  if (!payout.name.trim()) throw new ApiError('Enter the name on the account.', 'name');
  u.payout = payout; commit(); return safe(u);
}
/** Sends a new owner to the Nestly team for checking. */
export async function submitOwner(ownerId: string) {
  await wait(700); const u = getDb().users.find(x => x.id === ownerId)!;
  u.ownerStatus = 'pending'; u.ownerNote = undefined;
  adminIds().forEach(a => notify(a, { kind: 'review', title: 'Owner waiting for review', text: `${u.name} sent their ID and payment account.`, to: '/a/reviews' }));
  commit(); return safe(u);
}

/** Every hostel an owner has, with bed counts and how many custodians each has. */
export async function listOwnerHostels(ownerId: string) {
  await wait(300);
  return ownerHostels(ownerId).map(h => ({ hostel: h, beds: bedStats(h), custodians: custodiansOf(h.id).filter(c => !c.suspended).length }));
}
/** One hostel for the editor, with its rooms, documents and which rooms have people in them. */
export async function getOwnerHostel(hid: string) {
  await wait(250); const db = getDb(); const h = hostelById(hid); if (!h) throw new ApiError('Hostel not found');
  return { hostel: h, rooms: db.rooms.filter(r => r.hostelId === hid).sort((a, b) => a.no.localeCompare(b.no)), docs: db.docs.filter(d => d.hostelId === hid),
    occupied: new Set(db.tenants.filter(t => t.hostelId === hid && t.roomId && t.status !== 'out').map(t => t.roomId!)) };
}
/** Creates an empty draft hostel for an owner. Returns it. */
export async function createHostelDraft(ownerId: string) {
  await wait(400); const db = getDb(); const u = db.users.find(x => x.id === ownerId)!;
  const h: Hostel = { id: id('h'), seed: Math.floor(Math.random() * 20), name: '', uni: 'ucu', area: '', km: 0, dir: 0, rating: 0, nRev: 0, ownerName: u.name, ownerId,
    verified: u.ownerStatus === 'approved', fee: 40000, visit: '8:00 am to 9:00 pm', floors: 3, cols: 4, amen: [], rooms: [], about: '', status: 'draft', photos: [], rules: [], blocks: [] };
  db.hostels.push(h); commit(); return h;
}
const REVIEW_FIELDS = ['name', 'photos', 'location', 'km', 'dir'];
/** Saves an owner's changes. Changing what students judge a listing by on a live hostel sends it back to review. */
export async function saveHostelDraft(hid: string, patch: Partial<Hostel>) {
  await wait(500); const h = hostelById(hid)!;
  const touchesReview = h.status === 'live' && Object.keys(patch).some(k => REVIEW_FIELDS.includes(k) && JSON.stringify((patch as Record<string, unknown>)[k]) !== JSON.stringify((h as unknown as Record<string, unknown>)[k]));
  Object.assign(h, patch);
  if (patch.location || patch.uni) syncDistance(h);
  if (patch.photos) h.photoUrl = patch.photos[0];
  if (touchesReview) { h.status = 'in_review'; h.submittedAt = isoNow(); adminIds().forEach(a => notify(a, { kind: 'review', title: 'Listing changed', text: `${h.name} changed its name, photos or location.`, to: '/a/reviews' })); }
  commit(); return { hostel: h, sentToReview: touchesReview };
}
/** Saves the room types and prices of a hostel. */
export async function updateRoomTypes(hid: string, types: RoomType[]) {
  await wait(500); const h = hostelById(hid)!;
  h.rooms = types.map(t => { const old = h.rooms.find(r => r.t === t.t); return { ...t, taken: old?.taken ?? 0 }; });
  syncTypeCounts(hid); commit(); return h;
}
/** Adds several numbered rooms in one go, like A-01 to A-08. */
export async function generateRooms(hid: string, block: string, type: string, count: number, floor: number, beds: number) {
  await wait(500); const db = getDb(); const h = hostelById(hid)!;
  const b = block.trim().toUpperCase(); if (!/^[A-Z0-9]{1,3}$/.test(b)) throw new ApiError('Use a short block name like A or B2.', 'block');
  const existing = db.rooms.filter(r => r.hostelId === hid && r.block === b).length;
  for (let i = 1; i <= count; i++) { const n = existing + i; db.rooms.push({ id: id('r'), hostelId: hid, no: `${b}-${String(n).padStart(2, '0')}`, block: b, floor, type, beds, status: 'ready' }); }
  h.blocks = Array.from(new Set([...(h.blocks ?? []), b])).sort();
  syncTypeCounts(hid); commit();
}
/** Changes one room: number, block, floor, type or beds. */
export async function updateRoom(rid: string, patch: Partial<Pick<Room, 'no' | 'block' | 'floor' | 'type' | 'beds'>>) {
  await wait(300); const db = getDb(); const r = db.rooms.find(x => x.id === rid)!;
  if (patch.no && db.rooms.some(x => x.hostelId === r.hostelId && x.id !== rid && x.no.toLowerCase() === patch.no!.trim().toLowerCase())) throw new ApiError('Another room already has that number.', 'no');
  Object.assign(r, patch); syncTypeCounts(r.hostelId); commit();
}
/** Deletes a room. Throws ApiError if someone is in it. */
export async function deleteRoom(rid: string) {
  await wait(300); const db = getDb(); const r = db.rooms.find(x => x.id === rid)!;
  if (db.tenants.some(t => t.roomId === rid && t.status !== 'out')) throw new ApiError('Someone is in this room. Ask the custodian to move them first.');
  db.rooms = db.rooms.filter(x => x.id !== rid); syncTypeCounts(r.hostelId); commit();
}
/** One line of the "ready to submit" checklist. */
export type CheckItem = { key: string; label: string; done: boolean };
/** What a hostel still needs before it can be sent for review. */
export function hostelChecklist(h: Hostel, roomCount: number, hasProof: boolean): CheckItem[] {
  return [
    { key: 'basics', label: 'Name, university, booking fee and description', done: !!(h.name.trim() && h.fee > 0 && h.about.trim().length >= 20) },
    { key: 'location', label: 'Pin on the map and area name', done: !!h.location && !!h.area.trim() },
    { key: 'photos', label: 'At least 3 photos', done: (h.photos?.length ?? 0) >= 3 },
    { key: 'types', label: 'Room types and prices', done: h.rooms.length > 0 && h.rooms.every(r => r.price > 0 && r.total > 0) },
    { key: 'rooms', label: 'Rooms set up', done: roomCount > 0 },
    { key: 'amenities', label: 'Amenities and house rules', done: h.amen.length > 0 && (h.rules?.length ?? 0) > 0 },
    { key: 'proof', label: 'Proof of ownership', done: hasProof },
  ];
}
/** Sends a hostel to the Nestly team. Throws ApiError if a section is missing. */
export async function submitHostelForReview(hid: string) {
  await wait(600); const db = getDb(); const h = hostelById(hid)!;
  const list = hostelChecklist(h, db.rooms.filter(r => r.hostelId === hid).length, db.docs.some(d => d.hostelId === hid));
  if (list.some(c => !c.done)) throw new ApiError('Finish every section first.');
  h.status = 'in_review'; h.submittedAt = isoNow(); h.reviewNote = undefined;
  adminIds().forEach(a => notify(a, { kind: 'review', title: 'Listing waiting for review', text: `${h.name} by ${h.ownerName}.`, to: '/a/reviews' }));
  commit(); return h;
}

/** The owner writes one public reply under a student's review. */
export async function replyReview(rid: string, text: string) {
  await wait(400); const r = getDb().reviews.find(x => x.id === rid); if (!r) throw new ApiError('Review not found');
  if (text.trim().length < 3) throw new ApiError('Write a short reply.'); r.reply = text.trim(); commit();
}
/** The owner's home screen: next semester's beds, money, rating, what needs them, and how students find the listings. */
export async function ownerHome(ownerId: string) {
  await wait(400); const db = getDb(); const hs = ownerHostels(ownerId); const ids = hs.map(h => h.id);
  const live = hs.filter(h => h.status === 'live' || h.status === 'suspended');
  const bookings = db.bookings.filter(b => ids.includes(b.hostelId) && b.status !== 'cancelled');
  const ws = weekStart(); const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const inRange = (b: Booking, a: number, z = Infinity) => !!b.at && +new Date(b.at) >= a && +new Date(b.at) < z;
  const me = db.users.find(u => u.id === ownerId)!; const sub = subscriptionOf(me);
  const reviews = db.reviews.filter(r => ids.includes(r.hostelId) && !r.hidden);
  const per = hs.map(h => {
    const bs = bookingSem(h); const next = bs ? bookings.filter(b => b.hostelId === h.id && b.sem === semName(bs)) : [];
    const types = h.rooms.map(r => ({ t: r.t, total: r.total, left: Math.max(0, r.total - next.filter(b => b.room === r.t).length) }));
    const total = types.reduce((a, t) => a + t.total, 0);
    const hr = reviews.filter(r => r.hostelId === h.id);
    return { hostel: h, sem: bs ? semName(bs) : null, total, booked: Math.min(total, next.length), types, views: h.views ?? 0, saves: h.saves ?? 0,
      month: bookings.filter(b => b.hostelId === h.id && inRange(b, +monthStart)).length, rating: h.rating, nRev: h.nRev, unreplied: hr.filter(r => !r.reply).length,
      custodian: custodiansOf(h.id).some(c => !c.suspended) };
  });
  const L = per.filter(p => live.some(h => h.id === p.hostel.id));
  const nRev = L.reduce((a, p) => a + p.nRev, 0);
  const todo: { key: string; tone: 'bad' | 'warn' | 'info'; text: string; sub: string; to?: string; cta: string; review?: string }[] = [];
  if (sub.overdue) todo.push({ key: 'sub', tone: 'bad', text: 'Your subscription is overdue', sub: `Pay ${ugxPlain(sub.fee)} to keep your hostels on Explore`, to: '/o/money', cta: 'Pay' });
  else if (sub.live && sub.daysLeft <= 5) todo.push({ key: 'sub', tone: 'warn', text: `Subscription due in ${sub.daysLeft} ${sub.daysLeft === 1 ? 'day' : 'days'}`, sub: `${ugxPlain(sub.fee)} on ${sub.due}`, to: '/o/money', cta: 'Pay' });
  hs.filter(h => h.status === 'changes_requested').forEach(h => todo.push({ key: 'cr' + h.id, tone: 'bad', text: `${h.name}: changes requested`, sub: h.reviewNote ?? 'See what Nestly asked you to fix', to: `/o/hostels/${h.id}`, cta: 'Fix' }));
  hs.filter(h => h.status === 'in_review').forEach(h => todo.push({ key: 'ir' + h.id, tone: 'info', text: `${h.name || 'Your hostel'} is in review`, sub: 'Nestly usually checks within 1 to 2 working days', to: `/o/hostels/${h.id}`, cta: 'View' }));
  hs.filter(h => h.status === 'draft').forEach(h => todo.push({ key: 'dr' + h.id, tone: 'info', text: `Finish ${h.name || 'your new hostel'}`, sub: 'Add the missing details and send it for review', to: `/o/hostels/${h.id}`, cta: 'Continue' }));
  live.filter(h => h.status === 'live' && !custodiansOf(h.id).some(c => !c.suspended)).forEach(h => todo.push({ key: 'cu' + h.id, tone: 'warn', text: `${h.name} has no custodian`, sub: 'Invite someone to check students in and log visitors', to: '/o/staff', cta: 'Invite' }));
  reviews.filter(r => !r.reply).slice(0, 3).forEach(r => todo.push({ key: 'rv' + r.id, tone: 'info', text: `${r.who} left ${r.stars} stars on ${hostelById(r.hostelId)?.name}`, sub: `"${r.text}"`, cta: 'Reply', review: r.id }));
  db.rooms.filter(r => ids.includes(r.hostelId) && r.status === 'unavailable' && r.unavailableSince && Date.now() - +new Date(r.unavailableSince) > 7 * 86400000)
    .forEach(r => todo.push({ key: 'rm' + r.id, tone: 'warn', text: `${hostelById(r.hostelId)?.name} ${r.no} out of use for ${Math.floor((Date.now() - +new Date(r.unavailableSince!)) / 86400000)} days`, sub: r.unavailableReason ?? 'Not available', to: `/o/hostels/${r.hostelId}?s=rooms`, cta: 'Check' }));
  live.filter(h => h.status === 'live' && !bookingSem(h)).forEach(h => todo.push({ key: 'sm' + h.id, tone: 'warn', text: `${h.name} is not taking bookings`, sub: 'Open the next semester so students can book', to: `/o/hostels/${h.id}?s=sems`, cta: 'Open' }));
  if (live.some(h => !h.sems?.length && !uniSems(h.uni))) todo.push({ key: 'smd', tone: 'info', text: 'Check your semester dates', sub: `Using ${universityById(live[0]!.uni)?.short ?? 'the university'} dates until you set your own`, to: `/o/hostels/${live.find(h => !h.sems?.length && !uniSems(h.uni))!.id}?s=sems`, cta: 'Set dates' });
  L.forEach(p => p.types.filter(t => t.total > 0 && t.left === 0).forEach(t => todo.push({ key: 'so' + p.hostel.id + t.t, tone: 'info', text: `${t.t} at ${p.hostel.name} is fully booked`, sub: 'Add rooms of this type, or raise its price for late bookers', to: `/o/hostels/${p.hostel.id}?s=types`, cta: 'Edit' })));
  const views = L.reduce((a, p) => a + p.views, 0), saves = L.reduce((a, p) => a + p.saves, 0), booked = L.reduce((a, p) => a + p.month, 0);
  // Tips come only from the owner's own numbers, compared with other live hostels near the same campus.
  const tips: string[] = [];
  const few = L.filter(p => (p.hostel.photos?.length ?? 0) < 4).map(p => p.hostel.name);
  if (few.length) tips.push(`${few.length > 2 ? `${few.slice(0, 2).join(', ')} and ${few.length - 2} more` : few.join(' and ')} ${few.length === 1 ? 'has' : 'have'} fewer than 4 photos. Clear room photos help students choose.`);
  L.forEach(p => { if (p.views >= 200 && p.month / p.views < 0.01) tips.push(`${p.hostel.name}: ${p.views.toLocaleString('en-US')} views but only ${p.month} ${p.month === 1 ? 'booking' : 'bookings'} this month. Check its price against nearby hostels.`); });
  L.forEach(p => { const near = db.hostels.filter(h => isLive(h) && h.uni === p.hostel.uni && h.id !== p.hostel.id && h.rooms.length); if (!near.length || !p.hostel.rooms.length) return;
    const avg = near.reduce((a, h) => a + minPrice(h), 0) / near.length, mine = minPrice(p.hostel);
    if (mine > avg * 1.15) tips.push(`${p.hostel.name}'s cheapest room is ${Math.round((mine / avg - 1) * 100)}% above the average near ${universityById(p.hostel.uni)?.short}.`); });
  const recent = [
    ...bookings.filter(b => b.at).map(b => ({ at: b.at!, text: `${db.users.find(u => u.id === b.userId)?.name ?? 'A student'} booked ${b.room.toLowerCase()} at ${hostelById(b.hostelId)?.name}`, kind: 'booking' as const })),
    ...db.audit.filter(a => a.action === 'Gave a room' && hs.some(h => a.target.startsWith(h.name))).map(a => ({ at: a.at, text: `${a.detail} got room ${a.target.split(', ')[1]}`, kind: 'room' as const })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
  return {
    sem: NEXT_SEM, hostels: per, todo, tips: tips.slice(0, 2), recent, sub, account: me.payout,
    kpi: { total: L.reduce((a, p) => a + p.total, 0), booked: L.reduce((a, p) => a + p.booked, 0),
      week: bookings.filter(b => inRange(b, +ws)).length, lastWeek: bookings.filter(b => inRange(b, +ws - 7 * 86400000, +ws)).length,
      feesMonth: bookings.filter(b => inRange(b, +monthStart)).reduce((a, b) => a + b.fee, 0),
      rating: nRev ? L.reduce((a, p) => a + p.rating * p.nRev, 0) / nRev : 0, nRev },
    funnel: { views, saves, booked },
    reviews: Object.fromEntries(reviews.map(r => [r.id, { ...r, hostel: hostelById(r.hostelId)?.name ?? '' }])),
  };
}
/** Every booking at an owner's hostels, newest first. */
export async function listOwnerBookings(ownerId: string) {
  await wait(350); const db = getDb(); const ids = ownerHostels(ownerId).map(h => h.id);
  return db.bookings.filter(b => ids.includes(b.hostelId)).map(b => ({ ...b, hostel: hostelById(b.hostelId)!, student: db.users.find(u => u.id === b.userId),
    tenant: db.tenants.find(t => t.bookingId === b.id) })).sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
}
/** The owner's Money page: payment account, booking fees received and their subscription. */
export async function ownerMoney(ownerId: string) {
  await wait(350); const db = getDb(); const ids = ownerHostels(ownerId).map(h => h.id);
  const semStart = new Date('2026-07-01T00:00:00');
  const sem = db.bookings.filter(b => ids.includes(b.hostelId) && b.status !== 'cancelled' && b.at && +new Date(b.at) >= +semStart);
  const collected = sem.reduce((a, b) => a + b.fee, 0);
  const me = db.users.find(u => u.id === ownerId)!;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const fees = db.bookings.filter(b => ids.includes(b.hostelId) && b.status !== 'cancelled' && b.at).sort((a, b) => b.at!.localeCompare(a.at!))
    .map(b => ({ ...b, student: db.users.find(u => u.id === b.userId)?.name ?? 'Student', hostel: hostelById(b.hostelId)?.name ?? '' }));
  return { account: me.payout, fees, collected, month: fees.filter(b => +new Date(b.at!) >= +monthStart).reduce((a, b) => a + b.fee, 0),
    monthCount: fees.filter(b => +new Date(b.at!) >= +monthStart).length, semCount: sem.length, sub: subscriptionOf(me) };
}
/** An owner's custodians and open invites, by hostel. */
export async function listCustodians(ownerId: string) {
  await wait(300); const db = getDb(); const hs = ownerHostels(ownerId); const ids = hs.map(h => h.id);
  return {
    hostels: hs,
    staff: db.users.filter(u => u.role === 'custodian' && u.hostelId && ids.includes(u.hostelId) && !u.suspended),
    invites: db.invites.filter(i => ids.includes(i.hostelId) && !i.used && !i.cancelled),
  };
}
/** True when an invite is more than 7 days old. */
export const inviteExpired = (i: { at?: string }) => !!i.at && Date.now() - +new Date(i.at) > 7 * 86400000;
/** Creates an invite code for a new custodian. Returns the invite. */
export async function inviteCustodian(hostelId: string, name: string, contact: string) {
  await wait(600); const db = getDb(); const h = hostelById(hostelId)!; const me = sessionUser()!;
  if (name.trim().split(/\s+/).length < 2) throw new ApiError('Enter their first and last name.', 'name');
  if (!contact.trim()) throw new ApiError('Enter a phone number or email.', 'contact');
  const prefix = h.name.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase().padEnd(4, 'X');
  let code = ''; do { code = `${prefix}-${1000 + Math.floor(Math.random() * 9000)}`; } while (db.invites.some(i => i.code === code));
  db.invites.push({ code, hostelId, invitedBy: me.name, email: contact.includes('@') ? contact.trim().toLowerCase() : `${contact.replace(/\s/g, '')}@sms.nestly.app`, name: name.trim(), used: false, at: isoNow() });
  notify(me.id, { kind: 'staff', title: `Invite ready for ${name.trim().split(' ')[0]}`, text: `Code ${code} for ${h.name}. It expires in 7 days.`, to: '/o/staff' });
  commit(); return code;
}
/** Sends an invite again and restarts its 7 days. */
export async function resendInvite(code: string) { await wait(300); const i = getDb().invites.find(x => x.code === code)!; i.at = isoNow(); commit(); }
/** Cancels an invite so the code stops working. */
export async function cancelInvite(code: string) { await wait(300); const i = getDb().invites.find(x => x.code === code)!; i.cancelled = true; commit(); }
/** Removes a custodian from a hostel. */
export async function removeCustodian(userId: string) {
  await wait(500); const db = getDb(); const u = db.users.find(x => x.id === userId)!; const h = hostelById(u.hostelId ?? '');
  u.suspended = true; u.suspendReason = 'Removed by the owner';
  audit('Removed custodian', h?.name ?? '', u.name);
  notify(h?.ownerId, { kind: 'staff', title: `${u.name} was removed`, text: `They can no longer open ${h?.name}.`, to: '/o/staff' });
  commit();
}

/* =====================================================================
   Admin
   ===================================================================== */
export async function adminOverview() {
  await wait(400); const db = getDb(); const ws = weekStart();
  const pendingOwners = db.users.filter(u => u.role === 'owner' && u.ownerStatus === 'pending');
  const listings = db.hostels.filter(h => h.status === 'in_review');
  const oldest = listings.map(h => h.submittedAt ?? isoNow()).sort()[0];
  const weeks = Array.from({ length: 8 }, (_, i) => new Date(ws.getTime() - (7 - i) * 7 * 86400000));
  const perWeek = weeks.map(w => db.bookings.filter(b => b.at && +new Date(b.at) >= +w && +new Date(b.at) < +w + 7 * 86400000).length);
  const thisWeek = db.bookings.filter(b => b.at && Date.now() - +new Date(b.at) < 7 * 86400000 && b.status !== 'cancelled');
  return {
    queue: { owners: pendingOwners.length, listings: listings.length, oldest, flags: db.flags.filter(f => f.status === 'open').length },
    platform: { live: db.hostels.filter(isLive).length, students: db.users.filter(u => u.role === 'student' && u.emailVerified).length,
      bookingsWeek: thisWeek.length, trend: perWeek },
    subs: subSummary(),
    ownersSince: pendingOwners.map(u => db.docs.filter(d => d.ownerId === u.id).map(d => d.uploadedAt).sort()[0] ?? u.joined ?? isoNow()).sort()[0],
    recent: db.audit.slice(0, 8).map(a => ({ ...a, actor: db.users.find(u => u.id === a.actorId)?.name ?? 'Someone' })),
  };
}
/** Owners and listings waiting for the Nestly team. */
export async function listReviewQueue() {
  await wait(350); const db = getDb();
  return {
    owners: db.users.filter(u => u.role === 'owner' && u.ownerStatus === 'pending').map(u => ({ user: safe(u), docs: db.docs.filter(d => d.ownerId === u.id && !d.hostelId),
      hostels: db.hostels.filter(h => h.ownerId === u.id), since: db.docs.filter(d => d.ownerId === u.id).map(d => d.uploadedAt).sort()[0] ?? u.joined ?? isoNow() }))
      .sort((a, b) => a.since.localeCompare(b.since)),
    listings: db.hostels.filter(h => h.status === 'in_review').map(h => ({ hostel: h, owner: db.users.find(u => u.id === h.ownerId), docs: db.docs.filter(d => d.hostelId === h.id),
      rooms: db.rooms.filter(r => r.hostelId === h.id).length, since: h.submittedAt ?? isoNow() })).sort((a, b) => a.since.localeCompare(b.since)),
  };
}
/** Approves an owner after checking their ID and payment account. */
export async function approveOwner(ownerId: string) {
  await wait(500); const db = getDb(); const u = db.users.find(x => x.id === ownerId)!;
  u.ownerStatus = 'approved'; u.ownerNote = undefined;
  db.docs.filter(d => d.ownerId === ownerId && !d.hostelId).forEach(d => { d.status = 'accepted'; });
  db.hostels.filter(h => h.ownerId === ownerId).forEach(h => { h.verified = true; });
  notify(ownerId, { kind: 'review', title: 'You are approved', text: 'Your details are checked. Bookings, Money and Staff are now open.', to: '/o/overview' });
  audit('Approved owner', u.name, 'ID and payment account checked'); commit();
}
/** Rejects an owner with a reason they can read. */
export async function rejectOwner(ownerId: string, reason: string) {
  await wait(500); if (!reason.trim()) throw new ApiError('Give a reason so the owner knows what to fix.', 'reason');
  const db = getDb(); const u = db.users.find(x => x.id === ownerId)!;
  u.ownerStatus = 'rejected'; u.ownerNote = reason.trim();
  db.docs.filter(d => d.ownerId === ownerId && !d.hostelId).forEach(d => { d.status = 'rejected'; d.note = reason.trim(); });
  notify(ownerId, { kind: 'review', title: 'We could not approve your details', text: reason.trim(), to: '/o/overview' });
  audit('Rejected owner', u.name, reason.trim()); commit();
}
/** Publishes a listing on Explore. */
export async function approveListing(hid: string) {
  await wait(500); const db = getDb(); const h = hostelById(hid)!; const owner = db.users.find(u => u.id === h.ownerId);
  if (owner?.ownerStatus !== 'approved') throw new ApiError(`Approve ${owner?.name ?? 'the owner'} first. Listings go live only for checked owners.`);
  h.status = 'live'; h.verified = true; h.reviewNote = undefined; h.reviewSections = undefined; h.listedAt = h.listedAt ?? isoNow();
  db.docs.filter(d => d.hostelId === hid).forEach(d => { d.status = 'accepted'; });
  notify(h.ownerId, { kind: 'review', title: `${h.name} is live`, text: 'Students can now find and book it.', to: '/o/hostels' });
  audit('Approved listing', h.name, 'Published to students'); commit();
}
/** Sends a listing back to the owner with a note and the sections to fix. */
export async function requestChanges(hid: string, note: string, sections: string[] = []) {
  await wait(500); if (!note.trim()) throw new ApiError('Tell the owner what to change.', 'note');
  const h = hostelById(hid)!; h.status = 'changes_requested'; h.reviewNote = note.trim(); h.reviewSections = sections.length ? sections : undefined;
  notify(h.ownerId, { kind: 'review', title: `Changes requested for ${h.name}`, text: note.trim(), to: `/o/hostels/${hid}` });
  audit('Requested changes', h.name, note.trim()); commit();
}
/** Pauses a hostel: it leaves Explore and the owner sees the reason. Bookings stay valid. */
export async function suspendHostel(hid: string, reason: string) {
  await wait(500); if (!reason.trim()) throw new ApiError('Give a reason.', 'reason');
  const h = hostelById(hid)!; h.status = 'suspended'; h.pausedFor = 'admin'; h.suspendReason = reason.trim();
  notify(h.ownerId, { kind: 'review', title: `${h.name} is paused`, text: `${reason.trim()} Existing bookings stay valid.`, to: '/o/hostels' });
  audit('Paused hostel', h.name, reason.trim()); commit();
}
/** Puts a paused hostel back on Explore. */
export async function restoreHostel(hid: string) {
  await wait(400); const h = hostelById(hid)!; h.status = 'live'; h.pausedFor = undefined; h.suspendReason = undefined;
  notify(h.ownerId, { kind: 'review', title: `${h.name} is live again`, text: 'Students can find it on Nestly again.', to: '/o/hostels' });
  audit('Restored hostel', h.name, 'Back on Explore'); commit();
}
/** Every hostel for the admin, with owner, beds, open semester, next-semester bookings, subscription state and problems. */
export async function listAllHostels() {
  await wait(350); const db = getDb();
  return db.hostels.map(h => {
    const owner = db.users.find(u => u.id === h.ownerId); const sem = bookingSem(h); const sub = owner ? subscriptionOf(owner) : null;
    const beds = bedStats(h); const next = sem ? semBookings(h.id, sem) : 0; const flags = db.flags.filter(f => f.hostelId === h.id && f.status === 'open').length;
    const issues: { tone: 'bad' | 'warn' | 'info'; text: string }[] = [];
    if (h.status === 'live' || h.status === 'suspended') {
      if (sub?.state === 'late') issues.push({ tone: 'bad', text: `Owner's subscription is ${sub.daysLate} days late` });
      else if (sub?.state === 'grace') issues.push({ tone: 'warn', text: `Owner's subscription is late, grace period ends ${sub.graceEnd}` });
      if (!custodiansOf(h.id).some(c => !c.suspended)) issues.push({ tone: 'info', text: 'No custodian to check students in' });
      if (h.status === 'live' && !sem) issues.push({ tone: 'warn', text: 'Not taking bookings for any semester' });
      if (!h.sems?.length) issues.push({ tone: 'info', text: uniSems(h.uni) ? 'Uses the university calendar' : 'Uses the default calendar, the university has none set' });
    }
    if (flags) issues.unshift({ tone: 'bad', text: `${flags} open ${flags === 1 ? 'report' : 'reports'} from students` });
    return { hostel: h, owner, beds, flags, sem, next, sub, issues };
  });
}
/** Every account for the admin, with role details and recent activity. */
export async function listUsers() {
  await wait(350); const db = getDb();
  return db.users.filter(u => u.role !== 'admin').map(u => ({ user: safe(u),
    where: u.role === 'student' ? universityById(u.universityId)?.short ?? '' : u.role === 'custodian' ? hostelById(u.hostelId ?? '')?.name ?? '' : `${db.hostels.filter(h => h.ownerId === u.id).length} hostels`,
    bookings: db.bookings.filter(b => b.userId === u.id).map(b => ({ ...b, hostel: hostelById(b.hostelId)?.name ?? '' })),
    hostels: db.hostels.filter(h => h.ownerId === u.id),
    sub: u.role === 'owner' && u.ownerStatus === 'approved' ? subscriptionOf(u) : null,
    addedBy: u.role === 'custodian' ? db.users.find(o => o.id === hostelById(u.hostelId ?? '')?.ownerId)?.name ?? '' : '',
    activity: db.audit.filter(a => a.actorId === u.id || a.detail.includes(u.name) || a.target.includes(u.name)).slice(0, 6) }));
}
/** Pauses an account with a reason, so the person cannot log in. */
export async function suspendUser(userId: string, reason: string) {
  await wait(500); if (!reason.trim()) throw new ApiError('Give a reason.', 'reason');
  const u = getDb().users.find(x => x.id === userId)!; u.suspended = true; u.suspendReason = reason.trim();
  audit('Paused account', u.name, reason.trim()); commit();
}
/** Lets a paused account log in again. */
export async function restoreUser(userId: string) {
  await wait(400); const u = getDb().users.find(x => x.id === userId)!; u.suspended = false; u.suspendReason = undefined;
  audit('Restored account', u.name, ''); commit();
}
/** Admin sends someone a password reset link. */
export async function sendResetLink(userId: string) {
  await wait(500); const u = getDb().users.find(x => x.id === userId)!; audit('Sent password reset link', u.name, u.email); commit(); return u.email;
}
/** A student reports a listing, a review or a payment problem. Owners can report a review. Notifies the admins. */
export async function reportListing(userId: string, hid: string, reason: string, text: string, more: { kind?: FlagKind; reviewId?: string; bookingId?: string } = {}) {
  await wait(500); const db = getDb(); const h = hostelById(hid)!;
  const bookingId = more.bookingId ?? (more.kind === 'payment' ? db.bookings.filter(b => b.userId === userId && b.hostelId === hid).sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))[0]?.id : undefined);
  const f: Flag = { id: id('f'), hostelId: hid, reportedBy: userId, reason, text: text.trim(), at: isoNow(), status: 'open', kind: more.kind ?? 'listing', reviewId: more.reviewId, bookingId };
  db.flags.unshift(f);
  adminIds().forEach(a => notify(a, { kind: 'flag', title: `New report about ${h.name}`, text: `${reason}: ${text.trim() || 'No details given.'}`, to: '/a/flags' }));
  commit(); return f;
}
/** Every report with its hostel, owner, reporter and any review or booking it is about. */
export async function listFlags() {
  await wait(300); const db = getDb();
  return db.flags.map(f => { const h = hostelById(f.hostelId);
    return { ...f, kind: (f.kind ?? 'listing') as FlagKind, hostel: h, owner: db.users.find(u => u.id === h?.ownerId), by: db.users.find(u => u.id === f.reportedBy),
      review: f.reviewId ? db.reviews.find(r => r.id === f.reviewId) : undefined, booking: f.bookingId ? db.bookings.find(b => b.id === f.bookingId) : undefined,
      others: db.flags.filter(x => x.id !== f.id && x.hostelId === f.hostelId).length }; }).sort((a, b) => b.at.localeCompare(a.at));
}
/** Plain words for how a report was closed. */
export const OUTCOME_LABEL: Record<FlagOutcome, string> = { dismissed: 'No action needed', warned: 'Owner warned', hidden: 'Review hidden', paused: 'Hostel paused', confirmed: 'Owner confirmed payment' };
/** Closes a report and does what the admin chose: warn the owner, hide a review or pause the hostel. */
export async function resolveFlag(fid: string, outcome: FlagOutcome, note: string) {
  await wait(450); const db = getDb(); const f = db.flags.find(x => x.id === fid)!; const h = hostelById(f.hostelId)!;
  if (!note.trim()) throw new ApiError('Write a short note about what you found.', 'note');
  f.status = 'resolved'; f.outcome = outcome; f.note = note.trim(); f.resolvedAt = isoNow();
  if (outcome === 'hidden' && f.reviewId) { const r = db.reviews.find(x => x.id === f.reviewId); if (r) r.hidden = true; }
  if (outcome === 'paused' && h.status === 'live') { h.status = 'suspended'; h.pausedFor = 'admin'; h.suspendReason = f.reason; notify(h.ownerId, { kind: 'flag', title: `${h.name} is paused`, text: `${note.trim()} Existing bookings stay valid.`, to: '/o/hostels' }); }
  if (outcome === 'warned') notify(h.ownerId, { kind: 'flag', title: `A warning about ${h.name}`, text: note.trim(), to: '/o/overview' });
  if (outcome === 'confirmed') notify(h.ownerId, { kind: 'flag', title: 'A student payment was checked', text: note.trim(), to: '/o/money' });
  notify(f.reportedBy, { kind: 'flag', title: 'We looked into your report', text: `${OUTCOME_LABEL[outcome]}. Thank you for telling us.`, to: '/s/explore' });
  audit('Resolved report', h.name, `${OUTCOME_LABEL[outcome]}: ${f.note}`); commit();
}
/** The admin activity log, newest first. */
export async function listAudit() {
  await wait(300); const db = getDb();
  return db.audit.map(a => ({ ...a, actor: db.users.find(u => u.id === a.actorId)?.name ?? 'Someone' }));
}
/** Adds or edits a university: names, email domain, map pin, logo and semester calendar. Throws ApiError on bad input. */
export async function saveUniversity(u: University, isNew: boolean) {
  await wait(500); const db = getDb();
  if (!u.name.trim() || !u.short.trim()) throw new ApiError('Enter the full and short name.', 'name');
  const domain = u.domain.trim().toLowerCase().replace(/^@/, '');
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) throw new ApiError('Enter a domain like ucu.ac.ug.', 'domain');
  if (!Number.isFinite(u.lat) || !Number.isFinite(u.lng) || (!u.lat && !u.lng)) throw new ApiError('Put the pin on the main gate or main building.', 'location');
  const sems = (u.sems ?? []).filter(x => x.start || x.end);
  sems.forEach((x, i) => { if (!x.start || !x.end) throw new ApiError(`Semester ${i + 1} needs a start and an end date.`, 'sems'); if (x.end <= x.start) throw new ApiError(`Semester ${i + 1} ends before it starts.`, 'sems'); });
  const sorted = sems.slice().sort((a, b) => a.start.localeCompare(b.start));
  sorted.forEach((x, i) => { if (i && x.start <= sorted[i - 1]!.end) throw new ApiError('Two semesters overlap. Check the dates.', 'sems'); });
  const clean = { ...u, sems: sorted.length ? sorted : undefined, name: u.name.trim(), short: u.short.trim(), area: u.area.trim(), domain, lat: +u.lat.toFixed(6), lng: +u.lng.toFixed(6) };
  if (isNew) { if (db.universities.some(x => x.id === clean.id)) clean.id = clean.id + Math.floor(Math.random() * 90); db.universities.push(clean); }
  else Object.assign(db.universities.find(x => x.id === u.id)!, clean);
  db.hostels.filter(h => h.uni === clean.id).forEach(syncDistance);
  audit(isNew ? 'Added university' : 'Updated university', clean.name, `Email domain set to ${domain}`); commit();
}
export type { AuditEntry };

// Bring the room-type counts in line with real rooms once, when the app starts.
/** Where a hostel sits. Old demo hostels only had a distance and direction, so their point is worked out once. */
export function hostelPoint(h: Hostel): LatLng | null {
  if (h.location) return h.location;
  const u = universityById(h.uni); return u && h.km > 0 ? offset(u, h.km, h.dir ?? 0) : null;
}
/** Keeps km and direction true to the pin and the university's exact spot. */
function syncDistance(h: Hostel) {
  const u = universityById(h.uni); const p = hostelPoint(h);
  if (!u || !p) return;
  h.location = { lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) };
  h.km = Math.max(0.1, +distanceKm(u, p).toFixed(1)); h.dir = Math.round(bearing(u, p));
}
onFreshData(() => getDb().hostels.forEach(h => { syncTypeCounts(h.id); syncDistance(h); }));
