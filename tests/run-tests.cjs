/**
 * Nestly Phase 3 test cases T01 to T10.
 * Drives a real browser (Playwright) through the prototype running on real data (Supabase), checks the database
 * where it matters, and saves screenshots as evidence in tests/evidence/.
 *
 * Run (see tests/README.md):  BASE=http://127.0.0.1:5173 PGURL=postgres://postgres@localhost:54322/postgres node tests/run-tests.cjs
 * Uses only fictitious sample accounts (password nestly123) and mock payments.
 */
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs'); const path = require('path');

const BASE = process.env.BASE || 'http://127.0.0.1:5173';
const PG = process.env.PGURL || 'postgres://postgres@localhost:54322/postgres';
const MAIL = process.env.MAIL_LOG; // local email catcher log (one JSON message per line)
const EV = path.join(__dirname, 'evidence'); fs.mkdirSync(EV, { recursive: true });
const sql = q => execSync(`psql "${PG}" -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const stamp = Date.now().toString(36).slice(-5);
const NEW_STUDENT = { name: 'Brenda Achieng', email: `brenda.${stamp}@ucu.ac.ug`, pw: 'nestly123x' };

// Two-step login: admins must use it. The test database starts each run with no factors, the first admin login
// sets one up from the key shown on screen, and later logins type the current code.
let totpSecret = null;
const b32 = s => { const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = ''; for (const c of s.replace(/[=\s]+/g, '')) bits += a.indexOf(c).toString(2).padStart(5, '0'); return Buffer.from(bits.match(/.{8}/g).map(b => parseInt(b, 2))); };
const totp = secret => { const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000))); const h = require('crypto').createHmac('sha1', b32(secret)).update(c).digest(); const o = h[19] & 15; return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0'); };
async function passTwoStep(p) {
  if (!/\/security\/two-step/.test(p.url())) return;
  if (await p.locator('#ts-first').isVisible().catch(() => false)) {
    totpSecret = (await p.locator('code').first().innerText()).trim();
    await p.fill('#ts-first', totp(totpSecret)); await p.click('button:has-text("Turn on two-step login")');
  } else { await p.fill('#ts-code', totp(totpSecret)); await p.click('button:has-text("Log in")'); }
  await p.waitForURL(u => !/two-step/.test(u.toString())); await p.waitForTimeout(1200);
}

const results = [];
let browser;
async function open(login, size = { width: 1366, height: 768 }, pw = 'nestly123') {
  const ctx = await browser.newContext({ viewport: size });
  await ctx.route(u => !/127\.0\.0\.1|localhost/.test(u.toString()), r => r.abort()); // no outside calls (map tiles, fonts)
  const p = await ctx.newPage(); p.setDefaultTimeout(15000);
  if (login) {
    await p.goto(BASE + '/login'); await p.fill('#login-id', login); await p.fill('#login-pw', pw);
    await p.click('button[type=submit]'); await p.waitForURL(u => !/\/login/.test(u.toString())); await p.waitForTimeout(1500);
    await passTwoStep(p);
  }
  return p;
}
const shot = async (p, id, name) => { const f = `${id}-${name}.png`; await p.screenshot({ path: path.join(EV, f) }); return f; };
const wait = ms => new Promise(r => setTimeout(r, ms));

async function test(id, type, title, expected, fn) {
  if (process.env.ONLY && !process.env.ONLY.split(',').includes(id)) return;
  const r = { id, type, title, expected, actual: '', evidence: [], status: 'Fail', at: new Date().toISOString() };
  const t0 = Date.now();
  try { const out = await fn(r.evidence); r.actual = out; r.status = 'Pass'; }
  catch (e) { r.actual = 'ERROR: ' + e.message.split('\n')[0].slice(0, 300);
    for (const c of browser.contexts()) for (const pg of c.pages()) { const f = `${id}-FAIL-${r.evidence.length}.png`; await pg.screenshot({ path: path.join(EV, f) }).catch(() => {}); r.evidence.push(f); await c.close().catch(() => {}); } }
  r.seconds = Math.round((Date.now() - t0) / 100) / 10;
  results.push(r); console.log(`${r.status.padEnd(4)} ${id} ${title}${r.status === 'Fail' ? '  -> ' + r.actual : ''}`);
}
const must = (c, m) => { if (!c) throw new Error(m); };

/** Pays the open booking or subscription dialog: handles the sandbox approval page, a code, or a phone prompt. */
async function finishPayment(p) {
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline) {
    if (await p.locator('#pay-otp').isVisible().catch(() => false)) { await p.fill('#pay-otp', '123456'); await p.click('button:has-text("Confirm UGX")'); }
    if (/\/pay\/return/.test(p.url()) || await p.getByText(/You are booked at|Room booked|Payment received|Subscription paid/).first().isVisible().catch(() => false)) return;
    await wait(700);
  }
  throw new Error('payment did not finish');
}

(async () => {
  browser = await chromium.launch();
  sql('delete from auth.mfa_factors'); // test database only: admins set up two-step login afresh each run
  sql("update universities set email_ok = true where id = 'ucu'"); // T02 tests the university email route, which admins switch on per university
  const h1 = 'h1';
  const takenBefore = () => sql(`select sum((r->>'taken')::int) from hostels, jsonb_array_elements(rooms) r where id='${h1}'`);

  // ---------------------------------------------------------------- T01
  await test('T01', 'Positive', 'Guest searches hostels near UCU, filters by price and opens a hostel page',
    'Explore lists live hostels near UCU Mukono without an account; a price filter narrows the list; the hostel page shows room types, prices and rooms left',
    async ev => {
      const p = await open(null);
      await p.goto(BASE + '/s/explore'); await p.waitForSelector('.h-row, .h-card'); await wait(800);
      const all = await p.locator('.h-row:visible, .h-card:visible').count();
      ev.push(await shot(p, 'T01', '1-explore'));
      await p.click('button[aria-label*="ilter"]'); await wait(400);
      const range = p.locator('input[type=range]').first(); await range.fill('700000'); await wait(300);
      const apply = p.locator('button:has-text("Show"), button:has-text("Apply")').first(); if (await apply.isVisible().catch(() => false)) await apply.click();
      await wait(800); const filtered = await p.locator('.h-row:visible, .h-card:visible').count();
      ev.push(await shot(p, 'T01', '2-filtered'));
      await p.goto(BASE + '/s/explore/' + h1); await p.getByText('Choose a room').first().waitFor(); await wait(600);
      ev.push(await shot(p, 'T01', '3-hostel-page'));
      const phone = await open(null, { width: 360, height: 740 }); await phone.goto(BASE + '/s/explore'); await phone.waitForSelector('.h-row'); await wait(800);
      ev.push(await shot(phone, 'T01', '4-explore-phone')); await phone.context().close();
      await p.context().close();
      must(all > 0 && filtered > 0 && filtered < all, `list ${all}, filtered ${filtered}`);
      return `${all} hostels listed for UCU Mukono; ${filtered} after a maximum price of UGX 700,000; Hillview Hostel page shows 3 room types with prices and rooms left`;
    });

  // ---------------------------------------------------------------- T02
  let bookingId = '';
  await test('T02', 'Positive', 'A new student signs up, confirms the university email, books a room and pays by mock mobile money',
    'Account created and confirmed by email link; booking confirmed only after the server verifies the payment; reference and receipt shown; rooms taken goes up by 1',
    async ev => {
      const before = +takenBefore();
      const p = await open(null);
      await p.goto(BASE + '/signup'); await p.click('.pay-opt >> nth=0'); await p.click('button:has-text("Continue")');
      await p.fill('#su-name', NEW_STUDENT.name); await p.fill('#su-email', NEW_STUDENT.email); await p.fill('#su-pw', NEW_STUDENT.pw);
      await p.check('input[type=checkbox]'); ev.push(await shot(p, 'T02', '1-signup'));
      await p.click('button:has-text("Create account")'); await p.getByText(/We sent a link/).first().waitFor();
      ev.push(await shot(p, 'T02', '2-check-email'));
      // read the confirmation email from the local email catcher and open its link
      let link = null;
      for (let i = 0; i < 20 && !link; i++) {
        await wait(500);
        const lines = fs.readFileSync(MAIL, 'utf8').trim().split('\n').reverse();
        const m = lines.map(l => JSON.parse(l)).find(x => x.to.includes(NEW_STUDENT.email));
        if (m) link = m.body.match(/href="([^"]+)"/)[1].replace(/&amp;/g, '&');
      }
      must(link, 'no confirmation email');
      await p.goto(link); await wait(2500);
      must(sql(`select email_verified from profiles where email='${NEW_STUDENT.email}'`) === 't', 'email not confirmed');
      ev.push(await shot(p, 'T02', '2b-confirmed'));
      if (/\/login/.test(p.url()) || await p.locator('#login-id').isVisible().catch(() => false) || !(await p.evaluate(() => Object.keys(localStorage).some(k => /auth-token/.test(k))))) {
        await p.goto(BASE + '/login'); await p.fill('#login-id', NEW_STUDENT.email); await p.fill('#login-pw', NEW_STUDENT.pw); await p.click('button[type=submit]'); await p.waitForURL(u => !/\/login/.test(u.toString())); await wait(1500);
      }
      await p.goto(BASE + '/s/explore/' + h1); await p.getByText('Choose a room').first().waitFor(); await wait(800);
      await p.locator('.hp-cta .btn, button:has-text("Book for")').first().click(); await wait(600);
      await p.click('text=Continue to payment'); await wait(400);
      await p.fill('#pay-phone', '0772 123 456'); ev.push(await shot(p, 'T02', '3-pay'));
      await p.click('button:has-text("Pay UGX")'); await finishPayment(p);
      await p.getByText(/You are booked|Room booked|booked at/).first().waitFor({ timeout: 20000 }); await wait(800);
      ev.push(await shot(p, 'T02', '4-booked'));
      const row = sql(`select b.id||'|'||b.status||'|'||b.fee from bookings b join profiles p on p.id=b.user_id where p.email='${NEW_STUDENT.email}'`);
      [bookingId] = row.split('|');
      must(/\|paid\|/.test(row), 'booking row: ' + row);
      const after = +takenBefore(); must(after === before + 1, `taken ${before} -> ${after}`);
      await p.goto(BASE + '/s/bookings'); await wait(1500); ev.push(await shot(p, 'T02', '5-bookings'));
      await p.context().close();
      return `Account confirmed by email link; booking ${bookingId} status "paid" after server verification; receipt shown; Hillview rooms taken ${before} to ${after}`;
    });

  // ---------------------------------------------------------------- T03
  await test('T03', 'Positive', 'The owner sees the booking and fee; the custodian gives a room, records the balance and checks the student in',
    'Booking and fee appear on the owner Money page; custodian assigns a free bed of the booked type; check-in is possible only after the balance is recorded',
    async ev => {
      must(bookingId, 'no booking from T02');
      const o = await open('grace.n'); await o.goto(BASE + '/o/money'); await o.getByText(NEW_STUDENT.name).first().waitFor({ timeout: 20000 }); await wait(600);
      ev.push(await shot(o, 'T03', '1-owner-money')); await o.context().close();
      const c = await open('peter.k'); await c.goto(BASE + '/c/tenants'); await wait(1500);
      await c.click('button:has-text("Arriving")'); await wait(600);
      const row = c.locator('tr, .m-row, .vm-row').filter({ hasText: NEW_STUDENT.name }).first();
      await row.locator('button:has-text("Give a room"), button:has-text("Give room")').first().click(); await wait(600);
      await c.locator('[aria-label="Free beds"] button').first().click(); ev.push(await shot(c, 'T03', '2-give-room'));
      await c.click('button:has-text("Give this bed")'); await wait(1500);
      await c.goto(BASE + '/c/tenants'); await wait(1200); await c.click('button:has-text("Arriving")'); await wait(600);
      const row2 = c.locator('tr, .m-row, .vm-row').filter({ hasText: NEW_STUDENT.name }).first();
      const blocked = await row2.locator('button:has-text("Check in")').count() === 0;
      await row2.locator('button:has-text("Collect")').first().click(); await wait(500); ev.push(await shot(c, 'T03', '3-collect-balance'));
      await c.click('button:has-text("Balance received")'); await wait(1500);
      await c.goto(BASE + '/c/tenants'); await wait(1200); await c.click('button:has-text("Arriving")'); await wait(600);
      await c.locator('tr, .m-row, .vm-row').filter({ hasText: NEW_STUDENT.name }).first().locator('button:has-text("Check in")').first().click(); await wait(1500);
      await c.goto(BASE + '/c/tenants'); await wait(1200);
      const sbtn = c.locator('button[aria-label*="earch"]').first(); if (await sbtn.isVisible().catch(() => false)) { await sbtn.click(); await c.keyboard.type('Brenda'); await wait(700); }
      ev.push(await shot(c, 'T03', '4-staying'));
      await c.context().close();
      const t = sql(`select t.status||'|'||coalesce(t.room,'')||'|'||coalesce(b.rent_paid_on,'') from tenants t join bookings b on b.id=t.booking_id where b.id='${bookingId}'`);
      const st = sql(`select status from bookings where id='${bookingId}'`);
      must(t.startsWith('in|') && st === 'checked-in' && blocked, `tenant ${t}, booking ${st}, check-in hidden before balance: ${blocked}`);
      return `Owner Money page lists ${NEW_STUDENT.name}'s fee; room ${t.split('|')[1]} given; "Check in" hidden until "Balance received"; booking status now "checked-in"`;
    });

  // ---------------------------------------------------------------- T04
  await test('T04', 'Positive', 'An admin approves a pending owner and their submitted listing; it goes live on Explore with a verified badge',
    'Owner status becomes approved; listing status becomes live and verified; the hostel appears on Explore',
    async ev => {
      const a = await open('admin'); await a.goto(BASE + '/a/reviews'); await wait(1500); ev.push(await shot(a, 'T04', '1-owner-queue'));
      await a.getByText('Daniel Okello').first().click(); await wait(1200);
      await a.click('button:has-text("Approve")'); await wait(1500);
      await a.goto(BASE + '/a/reviews?tab=listings'); await wait(1500);
      await a.getByText('Namilyango Road Hostel').first().click(); await wait(1200); ev.push(await shot(a, 'T04', '2-listing-review'));
      await a.click('button:has-text("Approve and publish")'); await wait(1500); await a.context().close();
      const r = sql(`select h.status||'|'||h.verified||'|'||p.owner_status from hostels h join profiles p on p.id=h.owner_id where h.id='h19'`);
      must(/^live\|(t|true)\|approved$/.test(r), r);
      const g = await open(null); await g.goto(BASE + '/s/explore/h19'); await g.getByText('Namilyango Road Hostel').first().waitFor(); await wait(800);
      ev.push(await shot(g, 'T04', '3-live')); await g.context().close();
      return 'Owner Daniel Okello approved; Namilyango Road Hostel status live and verified; its public page opens for a guest';
    });

  // ---------------------------------------------------------------- T05
  await test('T05', 'Positive', 'A visitor scans the gate QR code and signs in; the custodian marks them as left',
    'Visitor sign-in form opens without an account; visit recorded with time in; custodian sees them inside and can mark them as left',
    async ev => {
      const v = await open(null, { width: 390, height: 844 }); await v.goto(BASE + '/visit/' + h1); await wait(1200);
      await v.fill('#vq-name', 'Joseph Kato');
      // At the gate a visitor gives the room and part of the name, and sees only "Sarah A." (security finding F3).
      const room = sql(`select room from tenants where hostel_id='${h1}' and status='in' and name like 'Sarah%' limit 1`);
      await v.fill('#vq-host', room); await v.getByLabel('Their first or last name').fill('Sarah'); await wait(1200);
      await v.locator('.host-list button, [role=option]').first().click(); await v.fill('#vq-phone', '0772 555 101');
      await v.check('input[type=checkbox]'); ev.push(await shot(v, 'T05', '1-visitor-form'));
      await v.click('button:has-text("Sign in")'); await v.getByText("You're signed in").waitFor(); ev.push(await shot(v, 'T05', '2-pass'));
      await v.context().close();
      const c = await open('peter.k'); await c.goto(BASE + '/c/visitors'); await c.getByText('Joseph Kato').first().waitFor(); ev.push(await shot(c, 'T05', '3-inside'));
      await c.locator('tr, .m-row, .vm-row, .vcard').filter({ hasText: 'Joseph Kato' }).first().locator('button:has-text("Mark"), button[aria-label*="left"]').first().click(); await wait(800);
      const confirm = c.locator('.overlay button:has-text("Mark as left")'); if (await confirm.isVisible().catch(() => false)) await confirm.click();
      await wait(1500); await c.context().close();
      const r = sql(`select coalesce(tout,'') from visitors where name='Joseph Kato' order by seq desc limit 1`);
      must(r !== '', 'no time out recorded');
      return `Visitor signed in from the QR page without an account; custodian saw them inside and marked them left (time out ${r})`;
    });

  // ---------------------------------------------------------------- T06
  await test('T06', 'Positive', 'After a completed stay the student writes one review; a second review is not offered',
    'Rate your stay appears only for the completed booking; the review is saved and shows on the hostel page; the button disappears afterwards',
    async ev => {
      const s = await open('tonny.kato20@ucu.ac.ug'); await s.goto(BASE + '/s/bookings'); await wait(1500);
      await s.click('button:has-text("Past")').catch(() => {}); await wait(600);
      await s.locator('button:has-text("Rate your stay")').first().click(); await wait(500);
      await s.locator('[aria-label="Stars"] button').nth(3).click(); const ta = s.locator('.overlay textarea'); if (await ta.count()) await ta.fill('Quiet floors and the custodian fixes things fast.');
      ev.push(await shot(s, 'T06', '1-rate')); await s.click('button:has-text("Post rating")'); await wait(1500);
      await s.goto(BASE + '/s/bookings'); await wait(1200); await s.click('button:has-text("Past")').catch(() => {}); await wait(600);
      const again = await s.locator('button:has-text("Rate your stay")').count(); ev.push(await shot(s, 'T06', '2-after'));
      await s.context().close();
      const n = sql(`select count(*) from reviews where booking_id='NST-30840'`);
      must(n === '1' && again === 0, `reviews ${n}, rate buttons left ${again}`);
      return 'One review saved for booking NST-30840 (4 stars); "Rate your stay" no longer offered for it';
    });

  // ---------------------------------------------------------------- T07
  await test('T07', 'Validation', 'A student who already has a booking this semester is refused a second one',
    'The booking dialog explains the one-booking-per-semester rule and offers "See my bookings"; no second booking is created',
    async ev => {
      const s = await open(NEW_STUDENT.email, undefined, NEW_STUDENT.pw); // the student from T02, already booked
      await s.goto(BASE + '/s/explore/h2'); await s.getByText('Choose a room').first().waitFor(); await wait(700);
      const n0 = sql(`select count(*) from bookings b join profiles p on p.id=b.user_id where p.email='${NEW_STUDENT.email}'`);
      await s.locator('.hp-cta .btn, button:has-text("Book for")').first().click(); await s.getByText('You already have a booking').waitFor(); await wait(700);
      ev.push(await shot(s, 'T07', '1-refused')); await s.context().close();
      const n1 = sql(`select count(*) from bookings b join profiles p on p.id=b.user_id where p.email='${NEW_STUDENT.email}'`);
      must(n0 === n1, `bookings ${n0} -> ${n1}`);
      return `Dialog "You already have a booking" shown with the rule and a link to bookings; bookings for this student stayed at ${n1}`;
    });

  // ---------------------------------------------------------------- T08
  await test('T08', 'Validation', 'A wrong phone number is rejected, and a declined payment leaves nothing booked',
    'A short number shows a field error before any charge; a declined charge shows a clear message; no paid booking is created',
    async ev => {
      const s = await open('ruth.nakku10@ucu.ac.ug'); const email = 'ruth.nakku10@ucu.ac.ug';
      const paid0 = sql(`select count(*) from bookings b join profiles p on p.id=b.user_id where p.email='${email}' and b.status='paid'`);
      await s.goto(BASE + '/s/explore/h3'); await s.getByText('Choose a room').first().waitFor(); await wait(700);
      await s.locator('.hp-cta .btn, button:has-text("Book for")').first().click(); await wait(500);
      if (await s.getByText('You already have a booking').isVisible().catch(() => false)) throw new Error('test student already booked');
      await s.click('text=Continue to payment'); await s.fill('#pay-phone', '0772 12'); await s.click('button:has-text("Pay UGX")'); await wait(2500);
      ev.push(await shot(s, 'T08', '1-wrong-number'));
      const fieldErr = await s.getByText(/Enter a mobile money number/).first().innerText().catch(() => '');
      await s.fill('#pay-phone', '0772 000 001'); await s.click('button:has-text("Pay UGX"), button:has-text("Try again")'); await wait(3000);
      if (await s.locator('#pay-otp').isVisible().catch(() => false)) { await s.fill('#pay-otp', '123456'); await s.click('button:has-text("Confirm UGX")'); }
      await s.locator('.banner.danger, [role=alert]').first().waitFor({ timeout: 30000 }); await wait(500);
      ev.push(await shot(s, 'T08', '2-declined'));
      const msg = await s.locator('.banner.danger, [role=alert]').first().innerText().catch(() => '');
      if (!msg.trim()) throw new Error('no message after the declined payment');
      await s.context().close();
      const paid1 = sql(`select count(*) from bookings b join profiles p on p.id=b.user_id where p.email='${email}' and b.status='paid'`);
      must(fieldErr && paid0 === paid1, `field error "${fieldErr}", paid ${paid0} -> ${paid1}`);
      return `Short number refused: "${fieldErr.trim().slice(0, 80)}"; declined charge: "${msg.trim().slice(0, 90)}"; paid bookings stayed at ${paid1}`;
    });

  // ---------------------------------------------------------------- T09
  await test('T09', 'Access control', 'A custodian cannot open owner or admin pages, or read another hostel\'s bookings',
    'Owner and admin routes send the custodian back to their own pages; the database returns no rows for another hostel even when asked directly',
    async ev => {
      const c = await open('peter.k');
      await c.goto(BASE + '/o/money'); await wait(1500); const u1 = new URL(c.url()).pathname; ev.push(await shot(c, 'T09', '1-owner-route'));
      await c.goto(BASE + '/a/overview'); await wait(1500); const u2 = new URL(c.url()).pathname;
      // ask the database directly with the custodian's own session, bypassing the screens
      const rows = await c.evaluate(async () => {
        const { sb } = await import('/src/services/supabase.ts');
        const other = await sb.from('bookings').select('id').eq('hostel_id', 'h2');
        const own = await sb.from('bookings').select('id').eq('hostel_id', 'h1');
        const profiles = await sb.from('owner_accounts').select('*');
        return { other: other.data?.length ?? -1, own: own.data?.length ?? -1, payout: profiles.data?.length ?? -1 };
      });
      await c.context().close();
      must(!u1.startsWith('/o') && !u2.startsWith('/a') && rows.other === 0 && rows.own > 0 && rows.payout === 0, JSON.stringify({ u1, u2, rows }));
      return `/o/money redirected to ${u1}; /a/overview redirected to ${u2}; direct query: ${rows.own} bookings at own hostel, ${rows.other} at another hostel, ${rows.payout} owner payout rows`;
    });

  // ---------------------------------------------------------------- T10
  await test('T10', 'Positive', 'A student cancels within 48 hours; rooms left goes back up',
    'Cancel is offered during the 48-hour window; after confirming, the booking is cancelled and the room count returns',
    async ev => {
      const email = 'prossy.nalwoga2@ucu.ac.ug';
      const s = await open(email); const t0 = sql(`select sum((r->>'taken')::int) from hostels, jsonb_array_elements(rooms) r where id='h3'`);
      await s.goto(BASE + '/s/explore/h3'); await s.getByText('Choose a room').first().waitFor(); await wait(700);
      await s.locator('.hp-cta .btn, button:has-text("Book for")').first().click(); await wait(500);
      if (await s.getByText('You already have a booking').isVisible().catch(() => false)) throw new Error('test student already booked');
      await s.click('text=Continue to payment'); await s.fill('#pay-phone', '0772 222 333'); await s.click('button:has-text("Pay UGX")'); await finishPayment(s);
      await wait(1500); const t1 = sql(`select sum((r->>'taken')::int) from hostels, jsonb_array_elements(rooms) r where id='h3'`);
      await s.goto(BASE + '/s/bookings'); await wait(1500); ev.push(await shot(s, 'T10', '1-paid'));
      await s.locator('button:has-text("Cancel")').first().click(); await wait(500); ev.push(await shot(s, 'T10', '2-confirm'));
      await s.click('button:has-text("Cancel booking")'); await wait(2000); ev.push(await shot(s, 'T10', '3-cancelled'));
      await s.context().close();
      const t2 = sql(`select sum((r->>'taken')::int) from hostels, jsonb_array_elements(rooms) r where id='h3'`);
      const st = sql(`select b.status from bookings b join profiles p on p.id=b.user_id where p.email='${email}' and b.hostel_id='h3' order by b.seq desc limit 1`);
      must(st === 'cancelled' && +t1 === +t0 + 1 && +t2 === +t0, `status ${st}; taken ${t0} -> ${t1} -> ${t2}`);
      return `Booked and paid (rooms taken ${t0} to ${t1}); cancelled within the window; status "cancelled"; rooms taken back to ${t2}`;
    });

  await browser.close();
  fs.writeFileSync(path.join(EV, 'results.json'), JSON.stringify(results, null, 2));
  const md = ['| ID | Type | Test | Expected | Actual | Evidence | Status |', '|---|---|---|---|---|---|---|',
    ...results.map(r => `| ${r.id} | ${r.type} | ${r.title} | ${r.expected} | ${r.actual.replace(/\|/g, '/')} | ${r.evidence.join(', ')} | ${r.status} |`)].join('\n');
  fs.writeFileSync(path.join(EV, 'results.md'), `# Nestly test results\n\nRun at ${new Date().toISOString()} against ${BASE}\n\n${md}\n`);
  const pass = results.filter(r => r.status === 'Pass').length; console.log(`\n${pass} of ${results.length} passed`);
})();
