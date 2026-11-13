import { AlertTriangle, QrCode, BedDouble, CheckCircle2, ChevronRight, Clock, DoorOpen, KeyRound, LogIn, LogOut, Plus, Wrench } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { ErrorState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { Avatar, Btn, Skeleton } from '../../components/ui';
import type { Tenant, Visitor } from '../../data/types';
import { useIsPhone } from '../../lib/useIsPhone';
import { closingMin, LONG_VISIT, nowMin, span, t12, toMin, useMinuteTick } from '../../lib/visitTime';
import { custodianDay, setTenantStatus, signOutVisitor, undoSignOut } from '../../services/api';
import { useMe } from '../../services/session';
import { useData } from '../../services/useData';
import { GateQR, LogVisitor } from './shared';

type Task = { key: string; tone: 'bad' | 'warn' | 'info'; icon: ReactNode; text: ReactNode; sub: string; action: ReactNode };
const OFF_DAYS = 3; // a room out of use longer than this is worth a nudge

/**
 * The custodian's home screen. It answers "what do I need to do now?":
 * three numbers, a short to-do list sorted by urgency, who arrives today and who is inside.
 */
export function Today() {
  const me = useMe(); const phone = useIsPhone(); const toast = useToast(); const nav = useNavigate();
  useMinuteTick();
  const { data, loading, error, reload } = useData(() => custodianDay(me.hostelId!), [me.hostelId]);
  const [log, setLog] = useState(false); const [qr, setQr] = useState(false);
  const date = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const header = <PageHeader title="Today" search={false} actions={phone ? undefined : <Btn kind="secondary" onClick={() => setQr(true)}><QrCode size={17} />Gate QR</Btn>} />;
  if (error) return <>{header}<ErrorState message={error} onRetry={reload} /></>;
  if (loading && !data) return <>{header}<Skeleton rows={4} h={phone ? 72 : 110} /></>;
  const d = data!;
  const now = nowMin(); const close = closingMin(d.hostel.visit);
  const isLate = (v: Visitor) => close !== null && now >= close;
  const mins = (v: Visitor) => Math.max(0, now - toMin(v.tin));
  const late = d.inside.filter(isLate);
  const long = d.inside.filter(v => !isLate(v) && mins(v) >= LONG_VISIT);

  const out = async (v: Visitor) => { await signOutVisitor(v.id); toast(`${v.name.split(' ')[0]} marked as left`, { undo: () => { undoSignOut(v.id); } }); };
  const checkIn = async (t: Tenant) => { await setTenantStatus(t.id, 'in'); toast(`${t.name.split(' ')[0]} checked in to ${t.room}`); };
  const giveRoom = (t: Tenant) => nav(`/c/rooms?assign=${t.id}`);

  const tasks: Task[] = [
    ...late.map(v => ({ key: 'l' + v.id, tone: 'bad' as const, icon: <AlertTriangle size={17} />, text: <><b>{v.name}</b> is inside after hours</>,
      sub: `Room ${v.room} · in since ${t12(v.tin)}`, action: <Btn size="sm" onClick={() => out(v)}><LogOut size={15} />Mark left</Btn> })),
    ...d.arriving.filter(t => !t.roomId).map(t => ({ key: 'r' + t.id, tone: 'warn' as const, icon: <KeyRound size={17} />, text: <><b>{t.name}</b> needs a room</>,
      sub: `Paid · ${t.type}`, action: <Btn size="sm" onClick={() => giveRoom(t)}>Give room</Btn> })),
    ...long.map(v => ({ key: 'g' + v.id, tone: 'warn' as const, icon: <Clock size={17} />, text: <><b>{v.name}</b> inside for {span(mins(v))}</>,
      sub: `Room ${v.room}`, action: <Btn size="sm" kind="secondary" onClick={() => out(v)}><LogOut size={15} />Mark left</Btn> })),
    ...d.offRooms.filter(r => r.days >= OFF_DAYS).map(({ room: r, days }) => ({ key: 'o' + r.id, tone: 'info' as const, icon: <Wrench size={17} />,
      text: <>Room <b>{r.no}</b> out of use for {days} days</>, sub: r.unavailableReason ?? 'Not available', action: <Link to={`/c/rooms?room=${r.id}`} className="btn btn-secondary btn-sm">Check</Link> })),
  ];

  const strip = <div className="td-strip" role="list">
    <Link role="listitem" to="/c/visitors" className="td-num"><b className="num">{d.inside.length}</b><span>inside now</span></Link>
    <Link role="listitem" to="/c/visitors" className={'td-num' + (late.length ? ' bad' : '')}><b className="num">{late.length}</b><span>{late.length === 1 ? 'late visitor' : 'late visitors'}</span></Link>
    <Link role="listitem" to="/c/rooms" className="td-num"><b className="num">{d.freeBeds}</b><span>free beds</span></Link>
  </div>;

  const todo = <section className="card td-card td-todo" aria-label="Needs you now">
    <div className="td-head"><h2>Needs you now</h2>{tasks.length > 0 && <span className="td-count">{tasks.length}</span>}</div>
    {tasks.length ? <ul className="td-list">{tasks.map(t => <li key={t.key} className={'td-task ' + t.tone}>
      <span className="td-ic">{t.icon}</span><span className="grow min0"><span className="td-t">{t.text}</span><span className="td-s clamp1">{t.sub}</span></span>{t.action}</li>)}</ul>
      : <p className="td-clear"><CheckCircle2 size={18} />You're all caught up.</p>}
  </section>;

  const ready = d.arriving.filter(t => t.roomId);
  const arriving = <section className="card td-card" aria-label="Ready to check in">
    <div className="td-head"><h2>Ready to check in</h2><span className="td-count soft">{ready.length}</span><span className="grow" /><Link to="/c/tenants" className="td-link">All<ChevronRight size={15} /></Link></div>
    {ready.length ? <ul className="td-list">{ready.slice(0, phone ? 3 : 6).map(t => <li key={t.id} className="td-row">
      <Avatar user={{ name: t.name }} size={36} /><span className="grow min0"><b className="ink clamp1">{t.name}</b>
        <span className="td-s">{t.roomId ? <>{t.room} · {t.type}</> : <span className="warn-t">No room yet · {t.type}</span>}</span></span>
      {t.roomId ? <Btn size="sm" onClick={() => checkIn(t)}><LogIn size={15} />Check in</Btn> : <Btn size="sm" kind="secondary" onClick={() => giveRoom(t)}>Give room</Btn>}</li>)}</ul>
      : <p className="td-empty"><BedDouble size={16} />{d.arriving.length ? 'Give the students above a room first.' : 'Nobody is due to arrive.'}</p>}
  </section>;

  const inside = <section className="card td-card" aria-label="Visitors inside now">
    <div className="td-head"><h2>Inside now</h2><span className="td-count soft">{d.inside.length}</span><span className="grow" />
      <button className="td-link" onClick={() => setLog(true)}><Plus size={15} />Add visitor</button></div>
    {d.inside.length ? <ul className="td-list">{d.inside.slice(0, phone ? 3 : 6).map(v => { const l = isLate(v);
      return <li key={v.id} className="td-row"><Avatar user={{ name: v.name }} size={36} /><span className="grow min0"><b className="ink clamp1">{v.name}</b>
        <span className="td-s">Room {v.room} · <span className={l ? 'danger-t strong' : ''}>{l ? `${span(mins(v))}, past hours` : `since ${t12(v.tin)}`}</span></span></span>
        <button className="icon-btn td-out" onClick={() => out(v)} aria-label={`Mark ${v.name} as left`} title="Mark as left"><LogOut size={17} /></button></li>; })}</ul>
      : <p className="td-empty"><DoorOpen size={16} />Nobody is visiting. {d.visitsToday ? `${d.visitsToday} ${d.visitsToday === 1 ? 'visit' : 'visits'} so far today.` : ''}</p>}
    {d.inside.length > (phone ? 3 : 6) && <Link to="/c/visitors" className="td-more">See all {d.inside.length}<ChevronRight size={15} /></Link>}
  </section>;

  return <>
    {header}
    <p className="td-date">{date} · {d.hostel.name} · visiting {d.hostel.visit.replace(/:00/g, '')}</p>
    {phone ? <div className="td-phone">{strip}{todo}{arriving}{inside}</div>
      : <div className="td-grid fill">{strip}<div className="td-cols">{todo}<div className="td-side">{arriving}{inside}</div></div></div>}
    {log && <LogVisitor onClose={() => setLog(false)} />}
    {qr && <GateQR onClose={() => setQr(false)} />}
  </>;
}
