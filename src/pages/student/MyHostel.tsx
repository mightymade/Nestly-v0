import { CalendarClock, Clock, Compass, DoorOpen, Home, Phone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/Card';
import { PageHeader } from '../../components/PageHeader';
import { Pill } from '../../components/Pill';
import { EmptyState, ErrorState } from '../../components/States';
import { Avatar, Skeleton } from '../../components/ui';
import { fullDate, timeAgo } from '../../lib/format';
import { useIsPhone } from '../../lib/useIsPhone';
import { myHostel } from '../../services/api';
import { useMe } from '../../services/session';
import { useData } from '../../services/useData';

export function MyHostel() {
  const me = useMe(); const phone = useIsPhone();
  const { data, loading, error, reload } = useData(() => myHostel(me.id), [me.id]);
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading && data === undefined) return <><PageHeader title="My Hostel" /><Skeleton rows={3} h={150} /></>;
  if (!data) return <><PageHeader title="My Hostel" />
    <EmptyState icon={<Home size={24} />} title="This tab opens when you move in" text="Once the custodian checks you in, your room, stay dates and hostel notices show up here." action={<Link to="/s/explore" className="btn btn-primary"><Compass size={18} />Find a room</Link>} /></>;
  const { hostel: h, booking: b, notices, custodian, daysLeft, endLabel } = data;

  const visit = h.visit.replace(/:00/g, '');
  const hero = <div className="hero-card my-hero">
    <div className="row between start" style={{ gap: 10 }}><h2 className="my-hero-name">{h.name}</h2><Pill tone="onhero">Checked in</Pill></div>
    <div className="meta">
      <span><DoorOpen size={15} />Room {b.roomNo}</span>
      <span><Clock size={15} />Visitors {visit}</span>
      <span><CalendarClock size={15} />Ends {endLabel} · {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left</span>
    </div>
    {custodian && <div className="my-hero-cust">
      <span className="call"><Avatar user={custodian} size={28} /><span className="clamp1">{custodian.name} <span className="dim">· Custodian</span></span></span>
      {custodian.phone && <a className="call call-btn" href={`tel:${custodian.phone?.replace(/\s/g, '')}`} aria-label={`Call ${custodian.name}, ${custodian.phone}`}><Phone size={15} /><span className="call-num">{custodian.phone}</span></a>}
    </div>}
  </div>;
  const noticeCard = <Card fill={!phone} scroll title="Notices" subtitle="From your custodian and hostel owner">
    {notices.length ? <ul className="timeline-list">{notices.map(n => <li key={n.id}><span className="dot" /><div><p className="ink">{n.text}</p><p className="small muted" style={{ marginTop: 4 }} title={fullDate(n.at)}>{n.by} · {timeAgo(n.at)}</p></div></li>)}</ul>
      : <p className="muted">No notices right now.</p>}</Card>;
  if (phone) return <>
    <PageHeader title="My Hostel" />
    {hero}{noticeCard}
  </>;
  return <>
    <PageHeader title="My Hostel" />
    <div className="my-wrap fill">{hero}{noticeCard}</div>
  </>;
}
