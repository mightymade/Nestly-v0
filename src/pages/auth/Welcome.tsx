import { ArrowRight, Building2, ChevronRight, Compass, KeyRound, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AuthLayout } from './AuthLayout';

const PATHS: { to: string; icon: LucideIcon; title: string; text: string; main?: boolean }[] = [
  { to: '/s/explore', icon: Compass, title: 'Browse hostels', text: 'See rooms, prices and distance to campus. No account needed.', main: true },
  { to: '/owner/signup', icon: Building2, title: 'I own a hostel', text: 'List it and get student bookings' },
  { to: '/invite', icon: KeyRound, title: 'I work at a hostel', text: "Join with the owner's invite code" },
];

/**
 * One clear choice per kind of person. Students start by browsing (an account is only asked for
 * when they save or book), owners list a hostel, custodians join with a code. Logging in is a link.
 */
export function Welcome() {
  return <AuthLayout title="Welcome to Nestly" sub="Find and book a student hostel near your university." ownerLink={false} tall>
    <nav className="wl-paths" aria-label="How do you want to start?">
      {PATHS.map(({ to, icon: Icon, title, text, main }) => <Link key={to} to={to} className={'wl-path' + (main ? ' wl-main' : '')}>
        <span className="wl-ic"><Icon size={22} /></span>
        <span className="grow min0"><b>{title}</b><span>{text}</span></span>
        {main ? <span className="wl-go"><ArrowRight size={18} /></span> : <ChevronRight size={19} className="wl-chev" />}
      </Link>)}
    </nav>
    <p className="wl-login">Already have an account? <Link to="/login">Log in</Link></p>
  </AuthLayout>;
}
