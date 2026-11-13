import { HOSTELS, UNIVERSITIES } from './catalog';
import type { AuditEntry, Booking, DB, Hostel, Payout, Room, SubPayment, Tenant, User, VerificationDoc, Visitor } from './types';

const now = Date.now();
const ago = (minutes: number) => new Date(now - minutes * 60000).toISOString();
const daysAgo = (d: number) => ago(d * 24 * 60);
const todayIso = () => new Date().toISOString().slice(0, 10);
const hhmm = (d: Date) => d.toTimeString().slice(0, 5);
const dateLabel = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const slug = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '');
const PW = 'nestly123';

/* ---------- Hillview Hostel (h1): 24 rooms in blocks A, B and C ---------- */
const T_SSC = 'Single, self-contained', T_DSC = 'Double, self-contained', T_SSH = 'Single, shared bathroom';
function hillviewRooms(): Room[] {
  const out: Room[] = [];
  const add = (block: string, type: string, beds: number) => {
    for (let i = 1; i <= 8; i++) out.push({ id: `r-${block}${i}`, hostelId: 'h1', no: `${block}-0${i}`, block, floor: i <= 4 ? 1 : 2, type, beds, status: 'ready' });
  };
  add('A', T_SSC, 1); add('B', T_DSC, 2); add('C', T_SSH, 1);
  const off = (no: string, reason: string, days: number) => { const r = out.find(x => x.no === no)!; r.status = 'unavailable'; r.unavailableReason = reason; r.unavailableSince = daysAgo(days); };
  off('A-07', 'Broken window', 9); off('B-06', 'Leaking roof', 3);
  return out;
}

// [tenant id, name, phone, room number or '' for no room yet, bed, status]
const HILLVIEW: [string, string, string, string, number, Tenant['status']][] = [
  ['t1', 'Sarah Atim', '0772 000 111', 'C-01', 0, 'in'],
  ['t2', 'Collins Wasswa', '0754 111 222', 'A-01', 0, 'in'],
  ['t3', 'Prossy Nalwoga', '0782 333 444', 'A-02', 0, 'in'],
  ['t10', 'Brian Okello', '0701 818 222', 'A-03', 0, 'in'],
  ['t11', 'Joan Nansubuga', '0774 202 909', 'A-05', 0, 'in'],
  ['t12', 'Ivan Ssali', '0759 640 113', 'A-06', 0, 'in'],
  ['t4', 'Allan Byaruhanga', '0703 555 666', 'B-01', 0, 'in'],
  ['t9', 'Kevin Ouma', '0752 828 282', 'B-01', 1, 'in'],
  ['t5', 'Grace Achieng', '0776 777 888', 'B-02', 0, 'in'],
  ['t13', 'Esther Namara', '0783 470 551', 'B-03', 0, 'in'],
  ['t14', 'Ruth Nakku', '0705 119 384', 'B-03', 1, 'in'],
  ['t15', 'Daphne Atim', '0771 650 220', 'B-05', 0, 'in'],
  ['t16', 'Lydia Akol', '0756 302 918', 'B-05', 1, 'in'],
  ['t17', 'Moses Kato', '0789 441 076', 'B-07', 0, 'in'],
  ['t18', 'Paul Mugisha', '0702 913 645', 'C-03', 0, 'in'],
  ['t19', 'Henry Opio', '0778 266 403', 'C-04', 0, 'in'],
  ['t21', 'Agnes Nambi', '0757 830 117', 'C-06', 0, 'in'],
  ['t20', 'Faith Akello', '0780 552 019', 'C-05', 0, 'due'],
  ['t6', 'Mercy Auma', '0758 999 000', '', 0, 'due'],
  ['t7', 'Hassan Lubega', '0700 121 212', '', 0, 'due'],
  ['t8', 'Tonny Kato', '0772 343 434', '', 0, 'out'],
];
const TYPE_OF: Record<string, string> = { t6: T_DSC, t7: T_SSC, t8: T_SSH };

