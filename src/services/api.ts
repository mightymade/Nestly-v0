/**
 * The only file the screens talk to for data. Each function is async and waits a little,
 * like a real network call, so loading states are designed from day one.
 * Swap the bodies for Supabase calls later; keep the names and return shapes.
 */
import type { Visitor, Invite, Config, FlagKind, FlagOutcome, SubPayment, Semester, AuditEntry, Booking, Flag, Hostel, HostelStatus, Mail, Notification, Room, RoomType, Tenant, University, User, VerificationDoc } from '../data/types';
import { addDays, nowTime, sleep, ugx, ymd } from '../lib/format';
import { storage } from '../lib/storage';
import { clearAndReload, commit, getDb, onFreshData, reload } from './db';
import { authUid, friendly, presentDocs, storedDocUrl } from './remote';
import { live, sb, siteUrl } from './supabase';
import { bearing, distanceKm, offset, type LatLng } from '../lib/geo';

const SESSION = 'nestly.session';
const wait = (ms = 450) => sleep(ms);
const id = (p: string) => p + Math.random().toString(36).slice(2, 8);
const isoNow = () => new Date().toISOString();
const todayIso = () => ymd();
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
export const bookingSem = (h: Hostel) => { const today = ymd(); return hostelSems(h).find(s => s.open && s.end >= today) ?? null; };

import { ApiError } from './errors';
import { deviceId, freshAuth, setCodePending, twoStepOn } from './security';
import { removeDocFile, removeHostelPhotos, uploadDocFile, uploadHostelPhotos } from './files';
export { ApiError };

const safe = (u: User): User => ({ ...u, password: '' });
function notify(userId: string | undefined, n: Omit<Notification, 'id' | 'userId' | 'at' | 'read'>) {
  if (!userId) return;
  getDb().notifications.unshift({ id: id('nt'), userId, at: isoNow(), read: false, ...n });
}
const custodiansOf = (hostelId: string) => getDb().users.filter(u => u.role === 'custodian' && u.hostelId === hostelId);

/* ---------- Auth ---------- */
/** Live mode log in: usernames are turned into the account's email first, then Supabase checks the password. */
async function liveLogin(idOrEmail: string, password: string, captchaToken?: string) {
  // The login server function turns usernames into emails on the server, slows down guessing and notes new devices.
  const { data: res, error: e1 } = await sb!.functions.invoke('login', { body: { login: idOrEmail.trim(), password, device: deviceId(), captchaToken } });
  if (e1 || !res?.access_token) {
    let msg = 'We could not log you in. Try again.'; let field: string | undefined = 'id';
    try { const body = await (e1 as { context?: Response })?.context?.json(); if (body?.error) { msg = body.error; field = body.field; } } catch { /* keep the general message */ }
    throw new ApiError(msg, field);
  }
  const { data, error } = await sb!.auth.setSession({ access_token: res.access_token, refresh_token: res.refresh_token });
  if (error || !data.user) throw new ApiError(friendly(error ?? new Error('Could not start the session.')), 'id');
  await reload();
  const u = getDb().users.find(x => x.id === data.user!.id);
  if (!u || u.suspended) { await sb!.auth.signOut(); await clearAndReload(); throw new ApiError(u ? 'Your account is paused. Contact support@nestly.app.' : 'This account is not set up. Contact support@nestly.app.', 'id'); }
  u.lastActive = isoNow(); await commit().catch(() => undefined);
  return safe(u);
}
/** Live mode sign up. Supabase emails a confirmation link that brings the person to the login page. */
async function liveSignUp(email: string, password: string, _back: string, meta: Record<string, unknown>, captchaToken?: string) {
  // The confirmation link lands on /confirmed, which signs the person out and sends them to the login page.
  const { data, error } = await sb!.auth.signUp({ email, password, options: { emailRedirectTo: siteUrl() + '/confirmed', data: meta, captchaToken } });
  if (error) {
    if (/captcha/i.test(error.message)) throw new ApiError('Please complete the check that you are not a robot, then try again.');
    if (/registered|exists/i.test(error.message)) throw new ApiError('An account with this email already exists. Log in instead.', 'email');
    if (/password/i.test(error.message)) throw new ApiError('Choose a stronger password: 8 or more characters with letters and numbers.', 'password');
    if (/rate|seconds/i.test(error.message)) throw new ApiError('Too many sign-ups from here just now. Wait a minute and try again.');
    if (/database error/i.test(error.message)) throw new ApiError('We could not create the account. Check your details and try again.');
    throw new ApiError(friendly(error));
  }
  // Supabase answers an already-used email with an empty user, so nobody can test which emails have accounts.
  if (data.user && !data.user.identities?.length) throw new ApiError('An account with this email already exists. Log in instead.', 'email');
  if (data.session) await reload();
}
export function sessionUser(): User | null {
  const uid = live ? authUid : storage.get<string | null>(SESSION, null);
  const u = uid ? getDb().users.find(x => x.id === uid) : null;
  return u && !u.suspended ? safe(u) : null;
}
/** Logs someone in. Takes an email or username and a password. Returns the user, or throws ApiError with `field` set to "id" or "pw". */
export async function login(idOrEmail: string, password: string, captchaToken?: string) {
  if (live) return liveLogin(idOrEmail, password, captchaToken);
  await wait(600);
  const key = idOrEmail.trim().toLowerCase();
  const u = getDb().users.find(x => x.email.toLowerCase() === key || x.username?.toLowerCase() === key);
  if (!u) throw new ApiError('We could not find an account with that email or username.', 'id');
  if (u.password !== password) throw new ApiError('That password is not right. Try again or reset it.', 'password');
  if (u.suspended) throw new ApiError('Your account is paused. Contact support@nestly.app.', 'id');
  u.lastActive = isoNow();
  storage.set(SESSION, u.id); await commit();
  return safe(u);
}
/** Ends the session on this device. */
export async function logout() {
  setCodePending(false);
  if (live) { await sb!.auth.signOut(); await clearAndReload(); return; }
  await wait(200); storage.remove(SESSION); await commit();
}
/** Sends a reset link if the email has an account. Always looks successful, so it never reveals who has an account. */
export async function requestPasswordReset(email: string, captchaToken?: string) {
  await wait(500);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ApiError('Enter the email you signed up with.', 'email');
  if (live) {
    const { error } = await sb!.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: siteUrl() + '/reset-password', captchaToken });
    if (error && /captcha/i.test(error.message)) throw new ApiError('Please complete the check that you are not a robot, then try again.');
    if (error && /rate|network|fetch/i.test(error.message)) throw new ApiError(friendly(error));
  }
}
/** After opening a reset link: saves the new password for the person the link signed in. */
export async function setNewPassword(password: string) {
  if (!live) { await wait(400); return; }
  const { data } = await sb!.auth.getSession(); if (!data.session) throw new ApiError('This reset link has expired. Ask for a new one from the login page.');
  const { error } = await sb!.auth.updateUser({ password }); if (error) throw new ApiError(/same|different/i.test(error.message) ? 'Choose a password you have not used here before.' : friendly(error), 'password');
  await reload();
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
export async function signupStudent(input: { uniId: string; name: string; email: string; phone?: string; password: string; captchaToken?: string }) {
  await wait(700);
  const db = getDb(); const email = input.email.trim().toLowerCase();
  if (!emailMatchesUniversity(email, input.uniId)) throw new ApiError(`Use your ${universityById(input.uniId)?.short} student email. It must end with ${universityById(input.uniId)?.domain}.`, 'email');
  if (live) {
    await liveSignUp(email, input.password, '/s/explore', { role: 'student', name: input.name.trim(), phone: input.phone || null, university_id: input.uniId }, input.captchaToken);
    return { id: '', role: 'student', name: input.name.trim(), email, password: '', universityId: input.uniId, emailVerified: false } as User;
  }
  if (db.users.some(u => u.email.toLowerCase() === email)) throw new ApiError('An account with this email already exists. Log in instead.', 'email');
  const u: User = { id: id('u'), role: 'student', name: input.name.trim(), email, phone: input.phone || undefined, password: input.password, universityId: input.uniId, emailVerified: false };
  db.users.push(u); sendVerification(u); storage.set(SESSION, u.id); await commit();
  return safe(u);
}
/** Sends the sign-up confirmation email again, to an address that has not confirmed yet. */
export async function resendConfirmation(email: string, _back = '/s/explore', captchaToken?: string) {
  if (!live) { const u = getDb().users.find(x => x.email === email); if (u) await resendVerification(u.id); return; }
  const { error } = await sb!.auth.resend({ type: 'signup', email, options: { emailRedirectTo: siteUrl() + '/confirmed', captchaToken } });
  if (error && /captcha/i.test(error.message)) throw new ApiError('Please complete the check that you are not a robot, then try again.');
  if (error) throw new ApiError(/rate|seconds/i.test(error.message) ? 'Wait a minute before asking for another email.' : friendly(error));
}
/** Sends the student email confirmation again. */
export async function resendVerification(userId: string) {
  await wait(500); const u = getDb().users.find(x => x.id === userId)!;
  getDb().mail = getDb().mail.filter(m => m.to !== u.email); sendVerification(u); await commit();
}
/** Demo only: the emails "sent" to an address, so the demo inbox can show them. A real backend sends real email instead. */
export async function inbox(email: string) { await wait(250); return getDb().mail.filter(m => m.to === email); }
/** Confirms a student email from the link token. Returns the user. */
export async function confirmEmail(token: string) {
  await wait(600); const db = getDb();
  const m = db.mail.find(x => x.token === token); if (!m) throw new ApiError('This link has expired. Ask for a new one.');
  const u = db.users.find(x => x.email === m.to)!; u.emailVerified = true; u.verifiedUntil = addDays(ymd(), 365);
  db.mail = db.mail.filter(x => x.id !== m.id); await commit(); return safe(u);
}

/* ---------- Student ID route: any email plus a student ID that an admin checks ---------- */
/** A student on the student ID route whose ID is still waiting for, or failed, the admin's check. */
export const idWaiting = (u?: User | null) => !!u && u.role === 'student' && u.verifyVia === 'id' && !u.emailVerified;
/** True when a student on the ID route still has to add (or redo) their photos. */
export const idNeedsPhotos = (u?: User | null) => idWaiting(u) && (u!.idStatus === 'needs_photo' || u!.idStatus === 'rejected');
/** One line telling a student who cannot book yet what is happening and what to do. */
export function verifyNote(u: User) {
  if (u.verifyVia !== 'id') return 'Confirm your student email to book.';
  if (u.idStatus === 'needs_photo') return 'Add photos of your student ID to book.';
  return u.idStatus === 'rejected' ? 'Your student ID was not accepted. Send new photos to book.' : 'We are checking your student ID. You can book once it is approved.';
}
/** How each university's students are verified: by university email only where those emails are known to arrive. */
export const uniEmailOk = (uniId: string) => !!universityById(uniId)?.emailOk;
/**
 * For admins deciding whether a university's emails arrive: of the students who signed up with that university's
 * email, how many confirmed, and how many never did after a day.
 */
export function uniEmailStats(uniId: string) {
  const day = Date.now() - 86400000;
  const list = getDb().users.filter(u => u.role === 'student' && u.universityId === uniId && u.verifyVia !== 'id');
  return { confirmed: list.filter(u => u.emailVerified).length, stuck: list.filter(u => !u.emailVerified && (!u.joined || +new Date(u.joined) < day)).length };
}
const SNO = /^[A-Z0-9/-]{4,30}$/;
/**
 * Creates a student account on the student ID route with any email (for example Gmail) and the student number.
 * Live: Supabase emails a confirmation link first; after confirming and logging in, the student adds their photos.
 * Demo: the account is made at once and goes straight to the photo step.
 * Returns the email the link went to (live) or null (demo, already signed in).
 */
export async function signupStudentWithId(input: { uniId: string; name: string; email: string; phone?: string; password: string; studentNo: string; captchaToken?: string }): Promise<string | null> {
  const email = input.email.trim().toLowerCase(); const studentNo = input.studentNo.trim().toUpperCase();
  if (!SNO.test(studentNo)) throw new ApiError('Enter your student number as it is on your student ID.', 'studentNo');
  if (live) {
    const { data, error } = await sb!.functions.invoke('student-signup', { body: { uniId: input.uniId, name: input.name.trim(), email, password: input.password, studentNo, phone: input.phone || null, redirectTo: siteUrl() + '/confirmed', captchaToken: input.captchaToken } });
    if (error || !data?.email) {
      let msg = 'We could not create your account. Try again.'; let field: string | undefined;
      try { const body = await (error as { context?: Response })?.context?.json(); if (body?.error) { msg = body.error; field = body.field; } } catch { /* keep the general message */ }
      if (data?.error) { msg = data.error; field = data.field; }
      throw new ApiError(msg, field);
    }
    return data.email as string;
  }
  await wait(700); const db = getDb();
  if (db.users.some(u => u.email.toLowerCase() === email)) throw new ApiError('An account with this email already exists. Log in instead.', 'email');
  if (db.users.some(u => u.universityId === input.uniId && u.studentNo?.toUpperCase() === studentNo && u.idStatus === 'approved'))
    throw new ApiError('This student number is already verified on another account. If it is yours, contact support@nestly.app.', 'studentNo');
  const u: User = { id: id('u'), role: 'student', name: input.name.trim(), email, phone: input.phone || undefined, password: input.password, universityId: input.uniId,
    emailVerified: false, verifyVia: 'id', studentNo, idStatus: 'needs_photo', joined: isoNow(), lastActive: isoNow() };
  db.users.push(u); storage.set(SESSION, u.id);
  audit('Signed up with a student ID', universityById(u.universityId)?.short ?? '', u.name);
  await commit(); return null;
}
type Photo = { name: string; url: string; file?: File };
/**
 * Sends the student's ID photos for review: the front of the student ID and a selfie holding it. Also used after
 * a rejection, when the student may correct their student number too.
 */
export async function submitStudentId(userId: string, studentNo: string, idPhoto: Photo, selfie: Photo) {
  const u0 = getDb().users.find(x => x.id === userId)!;
  if (u0.idStatus !== 'needs_photo' && u0.idStatus !== 'rejected') throw new ApiError('Your photos are already with our team.');
  const sno = studentNo.trim().toUpperCase();
  if (!SNO.test(sno)) throw new ApiError('Enter your student number as it is on your student ID.', 'studentNo');
  if (getDb().users.some(x => x.id !== userId && x.universityId === u0.universityId && x.studentNo?.toUpperCase() === sno && x.idStatus === 'approved'))
    throw new ApiError('This student number is already verified on another account. If it is yours, contact support@nestly.app.', 'studentNo');
  await uploadDoc(userId, 'student_id', idPhoto.name, idPhoto.url, undefined, idPhoto.file);
  await uploadDoc(userId, 'student_selfie', selfie.name, selfie.url, undefined, selfie.file);
  const u = getDb().users.find(x => x.id === userId)!; const again = u.idStatus === 'rejected';
  u.studentNo = sno; u.idStatus = 'pending';
  // Live: a database trigger tells the admins. Demo: do it here.
  adminIds().forEach(a => notify(a, { kind: 'review', title: 'Student ID to check', text: `${u.name} (${universityById(u.universityId)?.short}) sent their student ID${again ? ' again' : ''}.`, to: '/a/reviews?tab=students' }));
  await commit(); return safe(u);
}
/** Other accounts at the same university that claim the same student number (pending, rejected or approved). */
export function sameNumberClaims(u: User) {
  const n = u.studentNo?.toUpperCase(); if (!n) return [];
  return getDb().users.filter(x => x.id !== u.id && x.universityId === u.universityId && x.studentNo?.toUpperCase() === n && x.idStatus && x.idStatus !== 'none').map(safe);
}
/** Deletes a student's ID photos once an admin has decided. Only the result is kept. */
async function forgetStudentId(userId: string) {
  const db = getDb(); const gone = db.docs.filter(d => d.ownerId === userId && (d.kind === 'student_id' || d.kind === 'student_selfie'));
  db.docs = db.docs.filter(d => !gone.includes(d)); await commit();
  if (live) for (const d of gone) await removeDocFile(storedDocUrl(d));
}
/**
 * Approves a student ID. Booking opens until the card's expiry date (as the admin read it from the card),
 * but for at most one year. The photos are then deleted.
 */
export async function approveStudentId(userId: string, cardValidUntil: string) {
  await adminFresh();
  await wait(500); await fresh(); const db = getDb(); const u = db.users.find(x => x.id === userId)!;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cardValidUntil)) throw new ApiError('Enter the date the card is valid until.', 'until');
  if (cardValidUntil <= ymd()) throw new ApiError('This card has expired. Reject it and ask for a current one.', 'until');
  const n = u.studentNo?.toUpperCase();
  if (db.users.some(x => x.id !== u.id && x.universityId === u.universityId && x.studentNo?.toUpperCase() === n && x.idStatus === 'approved'))
    throw new ApiError('Another account is already verified with this student number. Reject this one, or check both with the student.', 'until');
  const cap = addDays(ymd(), 365);
  u.emailVerified = true; u.verifiedUntil = cardValidUntil < cap ? cardValidUntil : cap; u.idStatus = 'approved'; u.idNote = undefined;
  notify(userId, { kind: 'review', title: 'Your student ID is approved', text: 'You can now book a room.', to: '/s/explore' });
  audit('Approved student ID', u.name, `${universityById(u.universityId)?.short ?? ''} student number ${u.studentNo ?? ''}, valid until ${u.verifiedUntil}. Photos deleted`);
  try { await forgetStudentId(userId); }
  catch (x) { if (/duplicate|unique/i.test((x as Error).message)) throw new ApiError('Another account is already verified with this student number.', 'until'); throw x; }
}
/** Rejects a student ID with a reason the student can read. The photos are deleted; they can send new ones. */
export async function rejectStudentId(userId: string, reason: string) {
  await adminFresh();
  await wait(500); await fresh(); if (!reason.trim()) throw new ApiError('Give a reason so the student knows what to fix.', 'reason');
  const u = getDb().users.find(x => x.id === userId)!; u.idStatus = 'rejected'; u.idNote = reason.trim();
  notify(userId, { kind: 'review', title: 'We could not accept your student ID', text: reason.trim(), to: '/signup' });
  audit('Rejected student ID', u.name, `${reason.trim()}. Photos deleted`);
  await forgetStudentId(userId);
}

