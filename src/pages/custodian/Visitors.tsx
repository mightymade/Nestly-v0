import { Clock, Lock, LogOut, Phone, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DataTable, type Column } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { SearchIcon } from '../../components/SearchIcon';
import { Pill } from '../../components/Pill';
import { Segmented } from '../../components/Segmented';
import { EmptyState, ErrorState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { Avatar, Btn, Skeleton } from '../../components/ui';
import type { Visitor } from '../../data/types';
import { useIsPhone } from '../../lib/useIsPhone';
import { hostelById, listTenants, listVisitors, signOutVisitor, undoSignOut } from '../../services/api';
import { useData } from '../../services/useData';
import { useHostelId } from './shared';
import { closingMin, LONG_VISIT, nowMin, span, t12, toMin, useMinuteTick } from '../../lib/visitTime';

type Tab = 'inside' | 'left';



export function Visitors() {
  const hid = useHostelId(); const phone = useIsPhone(); const toast = useToast();
  const hostel = hostelById(hid);
  const { data, loading, error, reload } = useData(() => listVisitors(hid), [hid]);
  const { data: tenants } = useData(() => listTenants(hid), [hid]);
  const [tab, setTab] = useState<Tab>('inside'); const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  useMinuteTick();

  const host = useMemo(() => { const m = new Map<string, string>(); (tenants ?? []).filter(t => t.status !== 'out').forEach(t => { if (!m.has(t.room)) m.set(t.room, t.name); }); return m; }, [tenants]);
  const all = data ?? [];
  const match = (v: Visitor) => !q.trim() || `${v.name} ${v.room} ${v.host ?? host.get(v.room) ?? ''}`.toLowerCase().includes(q.trim().toLowerCase());
  const inside = all.filter(v => !v.tout).sort((a, b) => toMin(a.tin) - toMin(b.tin)); // longest inside first
  const left = all.filter(v => v.tout).sort((a, b) => toMin(b.tout!) - toMin(a.tout!)); // most recent first
  const shown = (tab === 'inside' ? inside : left).filter(match);

  const close = hostel ? closingMin(hostel.visit) : null; const now = nowMin();
  const closed = close !== null && now >= close;
  const hoursLine = !hostel ? null : closed
    ? <span className={'vhours' + (inside.length ? ' bad' : '')}><Clock size={14} />Visiting ended at {t12(`${String(Math.floor(close! / 60)).padStart(2, '0')}:${String(close! % 60).padStart(2, '0')}`)}{inside.length ? ` · ${inside.length} still inside` : ''}</span>
    : <span className="vhours"><Clock size={14} />Visiting hours {hostel.visit.replace(/:00/g, '')}{close !== null && <> · closes in {span(close - now)}</>}</span>;

  const out = async (v: Visitor) => { await signOutVisitor(v.id); toast(`${v.name.split(' ')[0]} marked as left`, { undo: () => { undoSignOut(v.id); } }); };

  const search = <SearchIcon value={q} onChange={setQ} open={searching} setOpen={setSearching} placeholder="Search visitor, room or tenant" />;
  const tabs = <Segmented label="Show" value={tab} onChange={setTab} options={[{ value: 'inside', label: 'Inside now', count: inside.length }, { value: 'left', label: 'Left today', count: left.length }]} />;

  const leftCols: Column<Visitor>[] = [
    { key: 'who', header: 'Visitor', phone: 'title', cell: v => phone ? v.name : <span className="who"><Avatar user={{ name: v.name }} size={32} />{v.name}</span> },
    { key: 'host', header: 'Visited', phone: 'meta', cell: v => { const who = v.host ?? host.get(v.room); return <span>{who ? <><b className="ink">{who}</b> · </> : null}{v.room}</span>; } },
    { key: 'time', header: 'In and out', phone: 'meta', cell: v => <span className="num">{t12(v.tin)} to {t12(v.tout!)}</span> },
    { key: 'dur', header: 'Stayed', phone: 'badge', cell: v => { const m = toMin(v.tout!) - toMin(v.tin); return phone ? <Pill tone="neutral">{span(m)}</Pill> : <span className="num">{span(m)}</span>; } },
    { key: 'via', header: 'Signed in', phone: 'hide', cell: v => <span className="muted">{v.via === 'QR' ? 'Scanned gate QR' : 'Logged by you'}</span> },
  ];

  const state = (v: Visitor) => { const m = Math.max(0, now - toMin(v.tin)); const late = close !== null && now >= close; return { m, late, long: !late && m >= LONG_VISIT }; };
  const insideCols: Column<Visitor>[] = [
    { key: 'who', header: 'Visitor', cell: v => <span className="who"><Avatar user={{ name: v.name }} size={32} /><span className="min0"><b className="ink clamp1" style={{ display: 'block' }}>{v.name}</b>{v.phone && <span className="tiny muted num">{v.phone}</span>}</span></span> },
    { key: 'host', header: 'Visiting', cell: v => { const who = v.host ?? host.get(v.room); return <span className="row-sm"><span className="vroom">{v.room}</span>{who && <b className="ink clamp1">{who}</b>}</span>; } },
    { key: 'in', header: 'In at', cell: v => <span className="num">{t12(v.tin)}</span> },
    { key: 'dur', header: 'Inside for', cell: v => { const s = state(v); return <span className={'vstay' + (s.late ? ' bad' : s.long ? ' warn' : '')}><span className="num">{span(s.m)}</span>{(s.late || s.long) && <span className="tiny">{s.late ? 'past hours' : 'over 3 h'}</span>}</span>; } },
    { key: 'via', header: 'Signed in', cell: v => <span className="muted">{v.via === 'QR' ? 'Scanned gate QR' : 'Logged by you'}</span> },
    { key: 'act', header: '', align: 'right', cell: v => <span className="row-sm" style={{ gap: 6, justifyContent: 'flex-end' }}>
      {v.phone ? <a className="icon-btn" href={`tel:${v.phone.replace(/\s/g, '')}`} aria-label={`Call ${v.name}`} title={`Call ${v.phone}`}><Phone size={16} /></a> : <span className="icon-btn" aria-hidden="true" style={{ visibility: 'hidden' }} />}
      <Btn size="sm" kind={state(v).late ? 'primary' : 'secondary'} onClick={() => out(v)}><LogOut size={15} />Mark as left</Btn></span> },
  ];

  const body = error ? <ErrorState message={error} onRetry={reload} />
    : loading && !data ? <Skeleton rows={4} h={phone ? 96 : 72} />
    : !shown.length ? <EmptyState bare icon={<Users size={24} />}
        title={q ? 'No visitor matches your search' : tab === 'inside' ? 'Nobody is inside right now' : 'No one has left yet today'}
        text={q ? 'Try a different name or room.' : tab === 'inside' ? 'When a visitor scans the gate QR, or you log them, they show up here.' : 'Visitors appear here once they are marked as left.'} />
    : tab === 'inside' && !phone
      ? <DataTable label="Visitors inside now" noun="visitors" rows={shown} rowKey={v => v.id} columns={insideCols} />
    : tab === 'inside'
      ? <div className="vgrid">{shown.map(v => <InsideCard key={v.id} compact={phone} v={v} host={v.host ?? host.get(v.room)} now={now} close={close} onOut={() => out(v)} />)}</div>
      : <DataTable label="Visitors who left today" noun="visits" rows={shown} rowKey={v => v.id} columns={leftCols} />;

  const foot = <p className="vfoot"><Lock size={13} />Entries are time-stamped and cannot be edited or deleted.</p>;

  const head = <div className={'vhead' + (searching ? ' searching' : '')}>{tabs}<span className="grow" />{search}</div>;

  if (phone) return <>
    <PageHeader title="Visitors" search={false} />
    {head}{hoursLine}
    {body}{shown.length > 0 && foot}
  </>;

  return <>
    <PageHeader title="Visitors" search={false} />
    <section className="card card-pad fill-card fill grow-y vcard-main" aria-label="Visitor log">
      <div>{head}{hoursLine}</div>
      <div className="card-body">{body}{shown.length > 0 && foot}</div>
    </section>
  </>;
}

function InsideCard({ v, host, now, close, onOut, compact }: { v: Visitor; host?: string; now: number; close: number | null; onOut: () => void; compact?: boolean }) {
  const mins = Math.max(0, now - toMin(v.tin));
  const late = close !== null && now >= close;
  const long = !late && mins >= LONG_VISIT;
  const tone = late ? ' bad' : long ? ' warn' : '';
  const first = v.name.split(' ')[0];
  if (compact) return <div className="vcard vcard-m">
    <Avatar user={{ name: v.name }} size={40} />
    <div className="vm-info">
      <div className="vm-line1"><b className="ink clamp1">{v.name}</b></div>
      <div className="vm-line2"><span className="vroom">{v.room}</span>{host && <span className="clamp1">{host}</span>}</div>
      <div className="vm-line3"><span className={'vm-dur' + tone}>{span(mins)}</span><span className="clamp1">{late ? 'past hours' : long ? 'over 3 hours' : `in since ${t12(v.tin)}`}</span></div>
    </div>
    <div className="vm-acts">
      {v.phone && <a className="vm-btn" href={`tel:${v.phone.replace(/\s/g, '')}`} aria-label={`Call ${v.name}`}><Phone size={17} /></a>}
      <button className="vm-btn primary" onClick={onOut} aria-label={`Mark ${first} as left`} title="Mark as left"><LogOut size={17} /></button>
    </div>
  </div>;
  return <div className="vcard">
    <div className="vcard-top">
      <Avatar user={{ name: v.name }} size={42} />
      <div className="min0 grow">
        <b className="ink clamp1 vname-row">{v.name}</b>
        <div className="vhost"><span className="vroom">{v.room}</span>{host && <span className="clamp1">Visiting {host}</span>}</div>
      </div>
      <span className={'vtime' + tone} title={late ? 'Still inside after visiting hours' : long ? 'Inside for over 3 hours' : undefined}>
        <span className="num">{span(mins)}</span><span className="tiny">{late ? 'past hours' : long ? 'over 3 h' : 'inside'}</span></span>
    </div>
    <div className="vcard-actions">
      <span className="vmeta" title={`In at ${t12(v.tin)}, ${v.via === 'QR' ? 'QR scan' : 'logged by you'}`}>In at <b className="num">{t12(v.tin)}</b> · {v.via === 'QR' ? 'QR scan' : 'Logged by you'}</span>
      <span className="row-sm" style={{ gap: 6 }}>
        {v.phone && <a className="btn btn-secondary btn-sm vcall" href={`tel:${v.phone.replace(/\s/g, '')}`} aria-label={`Call ${v.name}`} title={v.phone}><Phone size={15} /></a>}
        <Btn size="sm" kind={late ? 'primary' : 'secondary'} onClick={onOut}><LogOut size={15} />Mark as left</Btn>
      </span>
    </div>
  </div>;
}