/** Today's visits, spread back from now so the dashboard always looks like a real day. */
function visitors(): Visitor[] {
  const names = ['Joel Mugisha', 'Ruth Akello', 'Moses Okello', 'Faith Nabirye', 'Daniel Ssempa', 'Brian Tumusiime', 'Esther Namata', 'Ivan Kasozi', 'Doreen Auma', 'Samuel Odong',
    'Patricia Nakimuli', 'Henry Mukasa', 'Agnes Atuhaire', 'Ronald Kizza', 'Sharon Nansubuga', 'Edwin Opio'];
  const rooms = ['B-01', 'A-02', 'C-01', 'B-03', 'A-01', 'B-05', 'C-03', 'A-05'];
  const out: Visitor[] = [];
  const day = todayIso();
  names.forEach((name, i) => {
    const tinD = new Date(now - (12 + i * 41 + (i % 3) * 9) * 60000);
    if (tinD.toISOString().slice(0, 10) !== day || tinD.getHours() < 7) return;
    const inside = i < 3;
    const toutD = new Date(tinD.getTime() + (25 + (i % 4) * 22) * 60000);
    out.push({ id: 'vs' + i, hostelId: 'h1', name, room: rooms[i % rooms.length]!, tin: hhmm(tinD), tout: inside || toutD.getTime() > now ? null : hhmm(toutD), via: i % 4 === 2 ? 'Custodian' : 'QR', phone: i % 3 === 1 ? undefined : `07${(70 + i) % 100} ${String(100 + i * 37).slice(-3)} ${String(400 + i * 53).slice(-3)}`, date: day });
  });
  return out.reverse();
}