/** Checks a custodian invite code. Returns the invite and its hostel, or throws ApiError if it is wrong, used or expired. */
export async function lookupInvite(code: string) {
  if (live) {
    const { data, error } = await sb!.rpc('lookup_invite', { p_code: code.trim() }); if (error) throw new ApiError(friendly(error), 'code');
    const inv = data as (Invite & { expired: boolean; hostel: Hostel }) | null;
    if (!inv) throw new ApiError('That invite code is not valid. Check it with the hostel owner.', 'code');
    if (inv.used) throw new ApiError('This invite has already been used.', 'code');
    if (inv.cancelled) throw new ApiError('The owner cancelled this invite. Ask them for a new one.', 'code');
    if (inv.expired) throw new ApiError('This invite has expired. Ask the owner to send it again.', 'code');
    return inv;
  }
  await wait(500);
  const inv = getDb().invites.find(i => i.code.toUpperCase() === code.trim().toUpperCase());
  if (!inv) throw new ApiError('That invite code is not valid. Check it with the hostel owner.', 'code');
  if (inv.used) throw new ApiError('This invite has already been used.', 'code');
  return { ...inv, hostel: getDb().hostels.find(h => h.id === inv.hostelId)! };
}
/** Creates the custodian account from an invite code. Takes name, username and password. Returns the new user. */
export async function acceptInvite(code: string, input: { name: string; username: string; password: string }) {
  if (live) {
    // A server function creates the account, so custodians without an email address can still join.
    const { data, error } = await sb!.functions.invoke('accept-invite', { body: { code, name: input.name.trim(), username: input.username.trim().toLowerCase(), password: input.password } });
    if (error || !data?.email) {
      let msg = 'We could not create your account. Try again.'; let field: string | undefined;
      try { const body = await (error as { context?: Response })?.context?.json(); if (body?.error) { msg = body.error; field = body.field; } } catch { /* keep the general message */ }
      if (data?.error) { msg = data.error; field = data.field; }
      throw new ApiError(msg, field);
    }
    return liveLogin(data.email as string, input.password);
  }
  await wait(700); const db = getDb();
  const inv = db.invites.find(i => i.code.toUpperCase() === code.trim().toUpperCase());
  if (!inv || inv.used) throw new ApiError('This invite is no longer valid.');
  const uname = input.username.trim().toLowerCase();
  if (db.users.some(u => u.username?.toLowerCase() === uname)) throw new ApiError('That username is taken. Try another.', 'username');
  const viaSms = inv.email.endsWith('@sms.nestly.app');
  const u: User = { id: id('u'), role: 'custodian', name: input.name.trim(), username: uname, email: inv.email, phone: viaSms ? inv.email.split('@')[0] : undefined, password: input.password, emailVerified: true, hostelId: inv.hostelId, joined: isoNow(), lastActive: isoNow() };
  db.users.push(u); inv.used = true; storage.set(SESSION, u.id); await commit(); return safe(u);
}

