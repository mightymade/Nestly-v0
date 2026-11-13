import { Bell, BellOff, Flag, ShieldCheck, Wallet, CalendarCheck, DoorOpen, Megaphone, UserRound, Wrench, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Notification } from '../data/types';
import { fullDate, timeAgo } from '../lib/format';
import { useIsPhone } from '../lib/useIsPhone';
import { listNotifications, markAllRead, markRead } from '../services/api';
import { useMe } from '../services/session';
import { useData } from '../services/useData';
import { Overlay } from './Overlay';
import { EmptyState } from './States';

const KIND_ICON: Record<Notification['kind'], LucideIcon> = { booking: CalendarCheck, problem: Wrench, notice: Megaphone, reminder: Bell, tenant: UserRound, visitor: DoorOpen, review: ShieldCheck, staff: UserRound, flag: Flag, money: Wallet };

export function NotificationBell() {
  const me = useMe(); const phone = useIsPhone(); const nav = useNavigate();
  const { data } = useData(() => listNotifications(me.id), [me.id]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // Only today's notifications are shown; older ones drop off at midnight.
  const today = new Date().toDateString();
  const list = (data ?? []).filter(n => new Date(n.at).toDateString() === today).sort((a, b) => b.at.localeCompare(a.at));
  const unread = list.filter(n => !n.read).length;
  useEffect(() => {
    if (!open || phone) return;
    const out = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', out); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', key); };
  }, [open, phone]);
  const go = (n: Notification) => { markRead(n.id); setOpen(false); nav(n.to); };
  const items = list.length ? <div className="stack-sm" style={{ gap: 2 }}>{list.map(n => { const I = KIND_ICON[n.kind];
    return <button key={n.id} className={'notif' + (n.read ? ' read' : '')} onClick={() => go(n)}><span className={'icon-tile sm ' + (n.read ? '' : 'primary')}><I size={17} /></span>
      <span className="grow"><span className="t">{n.title}</span><span className="small" style={{ display: 'block', marginTop: 2 }}>{n.text}</span>
        <span className="tiny muted" title={fullDate(n.at)} style={{ display: 'block', marginTop: 4 }}>{timeAgo(n.at)}</span></span>
      {!n.read && <span className="unread" aria-label="Unread" />}</button>; })}</div>
    : <EmptyState bare icon={<BellOff size={24} />} title="Nothing new today" text="Today's bookings, visitors and notices show up here." />;
  const markAll = unread > 0 && <button className="btn btn-text btn-sm" onClick={() => markAllRead(me.id)}>Mark all as read</button>;
  return <div ref={box} style={{ position: 'relative' }}>
    <button className="round-btn" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={open} onClick={() => setOpen(o => !o)}>
      <Bell size={19} />{unread > 0 && <span className="dot" />}</button>
    {open && !phone && <div className="popover" role="dialog" aria-label="Notifications">
      <div className="notif-head"><h2>Notifications</h2>{markAll}</div><div style={{ padding: '0 8px 8px' }}>{items}</div></div>}
    {open && phone && <Overlay title="Notifications" onClose={() => setOpen(false)} full>{markAll && <div className="row end" style={{ marginBottom: 8 }}>{markAll}</div>}{items}</Overlay>}
  </div>;
}