/** A clearly labelled sample document, so the admin review screen has something to look at. */
function docSvg(title: string, name: string, tone: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 300"><rect width="480" height="300" rx="18" fill="${tone}"/>
<rect x="24" y="24" width="432" height="252" rx="12" fill="#fff" opacity=".92"/><text x="44" y="68" font-family="Arial" font-size="22" font-weight="700" fill="#1F2340">${title}</text>
<rect x="44" y="96" width="110" height="136" rx="10" fill="#E3E6F3"/><circle cx="99" cy="146" r="26" fill="#B9BFDB"/><rect x="66" y="180" width="66" height="34" rx="16" fill="#B9BFDB"/>
<text x="178" y="120" font-family="Arial" font-size="14" fill="#676C82">Name</text><text x="178" y="144" font-family="Arial" font-size="18" font-weight="700" fill="#1F2340">${name}</text>
<rect x="178" y="166" width="220" height="10" rx="5" fill="#E3E6F3"/><rect x="178" y="188" width="180" height="10" rx="5" fill="#E3E6F3"/><rect x="178" y="210" width="200" height="10" rx="5" fill="#E3E6F3"/>
<text x="436" y="262" text-anchor="end" font-family="Arial" font-size="13" font-weight="700" fill="#C42B30">SAMPLE FOR THE DEMO</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

export function seed(): DB {
  const hostels: Hostel[] = JSON.parse(JSON.stringify(HOSTELS));
  const users: User[] = [
    { id: 'u1', role: 'student', name: 'Sarah Atim', email: 'sarah.atim@ucu.ac.ug', password: PW, phone: '0772 000 111', universityId: 'ucu', emailVerified: true, verifiedUntil: '31 Aug 2027', joined: daysAgo(330) },
    { id: 'u2', role: 'custodian', name: 'Peter Kizito', username: 'peter.k', email: 'peter.kizito@gmail.com', password: PW, phone: '0701 234 567', emailVerified: true, hostelId: 'h1', joined: daysAgo(400), lastActive: ago(8) },
    { id: 'u3', role: 'owner', name: 'Grace Namuli', username: 'grace.n', email: 'grace.namuli@gmail.com', password: PW, phone: '0772 454 567', emailVerified: true, ownerStatus: 'approved',
      payout: { method: 'mtn', to: '0772 454 567', name: 'Grace Namuli' }, joined: daysAgo(520) },
    { id: 'u4', role: 'owner', name: 'Daniel Okello', username: 'daniel.o', email: 'daniel.okello@gmail.com', password: PW, phone: '0759 210 883', emailVerified: true, ownerStatus: 'pending',
      payout: { method: 'airtel', to: '0759 210 883', name: 'Daniel Okello' }, joined: daysAgo(3) },
    { id: 'u9', role: 'admin', name: 'Nestly Admin', username: 'admin', email: 'admin@nestly.app', password: PW, emailVerified: true, joined: daysAgo(600) },
  ];

  // Every listed hostel needs an owner account. Grace is the demo owner; the rest are approved owners in the background.
  const ownerIds: Record<string, string> = { 'Grace Namuli': 'u3' };
  hostels.forEach(h => {
    if (!ownerIds[h.ownerName]) {
      const oid = 'o-' + slug(h.ownerName);
      ownerIds[h.ownerName] = oid;
      users.push({ id: oid, role: 'owner', name: h.ownerName, username: slug(h.ownerName), email: `${slug(h.ownerName)}@gmail.com`, password: PW, emailVerified: true, ownerStatus: 'approved',
        phone: `07${70 + users.length} ${String(310 + users.length * 17).slice(-3)} ${String(480 + users.length * 29).slice(-3)}`, payout: { method: 'mtn', to: '0770 000 000', name: h.ownerName }, joined: daysAgo(300 + users.length * 20) });
    }
    h.ownerId = ownerIds[h.ownerName]; h.status = 'live'; h.listedAt = daysAgo(120 + h.seed * 25);
    h.rooms.forEach(r => { r.beds = r.t.startsWith('Double') ? 2 : 1; });
    h.rules = ['No visitors after visiting hours', 'Keep noise down after 10:00 pm', 'No cooking in the rooms'];
  });
  // Mbalala Place moves to Grace so the demo owner has three hostels.
  const h12 = hostels.find(h => h.id === 'h12')!; h12.ownerId = 'u3'; h12.ownerName = 'Grace Namuli';
  const h1 = hostels.find(h => h.id === 'h1')!; h1.blocks = ['A', 'B', 'C'];
  h1.sems = [{ start: '2027-01-10', end: '2027-05-15', open: true }, { start: '2027-08-08', end: '2027-12-11', open: false }];
  // Listing views and saves this month, for the owner's "How students find you" funnel.
  ([['h1', 1240, 96], ['h2', 610, 41], ['h12', 480, 28]] as const).forEach(([id, v, s]) => { const h = hostels.find(x => x.id === id); if (h) { h.views = v; h.saves = s; } });
  h1.rooms = [{ t: T_SSC, sc: true, price: 1350000, total: 8, taken: 0, beds: 1 }, { t: T_DSC, sc: true, price: 800000, total: 16, taken: 0, beds: 2 }, { t: T_SSH, sc: false, price: 950000, total: 8, taken: 0, beds: 1 }];

  // Grace's draft that the admin sent back, and Daniel's hostel waiting for review.
  hostels.push({ id: 'h20', seed: 19, name: 'Hillview Annex', uni: 'ucu', area: 'Kampala Road, Mukono', km: 0.5, dir: 55, rating: 0, nRev: 0, ownerName: 'Grace Namuli', ownerId: 'u3', verified: true,
    fee: 50000, visit: '8:00 am to 9:00 pm', floors: 2, cols: 4, amen: ['wifi', 'security', 'water'], about: 'A smaller building next to Hillview Hostel with eight single rooms.',
    rooms: [{ t: 'Single, shared bathroom', sc: false, price: 900000, total: 8, taken: 0, beds: 1 }], status: 'changes_requested', submittedAt: daysAgo(4),
    reviewNote: 'Add at least 3 photos of the rooms. The current photos only show the outside of the building.', rules: ['No visitors after visiting hours'] });
  hostels.push({ id: 'h19', seed: 18, name: 'Namilyango Road Hostel', uni: 'ucu', area: 'Namilyango Road, Mukono', km: 1.4, dir: 75, rating: 0, nRev: 0, ownerName: 'Daniel Okello', ownerId: 'u4', verified: false,
    fee: 40000, visit: '8:00 am to 8:00 pm', floors: 3, cols: 4, amen: ['wifi', 'security', 'water', 'power'], about: 'New three-storey hostel on Namilyango Road, about fifteen minutes on foot to the UCU gate.',
    rooms: [{ t: 'Single, self-contained', sc: true, price: 1000000, total: 10, taken: 0, beds: 1 }, { t: 'Double, shared bathroom', sc: false, price: 580000, total: 8, taken: 0, beds: 2 }],
    status: 'in_review', submittedAt: ago(60 * 30), blocks: ['A', 'B'], rules: ['No visitors after 8:00 pm', 'No cooking in the rooms'], location: { lat: 0.3561, lng: 32.7612 } });

  /* Hillview tenants, their student accounts and their bookings. */
  const rooms = hillviewRooms();
  // Daniel set up his rooms before sending Namilyango Road Hostel for review.
  for (let i = 1; i <= 10; i++) rooms.push({ id: `r19-A${i}`, hostelId: 'h19', no: `A-${String(i).padStart(2, '0')}`, block: 'A', floor: i <= 5 ? 1 : 2, type: 'Single, self-contained', beds: 1, status: 'ready' });
  for (let i = 1; i <= 4; i++) rooms.push({ id: `r19-B${i}`, hostelId: 'h19', no: `B-0${i}`, block: 'B', floor: 1, type: 'Double, shared bathroom', beds: 2, status: 'ready' });
  const tenants: Tenant[] = []; const bookings: Booking[] = [];
  HILLVIEW.forEach(([tid, name, phone, no, bed, status], i) => {
    const room = rooms.find(r => r.no === no);
    const type = room?.type ?? TYPE_OF[tid]!;
    const uid = tid === 't1' ? 'u1' : 'st-' + tid;
    if (uid !== 'u1') users.push({ id: uid, role: 'student', name, email: `${slug(name)}${i}@ucu.ac.ug`, password: PW, phone, universityId: 'ucu', emailVerified: i % 6 !== 5, verifiedUntil: '31 Aug 2027', joined: daysAgo(200 + i * 9) });
    const bid = tid === 't1' ? 'NST-31502' : `NST-${30100 + i * 37}`;
    const at = daysAgo(status === 'due' ? 2 + i % 3 : 95 + i * 2);
    tenants.push({ id: tid, hostelId: 'h1', name, phone, type, status, room: room?.no ?? '', roomId: room?.id, bed: room ? bed : undefined, userId: uid, bookingId: bid,
      end: status === 'out' ? 'Left 30 Oct 2026' : '15 Dec 2026' });
    bookings.push({ id: bid, userId: uid, hostelId: 'h1', room: type, roomNo: status === 'in' ? room?.no : undefined, sem: 'Aug to Dec 2026', fee: 50000,
      status: status === 'in' ? 'checked-in' : status === 'due' ? 'paid' : 'completed', paidOn: dateLabel(at), at, payRef: `MP${String(260000 + i * 4111).slice(0, 6)}.${1200 + i}` });
  });
  bookings.unshift({ id: 'NST-24187', userId: 'u1', hostelId: 'h2', room: 'Double, shared bathroom', sem: 'Jan to May 2026', fee: 40000, status: 'completed', paidOn: '12 Dec 2025', at: '2025-12-12T10:00:00.000Z', payRef: 'MP251212.0331' });
  // Early bookings for next semester at Grace's hostels, so Bookings and Money have recent activity.
  const NEXT: [string, string, string, string, number][] = [
    ['Rita Nankya', 'h1', T_SSC, 'h1', 1], ['Simon Lule', 'h2', 'Single, self-contained', 'h2', 3], ['Pamela Adong', 'h12', 'Double, self-contained', 'h12', 6],
    ['Martin Ochieng', 'h1', T_DSC, 'h1', 9], ['Juliet Kemigisha', 'h2', 'Double, shared bathroom', 'h2', 12], ['Ben Twinomujuni', 'h12', 'Single, self-contained', 'h12', 17],
    ['Patience Akello', 'h1', T_SSC, 'h1', 2], ['Derrick Mukasa', 'h1', T_DSC, 'h1', 4], ['Sharon Nakato', 'h1', T_DSC, 'h1', 5], ['Isaac Opio', 'h1', T_SSH, 'h1', 8],
    ['Winnie Atuhaire', 'h1', T_SSC, 'h1', 11], ['Edwin Kato', 'h1', T_SSH, 'h1', 15], ['Lydia Namutebi', 'h1', T_DSC, 'h1', 20], ['Allan Mugerwa', 'h1', T_SSC, 'h1', 26],
    ['Rose Achieng', 'h2', 'Single, self-contained', 'h2', 6], ['Henry Ssali', 'h2', 'Double, shared bathroom', 'h2', 18], ['Grace Amony', 'h12', 'Double, self-contained', 'h12', 10], ['Moses Waiswa', 'h12', 'Single, self-contained', 'h12', 23]];
  NEXT.forEach(([name, hid, type, , d], i) => {
    const uid = 'st-n' + i; const at = daysAgo(d); const fee = hostels.find(h => h.id === hid)!.fee;
    users.push({ id: uid, role: 'student', name, email: `${slug(name)}@ucu.ac.ug`, password: PW, phone: `07${71 + i} ${300 + i * 21} ${500 + i * 13}`, universityId: 'ucu', emailVerified: true, verifiedUntil: '31 Aug 2027', joined: daysAgo(d + 40) });
    bookings.push({ id: `NST-32${String(110 + i * 7)}`, userId: uid, hostelId: hid, room: type, sem: 'Jan to May 2027', fee, status: 'paid', paidOn: dateLabel(at), at, payRef: `MP${String(270000 + i * 5113).slice(0, 6)}.${2200 + i}` });
  });

  /* Weekly payouts for Grace: booking fees minus Nestly's commission (see COMMISSION_RATE in api.ts). */
  const payouts: Payout[] = [];
  const graceHostels = hostels.filter(h => h.ownerId === 'u3').map(h => h.id);
  const graceBookings = bookings.filter(b => graceHostels.includes(b.hostelId) && b.at && Date.now() - +new Date(b.at) < 120 * 86400000);
  const friday = (w: number) => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 2) % 7) - 7 * w); d.setHours(10, 0, 0, 0); return d; };
  for (let w = -1; w < 16; w++) {
    const end = friday(w), start = new Date(end.getTime() - 7 * 86400000);
    const inWeek = graceBookings.filter(b => +new Date(b.at!) > +start && +new Date(b.at!) <= +(w === -1 ? new Date() : end));
    if (!inWeek.length) continue;
    payouts.push({ id: 'po' + (w + 2), ownerId: 'u3', amount: Math.round(inWeek.reduce((a, b) => a + b.fee, 0) * 0.9), method: 'mtn', to: '0772 454 567',
      status: w === -1 ? 'scheduled' : 'paid', date: (w === -1 ? new Date(friday(0).getTime() + 7 * 86400000) : end).toISOString(), bookings: inWeek.map(b => b.id) });
  }

  const docs: VerificationDoc[] = [
    { id: 'd1', ownerId: 'u4', kind: 'national_id', fileName: 'national-id-front.jpg', url: docSvg('NATIONAL ID CARD', 'Daniel Okello', '#5B8DEF'), uploadedAt: ago(60 * 31), status: 'pending' },
    { id: 'd2', ownerId: 'u4', kind: 'selfie', fileName: 'selfie.jpg', url: docSvg('SELFIE', 'Daniel Okello', '#8E9AAF'), uploadedAt: ago(60 * 31), status: 'pending' },
    { id: 'd3', ownerId: 'u4', hostelId: 'h19', kind: 'ownership', fileName: 'land-title-namilyango.pdf', url: docSvg('CERTIFICATE OF TITLE', 'Daniel Okello', '#22A06B'), uploadedAt: ago(60 * 30), status: 'pending' },
    { id: 'd4', ownerId: 'u3', kind: 'national_id', fileName: 'id-front.jpg', url: docSvg('NATIONAL ID CARD', 'Grace Namuli', '#5B8DEF'), uploadedAt: daysAgo(520), status: 'accepted' },
    { id: 'd5', ownerId: 'u3', kind: 'selfie', fileName: 'selfie.jpg', url: docSvg('SELFIE', 'Grace Namuli', '#8E9AAF'), uploadedAt: daysAgo(520), status: 'accepted' },
    { id: 'd6', ownerId: 'u3', hostelId: 'h1', kind: 'trading_licence', fileName: 'trading-licence-2026.pdf', url: docSvg('TRADING LICENCE', 'Grace Namuli', '#22A06B'), uploadedAt: daysAgo(300), status: 'accepted' },
  ];
  const audit: AuditEntry[] = [
    { id: 'a1', at: daysAgo(4), actorId: 'u9', actorRole: 'admin', action: 'Requested changes', target: 'Hillview Annex', detail: 'Add at least 3 photos of the rooms.' },
    { id: 'a2', at: daysAgo(3), actorId: 'u2', actorRole: 'custodian', action: 'Room not available', target: 'Hillview Hostel, B-06', detail: 'Leaking roof' },
    { id: 'a3', at: daysAgo(9), actorId: 'u2', actorRole: 'custodian', action: 'Room not available', target: 'Hillview Hostel, A-07', detail: 'Broken window' },
    { id: 'a4', at: daysAgo(21), actorId: 'u9', actorRole: 'admin', action: 'Approved listing', target: 'Mbuya Hill Hostel', detail: 'Published to students' },
    { id: 'a5', at: daysAgo(26), actorId: 'u9', actorRole: 'admin', action: 'Approved owner', target: 'Joseph Waiswa', detail: 'ID and title checked' },
    { id: 'a6', at: daysAgo(40), actorId: 'u9', actorRole: 'admin', action: 'Updated university', target: 'Kyambogo University', detail: 'Email domain set to kyu.ac.ug' },
  ];

  /* Subscriptions. Owners pay Nestly per listed hostel each month; a few are behind so the admin has something to chase. */
  const SUB_FEE = 50000;
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const monthEnd = (offset: number) => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth() + 1 + offset, 0); };
  const subPayments: SubPayment[] = [];
  const background = users.filter(u => u.id.startsWith('o-'));
  // 0: two months behind. 1: one month behind, admin gave extra days. 2: one month behind. 3: paid ahead. Rest: paid for this month.
  const paidTo: Record<string, number> = { u3: 0 };
  background.forEach((u, i) => { paidTo[u.id] = i === 0 ? -2 : i === 1 ? -1 : i === 2 ? -1 : i === 3 ? 2 : 0; });
  background[1] && (background[1].subGraceUntil = ymd(new Date(Date.now() + 5 * 86400000)));
  background[2] && (background[2].subRemindedAt = daysAgo(4));
  Object.entries(paidTo).forEach(([oid, off]) => {
    const u = users.find(x => x.id === oid)!; const end = monthEnd(off); u.subPaidUntil = ymd(end);
    const n = Math.max(1, hostels.filter(h => h.ownerId === oid && h.status === 'live').length);
    const joined = new Date(u.joined ?? daysAgo(400));
    for (let m = 0; m < 8; m++) {
      const cover = new Date(end.getFullYear(), end.getMonth() - m, 1); if (cover < joined) break;
      const paidOn = new Date(cover.getFullYear(), cover.getMonth(), 1 + ((oid.length + m) % 4), 10, 0, 0);
      if (paidOn > new Date()) { paidOn.setTime(Date.now() - (m + 1) * 86400000); }
      subPayments.push({ id: `sp-${oid}-${m}`, ownerId: oid, amount: SUB_FEE * n, months: 1, at: paidOn.toISOString(), via: m % 5 === 3 ? 'recorded' : 'app',
        ref: `SUB-${oid.slice(-4).toUpperCase()}-${cover.getFullYear()}${String(cover.getMonth() + 1).padStart(2, '0')}`, note: m % 5 === 3 ? 'Paid cash at the Nestly office' : undefined });
    }
  });
  subPayments.sort((a, b) => b.at.localeCompare(a.at));
  if (background[0]) audit.push({ id: 'a7', at: daysAgo(12), actorId: 'u9', actorRole: 'admin', action: 'Sent payment reminder', target: background[0].name, detail: 'Subscription overdue' });
  if (background[2]) audit.push({ id: 'a8', at: daysAgo(4), actorId: 'u9', actorRole: 'admin', action: 'Sent payment reminder', target: background[2].name, detail: 'Subscription overdue' });
  if (background[1]) audit.push({ id: 'a9', at: daysAgo(1), actorId: 'u9', actorRole: 'admin', action: 'Gave more time to pay', target: background[1].name, detail: '5 more days' });
  audit.sort((a, b) => b.at.localeCompare(a.at));
  // A payment problem needs a booking to point at.
  bookings.push({ id: 'NST-32590', userId: 'st-n2', hostelId: 'h10', room: 'Single, self-contained', sem: 'Jan to May 2027', fee: 40000, status: 'paid', paidOn: dateLabel(daysAgo(7)), at: daysAgo(7), payRef: 'MP271633.4410' });

  return {
    hostels, users, bookings, tenants, rooms, docs, payouts, audit, subPayments,
    config: { subFee: SUB_FEE, perHostel: true, graceDays: 7 },
    universities: (JSON.parse(JSON.stringify(UNIVERSITIES)) as DB['universities']).map(u => u.id === 'ucu' ? { ...u, sems: [{ start: '2027-01-11', end: '2027-05-14' }, { start: '2027-08-09', end: '2027-12-10' }] }
      : u.id === 'mak' ? { ...u, sems: [{ start: '2027-01-18', end: '2027-05-21' }, { start: '2027-08-16', end: '2027-12-17' }] } : u),
    saved: { u1: ['h3', 'h2'] },
    reviews: [
      { id: 'v1', hostelId: 'h1', who: 'Brian O.', stars: 5, when: 'May 2026', text: 'Water never ran out all semester and the custodian fixes things fast.', reply: 'Thank you Brian, see you next semester.' },
      { id: 'v2', hostelId: 'h1', who: 'Esther N.', stars: 4, when: 'May 2026', text: 'Good rooms. WiFi slows down at night but backup power is a big plus.' },
      { id: 'v6', hostelId: 'h1', who: 'Collins W.', stars: 5, when: 'Dec 2025', text: 'Quiet floors, clean bathrooms, close to the main gate.' },
      { id: 'v7', hostelId: 'h1', who: 'Mercy A.', stars: 3, when: 'Dec 2025', text: 'Rooms are fine but the double rooms are a bit small.' },
      { id: 'v3', hostelId: 'h2', who: 'Ivan K.', stars: 4, when: 'Dec 2025', text: 'Quiet and cheap. The shop at the gate saves a lot of time.' },
      { id: 'v4', hostelId: 'h3', who: 'Joan A.', stars: 5, when: 'May 2026', text: 'The garden is lovely for reading.' },
      { id: 'v8', hostelId: 'h2', who: 'Pius M.', stars: 1, when: 'Oct 2026', text: 'The owner is a thief and a liar. Everyone who stays there is stupid.', reply: 'Pius, you never stayed here. We have no booking in your name.' },
      { id: 'v5', hostelId: 'h5', who: 'Mark T.', stars: 5, when: 'May 2026', text: 'Best location near Makerere.' },
    ],
    visitors: visitors(),
    notices: [
      { id: 'n1', hostelId: 'h1', text: 'Water will be off on Monday from 9:00 am to 1:00 pm while the tank is cleaned. Fill your containers on Sunday night.', by: 'Peter Kizito, custodian', at: ago(60 * 20) },
      { id: 'n2', hostelId: 'h1', text: 'The study room now stays open until midnight during exams.', by: 'Grace Namuli, owner', at: daysAgo(6) },
    ],
    invites: [{ code: 'HILL-4821', hostelId: 'h1', invitedBy: 'Grace Namuli', email: 'agnes.nakato@gmail.com', name: 'Agnes Nakato', used: false, at: daysAgo(2) }],
    flags: [
      { id: 'f1', hostelId: 'h4', reportedBy: 'st-n1', reason: 'Wrong price', text: 'The custodian asked me for UGX 650,000, not the 500,000 shown on Nestly.', at: ago(60 * 5), status: 'open' },
      { id: 'f2', hostelId: 'h11', reportedBy: 'st-n4', reason: 'Unsafe place', text: 'The back gate does not lock and there is no guard at night.', at: daysAgo(2), status: 'open' },
      { id: 'f3', kind: 'payment', hostelId: 'h10', bookingId: 'NST-32590', reportedBy: 'st-n2', reason: 'Payment not received', text: 'I paid the UGX 40,000 booking fee by MTN a week ago. The custodian says the owner never got it and wants me to pay again.', at: ago(60 * 20), status: 'open' },
      { id: 'f4', kind: 'review', hostelId: 'h2', reviewId: 'v8', reportedBy: 'u3', reason: 'Abusive language', text: 'This person never stayed at Nakabago Court. We have no booking for them.', at: daysAgo(1), status: 'open' },
      { id: 'f0', hostelId: 'h9', reportedBy: 'st-n6', reason: 'Photos do not match', text: 'The rooms are smaller than in the photos.', at: daysAgo(30), status: 'resolved', outcome: 'warned', resolvedAt: daysAgo(28), note: 'Owner added new photos of the actual rooms.' },
    ],
    mail: [],
    notifications: [
      { id: 'nt2', userId: 'u1', kind: 'notice', title: 'New notice at Hillview Hostel', text: 'Water will be off on Monday from 9:00 am to 1:00 pm.', at: ago(25), read: false, to: '/s/my-hostel' },
      { id: 'nt3', userId: 'u1', kind: 'reminder', title: 'Keep your room for next semester', text: 'Book Hillview again before rooms open to others.', at: ago(150), read: true, to: '/s/bookings' },
      { id: 'nt6', userId: 'u2', kind: 'tenant', title: '2 students need a room', text: 'Mercy Auma and Hassan Lubega arrive today. Give them a room on the Rooms page.', at: ago(60 * 3), read: false, to: '/c/rooms' },
      { id: 'nt7', userId: 'u2', kind: 'visitor', title: 'Visitor still inside after hours', text: 'Yesterday a visitor to B-01 left at 9:40 pm.', at: ago(200), read: true, to: '/c/visitors' },
      { id: 'nt8', userId: 'u3', kind: 'booking', title: 'New booking at Hillview Hostel', text: 'Rita Nankya booked a single, self-contained room for Jan to May 2027.', at: ago(70), read: false, to: '/o/bookings' },
      { id: 'nt9', userId: 'u3', kind: 'review', title: 'Changes requested for Hillview Annex', text: 'Add at least 3 photos of the rooms.', at: ago(60 * 2), read: true, to: '/o/hostels/h20' },
      { id: 'nt10', userId: 'u9', kind: 'flag', title: 'New report about Seeta Rise', text: 'Wrong price: the custodian asked for more than the listed price.', at: ago(60 * 5), read: false, to: '/a/flags' },
      { id: 'nt11', userId: 'u9', kind: 'review', title: 'Owner waiting for review', text: 'Daniel Okello sent his ID and Namilyango Road Hostel.', at: ago(60 * 3), read: true, to: '/a/reviews' },
    ],
  };
}
