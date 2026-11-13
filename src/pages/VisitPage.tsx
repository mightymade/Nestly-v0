import { Link, useParams } from 'react-router-dom';
import { Logo } from '../components/ui';
import { hostelById } from '../services/api';
import { VisitorScreen } from './custodian/shared';

/** What a visitor's phone opens after scanning the gate QR. No account needed. */
export function VisitPage() {
  const { hid = '' } = useParams(); const h = hostelById(hid);
  if (!h || h.status !== 'live') return <main className="visit-page"><div className="visit-missing">
    <Logo /><h1>This code is not working</h1><p className="muted">The hostel may have stopped using Nestly. Ask the custodian at the gate to sign you in.</p>
    <Link to="/welcome" className="btn btn-secondary">Go to Nestly</Link></div></main>;
  return <main className="visit-page"><VisitorScreen hid={hid} remember onDone={() => { window.scrollTo(0, 0); location.reload(); }} /></main>;
}
