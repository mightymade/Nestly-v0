import { BadgeCheck, ChevronLeft, MapPin, Smartphone } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import campus from '../../assets/ucu-campus.jpg';
import { Overlay } from '../../components/Overlay';
import { Logo } from '../../components/ui';
import { useIsPhone } from '../../lib/useIsPhone';

const PROMISES: [ReactNode, string][] = [
  [<BadgeCheck size={15} key="v" />, 'Hostels checked by Nestly'],
  [<MapPin size={15} key="m" />, 'Real distance to campus'],
  [<Smartphone size={15} key="p" />, 'Pay with mobile money'],
];

/** The campus photo panel shared by the welcome, log in and sign up pages. */
function Hero() {
  return <div className="auth-hero">
    <img className="auth-photo" src={campus} alt="" />
    <div className="auth-shade" />
    <div className="auth-copy">
      <h1>Your room near campus, sorted before the semester starts.</h1>
      <p className="lead">Compare hostels near your university, book a room with mobile money, and keep everything about your stay in one place.</p>
      <ul className="auth-promises">{PROMISES.map(([ic, t]) => <li key={t}>{ic}{t}</li>)}</ul>
    </div>
  </div>;
}

const HELP: [string, string][] = [
  ['How do I sign up as a student?', 'Tap Create a student account and use your university email. We send a link to that email to confirm it is you.'],
  ['I own a hostel. How do I join?', 'Tap I own a hostel. You add your details and ID, then your hostel. Nestly checks both before students can see it.'],
  ['I work at a hostel. How do I get in?', 'Ask the hostel owner for an invite code, then tap I work at a hostel and enter it.'],
  ['I forgot my password.', 'On the log in page, tap Forgot password? and we send a reset link to your email.'],
];

/** Small footer under the sign-in panel. Help and Privacy open short answers instead of pages that need an account. */
function AuthFoot() {
  const [open, setOpen] = useState<'help' | 'privacy' | null>(null);
  return <footer className="auth-foot">
    <span>© 2026 Nestly</span><span aria-hidden="true">·</span>
    <button type="button" onClick={() => setOpen('help')}>Help</button><span aria-hidden="true">·</span>
    <button type="button" onClick={() => setOpen('privacy')}>Privacy</button>
    {open === 'help' && <Overlay title="Help" onClose={() => setOpen(null)} width={480}>
      <div className="stack">{HELP.map(([q, a]) => <div key={q}><b className="ink">{q}</b><p className="small muted" style={{ marginTop: 4 }}>{a}</p></div>)}</div>
    </Overlay>}
    {open === 'privacy' && <Overlay title="Privacy" onClose={() => setOpen(null)} width={480}>
      <div className="stack small">
        <p>Nestly keeps only what it needs to book a room: your name, email, phone number and bookings.</p>
        <p>Hostel owners see the name and phone number of students who book with them. Custodians see the students at their hostel.</p>
        <p>Owner ID documents are seen only by the Nestly team that checks them. We never sell your details.</p>
        <p className="muted">This is a student project. A full privacy policy will be added before Nestly takes real bookings.</p>
      </div>
    </Overlay>}
  </footer>;
}

export function AuthLayout({ title, sub, children, back, foot, ownerLink = true, wide, tall, onBack }: {
  title: string; sub?: string; children: ReactNode; back?: string; foot?: ReactNode; ownerLink?: boolean;
  /** Wider form column on PC, for forms with fields side by side. */ wide?: boolean;
  /** Big photo header on phone (welcome page). Other pages use a short strip so the form fits. */ tall?: boolean;
  /** Back goes to the previous step instead of a page. */ onBack?: () => void;
}) {
  const phone = useIsPhone();
  const backBtn = (cls: string) => onBack ? <button type="button" className={cls} onClick={onBack} aria-label="Back" title="Back"><ChevronLeft size={22} /></button>
    : back ? <Link to={back} className={cls} aria-label="Back" title="Back"><ChevronLeft size={22} /></Link> : null;
  if (phone) return <div className={'m-auth' + (tall ? '' : ' compact')}>
    <div className="head">
      <img className="auth-photo" src={campus} alt="" /><div className="auth-shade" />
      <div className="row rel" style={{ gap: 12 }}>{backBtn('auth-back on-photo')}<Link to="/welcome" aria-label="Nestly home"><Logo /></Link></div>
      <div className="rel"><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
    </div>
    <div className="body auth-in">{children}{foot && <div className="sticky-foot">{foot}</div>}{!foot && <AuthFoot />}</div>
  </div>;
  return <div className="frame"><div className="auth">
    <Hero />
    <div className="auth-form">{ownerLink && <Link to="/owner/signup" className="owner-link small">For hostel owners</Link>}<div className={'inner auth-in' + (wide ? ' wide' : '')}>
      <Link to="/welcome" aria-label="Nestly home" className="form-logo"><Logo /></Link>
      <div className="auth-title">{backBtn('auth-back')}<div><h1>{title}</h1>{sub && <p className="muted" style={{ marginTop: 8 }}>{sub}</p>}</div></div>
      {children}{foot}
    </div><AuthFoot /></div>
  </div></div>;
}
