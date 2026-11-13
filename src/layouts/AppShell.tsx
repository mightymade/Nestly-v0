import { BedDouble, Building2, CalendarDays, ClipboardCheck, Compass, Flag, GraduationCap, Heart, HelpCircle, History, Home, LayoutDashboard, LogOut, Megaphone, QrCode, Repeat, Settings, User as UserIcon, UserCog, Users, Wallet, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { NotificationBell } from '../components/NotificationBell';
import { Avatar, Logo, VerifiedName } from '../components/ui';
import { setThemeUser } from '../lib/theme';
import type { Role } from '../data/types';
import { useIsPhone } from '../lib/useIsPhone';
import { GateQR } from '../pages/custodian/shared';
import { currentStay, hasBookingFor, logout, NEXT_SEM, savedIds } from '../services/api';
import { useMe, useUser } from '../services/session';
import { useNeedAccount, type Need } from '../components/AccountGate';

type Item = { to: string; label: string; icon: LucideIcon };
const OWNER_TABS: Item[] = [{ to: '/o/overview', label: 'Overview', icon: LayoutDashboard }, { to: '/o/hostels', label: 'Hostels', icon: Building2 }, { to: '/o/bookings', label: 'Bookings', icon: CalendarDays }, { to: '/o/money', label: 'Money', icon: Wallet }, { to: '/o/staff', label: 'Staff', icon: UserCog }];
const ADMIN_TABS: Item[] = [{ to: '/a/overview', label: 'Overview', icon: LayoutDashboard }, { to: '/a/reviews', label: 'Reviews', icon: ClipboardCheck }, { to: '/a/hostels', label: 'Hostels', icon: Building2 }, { to: '/a/users', label: 'Users', icon: Users }, { to: '/a/flags', label: 'Flags', icon: Flag }];
const NAV: Record<Role, { groups: [string, Item[]][]; tabs: Item[] }> = {
  student: {
    groups: [
      ['Menu', [{ to: '/s/explore', label: 'Explore', icon: Compass }, { to: '/s/saved', label: 'Saved', icon: Heart }, { to: '/s/bookings', label: 'Bookings', icon: CalendarDays }, { to: '/s/my-hostel', label: 'My Hostel', icon: Home }]],
      ['Account', [{ to: '/s/account', label: 'Account', icon: UserIcon }, { to: '/s/help', label: 'Help', icon: HelpCircle }]],
    ],
    tabs: [{ to: '/s/explore', label: 'Explore', icon: Compass }, { to: '/s/saved', label: 'Saved', icon: Heart }, { to: '/s/bookings', label: 'Bookings', icon: CalendarDays }, { to: '/s/my-hostel', label: 'My Hostel', icon: Home }, { to: '/s/account', label: 'Account', icon: UserIcon }],
  },
  custodian: {
    groups: [
      ['Menu', [{ to: '/c/today', label: 'Today', icon: LayoutDashboard }, { to: '/c/visitors', label: 'Visitors', icon: QrCode }, { to: '/c/tenants', label: 'Tenants', icon: Users }, { to: '/c/rooms', label: 'Rooms', icon: BedDouble }, { to: '/c/notices', label: 'Notices', icon: Megaphone }]],
      ['Tools', [{ to: '/c/settings', label: 'Settings', icon: Settings }, { to: '/c/help', label: 'Help', icon: HelpCircle }]],
    ],
    tabs: [{ to: '/c/today', label: 'Today', icon: LayoutDashboard }, { to: '/c/visitors', label: 'Visitors', icon: QrCode }, { to: '/c/tenants', label: 'Tenants', icon: Users }, { to: '/c/rooms', label: 'Rooms', icon: BedDouble }, { to: '/c/notices', label: 'Notices', icon: Megaphone }],
  },
  owner: {
    groups: [['Menu', OWNER_TABS], ['Tools', [{ to: '/o/settings', label: 'Settings', icon: Settings }, { to: '/o/help', label: 'Help', icon: HelpCircle }]]],
    tabs: OWNER_TABS,
  },
  admin: {
    groups: [['Menu', [...ADMIN_TABS.slice(0, 4), { to: '/a/subscriptions', label: 'Subscriptions', icon: Wallet }, ADMIN_TABS[4]!]], ['Tools', [{ to: '/a/universities', label: 'Universities', icon: GraduationCap }, { to: '/a/activity', label: 'Activity log', icon: History }, { to: '/a/settings', label: 'Settings', icon: Settings }]]],
    tabs: ADMIN_TABS,
  },
};
const TITLES: Record<string, string> = {
  '/s/explore': 'Find a room', '/s/saved': 'Saved', '/s/bookings': 'Bookings', '/s/my-hostel': 'My Hostel', '/s/account': 'Account',
  '/o/overview': 'Overview', '/o/hostels': 'Hostels', '/o/bookings': 'Bookings', '/o/money': 'Money', '/o/staff': 'Staff',
  '/a/overview': 'Overview', '/a/reviews': 'Reviews', '/a/hostels': 'Hostels', '/a/users': 'Users', '/a/flags': 'Flags', '/a/subscriptions': 'Subscriptions',
  '/c/settings': 'Settings', '/c/today': 'Today', '/c/visitors': 'Visitors', '/c/tenants': 'Tenants', '/c/rooms': 'Rooms', '/c/notices': 'Notices',
};
// Screens pushed on top of a tab on phone: they bring their own back bar and hide the tab bar.
const PUSHED = [/^\/s\/explore\/[^/]+$/, /^\/s\/account\/[^/]+$/, /^\/s\/help$/, /^\/c\/settings/, /^\/c\/help$/, /^\/o\/(settings|help|hostels\/.+)/, /^\/a\/(settings|help|universities|activity|subscriptions)/];

const SETTINGS: Record<Role, string> = { student: '/s/account', custodian: '/c/settings', owner: '/o/settings', admin: '/a/settings' };

function Promo({ role }: { role: Role }) {
  const me = useMe(); const nav = useNavigate();
  if (role !== 'student') return null;
  const stay = currentStay(me.id);
  if (!stay || hasBookingFor(me.id, NEXT_SEM)) return null;
  return <div className="promo"><span className="tile"><Repeat size={17} /></span><h3>Next semester</h3><p>Keep your room for {NEXT_SEM}.</p>
    <button className="btn btn-primary btn-sm" onClick={() => nav(`/s/explore/${stay.hostel.id}`)}>Book again</button></div>;
}

/** Bottom of the sidebar: who is signed in, and a log out button. */
function SideFoot({ role }: { role: Role }) {
  const me = useMe(); const nav = useNavigate();
  const label = { student: 'Student', custodian: 'Custodian', owner: 'Hostel owner', admin: 'Nestly admin' }[role];
  return <div className="side-foot">
    <div className="side-sep" role="separator" />
    <div className="side-me">
      <Link to={SETTINGS[role]} className="side-user" aria-label="Your account">
        <Avatar user={me} size={40} /><span className="grow" style={{ minWidth: 0 }}><VerifiedName user={me} className="name" /><span className="role clamp1" style={{ display: 'block' }}>{label}</span></span></Link>
      <button className="logout-icon" onClick={async () => { await logout(); nav('/welcome', { replace: true }); }} aria-label="Log out" title="Log out"><LogOut size={19} /></button>
    </div>
  </div>;
}

/** Pages a guest cannot open. Tapping them explains why and offers sign up. */
const LOCKED: Record<string, Need> = { '/s/saved': 'saved', '/s/bookings': 'bookings', '/s/my-hostel': 'my-hostel', '/s/account': 'account' };

/** Bottom of the sidebar for someone browsing without an account. */
function GuestFoot() {
  return <div className="side-foot guest-foot">
    <div className="guest-card"><b className="ink">Browsing as a guest</b><p className="small muted">Create a free account to save hostels and book a room.</p>
      <Link to="/signup" className="btn btn-primary btn-sm btn-block">Create account</Link>
      <Link to="/login" className="btn btn-secondary btn-sm btn-block">Log in</Link></div>
  </div>;
}

export function AppShell({ role }: { role: Role }) {
  const me = useUser(); const phone = useIsPhone(); const loc = useLocation(); const need = useNeedAccount();
  // Custodians have no settings screen on phone, so there the app always follows the device's light or dark mode.
  useEffect(() => { setThemeUser(me?.id ?? null, !!me && role === 'custodian' && phone); return () => setThemeUser(null); }, [me?.id, role, phone]); // eslint-disable-line react-hooks/exhaustive-deps
  const cfg = NAV[role];
  const savedCount = me && role === 'student' ? savedIds(me.id).length : 0;
  const locked = (to: string) => !me ? LOCKED[to] : undefined;
  const [qr, setQr] = useState(false);

  if (!phone) return <div className="frame"><div className="frame-inner">
    <aside className="side" aria-label="Sidebar">
      <Link to={cfg.tabs[0]!.to} aria-label="Nestly home"><Logo /></Link>
      {cfg.groups.map(([label, items]) => <nav key={label} className="nav-group" aria-label={label}><span className="section-label">{label}</span>
        {items.map(({ to, label, icon: Icon }) => { const l = locked(to);
          return l ? <button key={to} className="nav-link" onClick={() => need(l)}><Icon size={20} className="ic" />{label}</button>
            : <NavLink key={to} to={to} className="nav-link"><Icon size={20} className="ic" />{label}
          {label === 'Saved' && savedCount > 0 && <span className="count">{savedCount}</span>}</NavLink>; })}</nav>)}
      {me && <Promo role={role} />}
      {me ? <SideFoot role={role} /> : <GuestFoot />}
    </aside>
    <main className="main"><div className="main-inner"><div className="page" key={loc.pathname}><Outlet /></div></div></main>
  </div></div>;

  const pushed = PUSHED.some(r => r.test(loc.pathname));
  const title = TITLES[loc.pathname] ?? 'Nestly';
  return <div className={'m-shell' + (pushed ? ' no-tabs' : '')}>
    {!pushed && <header className="m-top"><span className="title">{title}</span>{role === 'custodian' && <button className="round-btn" onClick={() => setQr(true)} aria-label="Gate QR code" title="Gate QR code"><QrCode size={19} /></button>}{me ? <NotificationBell /> : <Link to="/login" className="btn btn-secondary btn-sm">Log in</Link>}
      {role !== 'student' && <Link to={SETTINGS[role]} className="round-btn" aria-label="Settings"><Settings size={19} /></Link>}</header>}
    {pushed ? <div className="page" key={loc.pathname}><Outlet /></div> : <main className="m-main"><div className="page" key={loc.pathname}><Outlet /></div></main>}
    {!pushed && <nav className="tabbar" style={{ gridTemplateColumns: `repeat(${cfg.tabs.length}, 1fr)` }} aria-label="Main">
      {cfg.tabs.map(({ to, label, icon: Icon }) => { const l = locked(to);
        return l ? <button key={to} onClick={() => need(l)}><span className="pill"><Icon size={21} /></span>{label}</button>
          : <NavLink key={to} to={to}><span className="pill"><Icon size={21} /></span>{label}</NavLink>; })}</nav>}
  {qr && <GateQR onClose={() => setQr(false)} />}
  </div>;
}
