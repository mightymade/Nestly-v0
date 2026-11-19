import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useIsPhone } from '../lib/useIsPhone';
import { useUser } from '../services/session';
import { NotificationBell } from './NotificationBell';
import { QuickSearch } from './QuickSearch';

/** Page title row. On PC it also carries search and notifications. Guests get Log in and Create account instead. */
export function PageHeader({ title, actions, search = true }: { title: string; actions?: ReactNode; search?: boolean }) {
  const phone = useIsPhone(); const me = useUser();
  if (phone) return actions ? <div className="m-actions">{actions}</div> : null;
  return <header className="topbar">
    <div className="titles"><h1>{title}</h1></div>
    <div className="row" style={{ gap: 12 }}>
      {actions && <div className="page-actions">{actions}</div>}
      {me ? <div className="tools">{search && <QuickSearch />}<NotificationBell /></div>
        : <div className="row" style={{ gap: 8 }}><Link to="/login" className="btn btn-secondary">Log in</Link><Link to="/signup" className="btn btn-primary">Create account</Link></div>}
    </div>
  </header>;
}
