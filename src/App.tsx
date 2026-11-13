import { useEffect } from 'react';
import { BrowserRouter, Link, MemoryRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { Logo } from './components/ui';
import { ToastProvider } from './components/Toast';
import { AccountGateProvider } from './components/AccountGate';
import type { Role, User } from './data/types';
import { AppShell } from './layouts/AppShell';
import { useIsPhone } from './lib/useIsPhone';
import { Invite } from './pages/auth/Invite';
import { Login } from './pages/auth/Login';
import { Signup } from './pages/auth/Signup';
import { Welcome } from './pages/auth/Welcome';
import { Notices } from './pages/custodian/Notices';
import { Rooms } from './pages/custodian/Rooms';
import { Tenants } from './pages/custodian/Tenants';
import { Today } from './pages/custodian/Today';
import { Visitors } from './pages/custodian/Visitors';
import { AdminFlags } from './pages/admin/Flags';
import { AdminActivity } from './pages/admin/Activity';
import { AdminHostels } from './pages/admin/Hostels';
import { AdminOverview } from './pages/admin/Overview';
import { AdminReviews } from './pages/admin/Reviews';
import { AdminUniversities } from './pages/admin/Universities';
import { AdminUsers } from './pages/admin/Users';
import { AdminSubscriptions } from './pages/admin/Subscriptions';
import { VisitPage } from './pages/VisitPage';
import { OwnerBookings } from './pages/owner/Bookings';
import { HostelEditor } from './pages/owner/HostelEditor';
import { OwnerHostels } from './pages/owner/Hostels';
import { Money } from './pages/owner/Money';
import { OwnerOverview } from './pages/owner/Overview';
import { OwnerSignup } from './pages/owner/Signup';
import { Staff } from './pages/owner/Staff';
import { HelpPage } from './pages/shared/Help';
import { SettingsPage } from './pages/shared/Settings';
import { Bookings } from './pages/student/Bookings';
import { Explore } from './pages/student/Explore';
import { HostelPage } from './pages/student/HostelPage';
import { MyHostel } from './pages/student/MyHostel';
import { Saved } from './pages/student/Saved';
import { SessionProvider, useUser } from './services/session';

const home = (u: Pick<User, 'role' | 'ownerStatus'>) => u.role === 'student' ? '/s/explore' : u.role === 'custodian' ? '/c/today'
  : u.role === 'admin' ? '/a/overview' : u.ownerStatus === 'incomplete' ? '/owner/signup' : '/o/overview';

function Guard({ role }: { role: Role }) {
  const u = useUser();
  if (!u) return <Navigate to="/welcome" replace />;
  if (u.role !== role) return <Navigate to={home(u)} replace />;
  if (role === 'owner' && u.ownerStatus === 'incomplete') return <Navigate to="/owner/signup" replace />;
  return <Outlet />;
}
/** Students' area. Guests may browse Explore, hostel pages and Help; everything else needs an account. */
function StudentGate() {
  const u = useUser(); const { pathname } = useLocation();
  if (!u) return /^\/s(\/explore(\/[^/]+)?|\/help)?\/?$/.test(pathname) ? <Outlet /> : <Navigate to="/login" replace />;
  if (u.role !== 'student') return <Navigate to={home(u)} replace />;
  return <Outlet />;
}
function GuestOnly() { const u = useUser(); return u ? <Navigate to={home(u)} replace /> : <Outlet />; }
function SignupRoute() { const u = useUser(); return u && (u.role !== 'student' || u.emailVerified) ? <Navigate to={home(u)} replace /> : <Signup />; }
function OwnerSignupRoute() {
  const u = useUser(); const fix = new URLSearchParams(useLocation().search).has('fix');
  if (u && (u.role !== 'owner' || (u.ownerStatus !== 'incomplete' && !(fix && u.ownerStatus === 'rejected')))) return <Navigate to={home(u)} replace />;
  return <OwnerSignup />;
}
/** Unknown links get a clear message and a way home, not a silent redirect. */
function NotFound() {
  const u = useUser();
  return <main className="visit-page"><div className="visit-missing">
    <Logo /><h1>We could not find that page</h1><p className="muted">The link may be old or typed wrong.</p>
    <Link to={u ? home(u) : '/welcome'} className="btn btn-primary">{u ? 'Go to my home page' : 'Go to Nestly'}</Link></div></main>;
}

function Root() { const u = useUser(); return <Navigate to={u ? home(u) : '/welcome'} replace />; }

function AppRoutes() {
  useIsPhone(); // keeps the body class in sync
  return <Routes>
    <Route path="/" element={<Root />} />
    <Route path="/visit/:hid" element={<VisitPage />} />
    <Route element={<GuestOnly />}><Route path="/welcome" element={<Welcome />} /><Route path="/login" element={<Login />} /><Route path="/invite" element={<Invite />} /></Route>
    <Route path="/signup" element={<SignupRoute />} />
    <Route path="/s" element={<StudentGate />}><Route element={<AppShell role="student" />}>
      <Route index element={<Navigate to="explore" replace />} />
      <Route path="explore" element={<Explore />} /><Route path="explore/:id" element={<HostelPage />} />
      <Route path="saved" element={<Saved />} /><Route path="bookings" element={<Bookings />} /><Route path="my-hostel" element={<MyHostel />} />
      <Route path="help" element={<HelpPage />} /><Route path="account" element={<SettingsPage base="/s/account" home="/s/explore" />} /><Route path="account/:section" element={<SettingsPage base="/s/account" home="/s/explore" />} />
    </Route></Route>
    <Route path="/c" element={<Guard role="custodian" />}><Route element={<AppShell role="custodian" />}>
      <Route index element={<Navigate to="today" replace />} />
      <Route path="today" element={<Today />} /><Route path="visitors" element={<Visitors />} /><Route path="tenants" element={<Tenants />} />
      <Route path="rooms" element={<Rooms />} /><Route path="notices" element={<Notices />} />
      <Route path="help" element={<HelpPage />} /><Route path="settings" element={<SettingsPage base="/c/settings" home="/c/today" />} /><Route path="settings/:section" element={<SettingsPage base="/c/settings" home="/c/today" />} />
    </Route></Route>
    <Route path="/owner/signup" element={<OwnerSignupRoute />} />
    <Route path="/o" element={<Guard role="owner" />}><Route element={<AppShell role="owner" />}>
      <Route index element={<Navigate to="overview" replace />} />
      <Route path="overview" element={<OwnerOverview />} /><Route path="hostels" element={<OwnerHostels />} /><Route path="hostels/:id" element={<HostelEditor />} />
      <Route path="bookings" element={<OwnerBookings />} /><Route path="money" element={<Money />} /><Route path="staff" element={<Staff />} />
      <Route path="help" element={<HelpPage />} /><Route path="settings" element={<SettingsPage base="/o/settings" home="/o/overview" />} /><Route path="settings/:section" element={<SettingsPage base="/o/settings" home="/o/overview" />} />
    </Route></Route>
    <Route path="/a" element={<Guard role="admin" />}><Route element={<AppShell role="admin" />}>
      <Route index element={<Navigate to="overview" replace />} />
      <Route path="overview" element={<AdminOverview />} /><Route path="reviews" element={<AdminReviews />} /><Route path="hostels" element={<AdminHostels />} />
      <Route path="users" element={<AdminUsers />} /><Route path="flags" element={<AdminFlags />} /><Route path="subscriptions" element={<AdminSubscriptions />} /><Route path="universities" element={<AdminUniversities />} /><Route path="activity" element={<AdminActivity />} />
      <Route path="help" element={<HelpPage />} /><Route path="settings" element={<SettingsPage base="/a/settings" home="/a/overview" />} /><Route path="settings/:section" element={<SettingsPage base="/a/settings" home="/a/overview" />} />
    </Route></Route>
    <Route path="*" element={<NotFound />} />
  </Routes>;
}

// The single-file preview runs inside a frame without real URLs, so it keeps routes in memory.
const Router = import.meta.env.MODE === 'single' ? MemoryRouter : BrowserRouter;

export default function App() {
  return <SessionProvider><ToastProvider><Router><AccountGateProvider><ScrollTop /><AppRoutes /></AccountGateProvider></Router></ToastProvider></SessionProvider>;
}

function ScrollTop() { const { pathname } = useLocation(); useEffect(() => { window.scrollTo(0, 0); }, [pathname]); return null; }