/* ---------- Profile and settings ---------- */
export async function usernameAvailable(name: string, selfId: string) {
  if (live) { const { data } = await sb!.rpc('username_free', { p_username: name.trim() }); return !!data; }
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
  if (live && patch.email !== undefined && patch.email !== u.email) {
    // The new address gets a confirmation link; the profile switches over once it is opened.
    const { error } = await sb!.auth.updateUser({ email: patch.email.trim().toLowerCase() }, { emailRedirectTo: siteUrl() + '/c/settings/profile' });
    if (error) throw new ApiError(friendly(error), 'email');
    delete patch.email;
  }
  Object.assign(u, patch); await commit(); return safe(u);
}
/** Changes the password after checking the current one. Throws ApiError on a wrong current password. */
export async function changePassword(userId: string, current: string, next: string) {
  if (live) {
    if (current === next) throw new ApiError('Choose a password you have not used here before.', 'next');
    const u = getDb().users.find(x => x.id === userId)!;
    const check = await sb!.auth.signInWithPassword({ email: u.email, password: current });
    if (check.error) throw new ApiError('Your current password is not right.', 'current');
    const { error } = await sb!.auth.updateUser({ password: next }); if (error) throw new ApiError(friendly(error), 'next');
    return;
  }
  await wait(700); const u = getDb().users.find(x => x.id === userId)!;
  if (u.password !== current) throw new ApiError('Your current password is not right.', 'current');
  if (current === next) throw new ApiError('Choose a password you have not used here before.', 'next');
  u.password = next; await commit();
}

/* ---------- Hostels ---------- */
export const hostelById = (hid: string) => getDb().hostels.find(h => h.id === hid);
const isLive = (h: Hostel) => (h.status ?? 'live') === 'live';
/** Live hostels near a university, for Explore. */
export async function listHostels(uniId: string) { await wait(350); return getDb().hostels.filter(h => h.uni === uniId && isLive(h)); }
/** One hostel and its visible reviews, for the hostel page. Also counts a view. Throws if the hostel does not exist. */
export async function getHostel(hid: string) { await wait(300); const h = hostelById(hid); if (!h) throw new ApiError('Hostel not found'); if (live) void sb!.rpc('bump_hostel', { p_hostel: hid, p_field: 'views' }); else h.views = (h.views ?? 0) + 1; return { hostel: h, reviews: getDb().reviews.filter(r => r.hostelId === hid && !r.hidden) }; }
/** The cheapest room type price per semester, or 0. */
export const minPrice = (h: Hostel) => (h.rooms.length ? Math.min(...h.rooms.map(r => r.price)) : 0);
/** How many rooms are still free across all room types. */
export const roomsLeft = (h: Hostel) => h.rooms.reduce((a, r) => a + r.total - r.taken, 0);

/** The ids of hostels a student saved. */
export function savedIds(userId: string) { return getDb().saved[userId] ?? []; }
/** Saves or unsaves a hostel for a student. Also counts saves for the owner. */
export async function toggleSaved(userId: string, hid: string) {
  const list = getDb().saved[userId] ?? (getDb().saved[userId] = []);
  const i = list.indexOf(hid); if (i >= 0) list.splice(i, 1); else { list.unshift(hid); const h = hostelById(hid); if (h && !live) h.saves = (h.saves ?? 0) + 1; }
  if (live) void sb!.rpc('bump_hostel', { p_hostel: hid, p_field: 'saves', p_by: i >= 0 ? -1 : 1 });
  await commit(); return i < 0;
}
/** The live hostels a student saved. */
export async function listSaved(userId: string) { await wait(300); return (savedIds(userId).map(hostelById).filter(Boolean) as Hostel[]).filter(isLive); }

/* ---------- Bookings ---------- */
/* ---------- Mobile money with real data (Flutterwave, through the "payments" server function) ---------- */
/** What happened to a payment. `next` says what the person must do while it is pending. */
export type PayResult = { txRef?: string; result: 'paid' | 'failed' | 'pending'; kind?: 'booking' | 'subscription'; bookingId?: string; hostelId?: string; paidUntil?: string; cancelUntil?: string; error?: string;
  next?: { type: 'approve' | 'otp' | 'redirect'; note?: string; url?: string } };
async function payCall(body: Record<string, unknown>): Promise<PayResult> {
  const { data, error } = await sb!.functions.invoke('payments', { body });
  if (error || !data) {
    let msg = 'We could not reach the payment service. Check your connection and try again.'; let field: string | undefined;
    try { const b = await (error as { context?: Response })?.context?.json(); if (b?.error) { msg = b.error; field = b.field; } } catch { /* keep the general message */ }
    throw new ApiError(msg, field);
  }
  const r: PayResult = { txRef: data.tx_ref ?? body.tx_ref as string | undefined, result: data.result, kind: data.kind, bookingId: data.booking_id, hostelId: data.hostel_id,
    paidUntil: data.paid_until, cancelUntil: data.cancel_until, error: data.error ?? data.reason, next: data.next };
  if (r.result !== 'pending') await reload();
  // A payment method that needs a web page (not usual for mobile money): go there and come back to /pay/return.
  if (r.result === 'pending' && r.next?.type === 'redirect' && r.next.url) { window.location.assign(r.next.url); return new Promise<never>(() => undefined); }
  return r;
}
/** Live data: asks Flutterwave to charge a student's phone for a booking fee. The server sets the price. Returns the pending payment. */
export const startBookingPayment = (hid: string, roomIdx: number, phone: string, method: 'mtn' | 'airtel') =>
  payCall({ action: 'start', kind: 'booking', hostel_id: hid, room: roomIdx, phone, network: method, back: siteUrl() });
/** Live data: asks Flutterwave to charge an owner's phone for months of subscription. */
export const startSubscriptionPayment = (months: number, phone: string, method: 'mtn' | 'airtel') =>
  payCall({ action: 'start', kind: 'subscription', months, phone, network: method, back: siteUrl() });
/** Live data: sends the code Flutterwave asked for (in test mode it is always 123456). */
export const sendPaymentCode = (txRef: string, otp: string) => payCall({ action: 'otp', tx_ref: txRef, otp });
/** Live data: asks the server to check a payment with Flutterwave and confirm it if the money arrived. */
export const confirmPayment = (q: { txRef: string }) => payCall({ action: 'confirm', tx_ref: q.txRef });
export async function listBookings(userId: string) {
  await wait(350);
  return getDb().bookings.filter(b => b.userId === userId && b.status !== 'pending').slice().reverse().map(b => ({ ...b, hostel: hostelById(b.hostelId)! }));
}
/** True when the student already has an active booking for that semester. */
export const hasBookingFor = (userId: string, sem: string) => getDb().bookings.some(b => b.userId === userId && b.sem === sem && b.status !== 'cancelled' && b.status !== 'pending');
/** Books a room and takes the booking fee by mobile money. Takes student, hostel, room type index, phone and network. Returns the booking. The fee goes straight to the owner. Throws ApiError if the payment fails or the room is gone. */
export async function createBooking(userId: string, hid: string, roomIdx: number, phone: string, method: 'mtn' | 'airtel') {
  if (live) throw new ApiError('Use startBookingPayment with real data.');
  await wait(2200);
  const u = getDb().users.find(x => x.id === userId)!; const h = hostelById(hid)!; const r = h.rooms[roomIdx]!;
  if (!u.emailVerified) throw new ApiError(u.verifyVia === 'id' ? 'Your student ID is not approved yet. You can book once it is.' : 'Confirm your student email before booking.');
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
  const b: Booking = { id: 'NST-' + (32100 + Math.floor(Math.random() * 800)), userId, hostelId: hid, room: r.t, sem: SEM, fee: h.fee, status: 'paid', rent: r.price, rentPaidOn: null, at: d.toISOString(),
    payRef: `${method === 'mtn' ? 'MP' : 'AM'}${String(Date.now()).slice(-6)}.${Math.floor(1000 + Math.random() * 8999)}`,
    paidOn: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }), cancelUntil: until.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) };
  getDb().bookings.push(b);
  // The student now waits for the custodian to give them a room.
  getDb().tenants.push({ id: id('t'), hostelId: hid, name: u.name, phone: u.phone ?? phone, type: r.t, status: 'due', room: '', end: d0(sem.end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }), userId, bookingId: b.id });
  notify(userId, { kind: 'booking', title: 'Booking confirmed', text: `${h.name}, ${SEM}. Ref ${b.id}.`, to: '/s/bookings' });
  notify(h.ownerId, { kind: 'booking', title: `New booking at ${h.name}`, text: `${u.name} booked a ${r.t.toLowerCase()} room for ${SEM}.`, to: '/o/bookings' });
  custodiansOf(hid).forEach(c => notify(c.id, { kind: 'tenant', title: `${u.name} needs a room`, text: `Booked a ${r.t.toLowerCase()} room. Give them a room on the Rooms page.`, to: '/c/rooms' }));
  syncTypeCounts(hid); await commit(); return b;
}
/** Rent for the semester: fixed when the student booked, or the room type's price for older bookings. */
export const rentTotal = (b: Booking) => b.rent ?? hostelById(b.hostelId)?.rooms.find(r => r.t === b.room)?.price ?? 0;
/** What the student still pays at check-in: the semester rent less the booking fee they already paid. */
export const balanceDue = (b: Booking) => Math.max(0, rentTotal(b) - b.fee);
/** The booking behind a tenant, if any. */
export const bookingOfTenant = (t: Tenant) => getDb().bookings.find(x => x.id === t.bookingId);
/**
 * True while the balance has not been collected, so the custodian cannot check the student in yet.
 * In live mode this only applies once the database has the rent column (migration 0009), so `rent` must exist on the booking.
 */
