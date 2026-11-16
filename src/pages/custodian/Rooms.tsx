import { ArrowRightLeft, BedDouble, ChevronRight, KeyRound, Phone, Wrench, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Overlay } from '../../components/Overlay';
import { PageHeader } from '../../components/PageHeader';
import { Pill, type Tone } from '../../components/Pill';
import { SearchIcon } from '../../components/SearchIcon';
import { Segmented } from '../../components/Segmented';
import { EmptyState, ErrorState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { Avatar, Btn } from '../../components/ui';
import type { Tenant } from '../../data/types';
import { timeAgo } from '../../lib/format';
import { useIsPhone } from '../../lib/useIsPhone';
import { ApiError, assignRoom, listRoomsWithOccupancy, moveTenant, setRoomAvailability, type RoomOcc, type RoomState } from '../../services/api';
import { useData } from '../../services/useData';
import { useHostelId } from './shared';

type Filter = 'all' | 'free' | 'off';
export const STATE: Record<RoomState, [string, Tone]> = {
  occupied: ['Occupied', 'neutral'], partly: ['Partly free', 'primary'], free: ['Free', 'success'], reserved: ['Reserved', 'warn'], unavailable: ['Not available', 'danger'],
};
const tel = (p: string) => `tel:${p.replace(/\s/g, '')}`;
const short = (t: string) => t.replace('self-contained', 'self-cont.').replace('shared bathroom', 'shared bath');

/** Custodian rooms: which beds are free, who is in each room, and giving arriving students a room. */
export function Rooms() {
  const hid = useHostelId(); const phone = useIsPhone();
  const { data, loading, error, reload } = useData(() => listRoomsWithOccupancy(hid), [hid]);
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>('all'); const [q, setQ] = useState(''); const [searching, setSearching] = useState(false);
  const [sel, setSel] = useState<string | null>(params.get('room'));
  const [assigning, setAssigning] = useState<Tenant | null>(null);
  const rooms = data?.rooms ?? []; const waiting = data?.waiting ?? [];

  // Arrive from Tenants with ?assign=<tenant id> to open the room picker straight away.
  useEffect(() => {
    const a = params.get('assign'); if (!a || !data) return;
    const t = waiting.find(x => x.id === a); if (t) setAssigning(t);
    params.delete('assign'); setParams(params, { replace: true });
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const s = q.trim().toLowerCase();
  const shown = useMemo(() => rooms.filter(o => (filter === 'all' || (filter === 'free' ? (o.state === 'free' || o.state === 'partly') : o.state === 'unavailable'))
    && (!s || o.room.no.toLowerCase().includes(s) || o.beds.some(b => b?.name.toLowerCase().includes(s)))), [rooms, filter, s]);
  const blocks = Array.from(new Set(shown.map(o => o.room.block)));
  const usable = rooms.filter(o => o.room.status === 'ready');
  const total = usable.reduce((a, o) => a + o.room.beds, 0), free = usable.reduce((a, o) => a + o.free, 0), off = rooms.filter(o => o.state === 'unavailable').length;
  const selected = rooms.find(o => o.room.id === sel) ?? null;
  const pick = (id: string | null) => setSel(id);

  const tabs = <Segmented label="Show rooms" value={filter} onChange={setFilter} options={[
    { value: 'all', label: 'All', count: rooms.length }, { value: 'free', label: 'Free beds', count: free }, { value: 'off', label: phone ? 'Not avail.' : 'Not available', count: off }]} />;
  const head = <div className={'vhead' + (searching ? ' searching' : '')}>{tabs}<span className="grow" />
    <SearchIcon value={q} onChange={setQ} open={searching} setOpen={setSearching} placeholder="Room or tenant name" /></div>;
  const summary = data && <p className="rm-sum"><span><b className="num">{total - free}</b> of {total} beds taken</span><span className="dotsep" /><span><b className="num ok">{free}</b> free</span>{off > 0 && <><span className="dotsep" /><span><b className="num bad">{off}</b> not available</span></>}</p>;

  const grid = error ? <ErrorState message={error} onRetry={reload} />
    : loading && !data ? <div className="rm-grid">{Array.from({ length: 8 }, (_, i) => <div key={i} className="skel" style={{ height: 104 }} />)}</div>
    : !shown.length ? <EmptyState bare icon={<BedDouble size={24} />} title={s ? 'No room or tenant matches' : filter === 'free' ? 'No free beds' : filter === 'off' ? 'Every room is in use' : 'No rooms yet'}
        text={s ? 'Try a room number like B-02 or a tenant’s name.' : filter === 'all' ? 'The hostel owner adds rooms from their side of Nestly.' : 'Try another tab.'} />
    : blocks.map(b => { const list = shown.filter(o => o.room.block === b); const whole = rooms.filter(o => o.room.block === b); const bt = whole.reduce((a, o) => a + (o.room.status === 'ready' ? o.room.beds : 0), 0), bf = whole.reduce((a, o) => a + (o.room.status === 'ready' ? o.free : 0), 0);
      return <section key={b} className="rm-block" aria-label={`Block ${b}`}>
        <h3 className="rm-bhead">Block {b}<span>{whole.every(o => o.room.beds === 1) ? `${bt - bf} of ${bt} rooms taken` : `${bt - bf} of ${bt} beds taken`}</span></h3>
        <div className="rm-grid">{list.map((o, i) => <RoomTile key={o.room.id} o={o} i={i} on={sel === o.room.id} onClick={() => pick(sel === o.room.id && !phone ? null : o.room.id)} />)}</div>
      </section>; });

  const waitBox = waiting.length > 0 && <div className="rm-wait">
    <div className="rm-wait-head"><KeyRound size={16} /><b>{waiting.length} {waiting.length === 1 ? 'student needs' : 'students need'} a room</b></div>
    {waiting.map(t => <div key={t.id} className="rm-wait-row">
      <Avatar user={{ name: t.name }} size={34} />
      <div className="min0 grow"><b className="ink clamp1">{t.name}</b><span className="tiny muted clamp1">Booked {t.type.toLowerCase()}</span></div>
      <Btn size="sm" onClick={() => setAssigning(t)}>Give room</Btn>
    </div>)}
  </div>;

  const detail = selected && <RoomDetail o={selected} rooms={rooms} waiting={waiting} onClose={() => pick(null)} onAssign={setAssigning} />;
  const assign = assigning && <AssignDialog t={assigning} rooms={rooms} onClose={() => setAssigning(null)} onDone={id => { setAssigning(null); pick(id); }} />;

  if (phone) return <>
    <PageHeader title="Rooms" search={false} />
    {head}{summary}{waitBox}
    <div className="rm-list">{grid}</div>
    {selected && <Overlay title={`Room ${selected.room.no}`} onClose={() => pick(null)}>{detail}</Overlay>}
    {assign}
  </>;
  return <>
    <PageHeader title="Rooms" search={false} />
    <div className="rm-split fill">
      <section className="card card-pad fill-card vcard-main" aria-label="Rooms">
        <div>{head}{summary}</div>
        <div className="card-body scroll-y rm-scroll">{grid}</div>
      </section>
      <aside className="card card-pad rm-side scroll-y" aria-label={selected ? `Room ${selected.room.no}` : 'Waiting for a room'}>
        {detail ?? (waiting.length ? waitBox : <EmptyState bare icon={<KeyRound size={24} />} title="Nobody is waiting for a room" text="Choose a room to see who is in it." />)}
      </aside>
    </div>
    {assign}
  </>;
}

function BedDots({ o }: { o: RoomOcc }) {
  if (o.room.beds < 2) return null; // a single room has one bed; its status already says it all
  return <span className="beds" aria-label={`${o.room.beds - o.free} of ${o.room.beds} beds taken`}>
    {o.beds.map((b, i) => <i key={i} className={b ? (b.status === 'due' ? 'res' : 'on') : ''} />)}</span>;
}

function RoomTile({ o, i, on, onClick }: { o: RoomOcc; i: number; on: boolean; onClick: () => void }) {
  const [label, tone] = STATE[o.state];
  return <button className={'rm-tile' + (on ? ' on' : '') + (o.state === 'unavailable' ? ' off' : '')} onClick={onClick} style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }}
    aria-label={`Room ${o.room.no}, ${o.room.type}, ${label}`} aria-pressed={on}>
    <span className="rm-top"><span className="rm-no num">{o.room.no}</span><BedDots o={o} /></span>
    <span className="rm-type clamp1">{short(o.room.type)}</span>
    <span className={'rm-state t-' + tone}>{label}</span>
    <ChevronRight size={16} className="rm-chev" />
  </button>;
}

function RoomDetail({ o, rooms, waiting, onClose, onAssign }: { o: RoomOcc; rooms: RoomOcc[]; waiting: Tenant[]; onClose: () => void; onAssign: (t: Tenant) => void }) {
  const phone = useIsPhone(); const toast = useToast();
  const [off, setOff] = useState(false); const [moving, setMoving] = useState<Tenant | null>(null); const [busy, setBusy] = useState(false);
  const [label, tone] = STATE[o.state];
  const fits = waiting.filter(t => t.type === o.room.type);
  const ready = async () => { setBusy(true); await setRoomAvailability(o.room.id, true); setBusy(false); toast(`${o.room.no} is ready to use`, { undo: () => { setRoomAvailability(o.room.id, false, o.room.unavailableReason ?? 'Not available'); } }); };
  return <div className="rm-detail">
    {!phone && <div className="row between start"><div><h2 className="rm-dno num">{o.room.no}</h2><p className="small muted">Block {o.room.block} · Floor {o.room.floor} · {o.room.type}</p></div>
      <button className="icon-btn" onClick={onClose} aria-label="Close room details"><X size={18} /></button></div>}
    {phone && <p className="small muted">Block {o.room.block} · Floor {o.room.floor} · {o.room.type}</p>}
    <div className="row-sm" style={{ gap: 8 }}><Pill tone={tone}>{label}</Pill><span className="small muted">{o.room.beds === 1 ? 'Single room' : `${o.room.beds - o.free} of ${o.room.beds} beds taken`}</span></div>
    {o.room.status === 'unavailable' && <div className="rm-off"><Wrench size={16} /><div><b>{o.room.unavailableReason}</b><span className="tiny muted">Not available since {timeAgo(o.room.unavailableSince!)}</span></div></div>}

    <div className="rm-beds">{o.beds.map((t, i) => <div key={i} className="rm-bed">
      <span className="rm-bedno">{o.room.beds > 1 ? `Bed ${i + 1}` : 'Room'}</span>
      {t ? <>
        <div className="min0 grow"><Link to={`/c/tenants?q=${encodeURIComponent(t.name)}`} className="ink strong clamp1">{t.name}</Link>
          <span className="tiny muted clamp1">{t.status === 'due' ? 'Arriving, not checked in yet' : `Stay ends ${t.end}`}</span></div>
        <a className="vm-btn" href={tel(t.phone)} aria-label={`Call ${t.name}`}><Phone size={16} /></a>
        <button className="vm-btn" onClick={() => setMoving(t)} aria-label={`Move ${t.name} to another room`} title="Move"><ArrowRightLeft size={16} /></button>
      </> : <>
        <span className="grow muted small">{o.room.status === 'unavailable' ? 'Not in use' : 'Free'}</span>
        {o.room.status === 'ready' && fits[0] && <Btn size="sm" kind="secondary" onClick={() => onAssign(fits[0]!)}>Give to {fits[0].name.split(' ')[0]}</Btn>}
      </>}
    </div>)}</div>

    <div className="rm-actions">
      {o.room.status === 'ready'
        ? <Btn kind="secondary" size="sm" onClick={() => setOff(true)} disabled={o.free < o.room.beds} title={o.free < o.room.beds ? 'Move the people in this room first' : undefined}><Wrench size={15} />Mark not available</Btn>
        : <Btn size="sm" loading={busy} onClick={ready}>Mark ready</Btn>}
      {o.room.status === 'ready' && o.free < o.room.beds && <span className="tiny muted">Move the people in this room before taking it out of use.</span>}
    </div>
    {off && <OffDialog o={o} onClose={() => setOff(false)} />}
    {moving && <MoveDialog t={moving} rooms={rooms} onClose={() => setMoving(null)} />}
  </div>;
}

function OffDialog({ o, onClose }: { o: RoomOcc; onClose: () => void }) {
  const toast = useToast(); const [why, setWhy] = useState(''); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const QUICK = ['Broken window', 'Leaking roof', 'Plumbing', 'Electrical fault', 'Being cleaned', 'Painting'];
  const go = async () => {
    setBusy(true); setErr(null);
    try { await setRoomAvailability(o.room.id, false, why); toast(`${o.room.no} marked not available`, { undo: () => { setRoomAvailability(o.room.id, true); } }); onClose(); }
    catch (x) { setErr((x as ApiError).message); } finally { setBusy(false); }
  };
  return <Overlay title={`Take ${o.room.no} out of use?`} onClose={onClose} width={460}
    footer={<><Btn kind="secondary" onClick={onClose}>Cancel</Btn><Btn loading={busy} onClick={go}><Wrench size={16} />Mark not available</Btn></>}>
    <div className="stack">
      <p className="muted">Students will not be given this room until you mark it ready. The owner sees the reason.</p>
      <div className="chips">{QUICK.map(x => <button key={x} className={'chip' + (why === x ? ' on' : '')} onClick={() => setWhy(x)}>{x}</button>)}</div>
      <div className="field"><label htmlFor="off-why">Reason</label>
        <input id="off-why" className={'input' + (err ? ' bad' : '')} value={why} onChange={e => setWhy(e.target.value)} placeholder="For example: broken window" maxLength={80} />
        {err && <span className="err" role="alert">{err}</span>}</div>
    </div>
  </Overlay>;
}

type BedPick = { roomId: string; bed: number };
function FreeBeds({ rooms, type, value, onChange, exclude }: { rooms: RoomOcc[]; type?: string; value: BedPick | null; onChange: (b: BedPick) => void; exclude?: string }) {
  const list = rooms.filter(o => o.room.status === 'ready' && o.free > 0 && (!type || o.room.type === type) && o.room.id !== exclude);
  if (!list.length) return <EmptyState bare icon={<BedDouble size={24} />} title="No free beds" text={type ? `There is no free ${type.toLowerCase()} bed right now. Free one up or ask the owner.` : 'Every bed is taken.'} />;
  return <div className="bed-pick" role="radiogroup" aria-label="Free beds">{list.flatMap(o => o.beds.map((b, i) => b ? null :
    <button key={o.room.id + i} role="radio" aria-checked={value?.roomId === o.room.id && value.bed === i} className={'bp' + (value?.roomId === o.room.id && value.bed === i ? ' on' : '')}
      onClick={() => onChange({ roomId: o.room.id, bed: i })}>
      <span className="vroom">{o.room.no}</span><span className="min0 grow"><b className="clamp1">{o.room.beds > 1 ? `Bed ${i + 1} of ${o.room.beds}` : 'Single bed'}</b>
        <span className="tiny muted clamp1">{type ? `Floor ${o.room.floor}` : short(o.room.type)}{o.room.beds > 1 && o.free < o.room.beds ? ` · shares with ${o.beds.find(x => x)?.name.split(' ')[0]}` : ''}</span></span>
      <span className="radio" /></button>)).filter(Boolean)}</div>;
}

function AssignDialog({ t, rooms, onClose, onDone }: { t: Tenant; rooms: RoomOcc[]; onClose: () => void; onDone: (roomId: string) => void }) {
  const toast = useToast(); const [pick, setPick] = useState<BedPick | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    if (!pick) return; setBusy(true); setErr(null);
    try { const x = await assignRoom(t.id, pick.roomId, pick.bed); toast(`${t.name.split(' ')[0]} gets ${x.room}. Check them in on Tenants when they arrive.`); onDone(pick.roomId); }
    catch (e) { setErr((e as ApiError).message); } finally { setBusy(false); }
  };
  return <Overlay title={`Give ${t.name.split(' ')[0]} a room`} onClose={onClose} width={500}
    footer={<><Btn kind="secondary" onClick={onClose}>Cancel</Btn><Btn loading={busy} disabled={!pick} onClick={go}><KeyRound size={16} />Give this bed</Btn></>}>
    <div className="stack">
      <div className="row-sm"><Avatar user={{ name: t.name }} size={38} /><div><b className="ink">{t.name}</b><p className="small muted">Booked a {t.type.toLowerCase()} room</p></div></div>
      <p className="small muted">Only free beds of the type they paid for are shown.</p>
      <FreeBeds rooms={rooms} type={t.type} value={pick} onChange={setPick} />
      {err && <span className="err" role="alert">{err}</span>}
    </div>
  </Overlay>;
}

