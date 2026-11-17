import type { User, Hostel, RoomType, Booking, Tenant, Visitor, Review, Notice, Flag, Notification, AuditEntry, VerificationDoc, University } from './types';

export const seed = {
  users: [
    { id: 'u1', role: 'student' as const, name: 'Sarah Atim', email: 'sarah.atim@ucu.ac.ug', universityId: 'ucu', emailVerified: true, verifiedUntil: '2027-05-30', phone: '0772123456', joined: '2026-08-10' },
    { id: 'u2', role: 'custodian' as const, name: 'Peter Kizito', email: 'peter.k@custodian.nestly.app', username: 'peter.k', phone: '0772987654', hostelId: 'h1', joined: '2026-08-11' },
    { id: 'u3', role: 'owner' as const, name: 'Grace Namuli', email: 'grace.n@gmail.com', username: 'grace.n', phone: '0772555444', ownerStatus: 'approved' as const, payout: { method: 'mtn' as const, to: '0772555444', name: 'Grace Namuli' }, joined: '2026-08-01' },
    { id: 'u4', role: 'admin' as const, name: 'Admin', email: 'admin@nestly.app', username: 'admin', joined: '2026-01-01' },
  ],
  universities: [
    { id: 'ucu', name: 'Uganda Christian University', short: 'UCU Mukono', area: 'Mukono', domain: 'ucu.ac.ug', lat: 0.3546, lng: 32.7501, sems: [{ start: '2027-01-10', end: '2027-05-15' }] },
  ],
  hostels: [
    {
      id: 'h1', name: 'Hillview Hostel', uni: 'ucu', area: 'Kampala Road, Mukono', km: 0.4, lat: 0.352, lng: 32.748, rating: 4.6, nRev: 38, verified: true, status: 'live' as const,
      ownerId: 'u3', ownerName: 'Grace Namuli', fee: 50000, visit: '8 am to 9 pm', about: 'Four-storey hostel a short walk from the UCU main gate.',
      amen: ['wifi', 'security', 'laundry', 'water', 'study', 'power'], photos: [],
      rooms: [{ t: 'Single, self-contained', price: 1350000, total: 7, taken: 6 }, { t: 'Double, self-contained', price: 800000, total: 14, taken: 9 }, { t: 'Single, shared bathroom', price: 950000, total: 8, taken: 5 }]
    }
  ],
  rooms: [
    { id: 'r1', hostel_id: 'h1', no: 'A-01', type: 'Single, self-contained', price: 1350000, status: 'occupied' as const, total: 1, taken: 1 },
    { id: 'r2', hostel_id: 'h1', no: 'A-02', type: 'Single, self-contained', price: 1350000, status: 'free' as const, total: 1, taken: 0 },
  ],
  bookings: [] as Booking[], tenants: [] as Tenant[], visitors: [] as Visitor[], reviews: [] as Review[], saved: [] as { userId: string; hostelId: string }[],
  notices: [] as Notice[], invites: [] as any[], docs: [] as VerificationDoc[], flags: [] as Flag[], sub_payments: [] as any[], notifications: [] as Notification[], audit: [] as AuditEntry[],
};