export const balanceOwed = (b?: Booking | null) => !!b && b.status === 'paid' && (!live || b.rent !== undefined) && !b.rentPaidOn && balanceDue(b) > 0;
/** The custodian confirms they received the balance. After this the student can be checked in. Takes the tenant. Returns the booking. */
export async function recordRentPayment(tid: string) {
  await wait(400); const db = getDb(); const t = db.tenants.find(x => x.id === tid)!; const b = db.bookings.find(x => x.id === t.bookingId);
  if (!b) throw new ApiError('This tenant has no booking.');
  b.rent = b.rent ?? rentTotal(b); b.rentPaidOn = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  audit('Recorded rent balance', `${hostelById(b.hostelId)?.name}, ${t.name}`, `${ugxPlain(balanceDue(b))} received for ${b.sem} (rent ${ugxPlain(rentTotal(b))}, booking fee ${ugxPlain(b.fee)})`);
  notify(b.userId, { kind: 'money', title: 'Rent received', text: `${hostelById(b.hostelId)?.name} received your balance of ${ugx(balanceDue(b))}. You can move in.`, to: '/s/bookings' });
  await commit(); return b;
}
/** Cancels a booking and frees the room. The owner sends the fee back. Returns the booking. */
export async function cancelBooking(bid: string) {
  await wait(700); const b = getDb().bookings.find(x => x.id === bid)!;
  b.status = 'cancelled'; const r = hostelById(b.hostelId)!.rooms.find(x => x.t === b.room); if (r) r.taken--;
  getDb().tenants = getDb().tenants.filter(t => !(t.bookingId === b.id && t.status === 'due'));
  audit('Cancelled booking', hostelById(b.hostelId)?.name ?? '', `${getDb().users.find(u => u.id === b.userId)?.name ?? 'Student'}: ${b.room}, ${b.sem}. Booking fee ${ugxPlain(b.fee)} is returned by the owner`);
  syncTypeCounts(b.hostelId); await commit(); return b;
}
/** Adds the student's stars and review after a stay. */
export async function rateBooking(bid: string, stars: number, text: string, who: string) {
  await wait(600); const db = getDb(); const b = db.bookings.find(x => x.id === bid)!;
  db.reviews.unshift({ id: id('v'), hostelId: b.hostelId, userId: b.userId, bookingId: b.id, who, stars, when: new Date().toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }), text: text || 'No comment.' });
  b.status = 'rated'; hostelById(b.hostelId)!.nRev++; await commit();
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
/** True when the signed-in person runs this hostel (custodian, owner or admin), so they see its tenants and visitors. */
const isStaffOf = (hostelId: string) => { const me = sessionUser(); const h = hostelById(hostelId);
  return !!me && (me.role === 'admin' || (me.role === 'custodian' && me.hostelId === hostelId) || (!!h && h.ownerId === me.id)); };
const visitorFromRow = (r: Record<string, unknown>): Visitor => ({ id: String(r.id), hostelId: String(r.hostel_id), name: String(r.name), room: String(r.room), host: (r.host as string) ?? undefined,
  phone: (r.phone as string) ?? undefined, tin: String(r.tin), tout: (r.tout as string) ?? null, via: r.via as Visitor['via'], date: String(r.date) });
/** Shortens "Sarah Atim" to "Sarah A." for visitors at the gate. */
const firstAndInitial = (n: string) => { const [a, b] = n.trim().split(/\s+/); return b ? `${a} ${b[0]!.toUpperCase()}.` : a ?? ''; };
/**
 * "Who are you visiting?" Staff can search by name or room. A visitor at the gate must give the exact room and at
 * least three letters of the resident's first or last name, and sees only their first name and initial (finding F3).
 */
export async function findResidents(hostelId: string, q: string, room?: string): Promise<{ id: string; name: string; room: string }[]> {
  const s = q.trim().toLowerCase();
  if (!isStaffOf(hostelId)) {
    const r = (room ?? '').trim().toUpperCase();
    if (s.length < 3 || !r) return [];
    if (live) {
      const { data, error } = await sb!.rpc('find_resident', { p_hostel: hostelId, p_room: r, p_q: s }); if (error) throw new ApiError(friendly(error));
      return ((data ?? []) as { id: string; label: string; room: string }[]).map(x => ({ id: x.id, name: x.label, room: x.room }));
    }
    await wait(150);
    return getDb().tenants.filter(t => t.hostelId === hostelId && t.status === 'in' && t.roomId && t.room.toUpperCase() === r && t.name.toLowerCase().split(/\s+/).some(w => w.startsWith(s)))
      .slice(0, 3).map(t => ({ id: t.id, name: firstAndInitial(t.name), room: t.room }));
  }
  await wait(120);
  return getDb().tenants.filter(t => t.hostelId === hostelId && t.status === 'in' && t.roomId && (!s || `${t.name} ${t.room}`.toLowerCase().includes(s)))
    .sort((a, b) => a.name.localeCompare(b.name)).map(t => ({ id: t.id, name: t.name, room: t.room }));
}
/** Signs a visitor in, from the gate QR or by the custodian. Takes name, room, who they visit and phone. Returns the visitor. */
export async function signInVisitor(hostelId: string, input: { name: string; room: string; host?: string; hostId?: string; phone?: string }, via: 'QR' | 'Custodian') {
  const { hostId, ...rest } = input;
  if (live && !isStaffOf(hostelId)) {
    const { data, error } = await sb!.rpc('visitor_check_in', { p_hostel: hostelId, p_name: input.name, p_tenant: hostId ?? '', p_phone: input.phone ?? '' });
    if (error) throw new ApiError(friendly(error)); return visitorFromRow(data as Record<string, unknown>);
  }
  await wait(500);
  // At the gate the visitor only saw "Sarah A.", so the log gets the resident's full name from their record.
  const t = hostId ? getDb().tenants.find(x => x.id === hostId && x.hostelId === hostelId) : undefined;
  const v = { id: id('vs'), hostelId, ...rest, ...(t ? { host: t.name, room: t.room } : {}), tin: nowTime(), tout: null, via, date: todayIso() };
  getDb().visitors.push(v); await commit(); return v;
}
/** A visitor's own pass, for the gate page on their phone. Returns null if the visit is over or unknown. */
export async function getVisit(vid: string): Promise<Visitor | null> {
  if (live) { const { data } = await sb!.rpc('visitor_pass', { p_id: vid }); const r = data as Record<string, unknown> | null; return r?.id ? visitorFromRow(r) : null; }
  return getDb().visitors.find(x => x.id === vid) ?? null;
}
/** Marks a visitor as left. */
export async function signOutVisitor(vid: string) {
  if (live && !getDb().visitors.some(x => x.id === vid)) {
    const { error } = await sb!.rpc('visitor_sign_out', { p_id: vid }); if (error) throw new ApiError(friendly(error)); return;
  }
  await wait(300); const v = getDb().visitors.find(x => x.id === vid)!; v.tout = nowTime(); await commit();
}
/** Puts a visitor back inside, for the Undo button. */
export async function undoSignOut(vid: string) { await wait(150); const v = getDb().visitors.find(x => x.id === vid)!; v.tout = null; await commit(); }
/** Every tenant of a hostel: arriving, staying and left. */
export async function listTenants(hostelId: string) { await wait(300); return getDb().tenants.filter(t => t.hostelId === hostelId); }
/** Checks a tenant in or out. */
export async function setTenantStatus(tid: string, status: 'in' | 'out') {
  await wait(400); const db = getDb(); const t = db.tenants.find(x => x.id === tid)!;
  const b = db.bookings.find(x => x.id === t.bookingId);
  if (status === 'in' && !t.roomId) throw new ApiError(`Give ${t.name.split(' ')[0]} a room first.`);
  if (status === 'in' && balanceOwed(b)) throw new ApiError(`${t.name.split(' ')[0]} still owes ${ugx(balanceDue(b!))}. Collect the balance before checking them in.`);
  t.status = status;
  if (status === 'in' && b) { b.status = 'checked-in'; b.roomNo = t.room; }
  if (status === 'out') {
    t.end = 'Left ' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    if (b && b.status === 'checked-in') b.status = 'completed';
    t.roomId = undefined; t.bed = undefined; // the bed is free again
  }
  audit(status === 'in' ? 'Checked in' : 'Checked out', `${hostelById(t.hostelId)?.name}, room ${t.room}`, t.name);
  syncTypeCounts(t.hostelId); await commit(); return t;
}
/** Notices a custodian posted to a hostel. */
export async function listNotices(hostelId: string) { await wait(250); return getDb().notices.filter(n => n.hostelId === hostelId); }
/** Posts a notice to every tenant of a hostel and notifies them. */
export async function postNotice(hostelId: string, text: string, by: string) {
  await wait(500); const db = getDb(); db.notices.unshift({ id: id('n'), hostelId, text, by, at: isoNow() });
  db.tenants.filter(t => t.hostelId === hostelId && t.status === 'in' && t.userId).forEach(t => notify(t.userId, { kind: 'notice', title: `New notice at ${hostelById(hostelId)?.name}`, text, to: '/s/my-hostel' }));
  await commit();
}

