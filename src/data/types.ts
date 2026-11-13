export type Role = 'student' | 'custodian' | 'owner' | 'admin';
export type OwnerStatus = 'incomplete' | 'pending' | 'approved' | 'rejected';

export interface University { id: string; name: string; short: string; domain: string; area: string; lat: number; lng: number; /** Square logo as a data URL, added by an admin. */ logo?: string;
  /** The university's teaching calendar. Hostels use these dates until the owner sets their own. */ sems?: { start: string; end: string }[] }

export interface User {
  id: string; role: Role; name: string; email: string; password: string;
  username?: string; phone?: string; photo?: string;
  universityId?: string; emailVerified: boolean; verifiedUntil?: string;
  hostelId?: string; // custodians work at one hostel
  ownerStatus?: OwnerStatus; ownerNote?: string; // owners only
  /** The owner's own account. Students' booking fees are paid straight into it; Nestly never holds the money. */
  payout?: { method: 'mtn' | 'airtel' | 'bank'; to: string; name: string; bank?: string };
  /** Monthly Nestly subscription, paid by the owner. Last day it covers (ISO date). */
  subPaidUntil?: string;
  /** Extra time an admin gave before listings can be paused for an unpaid subscription (ISO date). */ subGraceUntil?: string;
  /** Last time an admin sent a payment reminder. */ subRemindedAt?: string;
  suspended?: boolean; suspendReason?: string;
  joined?: string; lastActive?: string;
}

export interface RoomType { t: string; sc: boolean; price: number; total: number; taken: number; beds?: number }
/** One semester at a hostel: when students move in and out, and whether bookings are open. */
export interface Semester { start: string; end: string; open: boolean }
export interface Hostel {
  id: string; name: string; uni: string; area: string; km: number; dir?: number; rating: number; nRev: number;
  ownerName: string; verified: boolean; fee: number; visit: string; floors: number; cols: number;
  amen: string[]; rooms: RoomType[]; about: string; seed: number; photoUrl?: string;
  ownerId?: string; status?: HostelStatus; reviewNote?: string; suspendReason?: string;
  /** Why it is paused: by an admin, or automatically because the owner's subscription is unpaid. */ pausedFor?: 'admin' | 'subscription';
  /** Sections an admin asked the owner to fix. */ reviewSections?: string[];
  blocks?: string[]; location?: { lat: number; lng: number }; rules?: string[]; photos?: string[];
  /** Semesters this hostel takes bookings for, set by the owner. Dates are ISO (YYYY-MM-DD). */ sems?: Semester[];
  /** This month: times students opened the listing, and times they saved it. */ views?: number; saves?: number;
  submittedAt?: string; listedAt?: string;
}
export type HostelStatus = 'draft' | 'in_review' | 'live' | 'changes_requested' | 'suspended';
export interface Review { id: string; hostelId: string; who: string; stars: number; when: string; text: string; reply?: string; /** Hidden by an admin after a report. */ hidden?: boolean }

export type BookingStatus = 'paid' | 'checked-in' | 'completed' | 'rated' | 'cancelled';
export interface Booking { id: string; userId: string; hostelId: string; room: string; roomNo?: string; sem: string; fee: number; status: BookingStatus; paidOn: string; cancelUntil?: string; at?: string; payRef?: string }

export interface Visitor { id: string; hostelId: string; name: string; room: string; /** The resident they came to see. */ host?: string; phone?: string; tin: string; tout: string | null; via: 'QR' | 'Custodian'; date: string }
/** `room` is the room number shown to people. A tenant with no `roomId` has booked but has not been given a room yet. */
export interface Tenant { id: string; hostelId: string; name: string; room: string; type: string; status: 'in' | 'due' | 'out'; end: string; phone: string; userId?: string; roomId?: string; bed?: number; bookingId?: string }
/** A physical room. Who sleeps in it is worked out from tenants; `status` only says whether it can be used. */
export interface Room { id: string; hostelId: string; no: string; block: string; floor: number; type: string; beds: number; status: 'ready' | 'unavailable'; unavailableReason?: string; unavailableSince?: string }
export interface Notice { id: string; hostelId: string; text: string; by: string; at: string }
export interface Notification { id: string; userId: string; kind: 'booking' | 'problem' | 'notice' | 'reminder' | 'tenant' | 'visitor' | 'review' | 'staff' | 'flag' | 'money'; title: string; text: string; at: string; read: boolean; to: string }
export interface Invite { code: string; hostelId: string; invitedBy: string; email: string; name: string; used: boolean; at?: string; cancelled?: boolean }
export interface Mail { id: string; to: string; subject: string; body: string; token?: string; when: string }

export interface VerificationDoc { id: string; ownerId: string; hostelId?: string; kind: 'national_id' | 'selfie' | 'ownership' | 'trading_licence'; fileName: string; url: string; uploadedAt: string; status: 'pending' | 'accepted' | 'rejected'; note?: string }
export interface Payout { id: string; ownerId: string; amount: number; method: 'mtn' | 'airtel' | 'bank'; to: string; status: 'scheduled' | 'paid'; date: string; bookings: string[] }
export interface AuditEntry { id: string; at: string; actorId: string; actorRole: Role; action: string; target: string; detail: string }
export type FlagKind = 'listing' | 'review' | 'payment';
export type FlagOutcome = 'dismissed' | 'warned' | 'hidden' | 'paused' | 'confirmed';
export interface Flag { id: string; hostelId: string; reportedBy: string; reason: string; text: string; at: string; status: 'open' | 'resolved'; note?: string;
  kind?: FlagKind; reviewId?: string; bookingId?: string; outcome?: FlagOutcome; resolvedAt?: string }
/** A subscription payment Nestly received from an owner. */
export interface SubPayment { id: string; ownerId: string; amount: number; months: number; at: string; via: 'app' | 'recorded'; ref: string; note?: string }
/** Platform settings an admin controls. */
export interface Config { subFee: number; perHostel: boolean; graceDays: number }

export interface DB {
  users: User[]; bookings: Booking[]; saved: Record<string, string[]>; reviews: Review[];
  visitors: Visitor[]; tenants: Tenant[]; rooms: Room[]; notices: Notice[];
  invites: Invite[]; mail: Mail[]; hostels: Hostel[]; notifications: Notification[];
  universities: University[]; docs: VerificationDoc[]; payouts: Payout[]; audit: AuditEntry[]; flags: Flag[];
  subPayments: SubPayment[]; config: Config;
}