function MoveDialog({ t, rooms, onClose }: { t: Tenant; rooms: RoomOcc[]; onClose: () => void }) {
  const toast = useToast(); const [pick, setPick] = useState<BedPick | null>(null); const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    if (!pick) return; setBusy(true); setErr(null);
    try { const x = await moveTenant(t.id, pick.roomId, pick.bed, why); toast(`${t.name.split(' ')[0]} moved to ${x.room}`); onClose(); }
    catch (e) { setErr((e as ApiError).message); } finally { setBusy(false); }
  };
  return <Overlay title={`Move ${t.name.split(' ')[0]}`} onClose={onClose} width={500}
    footer={<><Btn kind="secondary" onClick={onClose}>Cancel</Btn><Btn loading={busy} disabled={!pick || !why.trim()} onClick={go}><ArrowRightLeft size={16} />Move</Btn></>}>
    <div className="stack">
      <p className="small muted">Now in <b className="ink">{t.room}</b>. The move is saved in the activity log with your reason.</p>
      <FreeBeds rooms={rooms} value={pick} onChange={setPick} exclude={t.roomId} />
      <div className="field"><label htmlFor="mv-why">Why are they moving?</label>
        <input id="mv-why" className={'input' + (err ? ' bad' : '')} value={why} onChange={e => setWhy(e.target.value)} placeholder="For example: asked for a quieter floor" maxLength={100} />
        {err && <span className="err" role="alert">{err}</span>}</div>
    </div>
  </Overlay>;
}
