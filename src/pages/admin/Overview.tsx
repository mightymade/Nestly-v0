import { ArrowRight, Building2, CheckCircle2, ClipboardCheck, Flag, History, UserCheck, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/Card';
import { PageHeader } from '../../components/PageHeader';
import { ErrorState } from '../../components/States';
import { Skeleton } from '../../components/ui';
import { timeAgo, ugx } from '../../lib/format';
import { useIsPhone } from '../../lib/useIsPhone';
import { adminOverview } from '../../services/api';
import { waited } from './Reviews';
import { useData } from '../../services/useData';

/** Tiny line of bookings per week, drawn inline so the platform row stays one line. */
export function Spark({ values }: { values: number[] }) {
  const max = Math.max(1, ...values), w = 72, h = 22;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 2 - (v / max) * (h - 4)}`).join(' ');
  return <svg width={w} height={h} className="spark" aria-hidden="true"><polyline points={pts} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function AdminOverview() {
  const phone = useIsPhone();
  const { data, loading, error, reload } = useData(() => adminOverview(), []);
  if (error) return <><PageHeader title="Overview" /><ErrorState message={error} onRetry={reload} /></>;
  if (loading && !data) return <><PageHeader title="Overview" /><Skeleton rows={3} h={120} /></>;
  const d = data!; const q = d.queue; const m = d.subs;
  const items: [number, string, string, typeof Flag, string, boolean][] = [
    [q.flags, q.flags === 1 ? 'open report' : 'open reports', '/a/flags', Flag, 'safety and payment problems first', true],
    [q.owners, q.owners === 1 ? 'owner waiting for review' : 'owners waiting for review', '/a/reviews?tab=owners', UserCheck, d.ownersSince ? `oldest has waited ${waited(d.ownersSince)}` : '', false],
    [q.listings, q.listings === 1 ? 'listing waiting for review' : 'listings waiting for review', '/a/reviews?tab=listings', ClipboardCheck, q.oldest ? `oldest has waited ${waited(q.oldest)}` : '', false],
    [m.late, m.late === 1 ? 'owner is late paying' : 'owners are late paying', '/a/subscriptions', Wallet, `owe ${ugx(m.owed)} in total`, false],
  ];
  const work = items.filter(i => i[0] > 0);
  const queue = <Card title="Work queue">
    {work.length ? <ul className="att-list">{work.map(([n, l, to, I, extra, urgent]) => <li key={to}><Link to={to} className="att q"><span className={'icon-tile sm ' + (urgent ? 'danger' : 'primary')}><I size={16} /></span>
      <span className="grow"><b className="num">{n}</b> {l}{extra && <span className="tiny muted"> · {extra}</span>}</span><ArrowRight size={16} /></Link></li>)}</ul>
      : <p className="row-sm muted"><CheckCircle2 size={18} color="var(--success)" />Nothing waiting. Good work.</p>}
  </Card>;
  const paidShare = m.owners ? Math.round(((m.paid + m.due) / m.owners) * 100) : 0;
  const strip = <div className="card sstrip oh-strip ad-strip" aria-label="Nestly at a glance">
    <Link to="/a/subscriptions?tab=payments" className="sc"><span className="sc-l">Subscriptions this month</span><span className="sc-v num">{ugx(m.month)}</span>
      <span className="sc-s">Last month {ugx(m.lastMonth)}</span></Link>
    <Link to="/a/subscriptions?tab=all" className="sc"><span className="sc-l">Owners paid up</span><span className="sc-v num">{m.paid + m.due}<small>of {m.owners}</small></span>
      <span className="sc-bar"><i style={{ width: `${paidShare}%` }} /></span></Link>
    <Link to="/a/subscriptions" className="sc"><span className="sc-l">Late paying</span><span className={'sc-v num' + (m.late ? ' danger-t' : '')}>{m.late}<small>{m.grace ? `+ ${m.grace} in grace` : 'owners'}</small></span>
      <span className={'sc-s' + (m.owed ? ' down' : '')}>{m.owed ? `Owe ${ugx(m.owed)}` : 'Nobody owes anything'}</span></Link>
    <Link to="/a/hostels" className="sc"><span className="sc-l">Live hostels</span><span className="sc-v num">{d.platform.live}</span><span className="sc-s">Students can book</span></Link>
    <Link to="/a/users" className="sc"><span className="sc-l">Verified students</span><span className="sc-v num">{d.platform.students}</span><span className="sc-s">Confirmed school email</span></Link>
    <div className="sc"><span className="sc-l">Bookings, 7 days</span><span className="sc-v num">{d.platform.bookingsWeek}<Spark values={d.platform.trend} /></span><span className="sc-s">Paid straight to owners</span></div>
  </div>;
  const recent = <Card fill={!phone} scroll title="Recent activity" action={<Link to="/a/activity" className="btn btn-text btn-sm"><History size={15} />Full log</Link>}>
    <ul className="act-list">{d.recent.map(a => <li key={a.id}><span className="icon-tile sm"><Building2 size={15} /></span>
      <span className="grow small"><b className="ink">{a.actor}</b> {a.action.toLowerCase()}: {a.target}{a.detail && <span className="muted"> · {a.detail}</span>}</span><span className="tiny muted nowrap">{timeAgo(a.at)}</span></li>)}</ul>
  </Card>;
  return <><PageHeader title="Overview" />{phone ? <>{queue}{strip}{recent}</> : <div className="fill-col fill">{strip}{queue}{recent}</div>}</>;
}
