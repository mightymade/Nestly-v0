import { ApiError } from './errors';
import { live } from './supabase';
import { seed } from '../data/seed';
import { authUid } from './remote';
import type { User, Hostel, Tenant, Visitor, Review, Flag, Notification, AuditEntry, VerificationDoc, University, SearchHit, Booking, RoomType, RoomOcc, SubState } from '../data/types';

let store = { ...seed };
export { ApiError };

export function sessionUser(): User | null { return store.users[0] ?? null; }
export async function listHostels(_uniId?: string): Promise<Hostel[]> { return store.hostels.filter(h => h.status === 'live'); }
export async function getHostel(id: string): Promise<{ hostel: Hostel; reviews: Review[] }> { const h = store.hostels.find(h => h.id === id); if (!h) throw new ApiError('Not found'); return { hostel: h, reviews: store.reviews.filter(r => r.hostelId === id) }; }
export function hostelById(id: string): Hostel | undefined { return store.hostels.find(h => h.id === id); }
export function minPrice(hostel: Hostel | string): number { const h = typeof hostel === 'string' ? hostelById(hostel) : hostel; if (!h || !h.rooms.length) return 0; return Math.min(...h.rooms.map(r => r.price)); }
export function roomsLeft(hostel: Hostel | string): number { const h = typeof hostel === 'string' ? hostelById(hostel) : hostel; if (!h) return 0; return h.rooms.reduce((acc, r) => acc + Math.max(0, r.total - r.taken), 0); }
export async function toggleSaved(userId: string, hostelId: string): Promise<boolean> { return true; }
export function savedIds(userId: string): string[] { return store.saved.filter(s => s.userId === userId).map(s => s.hostelId); }
export async function listSaved(userId: string): Promise<Hostel[]> { const ids = savedIds(userId); return store.hostels.filter(h => ids.includes(h.id)); }
export function universityById(id: string): University | undefined { return store.universities.find(u => u.id === id); }
export const allUniversities = (): University[] => store.universities;
export const resetDemo = () => { store = { ...seed }; };

export async function login(idv: string, _pw: string): Promise<User> { const u = store.users.find(x => x.email === idv || x.username === idv); if (!u) throw new ApiError('Invalid credentials', 'id'); return u; }
export async function logout(): Promise<void> {}
export async function signupStudent(_data: unknown): Promise<void> {}
export async function confirmEmail(_token: string): Promise<void> {}
export async function resendConfirmation(_email: string, _back?: string): Promise<void> {}
export async function inbox(_email: string): Promise<any[]> { return []; }
export async function resendVerification(_userId: string): Promise<void> {}
export async function requestPasswordReset(_email: string): Promise<void> {}
export async function setNewPassword(_pw: string): Promise<void> {}
export async function changePassword(_uid: string, _cur: string, _next: string): Promise<void> {}
export async function usernameAvailable(u: string, _uid: string): Promise<boolean> { return u.length >= 3; }
export async function updateProfile(_uid: string, _patch: Partial<User>): Promise<void> {}

export async function custodianDay(_hostelId: string) { return { hostel: store.hostels[0] ?? { name: 'Hostel', visit: '8 am to 9 pm' }, inside: store.visitors.filter(v => !v.tout), arriving: store.tenants.filter(t => t.status === 'due'), offRooms: [], freeBeds: 5, visitsToday: store.visitors.length }; }
export async function listTenants(_hostelId: string): Promise<Tenant[]> { return store.tenants; }
export async function setTenantStatus(id: string, status: 'in' | 'out'): Promise<void> { const t = store.tenants.find(x => x.id === id); if (t) t.status = status; }
export async function listRoomsWithOccupancy(_hid: string): Promise<{ rooms: RoomOcc[]; waiting: Tenant[] }> { return { rooms: [], waiting: store.tenants.filter(t => !t.roomId) }; }
export async function setRoomAvailability(_rid: string, _ready: boolean, _reason?: string): Promise<void> {}
export async function assignRoom(_tid: string, _rid: string, _bed: number) { return { room: 'A-01' }; }
export async function moveTenant(_tid: string, _rid: string, _bed: number, _why: string) { return { room: 'A-02' }; }
export async function listVisitors(_hid: string): Promise<Visitor[]> { return store.visitors; }
export async function findResidents(_hid: string, _q: string) { return []; }
export async function signInVisitor(_hid: string, v: { name: string; room: string; host: string; phone: string }, via: 'QR' | 'Custodian'): Promise<Visitor> { const vis: Visitor = { id: 'v_' + Math.random(), hostelId: _hid, ...v, tin: new Date().toLocaleTimeString(), via }; store.visitors.push(vis); return vis; }
export async function signOutVisitor(id: string): Promise<void> { const v = store.visitors.find(x => x.id === id); if (v) v.tout = new Date().toLocaleTimeString(); }
export async function undoSignOut(id: string): Promise<void> { const v = store.visitors.find(x => x.id === id); if (v) delete v.tout; }
export async function getVisit(id: string): Promise<Visitor | null> { return store.visitors.find(v => v.id === id) || null; }
export async function listNotices(_hid: string): Promise<Notice[]> { return store.notices; }
export async function postNotice(_hid: string, text: string, by: string): Promise<void> { store.notices.push({ id: 'n_' + Math.random(), hostelId: _hid, text, by, at: new Date().toISOString() }); }

