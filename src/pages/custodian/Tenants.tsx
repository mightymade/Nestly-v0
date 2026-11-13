import { CalendarClock, Copy, KeyRound, LogIn, LogOut, Phone, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { DataTable, type Column } from '../../components/DataTable';
import { Overlay } from '../../components/Overlay';
import { PageHeader } from '../../components/PageHeader';
import { Pill } from '../../components/Pill';
import { SearchIcon } from '../../components/SearchIcon';
import { Segmented } from '../../components/Segmented';
import { EmptyState, ErrorState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { Avatar, Btn, Skeleton } from '../../components/ui';
import type { Tenant } from '../../data/types';
import { copyText } from '../../lib/format';
import { useIsPhone } from '../../lib/useIsPhone';
import { listTenants, setTenantStatus } from '../../services/api';
import { useData } from '../../services/useData';
import { useHostelId } from './shared';

type Filter = Tenant['status'];
const tel = (p: string) => `tel:${p.replace(/\s/g, '')}`;

/** Custodian tenants: who is staying, who is arriving to be checked in, and who has left. */
export function Tenants() {
  const hid = useHostelId(); const phone = useIsPhone(); const toast = useToast();
  const { data, loading, error, reload } = useData(() => listTenants(hid), [hid]);
  const [params] = useSearchParams(); const nav = useNavigate();
  const [filter, setFilter] = useState<Filter>('in'); const [q, setQ] = useState(params.get('q') ?? ''); const [searching, setSearching] = useState(!!params.get('q'));
  const [confirm, setConfirm] = useState<Tenant | null>(null); const [busy, setBusy] = useState<string | null>(null);
  const all = data ?? [];
  const list = useMemo(() => all.filter(t => t.status === filter && `${t.name} ${t.room}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => a.room.localeCompare(b.room)), [all, filter, q]);
  const count = (s: Filter) => all.filter(t => t.status === s).length;
  async function checkIn(t: Tenant) { if (!t.roomId) { nav(`/c/rooms?assign=${t.id}`); return; } setBusy(t.id); await setTenantStatus(t.id, 'in'); setBusy(null); toast(`${t.name.split(' ')[0]} checked in to ${t.room}`); }
  const copy = async (t: Tenant) => toast((await copyText(t.phone)) ? `${t.name.split(' ')[0]}'s number copied` : 'Could not copy. Select the number instead.');

  const tabs = <Segmented label="Show tenants" value={filter} onChange={setFilter}
    options={[{ value: 'in', label: 'Staying', count: count('in') }, { value: 'due', label: 'Arriving', count: count('due') }, { value: 'out', label: 'Left', count: count('out') }]} />;
  const head = <div className={'vhead' + (searching ? ' searching' : '')}>{tabs}<span className="grow" />
    <SearchIcon value={q} onChange={setQ} open={searching} setOpen={setSearching} placeholder="Search name or room" /></div>;

  const columns: Column<Tenant>[] = [
    { key: 'name', header: 'Tenant', cell: t => <span className="who"><Avatar user={{ name: t.name }} size={34} />{t.name}</span> },
    { key: 'room', header: 'Room', cell: t => t.roomId ? <Link to={`/c/rooms?room=${t.roomId}`} className="vroom">{t.room}</Link> : t.status === 'due' ? <span className="tiny warn-t strong">No room yet</span> : <span className="muted">None</span> },
    { key: 'type', header: 'Room type', cell: t => t.type },
    { key: 'phone', header: 'Phone', cell: t => <span className="row-sm"><span className="num">{t.phone}</span>
      <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => copy(t)} aria-label={`Copy ${t.name}'s phone number`}><Copy size={14} /></button></span> },
    { key: 'end', header: filter === 'due' ? 'Moving in' : 'Stay ends', cell: t => filter === 'due' ? 'Today' : t.end },
    { key: 'act', header: '', align: 'right', cell: t => t.status === 'due' ? (t.roomId ? <Btn size="sm" loading={busy === t.id} onClick={() => checkIn(t)}><LogIn size={15} />Check in</Btn> : <Btn size="sm" kind="secondary" onClick={() => checkIn(t)}><KeyRound size={15} />Give a room</Btn>)
      : t.status === 'in' ? <Btn kind="secondary" size="sm" onClick={() => setConfirm(t)}><LogOut size={15} />Check out</Btn> : <Pill tone="neutral">Left</Pill> },
  ];

  const empty = <EmptyState bare icon={<Users size={24} />} title={q ? 'Nobody matches your search' : filter === 'due' ? 'Nobody is arriving' : filter === 'in' ? 'No tenants staying yet' : 'Nobody has left yet'}
    text={q ? 'Try a different name or room.' : filter === 'due' ? 'Students who booked show up here on their move-in day.' : 'Tenants show up here once they are checked in.'} />;
  const body = error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <Skeleton rows={4} h={phone ? 84 : 56} />
    : !list.length ? empty
    : phone ? <div className="vgrid">{list.map(t => <TenantCard key={t.id} t={t} busy={busy === t.id} onIn={() => checkIn(t)} onOut={() => setConfirm(t)} />)}</div>
    : <DataTable label="Tenants" noun="tenants" rows={list} rowKey={t => t.id} columns={columns} />;

  const dialog = confirm && <Overlay title={`Check out ${confirm.name.split(' ')[0]}?`} onClose={() => setConfirm(null)} width={440}
    footer={<><Btn kind="secondary" onClick={() => setConfirm(null)}>Not yet</Btn><Btn onClick={async () => { await setTenantStatus(confirm.id, 'out'); toast(`${confirm.name.split(' ')[0]} checked out`); setConfirm(null); }}><LogOut size={16} />Check out</Btn></>}>
    <p>{confirm.name} will be marked as having left room <b className="ink">{confirm.room}</b> today. Check the room and collect the key first.</p></Overlay>;

  if (phone) return <>
    <PageHeader title="Tenants" search={false} />
    {head}{body}{dialog}
  </>;
  return <>
    <PageHeader title="Tenants" search={false} />
    <section className="card card-pad fill-card fill grow-y vcard-main" aria-label="Tenants">
      {head}
      <div className="card-body">{body}</div>
    </section>
    {dialog}
  </>;
}

/** Phone row: who, which room and type, when they move in or out, then icon actions. */
function TenantCard({ t, busy, onIn, onOut }: { t: Tenant; busy: boolean; onIn: () => void; onOut: () => void }) {
  const first = t.name.split(' ')[0];
  return <div className="vcard vcard-m">
    <Avatar user={{ name: t.name }} size={40} />
    <div className="vm-info">
      <div className="vm-line1"><b className="ink clamp1">{t.name}</b></div>
      <div className="vm-line2">{t.roomId ? <span className="vroom">{t.room}</span> : t.status === 'due' ? <span className="warn-t strong" style={{ flex: 'none' }}>No room yet</span> : null}<span className="clamp1">{t.type}</span></div>
      <div className="vm-line3"><CalendarClock size={13} /><span className="clamp1">{t.status === 'due' ? (t.roomId ? 'Moving in, room ready' : 'Moving in, needs a room') : t.status === 'in' ? `Stay ends ${t.end}` : `Left · stay was to ${t.end}`}</span></div>
    </div>
    <div className="vm-acts row-acts">
      <a className="vm-btn" href={tel(t.phone)} aria-label={`Call ${t.name}, ${t.phone}`}><Phone size={17} /></a>
      {t.status === 'due' && (t.roomId ? <button className="vm-btn primary" onClick={onIn} disabled={busy} aria-label={`Check ${first} in`} title="Check in"><LogIn size={17} /></button>
        : <button className="vm-btn primary" onClick={onIn} aria-label={`Give ${first} a room`} title="Give a room"><KeyRound size={17} /></button>)}
      {t.status === 'in' && <button className="vm-btn" onClick={onOut} aria-label={`Check ${first} out`} title="Check out"><LogOut size={17} /></button>}
    </div>
  </div>;
}
