/**
 * Nestly Phase 3 usability and accessibility checks.
 * For each role's main screens at phone (360 x 740) and laptop (1366 x 768) size it records:
 * sideways scrolling, controls with no name, tap targets under 40 px on the phone, and axe-core WCAG 2.1 A/AA results.
 * It also times the Explore page on an emulated slow 4G connection and checks keyboard focus on the login page.
 * Run: BASE=http://127.0.0.1:4174 node tests/usability-checks.cjs   (output: tests/evidence/usability.json and .md)
 */
const { chromium } = require('playwright');
const { default: AxeBuilder } = require('@axe-core/playwright');
const fs = require('fs'); const path = require('path');
const BASE = process.env.BASE || 'http://127.0.0.1:4174';
const EV = path.join(__dirname, 'evidence'); fs.mkdirSync(EV, { recursive: true });

const USERS = {
  guest: { login: null, pages: ['/welcome', '/login', '/signup', '/s/explore', '/s/explore/h1', '/visit/h1', '/privacy'] },
  student: { login: 'sarah.atim@ucu.ac.ug', pages: ['/s/explore', '/s/bookings', '/s/my-hostel', '/s/account'] },
  custodian: { login: 'peter.k', pages: ['/c/today', '/c/visitors', '/c/tenants', '/c/rooms'] },
  owner: { login: 'grace.n', pages: ['/o/overview', '/o/hostels', '/o/bookings', '/o/money', '/o/staff'] },
  admin: { login: 'admin', pages: ['/a/overview', '/a/reviews', '/a/users', '/a/subscriptions'] },
};
const SIZES = { phone: { width: 360, height: 740, isMobile: true, hasTouch: true }, laptop: { width: 1366, height: 768 } };

(async () => {
  const b = await chromium.launch(); const rows = []; const axeAll = {};
  for (const [sizeName, sz] of Object.entries(SIZES)) {
    for (const [role, u] of Object.entries(USERS)) {
      const ctx = await b.newContext({ viewport: { width: sz.width, height: sz.height }, isMobile: !!sz.isMobile, hasTouch: !!sz.hasTouch });
      await ctx.route(x => !/127\.0\.0\.1|localhost/.test(x.toString()), r => r.abort());
      const p = await ctx.newPage(); p.setDefaultTimeout(15000);
      if (u.login) { await p.goto(BASE + '/login'); await p.fill('#login-id', u.login); await p.fill('#login-pw', 'nestly123'); await p.click('button[type=submit]'); await p.waitForURL(x => !/\/login/.test(x.toString())); await p.waitForTimeout(1200); }
      for (const pg of u.pages) {
        await p.goto(BASE + pg); await p.waitForTimeout(1500);
        const m = await p.evaluate(phone => {
          const vis = el => { const s = getComputedStyle(el), r = el.getBoundingClientRect(); return s.visibility !== 'hidden' && s.display !== 'none' && r.width > 0 && r.height > 0 && !el.closest('[aria-hidden=true]'); };
          const unnamed = [...document.querySelectorAll('button, a[href], input, select, textarea')].filter(vis).filter(el => {
            if (el.tagName === 'INPUT' && (el.type === 'hidden')) return false;
            const name = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || el.getAttribute('placeholder') || (el.id && document.querySelector(`label[for="${el.id}"]`)?.innerText) || el.closest('label')?.innerText || el.querySelector('img[alt]')?.alt || '').trim();
            return !name;
          }).length;
          const small = phone ? [...document.querySelectorAll('button, a.btn, [role=button]')].filter(vis).filter(el => { const r = el.getBoundingClientRect(); return r.height < 40 && r.width < 40; }).length : 0;
          return { sideways: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth, innerWidth - document.documentElement.clientWidth), unnamed, small, emdash: document.body.innerText.includes('\u2014') };
        }, !!sz.isMobile);
        const axe = await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).disableRules(['region']).analyze();
        const v = axe.violations.map(x => ({ id: x.id, impact: x.impact, n: x.nodes.length, help: x.help }));
        for (const x of v) { const k = x.id; axeAll[k] = axeAll[k] || { help: x.help, impact: x.impact, screens: 0, nodes: 0 }; axeAll[k].screens++; axeAll[k].nodes += x.n; }
        rows.push({ size: sizeName, role, page: pg, ...m, axe: v.length, axeNodes: v.reduce((a, x) => a + x.n, 0), axeRules: v.map(x => x.id).join(' ') });
        if (pg === '/s/explore' || pg === '/c/today' || pg === '/o/overview' || pg === '/a/overview' || pg === '/s/explore/h1')
          await p.screenshot({ path: path.join(EV, `U-${sizeName}-${role}${pg.replace(/\//g, '_')}.png`) });
      }
      await ctx.close();
    }
  }
  // Slow 4G: Explore load time and bytes
  const ctx = await b.newContext({ viewport: { width: 360, height: 740 }, isMobile: true });
  await ctx.route(x => !/127\.0\.0\.1|localhost/.test(x.toString()), r => r.abort());
  const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p);
  await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
  let bytes = 0; cdp.on('Network.loadingFinished', e => { bytes += e.encodedDataLength; });
  const t0 = Date.now(); await p.goto(BASE + '/s/explore'); await p.waitForSelector('.h-row, .h-card', { timeout: 60000 }); const slow = Date.now() - t0;
  await ctx.close();
  // Keyboard: Tab through the login page and check each stop has a visible focus style
  const k = await (await b.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
  await k.goto(BASE + '/login'); await k.waitForTimeout(1000); const stops = [];
  for (let i = 0; i < 6; i++) {
    await k.keyboard.press('Tab');
    stops.push(await k.evaluate(() => { const a = document.activeElement; const s = getComputedStyle(a); return { el: (a.getAttribute('aria-label') || a.innerText || a.id || a.tagName).trim().slice(0, 30), ring: s.boxShadow !== 'none' || (s.outlineStyle !== 'none' && s.outlineWidth !== '0px') }; }));
  }
  await b.close();
  const out = { base: BASE, at: new Date().toISOString(), rows, axe: axeAll, slow4g: { ms: slow, kb: Math.round(bytes / 1024) }, keyboard: stops };
  fs.writeFileSync(path.join(EV, 'usability.json'), JSON.stringify(out, null, 2));
  const sum = s => rows.filter(r => r.size === s);
  for (const s of Object.keys(SIZES)) console.log(s, 'screens', sum(s).length, 'sideways', sum(s).filter(r => r.sideways > 0).map(r => r.role + r.page).join(','), 'unnamed', sum(s).reduce((a, r) => a + r.unnamed, 0), 'small', sum(s).reduce((a, r) => a + r.small, 0), 'emdash', sum(s).filter(r => r.emdash).length);
  console.log('axe rules', JSON.stringify(axeAll, null, 1));
  console.log('slow 4G explore', slow, 'ms', Math.round(bytes / 1024), 'KB'); console.log('keyboard', JSON.stringify(stops));
})();