export async function listNotifications(_uid: string): Promise<Notification[]> { return store.notifications; }
export async function markRead(id: string): Promise<void> { const n = store.notifications.find(x => x.id === id); if (n) n.read = true; }
export async function markAllRead(_uid: string): Promise<void> { store.notifications.forEach(n => { n.read = true; }); }
export async function audit(_entry: Omit<AuditEntry, 'id' | 'at'>): Promise<void> {}

export function bookingSem(_h: Hostel) { return { name: 'Jan to May 2027', open: true }; }
export function semName(_sem: unknown) { return 'Jan to May 2027'; }
export function semDates(_sem: unknown) { return '10 Jan to 15 May 2027'; }
export function hostelSems(_h: Hostel) { return [{ start: '2027-01-10', end: '2027-05-15', open: true }]; }
export function uniSems(_uni: string) { return true; }
export function balanceOwed(_b: unknown) { return false; }
export function balanceDue(_b: unknown) { return 0; }
export function bookingOfTenant(_t: Tenant) { return null; }
export async function reportListing(_uid: string, _hid: string, _why: string, _text: string, _meta?: unknown): Promise<void> {}
export async function quickSearch(_me: User, _q: string): Promise<SearchHit[]> { return []; }
export function hostelPoint(_h: Hostel) { return { lat: _h.lat, lng: _h.lng }; }
export async function docsOf(_uid: string): Promise<VerificationDoc[]> { return store.docs; }
export async function savePayout(_uid: string, _payout: unknown, _pw: string): Promise<void> {}
export async function lookupInvite(_code: string) { return { code: _code, hostel_id: 'h1', email: 'test@sms.nestly.app', name: 'Test', hostel: store.hostels[0]!, invitedBy: 'Grace' }; }
export async function acceptInvite(_code: string, _data: unknown): Promise<void> {}

export async function adminOverview() { return { queue: { flags: 0, owners: 0, listings: 0, oldest: null, ownersSince: null }, subs: { month: 1000000, lastMonth: 950000, expected: 1200000, owners: 5, late: 0, grace: 0, owed: 0, trend: [] }, platform: { live: store.hostels.length, students: 45, bookingsWeek: 12, trend: [2, 4, 3, 5, 6, 8, 12] }, recent: [] }; }
export async function listReviewQueue() { return { owners: [], listings: [] }; }
export async function approveOwner(_uid: string): Promise<void> {}
export async function rejectOwner(_uid: string, _r: string): Promise<void> {}
export async function approveListing(_hid: string): Promise<void> {}
export async function requestChanges(_hid: string, _r: string, _secs: string[]): Promise<void> {}
export async function suspendHostel(_hid: string, _r: string): Promise<void> {}
export async function restoreHostel(_hid: string): Promise<void> {}

type AdminHostelRow = { hostel: Hostel; owner: User | null; sem: any; beds: { taken: number; total: number }; next: number; sub: any; flags: number; issues: any[] };
export async function listAllHostels(): Promise<AdminHostelRow[]> { return []; }
type AdminUserRow = { user: User; where: string; bookings: any[]; sub: any; hostels: Hostel[]; activity: AuditEntry[]; addedBy?: string };
export async function listUsers(): Promise<AdminUserRow[]> { return []; }
export async function suspendUser(_uid: string, _r: string): Promise<void> {}
export async function restoreUser(_uid: string): Promise<void> {}
export async function sendResetLink(_uid: string): Promise<string> { return 'link'; }
export async function listFlags(): Promise<(Flag & { hostel?: Hostel; by?: User; owner?: User; booking?: Booking; others: number })[]> { return store.flags.map(f => ({ ...f, others: 0 })); }
export async function resolveFlag(_fid: string, _out: string, _note: string): Promise<void> {}
export async function listAudit(): Promise<(AuditEntry & { actor: string })[]> { return store.audit.map(a => ({ ...a, actor: 'Admin' })); }
export async function saveUniversity(_u: University, _isNew: boolean): Promise<void> {}

