import { CalendarDays, ChevronRight, Receipt } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DataTable, type Column } from '../../components/DataTable';
import { Overlay } from '../../components/Overlay';
import { PageHeader } from '../../components/PageHeader';
import { Pill, type Tone } from '../../components/Pill';
import { SearchIcon } from '../../components/SearchIcon';
import { Segmented } from '../../components/Segmented';
import { EmptyState, ErrorState } from '../../components/States';
import { Avatar, Skeleton, VerifiedName } from '../../components/ui';
import type { BookingStatus } from '../../data/types';
import { ugx } from '../../lib/format';
import { useIsPhone } from '../../lib/useIsPhone';
import { listOwnerBookings } from '../../services/api';
import { useData } from '../../services/useData';
import { HostelSwitcher, Locked, useOwner } from './shared';

type Tab = 'upcoming' | 'staying' | 'past';
type Row = Awaited<ReturnType<typeof listOwnerBookings>>[number];
const TAB_OF = (s: BookingStatus): Tab => (s === 'paid' ? 'upcoming' : s === 'checked-in' ? 'staying' : 'past');
const ST: Record<BookingStatus, [string, Tone]> = { paid: ['Paid, arriving', 'warn'], 'checked-in': ['Staying', 'success'], completed: ['Stay ended', 'neutral'], rated: ['Stay ended', 'neutral'], cancelled: ['Cancelled', 'danger'] };

export function OwnerBookings() {
  const { me, approved } = useOwner();
  if (!approved) return <><PageHeader title="Bookings" search={false} /><Locked what="Bookings" /></>;
  return <List ownerId={me.id} />;
}

function List({ ownerId }: { ownerId: string }) {
  const phone = useIsPhone();
  const { data, loading, error, reload } = useData(() => listOwnerBookings(ownerId), [ownerId]);
  const [tab, setTab] = useState<Tab>('upcoming'); const [hid, setHid] = useState('all');
  const [q, setQ] = useState(''); const [searching, setSearching] = useState(false); const [open, setOpen] = useState<Row | null>(null);
  const all = (data ?? []).filter(b => hid === 'all' || b.hostelId === hid);
  const hostels = Array.from(new Map((data ?? []).map(b => [b.hostel.id, b.hostel])).values());
  const many = hostels.length > 1;
  const list = useMemo(() => all.filter(b => TAB_OF(b.status) === tab && `${b.student?.name ?? ''} ${b.id} ${b.tenant?.room ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())), [all, tab, q]);
  const n = (t: Tab) => all.filter(b => TAB_OF(b.status) === t).length;
  const room = (b: Row) => b.tenant?.roomId ? <span className="vroom">{b.tenant.room}</span> : b.roomNo ? <span className="vroom">{b.roomNo}</span> : b.status === 'paid' ? <span className="tiny muted">Not assigned yet</span> : <span className="muted">None</span>;

  const cols: Column<Row>[] = [
    { key: 'who', header: 'Student', cell: b => <span className="who"><Avatar user={{ name: b.student?.name ?? '?' }} size={32} />{b.student ? <VerifiedName user={b.student} /> : 'Unknown'}</span> },
    ...(many ? [{ key: 'h', header: 'Hostel', cell: (b: Row) => <span className="clamp1">{b.hostel.name}</span> }] : []),
    { key: 'type', header: 'Room type', cell: b => b.room },
    { key: 'room', header: 'Room', cell: room },
    { key: 'sem', header: 'Semester', cell: b => b.sem },
    { key: 'fee', header: 'Booking fee', cell: b => <span className="num">{ugx(b.fee)}</span> },
    { key: 'st', header: 'Status', cell: b => <Pill tone={ST[b.status][1]}>{ST[b.status][0]}</Pill> },
  ];
  const tabs = <Segmented label="Show bookings" value={tab} onChange={setTab} options={[{ value: 'upcoming', label: phone ? 'Arriving' : 'Upcoming arrivals', count: n('upcoming') }, { value: 'staying', label: 'Staying', count: n('staying') }, { value: 'past', label: 'Past', count: n('past') }]} />;
  const head = <div className={'vhead' + (searching ? ' searching' : '')}>{tabs}<span className="grow" /><SearchIcon value={q} onChange={setQ} open={searching} setOpen={setSearching} placeholder="Student, reference or room" /></div>;
  const body = error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <Skeleton rows={4} h={56} />
    : !list.length ? <EmptyState bare icon={<CalendarDays size={24} />} title={q ? 'No booking matches' : tab === 'upcoming' ? 'No one is arriving yet' : tab === 'staying' ? 'Nobody is staying yet' : 'No past bookings'} text={q ? 'Try a name or a booking reference like NST-30100.' : 'Bookings show up here as soon as a student pays the booking fee.'} />
    : phone ? <div className="vgrid">{list.map(b => <button key={b.id} className="vcard vcard-m" onClick={() => setOpen(b)} style={{ textAlign: 'left' }}>
        <Avatar user={{ name: b.student?.name ?? '?' }} size={40} />
        <div className="vm-info"><div className="vm-line1"><b className="ink clamp1">{b.student?.name}</b></div>
          <div className="vm-line2">{room(b)}<span className="clamp1">{b.room}</span></div>
          <div className="vm-line3"><span className={'strong t-' + ST[b.status][1]}>{ST[b.status][0]}</span><span className="clamp1">· {many ? b.hostel.name : b.sem}</span></div></div>
        <ChevronRight size={18} className="muted" /></button>)}</div>
    : <DataTable label="Bookings" noun="bookings" rows={list} rowKey={b => b.id} columns={cols} onRowClick={setOpen} rowLabel={b => `Open booking ${b.id}`} />;
  const detail = open && <Overlay title={`Booking ${open.id}`} onClose={() => setOpen(null)} width={460}>
    <div className="stack">
      <div className="row-sm"><Avatar user={{ name: open.student?.name ?? '?' }} size={40} /><div>{open.student && <b className="ink"><VerifiedName user={open.student} /></b>}<p className="small muted">{open.student?.email}</p></div></div>
      <div className="review-list">{([['Hostel', open.hostel.name], ['Room type', open.room], ['Room', open.tenant?.room || open.roomNo || 'Not assigned yet. The custodian gives a room on arrival.'],
        ['Semester', open.sem], ['Booking fee', ugx(open.fee)], ['Paid on', open.paidOn], ['Payment reference', open.payRef ?? 'Not recorded'], ['Free cancellation until', open.cancelUntil ?? 'Ended'], ['Status', ST[open.status][0]]] as [string, string][])
        .map(([k, v]) => <div key={k} className="review-row"><div className="min0"><span className="tiny muted">{k}</span><b className="ink small">{v}</b></div></div>)}</div>
      <p className="tiny muted row-sm"><Receipt size={13} />Owners can see bookings but cannot change payments or give rooms.</p>
    </div></Overlay>;
  const header = <PageHeader title="Bookings" search={false} actions={<HostelSwitcher hostels={hostels} value={hid} onChange={setHid} />} />;
  if (phone) return <>{header}{head}{body}{detail}</>;
  return <>{header}<section className="card card-pad fill-card fill grow-y vcard-main" aria-label="Bookings">{head}<div className="card-body">{body}</div></section>{detail}</>;
}