/* ---------- Notifications ---------- */
export async function listNotifications(userId: string) { await wait(200); return getDb().notifications.filter(n => n.userId === userId); }
/** Marks one notification as read. */
export async function markRead(nid: string) { const n = getDb().notifications.find(x => x.id === nid); if (n && !n.read) { n.read = true; await commit(); } }
/** Marks all of a person's notifications as read. */
export async function markAllRead(userId: string) { await wait(150); getDb().notifications.forEach(n => { if (n.userId === userId) n.read = true; }); await commit(); }


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
/** Admin decisions need a recent password or two-step code (the database checks it too). */
const adminFresh = async () => { const me = sessionUser(); if (me) await freshAuth(me.id, me.email); };
function audit(action: string, target: string, detail = '') {
  const me = sessionUser(); if (!me) return;
  getDb().audit.unshift({ id: id('a'), at: isoNow(), actorId: me.id, actorRole: me.role, action, target, detail });
}
/** Admins to notify. With real data the database tells the admins itself (see 0005_stage2.sql), so this is empty. */
/** Live mode: loads the latest data first, so a decision is made on what is really there now (an owner may have just changed the listing). */
const fresh = () => (live ? reload() : Promise.resolve());
/** Admins to notify. */
const adminIds = () => live ? [] : getDb().users.filter(u => u.role === 'admin').map(u => u.id);

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
  syncTypeCounts(r.hostelId); await commit();
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
  syncTypeCounts(r.hostelId); await commit(); return t;
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
  syncTypeCounts(r.hostelId); await commit(); return t;
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
  // The subscription starts when the first hostel goes live. Before that there is nothing to pay.
  // Never paid but listed: the first payment is due the day the first hostel went live, with the usual grace days.
  const firstLive = getDb().hostels.filter(h => h.ownerId === u.id && (h.status === 'live' || h.status === 'suspended')).map(h => h.listedAt ?? isoNow()).sort()[0];
  const never = !u.subPaidUntil; const started = !never || hostels > 0;
  const start = firstLive ? new Date(new Date(firstLive).toDateString()) : new Date(now.toDateString());
  const paidUntil = u.subPaidUntil ? new Date(u.subPaidUntil + 'T23:59:59') : new Date(+start - 1000);
  const due = never ? start : new Date(paidUntil.getFullYear(), paidUntil.getMonth() + 1, 1);
  const overdue = live && started && now > paidUntil; const daysLeft = Math.ceil((+due - +now) / DAY);
  const extra = u.subGraceUntil ? new Date(u.subGraceUntil + 'T23:59:59') : null;
  const graceEnd = new Date(Math.max(+due + cfg.graceDays * DAY - 1, extra ? +extra : 0));
  const state: SubState = !live || !started ? 'off' : !overdue ? (daysLeft <= 7 ? 'due' : 'paid') : now <= graceEnd ? 'grace' : 'late';
  const daysLate = overdue ? Math.max(1, Math.floor((+now - +due) / DAY) + 1) : 0;
  const owed = overdue ? fee * Math.max(1, (now.getFullYear() - due.getFullYear()) * 12 + now.getMonth() - due.getMonth() + 1) : 0;
  const paid = getDb().subPayments?.filter(p => p.ownerId === u.id) ?? [];
  // Receipts are only real payments. An owner who never paid has none.
  const history = paid.slice(0, 8).map(p => { const m = /(\d{4})(\d{2})$/.exec(p.ref); const label = m ? monthLabel(+m[1]!, +m[2]! - 1) : monthLabel(new Date(p.at).getFullYear(), new Date(p.at).getMonth());
    return { month: p.months > 1 ? `${label} and ${p.months - 1} more` : label, amount: p.amount, ref: p.ref, paidOn: p.at.slice(0, 10), via: p.via }; });
  const paused = getDb().hostels.filter(h => h.ownerId === u.id && h.pausedFor === 'subscription').length;
  return { live, started, neverPaid: never, fee: started ? fee : 0, unitFee: fee, hostels, paused, perHostel: cfg.perHostel, unit: cfg.subFee, paidUntil: iso(paidUntil), due: iso(due), overdue, daysLeft, daysLate, owed, state,
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
  if (live) throw new ApiError('Use startSubscriptionPayment with real data.');
  await wait(900); const u = getDb().users.find(x => x.id === ownerId)!;
  addMonths(u, months, 'app');
  audit('Paid subscription', u.name, `${months} month${months > 1 ? 's' : ''}`); await commit(); return subscriptionOf(u);
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
  const owners = db.users.filter(u => u.role === 'owner' && u.ownerStatus === 'approved').map(subscriptionOf).filter(s => s.started);
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
  audit('Recorded subscription payment', u.name, `${ugxPlain(p.amount)}, ${note.trim()}`); await commit(); return subscriptionOf(u);
}
/** Sends an owner a payment reminder by notification and email. */
export async function remindSubscription(ownerId: string) {
  await wait(400); const db = getDb(); const u = db.users.find(x => x.id === ownerId)!; const s = subscriptionOf(u);
  const text = s.overdue ? `Your Nestly subscription is ${s.daysLate} ${s.daysLate === 1 ? 'day' : 'days'} late. Pay ${ugxPlain(s.owed)} to keep your hostels on Nestly.` : `Your Nestly subscription of ${ugxPlain(s.fee)} is due soon.`;
  notify(u.id, { kind: 'money', title: s.overdue ? 'Your subscription is late' : 'Your subscription is due soon', text, to: '/o/money' });
  db.mail.unshift({ id: id('m'), to: u.email, subject: 'Your Nestly subscription', body: text, when: isoNow() });
  u.subRemindedAt = isoNow(); audit('Sent payment reminder', u.name, s.overdue ? `${s.daysLate} days late` : 'Due soon'); await commit();
}
/** Gives an owner extra days before their listings can be paused. */
export async function giveMoreTime(ownerId: string, days: number) {
  await wait(400); const u = getDb().users.find(x => x.id === ownerId)!;
  u.subGraceUntil = iso(new Date(Date.now() + days * DAY));
  notify(u.id, { kind: 'money', title: `You have ${days} more days to pay`, text: 'Your hostels stay on Nestly while you pay your subscription.', to: '/o/money' });
  audit('Gave more time to pay', u.name, `${days} more days`); await commit();
}
/** Takes an owner's live hostels off Explore until they pay. Bookings already made stay valid. */
export async function pauseForUnpaid(ownerId: string) {
  await wait(500); const db = getDb(); const u = db.users.find(x => x.id === ownerId)!;
  const hs = db.hostels.filter(h => h.ownerId === ownerId && h.status === 'live');
  hs.forEach(h => { h.status = 'suspended'; h.pausedFor = 'subscription'; h.suspendReason = 'Subscription not paid'; });
  notify(u.id, { kind: 'money', title: 'Your hostels are paused', text: 'Students cannot find them until you pay your subscription. They come back as soon as you pay. Bookings already made stay valid.', to: '/o/money' });
  audit('Paused for unpaid subscription', u.name, `${hs.length} ${hs.length === 1 ? 'hostel' : 'hostels'} off Explore`); await commit(); return hs.length;
}
/** Saves the subscription price, per hostel or per owner, and the grace days. Tells owners if the price changed. */
export async function saveConfig(c: Config) {
  await wait(500);
  if (!Number.isFinite(c.subFee) || c.subFee < 1000) throw new ApiError('Enter a price of at least UGX 1,000.', 'subFee');
  if (!Number.isInteger(c.graceDays) || c.graceDays < 0 || c.graceDays > 30) throw new ApiError('Choose between 0 and 30 days.', 'graceDays');
  const before = subConfig(); getDb().config = { ...c };
  if (before.subFee !== c.subFee || before.perHostel !== c.perHostel) getDb().users.filter(u => u.role === 'owner' && u.ownerStatus === 'approved').forEach(u => {
    const s = subscriptionOf(u); notify(u.id, { kind: 'money', title: 'Your Nestly price is changing', text: `From your next payment you pay ${ugxPlain(s.fee)} a month.`, to: '/o/money' }); });
  audit('Changed subscription price', 'Nestly', `${ugxPlain(c.subFee)} ${c.perHostel ? 'per hostel' : 'per owner'} a month, ${c.graceDays} days to pay${before.subFee !== c.subFee ? ` (was ${ugxPlain(before.subFee)})` : ''}`); await commit();
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
export async function signupOwner(input: { name: string; phone: string; email: string; password: string; captchaToken?: string }) {
  await wait(700); const db = getDb(); const email = input.email.trim().toLowerCase();
  if (db.users.some(u => u.email.toLowerCase() === email)) throw new ApiError('An account with this email already exists. Log in instead.', 'email');
  if (!/^0?7\d{8}$/.test(input.phone.replace(/\s/g, ''))) throw new ApiError('Enter a 10-digit MTN or Airtel number.', 'phone');
  if (live) {
    await liveSignUp(email, input.password, '/owner/signup', { role: 'owner', name: input.name.trim(), phone: input.phone.trim() }, input.captchaToken);
    return { id: '', role: 'owner', name: input.name.trim(), email, password: '', emailVerified: false, ownerStatus: 'incomplete' } as User;
  }
  const u: User = { id: id('u'), role: 'owner', name: input.name.trim(), email, phone: input.phone, password: input.password, emailVerified: true, ownerStatus: 'incomplete', joined: isoNow() };
  db.users.push(u); storage.set(SESSION, u.id); await commit(); return safe(u);
}
/** Saves an uploaded ID, selfie or proof of ownership. Takes the owner, kind, file name and file data. */
export async function uploadDoc(ownerId: string, kind: VerificationDoc['kind'], fileName: string, url: string, hostelId?: string, file?: File) {
  await wait(live ? 0 : 900); const db = getDb(); const did = id('d');
  // Live data: the file goes to private storage first. PDFs are uploaded as they are; images already shrunk.
  const stored = live ? await uploadDocFile(ownerId, did, fileName, url, url ? undefined : file) : url;
  const old = db.docs.filter(d => d.ownerId === ownerId && d.kind === kind && d.hostelId === hostelId);
  db.docs = db.docs.filter(d => !old.includes(d));
  const d: VerificationDoc = { id: did, ownerId, hostelId, kind, fileName, url: stored, uploadedAt: isoNow(), status: 'pending' };
  db.docs.push(d); await commit();
  if (live) { await presentDocs([d]); for (const o of old) await removeDocFile(storedDocUrl(o)); }
  return d;
}
/** The documents an owner uploaded. */
export const docsOf = (ownerId: string) => getDb().docs.filter(d => d.ownerId === ownerId);
/** True when the two names share a word of three or more letters ("Grace Namuli" and "NAMULI GRACE A."). */
export const namesMatch = (a: string, b: string) => { const w = (x: string) => x.toLowerCase().split(/[^a-z]+/).filter(y => y.length >= 3); const A = w(a); return w(b).some(y => A.includes(y)); };
const payoutLabel = (p: NonNullable<User['payout']>) => `${p.method === 'bank' ? 'bank account' : p.method === 'mtn' ? 'MTN Mobile Money' : 'Airtel Money'} ending ${p.to.replace(/\s/g, '').slice(-4)}`;
/**
 * Saves the bank or mobile money account students pay into. The first account (during owner sign-up) is saved at
 * once. After approval, a change waits 24 hours: the owner gets an email with a link to cancel it, and if the
 * name on the new account does not match theirs, a Nestly admin must check it first.
 * Asks for the password (or the two-step code) when changing an existing account.
 */
export async function savePayout(ownerId: string, payout: NonNullable<User['payout']>, password?: string) {
  await wait(500); const u = getDb().users.find(x => x.id === ownerId)!;
  if (payout.method !== 'bank' && !/^0?7\d{8}$/.test(payout.to.replace(/\s/g, ''))) throw new ApiError('Enter a 10-digit mobile money number.', 'to');
  if (!payout.name.trim()) throw new ApiError('Enter the name on the account.', 'name');
  if (live && u.payout && await twoStepOn(ownerId)) await freshAuth(ownerId, u.email);
  else if (password !== undefined) {
    const ok = live ? !(await sb!.auth.signInWithPassword({ email: u.email, password })).error : u.password === password;
    if (!ok) throw new ApiError('That password is not right.', 'password');
  }
  const delayed = !!u.payout && u.ownerStatus === 'approved';
  if (!delayed) {
    const was = u.payout; u.payout = payout;
    audit('Changed payout account', u.name, `${was ? `${was.method} to ` : ''}${payoutLabel(payout)}, name ${payout.name.trim()}`);
    await commit(); return safe(u);
  }
  if (live) {
    const { error } = await sb!.rpc('request_payout_change', { p_payout: { ...payout, name: payout.name.trim() } });
    if (error) throw new ApiError(friendly(error));
    await reload(); return safe(getDb().users.find(x => x.id === ownerId)!);
  }
  const review = !namesMatch(payout.name, u.name);
  u.payoutPending = { ...payout, name: payout.name.trim() }; u.payoutPendingAt = isoNow(); u.payoutReview = review;
  audit('Asked to change payout account', u.name, `To ${payoutLabel(payout)}, name ${payout.name.trim()}${review ? '. Name differs: admin check needed' : ''}`);
  notify(ownerId, { kind: 'money', title: 'Payout change requested', text: `We emailed you about it. It starts in 24 hours${review ? ', after the Nestly team checks the name' : ''}. Not you? Cancel it on the payout page.`, to: '/o/settings/payout' });
  if (review) adminIds().forEach(a => notify(a, { kind: 'review', title: 'Payout name to check', text: `${u.name} wants payments to go to an account named ${payout.name.trim()}.`, to: '/a/reviews?tab=payouts' }));
  await commit(); return safe(u);
}
/** Puts waiting payout changes in place once their 24 hours are up (and any admin check is done). */
export async function applyDuePayouts() {
  if (live) { const { data } = await sb!.rpc('apply_due_payouts'); if (data) await reload(); return; }
  const due = Date.now() - 86400000; let n = 0;
  getDb().users.forEach(u => { if (u.payoutPending && !u.payoutReview && u.payoutPendingAt && +new Date(u.payoutPendingAt) <= due) { u.payout = u.payoutPending; u.payoutPending = undefined; u.payoutPendingAt = undefined; u.payoutReview = false; n++; } });
  if (n) await commit();
}
/** The owner cancels their own waiting payout change. */
export async function cancelMyPayoutChange(ownerId: string) {
  if (live) { const { error } = await sb!.rpc('cancel_my_payout_change'); if (error) throw new ApiError(friendly(error)); await reload(); return; }
  const u = getDb().users.find(x => x.id === ownerId)!; u.payoutPending = undefined; u.payoutPendingAt = undefined; u.payoutReview = false;
  audit('Cancelled payout change', u.name, 'From the payout settings page'); await commit();
}
/** The "this was not me" link from the payout email. Works without logging in. */
export async function cancelPayoutByLink(token: string): Promise<'cancelled' | 'invalid'> {
  if (!live) return 'invalid';
  const { data, error } = await sb!.rpc('cancel_payout_change', { p_token: token });
  if (error) throw new ApiError(friendly(error));
  return data === 'cancelled' ? 'cancelled' : 'invalid';
}
/** Admin: approves a waiting payout change whose account name differs from the owner's. */
export async function approvePayoutChange(ownerId: string) {
  await adminFresh(); await wait(400);
  if (live) { const { error } = await sb!.rpc('approve_payout_change', { p_owner: ownerId }); if (error) throw new ApiError(friendly(error)); await reload(); return; }
  const u = getDb().users.find(x => x.id === ownerId)!; u.payoutReview = false;
  audit('Approved payout change', u.name, 'Name on the new account checked');
  notify(ownerId, { kind: 'money', title: 'Payout account approved', text: 'The Nestly team checked your new payout account. It starts 24 hours after you asked.', to: '/o/money' });
  await commit();
}
/** Admin: refuses a waiting payout change. The old account stays. */
export async function rejectPayoutChange(ownerId: string, reason: string) {
  await adminFresh(); await wait(400); await fresh();
  if (!reason.trim()) throw new ApiError('Give a reason so the owner knows what to do.', 'reason');
  const u = getDb().users.find(x => x.id === ownerId)!; u.payoutPending = undefined; u.payoutPendingAt = undefined; u.payoutReview = false;
  audit('Rejected payout change', u.name, reason.trim());
  notify(ownerId, { kind: 'money', title: 'Payout change not accepted', text: `${reason.trim()} Your payout account stays as it was.`, to: '/o/settings/payout' });
  await commit();
}
/** Sends a new owner to the Nestly team for checking. */
export async function submitOwner(ownerId: string) {
  await wait(700); const u = getDb().users.find(x => x.id === ownerId)!;
  u.ownerStatus = 'pending'; u.ownerNote = undefined;
  adminIds().forEach(a => notify(a, { kind: 'review', title: 'Owner waiting for review', text: `${u.name} sent their ID and payment account.`, to: '/a/reviews' }));
  await commit(); return safe(u);
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
  db.hostels.push(h); await commit(); return h;
}
/** True for a draft the owner has not filled in at all, so leaving it can safely throw it away. */
export const isBlankDraft = (h: Hostel, rooms: { length: number }, docs: { length: number }) =>
  h.status === 'draft' && !h.name.trim() && !h.area.trim() && !(h.photos?.length) && !h.rooms.length && !rooms.length && !docs.length && !(h.about ?? '').trim() && !h.amen.length && !(h.rules?.length);
/** Deletes a hostel that was never sent for review. Live, in-review and paused hostels cannot be deleted here, because students may have booked them. */
export async function deleteHostelDraft(hid: string) {
  await wait(300); const db = getDb(); const h = hostelById(hid); if (!h) return;
  if (h.status !== 'draft') throw new ApiError('Only a draft can be deleted. To remove a hostel that has been submitted, contact support@nestly.app.');
  if (db.bookings.some(b => b.hostelId === hid)) throw new ApiError('This hostel has bookings, so it cannot be deleted.');
  const photos = h.photos ?? [];
  audit('Deleted draft hostel', h.name || 'Untitled hostel', h.area || 'Nothing entered yet');
  db.hostels = db.hostels.filter(x => x.id !== hid);
  db.rooms = db.rooms.filter(r => r.hostelId !== hid);
  db.docs = db.docs.filter(d => d.hostelId !== hid);
  await commit();
  if (live && photos.length) await removeHostelPhotos(photos, []);
}
const REVIEW_FIELDS = ['name', 'photos', 'location', 'km', 'dir'];
/** Saves an owner's changes. Changing what students judge a listing by on a live hostel sends it back to review. */
export async function saveHostelDraft(hid: string, patch: Partial<Hostel>) {
  await wait(500); await fresh(); const h = hostelById(hid)!;
  const oldPhotos = h.photos ?? [];
  if (live && patch.photos) patch = { ...patch, photos: await uploadHostelPhotos(hid, patch.photos) };
  const touchesReview = h.status === 'live' && Object.keys(patch).some(k => REVIEW_FIELDS.includes(k) && JSON.stringify((patch as Record<string, unknown>)[k]) !== JSON.stringify((h as unknown as Record<string, unknown>)[k]));
  const LABEL: Record<string, string> = { name: 'name', uni: 'university', area: 'area', location: 'map pin', photos: 'photos', about: 'description', amen: 'amenities', rules: 'rules', visit: 'visiting hours', fee: 'booking fee', sems: 'semester dates', km: 'distance' };
  const changed = Object.keys(patch).filter(k => JSON.stringify((patch as Record<string, unknown>)[k]) !== JSON.stringify((h as unknown as Record<string, unknown>)[k])).map(k => LABEL[k] ?? k);
  const oldName = h.name;
  Object.assign(h, patch);
  if (changed.length) audit('Edited hostel', h.name || oldName || 'Untitled hostel', `Changed ${changed.join(', ')}${patch.name && oldName && oldName !== patch.name ? `. Name was ${oldName}` : ''}${touchesReview ? '. Sent back to review' : ''}`);
  if (patch.location || patch.uni) syncDistance(h);
  if (patch.photos) h.photoUrl = patch.photos[0];
  if (touchesReview) { h.status = 'in_review'; h.submittedAt = isoNow(); adminIds().forEach(a => notify(a, { kind: 'review', title: 'Listing changed', text: `${h.name} changed its name, photos or location.`, to: '/a/reviews' })); }
  await commit();
  if (live && patch.photos) await removeHostelPhotos(oldPhotos, h.photos ?? []);
  return { hostel: h, sentToReview: touchesReview };
}
/** Saves the room types and prices of a hostel. */
export async function updateRoomTypes(hid: string, types: RoomType[]) {
  await wait(500); const h = hostelById(hid)!;
  h.rooms = types.map(t => { const old = h.rooms.find(r => r.t === t.t); return { ...t, taken: old?.taken ?? 0 }; });
  syncTypeCounts(hid); await commit(); return h;
}
/** Adds several numbered rooms in one go, like A-01 to A-08. */
export async function generateRooms(hid: string, block: string, type: string, count: number, floor: number, beds: number) {
  await wait(500); const db = getDb(); const h = hostelById(hid)!;
  const b = block.trim().toUpperCase(); if (!/^[A-Z0-9]{1,3}$/.test(b)) throw new ApiError('Use a short block name like A or B2.', 'block');
  const existing = db.rooms.filter(r => r.hostelId === hid && r.block === b).length;
  for (let i = 1; i <= count; i++) { const n = existing + i; db.rooms.push({ id: id('r'), hostelId: hid, no: `${b}-${String(n).padStart(2, '0')}`, block: b, floor, type, beds, status: 'ready' }); }
  h.blocks = Array.from(new Set([...(h.blocks ?? []), b])).sort();
  syncTypeCounts(hid); await commit();
}
/** Changes one room: number, block, floor, type or beds. */
export async function updateRoom(rid: string, patch: Partial<Pick<Room, 'no' | 'block' | 'floor' | 'type' | 'beds'>>) {
  await wait(300); const db = getDb(); const r = db.rooms.find(x => x.id === rid)!;
  if (patch.no && db.rooms.some(x => x.hostelId === r.hostelId && x.id !== rid && x.no.toLowerCase() === patch.no!.trim().toLowerCase())) throw new ApiError('Another room already has that number.', 'no');
  const was = { ...r }; Object.assign(r, patch);
  const diff = (Object.keys(patch) as (keyof typeof patch)[]).filter(k => was[k] !== r[k]).map(k => `${k} ${was[k]} to ${r[k]}`).join(', ');
  if (diff) audit('Edited room', `${hostelById(r.hostelId)?.name}, ${was.no}`, diff);
  syncTypeCounts(r.hostelId); await commit();
}
/** Deletes a room. Throws ApiError if someone is in it. */
export async function deleteRoom(rid: string) {
  await wait(300); const db = getDb(); const r = db.rooms.find(x => x.id === rid)!;
  if (db.tenants.some(t => t.roomId === rid && t.status !== 'out')) throw new ApiError('Someone is in this room. Ask the custodian to move them first.');
  audit('Deleted room', `${hostelById(r.hostelId)?.name}, ${r.no}`, `${r.type}, block ${r.block}, floor ${r.floor}`);
  db.rooms = db.rooms.filter(x => x.id !== rid); syncTypeCounts(r.hostelId); await commit();
}
/** One line of the "ready to submit" checklist. */
export type CheckItem = { key: string; label: string; done: boolean };
/** What a hostel still needs before it can be sent for review. */
/** Room types that have no rooms set up yet. Students could never be given a room of these types. */
export const typesWithoutRooms = (h: Hostel, rooms: Room[]) => rooms.length ? h.rooms.filter(t => !rooms.some(r => r.type === t.t)).map(t => t.t) : [];
export function hostelChecklist(h: Hostel, rooms: Room[], hasProof: boolean): CheckItem[] {
  const roomCount = rooms.length;
  return [
    { key: 'basics', label: 'Name, university, booking fee and description', done: !!(h.name.trim() && h.fee > 0 && h.about.trim().length >= 20) },
    { key: 'location', label: 'Pin on the map and area name', done: !!h.location && !!h.area.trim() },
    { key: 'photos', label: 'At least 3 photos', done: (h.photos?.length ?? 0) >= 3 },
    { key: 'types', label: 'Room types and prices', done: h.rooms.length > 0 && h.rooms.every(r => r.price > 0 && (roomCount > 0 || r.total > 0)) },
    { key: 'rooms', label: 'Rooms set up for every room type', done: roomCount > 0 && typesWithoutRooms(h, rooms).length === 0 },
    { key: 'amenities', label: 'Amenities and house rules', done: h.amen.length > 0 && (h.rules?.length ?? 0) > 0 },
    { key: 'proof', label: 'Proof of ownership', done: hasProof },
  ];
}
/** Sends a hostel to the Nestly team. Throws ApiError if a section is missing. */
export async function submitHostelForReview(hid: string) {
  await wait(600); await fresh(); const db = getDb(); const h = hostelById(hid)!;
  const list = hostelChecklist(h, db.rooms.filter(r => r.hostelId === hid), db.docs.some(d => d.hostelId === hid));
  if (list.some(c => !c.done)) throw new ApiError('Finish every section first.');
  h.status = 'in_review'; h.submittedAt = isoNow(); h.reviewNote = undefined;
  audit('Submitted listing for review', h.name, `${h.rooms.length} room ${h.rooms.length === 1 ? 'type' : 'types'}, from ${ugxPlain(minPrice(h))} per semester`);
  adminIds().forEach(a => notify(a, { kind: 'review', title: 'Listing waiting for review', text: `${h.name} by ${h.ownerName}.`, to: '/a/reviews' }));
  await commit(); return h;
}

/** The owner writes one public reply under a student's review. */
export async function replyReview(rid: string, text: string) {
  await wait(400); const r = getDb().reviews.find(x => x.id === rid); if (!r) throw new ApiError('Review not found');
  if (text.trim().length < 3) throw new ApiError('Write a short reply.'); r.reply = text.trim(); await commit();
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
    .map(b => ({ ...b, student: db.users.find(u => u.id === b.userId)?.name ?? 'Student', hostel: hostelById(b.hostelId)?.name ?? '',
      rentTotal: rentTotal(b), balance: balanceDue(b), balanceState: balanceDue(b) === 0 ? 'none' as const : balanceOwed(b) || b.status === 'pending' ? 'owed' as const : 'received' as const }));
  const balanceCollected = fees.filter(f => f.balanceState === 'received').reduce((a, f) => a + f.balance, 0);
  const balanceOwing = fees.filter(f => f.balanceState === 'owed').reduce((a, f) => a + f.balance, 0);
  return { account: me.payout, fees, collected, balanceCollected, balanceOwing, month: fees.filter(b => +new Date(b.at!) >= +monthStart).reduce((a, b) => a + b.fee, 0),
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
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
/** True when the invite was made with a real email address (not a phone number). */
export const inviteHasEmail = (i: { email: string }) => EMAIL_RE.test(i.email) && !i.email.endsWith('@sms.nestly.app');
/**
 * Emails the invite link and code to the custodian. Live: the send-invite server function sends it from the
 * Nestly Gmail account. Demo: nothing is sent. Returns the address, or throws an ApiError with a reason.
 */
export async function emailInvite(code: string): Promise<string> {
  const i = getDb().invites.find(x => x.code === code);
  if (!i || !inviteHasEmail(i)) throw new ApiError('This invite has a phone number, not an email.');
  if (!live) { await wait(500); return i.email; }
  const { data, error } = await sb!.functions.invoke('send-invite', { body: { code } });
  if (error || !data?.sent) {
    let msg = 'We could not send the email. Share the invite on WhatsApp instead.';
    try { const body = await (error as { context?: Response })?.context?.json(); if (body?.error) msg = body.error; } catch { /* keep the general message */ }
    throw new ApiError(msg);
  }
  return data.sent as string;
}
/**
 * Creates an invite code for a new custodian and, when an email was given, emails it to them.
 * Returns the code, the address it was emailed to (or null), and why the email failed (if it did).
 */
export async function inviteCustodian(hostelId: string, name: string, contact: string): Promise<{ code: string; emailed: string | null; emailError: string | null }> {
  await wait(600); const db = getDb(); const h = hostelById(hostelId)!; const me = sessionUser()!;
  if (name.trim().split(/\s+/).length < 2) throw new ApiError('Enter their first and last name.', 'name');
  if (!contact.trim()) throw new ApiError('Enter their email, or a phone number.', 'contact');
  const isEmail = contact.includes('@');
  if (isEmail && !EMAIL_RE.test(contact.trim())) throw new ApiError('Check the email address.', 'contact');
  if (!isEmail && !/^\+?[\d\s-]{9,15}$/.test(contact.trim())) throw new ApiError('Enter an email, or a phone number like 0772 123 456.', 'contact');
  const prefix = h.name.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase().padEnd(4, 'X');
  let code = ''; do { code = `${prefix}-${1000 + Math.floor(Math.random() * 9000)}`; } while (db.invites.some(i => i.code === code));
  db.invites.push({ code, hostelId, invitedBy: me.name, email: contact.includes('@') ? contact.trim().toLowerCase() : `${contact.replace(/\s/g, '')}@sms.nestly.app`, name: name.trim(), used: false, at: isoNow() });
  audit('Invited custodian', h.name, `${name.trim()} (${contact.trim()})`);
  notify(me.id, { kind: 'staff', title: `Invite ready for ${name.trim().split(' ')[0]}`, text: `Code ${code} for ${h.name}. It expires in 7 days.`, to: '/o/staff' });
  await commit();
  if (!isEmail) return { code, emailed: null, emailError: null };
  try { return { code, emailed: await emailInvite(code), emailError: null }; }
  catch (x) { return { code, emailed: null, emailError: (x as Error).message }; }
}
/** Renews an invite for another 7 days and emails it again when it has an email. Returns the address emailed, if any. */
export async function resendInvite(code: string): Promise<string | null> {
  await wait(300); const i = getDb().invites.find(x => x.code === code)!; i.at = isoNow(); await commit();
  return inviteHasEmail(i) ? emailInvite(code) : null;
}
/** Cancels an invite so the code stops working. */
export async function cancelInvite(code: string) { await wait(300); const i = getDb().invites.find(x => x.code === code)!; i.cancelled = true; await commit(); }
/** Removes a custodian from a hostel. */
export async function removeCustodian(userId: string) {
  await wait(500); const db = getDb(); const u = db.users.find(x => x.id === userId)!; const h = hostelById(u.hostelId ?? '');
  if (live) { const { error } = await sb!.rpc('remove_custodian', { p_user: userId }); if (error) throw new ApiError(friendly(error)); }
  u.suspended = true; u.suspendReason = 'Removed by the owner';
  audit('Removed custodian', h?.name ?? '', u.name);
  notify(h?.ownerId, { kind: 'staff', title: `${u.name} was removed`, text: `They can no longer open ${h?.name}.`, to: '/o/staff' });
  await commit();
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
    queue: { owners: pendingOwners.length, listings: listings.length, oldest, flags: db.flags.filter(f => f.status === 'open').length,
      students: db.users.filter(u => u.role === 'student' && u.idStatus === 'pending').length,
      studentsSince: db.docs.filter(d => d.kind === 'student_id').map(d => d.uploadedAt).sort()[0] },
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
    payouts: db.users.filter(u => u.role === 'owner' && u.payoutPending && u.payoutReview).map(u => ({ user: safe(u), was: u.payout, next: u.payoutPending!, since: u.payoutPendingAt ?? isoNow() }))
      .sort((a, b) => a.since.localeCompare(b.since)),
    students: db.users.filter(u => u.role === 'student' && u.idStatus === 'pending').map(u => ({ user: safe(u), doc: db.docs.find(d => d.ownerId === u.id && d.kind === 'student_id'),
      selfie: db.docs.find(d => d.ownerId === u.id && d.kind === 'student_selfie'), others: sameNumberClaims(u),
      uni: universityById(u.universityId), since: db.docs.find(d => d.ownerId === u.id && d.kind === 'student_id')?.uploadedAt ?? u.joined ?? isoNow() }))
      .sort((a, b) => a.since.localeCompare(b.since)),
  };
}
/** Approves an owner after checking their ID and payment account. */
export async function approveOwner(ownerId: string) {
  await adminFresh();
  await wait(500); await fresh(); const db = getDb(); const u = db.users.find(x => x.id === ownerId)!;
  u.ownerStatus = 'approved'; u.ownerNote = undefined;
  db.docs.filter(d => d.ownerId === ownerId && !d.hostelId).forEach(d => { d.status = 'accepted'; });
  db.hostels.filter(h => h.ownerId === ownerId).forEach(h => { h.verified = true; });
  notify(ownerId, { kind: 'review', title: 'You are approved', text: 'Your details are checked. Bookings, Money and Staff are now open.', to: '/o/overview' });
  audit('Approved owner', u.name, 'ID and payment account checked'); await commit();
}
/** Rejects an owner with a reason they can read. */
export async function rejectOwner(ownerId: string, reason: string) {
  await adminFresh();
  await wait(500); await fresh(); if (!reason.trim()) throw new ApiError('Give a reason so the owner knows what to fix.', 'reason');
  const db = getDb(); const u = db.users.find(x => x.id === ownerId)!;
  u.ownerStatus = 'rejected'; u.ownerNote = reason.trim();
  db.docs.filter(d => d.ownerId === ownerId && !d.hostelId).forEach(d => { d.status = 'rejected'; d.note = reason.trim(); });
  notify(ownerId, { kind: 'review', title: 'We could not approve your details', text: reason.trim(), to: '/o/overview' });
  audit('Rejected owner', u.name, reason.trim()); await commit();
}
/** Publishes a listing on Explore. */
export async function approveListing(hid: string) {
  await adminFresh();
  await wait(500); await fresh(); const db = getDb(); const h = hostelById(hid)!; const owner = db.users.find(u => u.id === h.ownerId);
  if (owner?.ownerStatus !== 'approved') throw new ApiError(`Approve ${owner?.name ?? 'the owner'} first. Listings go live only for checked owners.`);
  h.status = 'live'; h.verified = true; h.reviewNote = undefined; h.reviewSections = undefined; h.listedAt = h.listedAt ?? isoNow();
  db.docs.filter(d => d.hostelId === hid).forEach(d => { d.status = 'accepted'; });
  notify(h.ownerId, { kind: 'review', title: `${h.name} is live`, text: 'Students can now find and book it.', to: '/o/hostels' });
  audit('Approved listing', h.name, 'Published to students'); await commit();
}
/** Sends a listing back to the owner with a note and the sections to fix. */
export async function requestChanges(hid: string, note: string, sections: string[] = []) {
  await adminFresh();
  await wait(500); await fresh(); if (!note.trim()) throw new ApiError('Tell the owner what to change.', 'note');
  const h = hostelById(hid)!; h.status = 'changes_requested'; h.reviewNote = note.trim(); h.reviewSections = sections.length ? sections : undefined;
  notify(h.ownerId, { kind: 'review', title: `Changes requested for ${h.name}`, text: note.trim(), to: `/o/hostels/${hid}` });
  audit('Requested changes', h.name, note.trim()); await commit();
}
/** Pauses a hostel: it leaves Explore and the owner sees the reason. Bookings stay valid. */
export async function suspendHostel(hid: string, reason: string) {
  await wait(500); await fresh(); if (!reason.trim()) throw new ApiError('Give a reason.', 'reason');
  const h = hostelById(hid)!; h.status = 'suspended'; h.pausedFor = 'admin'; h.suspendReason = reason.trim();
  notify(h.ownerId, { kind: 'review', title: `${h.name} is paused`, text: `${reason.trim()} Existing bookings stay valid.`, to: '/o/hostels' });
  audit('Paused hostel', h.name, reason.trim()); await commit();
}
/** Puts a paused hostel back on Explore. */
export async function restoreHostel(hid: string) {
  await wait(400); await fresh(); const h = hostelById(hid)!; h.status = 'live'; h.pausedFor = undefined; h.suspendReason = undefined;
  notify(h.ownerId, { kind: 'review', title: `${h.name} is live again`, text: 'Students can find it on Nestly again.', to: '/o/hostels' });
  audit('Restored hostel', h.name, 'Back on Explore'); await commit();
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
  await adminFresh();
  await wait(500); await fresh(); if (!reason.trim()) throw new ApiError('Give a reason.', 'reason');
  const u = getDb().users.find(x => x.id === userId)!; u.suspended = true; u.suspendReason = reason.trim();
  audit('Paused account', u.name, reason.trim()); await commit();
}
/** Lets a paused account log in again. */
export async function restoreUser(userId: string) {
  await adminFresh();
  await wait(400); await fresh(); const u = getDb().users.find(x => x.id === userId)!; u.suspended = false; u.suspendReason = undefined;
  audit('Restored account', u.name, ''); await commit();
}
/** Admin sends someone a password reset link. */
export async function sendResetLink(userId: string) {
  await wait(500); const u = getDb().users.find(x => x.id === userId)!;
  if (live) { const { error } = await sb!.auth.resetPasswordForEmail(u.email, { redirectTo: siteUrl() + '/reset-password' }); if (error) throw new ApiError(friendly(error)); }
  audit('Sent password reset link', u.name, u.email); await commit(); return u.email;
}
/** A student reports a listing, a review or a payment problem. Owners can report a review. Notifies the admins. */
export async function reportListing(userId: string, hid: string, reason: string, text: string, more: { kind?: FlagKind; reviewId?: string; bookingId?: string } = {}) {
  await wait(500); const db = getDb(); const h = hostelById(hid)!;
  const bookingId = more.bookingId ?? (more.kind === 'payment' ? db.bookings.filter(b => b.userId === userId && b.hostelId === hid).sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))[0]?.id : undefined);
  const f: Flag = { id: id('f'), hostelId: hid, reportedBy: userId, reason, text: text.trim(), at: isoNow(), status: 'open', kind: more.kind ?? 'listing', reviewId: more.reviewId, bookingId };
  db.flags.unshift(f);
  adminIds().forEach(a => notify(a, { kind: 'flag', title: `New report about ${h.name}`, text: `${reason}: ${text.trim() || 'No details given.'}`, to: '/a/flags' }));
  await commit(); return f;
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
  await wait(450); await fresh(); const db = getDb(); const f = db.flags.find(x => x.id === fid)!; const h = hostelById(f.hostelId)!;
  if (!note.trim()) throw new ApiError('Write a short note about what you found.', 'note');
  f.status = 'resolved'; f.outcome = outcome; f.note = note.trim(); f.resolvedAt = isoNow();
  if (outcome === 'hidden' && f.reviewId) { const r = db.reviews.find(x => x.id === f.reviewId); if (r) r.hidden = true; }
  if (outcome === 'paused' && h.status === 'live') { h.status = 'suspended'; h.pausedFor = 'admin'; h.suspendReason = f.reason; notify(h.ownerId, { kind: 'flag', title: `${h.name} is paused`, text: `${note.trim()} Existing bookings stay valid.`, to: '/o/hostels' }); }
  if (outcome === 'warned') notify(h.ownerId, { kind: 'flag', title: `A warning about ${h.name}`, text: note.trim(), to: '/o/overview' });
  if (outcome === 'confirmed') notify(h.ownerId, { kind: 'flag', title: 'A student payment was checked', text: note.trim(), to: '/o/money' });
  notify(f.reportedBy, { kind: 'flag', title: 'We looked into your report', text: `${OUTCOME_LABEL[outcome]}. Thank you for telling us.`, to: '/s/explore' });
  audit('Resolved report', h.name, `${OUTCOME_LABEL[outcome]}: ${f.note}`); await commit();
}
/** The admin activity log, newest first. */
export async function listAudit() {
  await wait(300); const db = getDb();
  return db.audit.map(a => ({ ...a, actor: db.users.find(u => u.id === a.actorId)?.name ?? `${ROLE_LABEL[a.actorRole]} (account removed)` }));
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
  audit(isNew ? 'Added university' : 'Updated university', clean.name, `Email domain set to ${domain}`); await commit();
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

/* ---------- Security signals and reports (admin) ---------- */
export type SecuritySignals = {
  failedLogins: { login: string; n: number; last: string }[]; sharedPayers: { phone: string; students: number }[];
  cancellations: { hostelId: string; name: string; n: number }[]; studentNumbers: { uni: string; number: string; n: number }[];
  payoutChanges: { ownerId: string; name: string; accountName: string; review: boolean; at: string }[];
};
/** Things worth an admin's look: repeated wrong passwords, one phone paying for many students, many cancellations, shared student numbers, waiting payout changes. */
export async function securitySignals(): Promise<SecuritySignals> {
  if (live) {
    const { data, error } = await sb!.rpc('security_signals'); if (error) throw new ApiError(friendly(error));
    const d = data as Record<string, Record<string, unknown>[]>;
    return {
      failedLogins: (d.failed_logins ?? []).map(x => ({ login: String(x.login), n: Number(x.n), last: String(x.last) })),
      sharedPayers: (d.shared_payers ?? []).map(x => ({ phone: String(x.phone), students: Number(x.students) })),
      cancellations: (d.cancellations ?? []).map(x => ({ hostelId: String(x.hostel_id), name: String(x.name), n: Number(x.n) })),
      studentNumbers: (d.student_numbers ?? []).map(x => ({ uni: String(x.uni), number: String(x.number), n: Number(x.n) })),
      payoutChanges: (d.payout_changes ?? []).map(x => ({ ownerId: String(x.owner_id), name: String(x.name), accountName: String(x.account_name ?? ''), review: !!x.review, at: String(x.at) })),
    };
  }
  await wait(250); const db = getDb(); const week = Date.now() - 7 * 86400000;
  const canc = new Map<string, number>(); db.bookings.filter(b => b.status === 'cancelled' && b.at && +new Date(b.at) > week).forEach(b => canc.set(b.hostelId, (canc.get(b.hostelId) ?? 0) + 1));
  const nums = new Map<string, number>(); db.users.filter(u => u.studentNo && u.idStatus && u.idStatus !== 'none' && u.idStatus !== 'needs_photo').forEach(u => { const k = `${u.universityId}|${u.studentNo!.toUpperCase()}`; nums.set(k, (nums.get(k) ?? 0) + 1); });
  return {
    failedLogins: [], sharedPayers: [],
    cancellations: [...canc].filter(([, n]) => n >= 3).map(([hid, n]) => ({ hostelId: hid, name: hostelById(hid)?.name ?? hid, n })),
    studentNumbers: [...nums].filter(([, n]) => n >= 2).map(([k, n]) => { const [uid, no] = k.split('|'); return { uni: universityById(uid!)?.short ?? uid!, number: no!, n }; }),
    payoutChanges: db.users.filter(u => u.payoutPending).map(u => ({ ownerId: u.id, name: u.name, accountName: u.payoutPending!.name, review: !!u.payoutReview, at: u.payoutPendingAt ?? isoNow() })),
  };
}
export type SecurityReport = { id: string; text: string; contact: string; at: string; closed: boolean };
const REPORTS = 'nestly.demo.securityReports';
/** Anyone (no account needed) reports a security problem to the Nestly team. */
export async function reportSecurityProblem(text: string, contact: string) {
  if (text.trim().length < 20) throw new ApiError('Describe the problem in a few sentences.', 'text');
  if (live) { const { error } = await sb!.rpc('report_security_problem', { p_text: text, p_contact: contact }); if (error) throw new ApiError(friendly(error)); return; }
  await wait(500);
  storage.set(REPORTS, [{ id: id('sr'), text: text.trim(), contact: contact.trim(), at: isoNow(), closed: false }, ...storage.get<SecurityReport[]>(REPORTS, [])]);
  getDb().users.filter(u => u.role === 'admin').forEach(a => notify(a.id, { kind: 'review', title: 'Security problem reported', text: text.trim().slice(0, 120), to: '/a/overview' })); await commit();
}
/** Admin: the security reports, newest first. */
export async function listSecurityReports(): Promise<SecurityReport[]> {
  if (live) {
    const { data, error } = await sb!.from('security_reports').select('*').order('at', { ascending: false }).limit(50); if (error) throw new ApiError(friendly(error));
    return (data ?? []).map(r => ({ id: String(r.id), text: r.text, contact: r.contact, at: r.at, closed: r.closed }));
  }
  await wait(200); return storage.get<SecurityReport[]>(REPORTS, []);
}
/** Admin: marks a security report as dealt with. */
export async function closeSecurityReport(rid: string) {
  if (live) { const { error } = await sb!.from('security_reports').update({ closed: true }).eq('id', Number(rid)); if (error) throw new ApiError(friendly(error)); return; }
  storage.set(REPORTS, storage.get<SecurityReport[]>(REPORTS, []).map(r => (r.id === rid ? { ...r, closed: true } : r)));
}