type SubRow = { user: User; live: number; paused: number; hostels: Hostel[]; sub: { state: SubState; fee: number; owed: number; daysLate: number; daysLeft: number; paidUntil: string; graceEnd: string; due: string; neverPaid: boolean; overdue: boolean; remindedAt?: string; extraUntil?: string; history: any[] } };
export async function listSubscriptions(): Promise<SubRow[]> { return []; }
export async function recordSubPayment(_uid: string, _m: number, _ref: string) { return { paidUntil: '2027-06-01' }; }
export async function remindSubscription(_uid: string): Promise<void> {}
export async function giveMoreTime(_uid: string, _days: number): Promise<void> {}
export async function pauseForUnpaid(_uid: string): Promise<number> { return 1; }
export function subConfig() { return { subFee: 50000, perHostel: true, graceDays: 7 }; }
export async function saveConfig(_cfg: unknown): Promise<void> {}
export function ownerHostelCounts() { return [3]; }
export async function listUniversities(): Promise<University[]> { return store.universities; }

type SubPayment = { id: string; ownerId: string; owner: string; months: number; amount: number; via: 'app' | 'recorded'; ref: string; note?: string; at: string };
export async function listSubPayments(): Promise<SubPayment[]> { return store.sub_payments; }
export function subSummary() { return { month: 500000, lastMonth: 450000, expected: 600000, owners: 3, late: 0, grace: 0, owed: 0, trend: [] }; }

export async function createBooking(_d: any): Promise<void> {}
export async function listBookings(_uid: string): Promise<Booking[]> { return store.bookings; }
export async function hasBookingFor(_uid: string, _hid: string): Promise<boolean> { return false; }
export function rentTotal(_b: Booking): number { return _b.rent; }
export async function recordRentPayment(_tid: string): Promise<void> {}
export async function cancelBooking(_bid: string): Promise<void> {}
export async function rateBooking(_bid: string, _stars: number, _text: string): Promise<void> {}
export async function currentStay(_uid: string): Promise<Tenant | null> { return null; }
export async function myHostel(_uid: string) { return null; }
export async function startBookingPayment(_bid: string, _phone: string, _net: string): Promise<void> {}
export async function sendPaymentCode(_bid: string): Promise<void> {}
export async function confirmPayment(_bid: string): Promise<void> {}

export async function listOwnerBookings(_uid: string): Promise<any[]> { return []; }
export async function listCustodians(_uid: string): Promise<any[]> { return []; }
export async function inviteCustodian(_uid: string, _hid: string, _phone: string): Promise<void> {}
export async function resendInvite(_code: string): Promise<void> {}
export async function cancelInvite(_code: string): Promise<void> {}
export async function removeCustodian(_uid: string): Promise<void> {}
export async function billableHostels(_uid: string): Promise<number> { return 1; }
export async function paySubscription(_uid: string): Promise<void> {}
export async function startSubscriptionPayment(_uid: string, _phone: string, _net: string): Promise<void> {}
export async function signupOwner(_d: any): Promise<void> {}
export async function uploadDoc(_file: File): Promise<string> { return 'url'; }
export async function submitOwner(_uid: string): Promise<void> {}
export async function ownerHome(_uid: string) { return null; }
export async function ownerMoney(_uid: string) { return null; }

export async function listOwnerHostels(_uid: string): Promise<Hostel[]> { return store.hostels; }
export async function getOwnerHostel(_hid: string): Promise<Hostel> { return store.hostels[0]!; }
export async function createHostelDraft(_uid: string): Promise<string> { return 'h2'; }
export async function saveHostelDraft(_hid: string, _patch: Partial<Hostel>): Promise<void> {}
export async function deleteHostelDraft(_hid: string): Promise<void> {}
export async function isBlankDraft(_hid: string): Promise<boolean> { return false; }
export async function updateRoomTypes(_hid: string, _types: RoomType[]): Promise<void> {}
export async function generateRooms(_hid: string, _block: string, _floor: string, _type: string, _count: number): Promise<void> {}
export async function updateRoom(_rid: string, _patch: any): Promise<void> {}
export async function deleteRoom(_rid: string): Promise<void> {}
export async function typesWithoutRooms(_hid: string): Promise<string[]> { return []; }
export function hostelChecklist(_h: Hostel): { ok: boolean; text: string }[] { return []; }
export async function submitHostelForReview(_hid: string): Promise<void> {}
export async function replyReview(_rid: string, _reply: string): Promise<void> {}
export async function emailMatchesUniversity(_email: string, _uniId: string): Promise<boolean> { return true; }

export const OUTCOME_LABEL: Record<FlagOutcome, string> = { dismissed: 'Dismissed', warned: 'Warned', paused: 'Paused', hidden: 'Hidden', confirmed: 'Confirmed' };
export const ROLE_LABEL: Record<string, string> = { student: 'Student', custodian: 'Custodian', owner: 'Owner', admin: 'Admin' };
export const SUB_STATE_LABEL: Record<SubState, string> = { paid: 'Paid', due: 'Due soon', grace: 'In grace period', late: 'Late', off: 'Off' };
