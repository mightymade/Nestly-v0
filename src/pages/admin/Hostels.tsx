import { AlertTriangle, Building2, ChevronRight, Flag, Info, Pause, Play } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DataTable, type Column } from '../../components/DataTable';
import { Dropdown } from '../../components/Dropdown';
import { Overlay } from '../../components/Overlay';
import { PageHeader } from '../../components/PageHeader';
import { SearchIcon } from '../../components/SearchIcon';
import { Segmented } from '../../components/Segmented';
import { EmptyState, ErrorState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { Art, Btn, Skeleton } from '../../components/ui';
import type { HostelStatus } from '../../data/types';
import { ugx } from '../../lib/format';
import { useIsPhone } from '../../lib/useIsPhone';
import { allUniversities, listAllHostels, minPrice, restoreHostel, semName, suspendHostel, universityById } from '../../services/api';
import { SubPill } from './Subscriptions';
import { useData } from '../../services/useData';
import { HostelPill, shortDate } from '../owner/shared';
import { ReasonDialog } from './Reviews';

type Row = Awaited<ReturnType<typeof listAllHostels>>[number];
type Tab = 'all' | 'live' | 'review' | 'suspended' | 'issues';
const serious = (r: Row) => r.issues.some(i => i.tone !== 'info');
const inTab = (r: Row, t: Tab) => { const s: HostelStatus | undefined = r.hostel.status; return t === 'all' || (t === 'issues' ? serious(r) : t === 'live' ? s === 'live' : t === 'suspended' ? s === 'suspended' : s === 'in_review' || s === 'changes_requested' || s === 'draft'); };
const listed = (r: Row) => r.hostel.status === 'live' || r.hostel.status === 'suspended';

export function AdminHostels() {
  const phone = useIsPhone(); const [params] = useSearchParams();
  const { data, loading, error, reload } = useData(() => listAllHostels(), []);
  const [tab, setTab] = useState<Tab>('all'); const [uni, setUni] = useState('all');
  const [q, setQ] = useState(''); const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState<string | null>(params.get('h'));
  const all = data ?? [];
  const list = useMemo(() => all.filter(r => inTab(r, tab) && (uni === 'all' || r.hostel.uni === uni)
    && `${r.hostel.name} ${r.owner?.name ?? ''} ${r.hostel.area}`.toLowerCase().includes(q.trim().toLowerCase())), [all, tab, uni, q]);
  const n = (t: Tab) => all.filter(r => inTab(r, t) && (uni === 'all' || r.hostel.uni === uni)).length;
  const cols: Column<Row>[] = [
    { key: 'h', header: 'Hostel', cell: r => <span className="who"><span className="rv-thumb"><Art hostel={r.hostel} /></span><span className="min0"><b className="ink clamp1" style={{ display: 'block' }}>{r.hostel.name || 'Untitled'}</b><span className="tiny muted clamp1">{universityById(r.hostel.uni)?.short} · {r.hostel.area || 'No area yet'}</span></span></span> },
    { key: 'o', header: 'Owner', cell: r => <Link to={`/a/users?u=${r.owner?.id}`} onClick={e => e.stopPropagation()} className="clamp1">{r.owner?.name}</Link> },
    { key: 's', header: 'Status', cell: r => <span className="row-sm"><HostelPill h={r.hostel} />{r.flags > 0 && <span className="tiny danger-t strong row-sm" title={`${r.flags} open reports`}><Flag size={12} />{r.flags}</span>}</span> },
    { key: 'b', header: 'Taking bookings', cell: r => !listed(r) ? <span className="muted">Not listed</span> : r.sem ? <span className="small">{semName(r.sem)}</span> : <span className="small warn-t strong">Closed</span> },
    { key: 'n', header: 'Next semester', cell: r => !listed(r) || !r.sem ? <span className="muted">None</span> : <span className="ah-fill"><span className="sc-bar"><i style={{ width: `${r.beds.total ? Math.min(100, (r.next / r.beds.total) * 100) : 0}%` }} /></span><span className="tiny num">{r.next} of {r.beds.total} beds</span></span> },
    { key: 'p', header: 'Subscription', cell: r => r.sub && listed(r) ? <SubPill state={r.sub.state} /> : <span className="muted">None</span> },
  ];
  const TABS: [Tab, string][] = [['all', 'All'], ['live', 'Live'], ['review', 'Not live yet'], ['suspended', 'Paused'], ['issues', 'Has problems']];
  const tabs = phone ? <Dropdown label="Status" value={tab} onChange={setTab} options={TABS.map(([v, l]) => ({ value: v, label: `${l} (${n(v)})` }))} />
    : <Segmented label="Status" value={tab} onChange={setTab} options={TABS.map(([v, l]) => ({ value: v, label: l, count: n(v) }))} />;
  const uniPick = <Dropdown label="University" value={uni} onChange={setUni} align="right" options={[{ value: 'all', label: 'All universities' }, ...allUniversities().map(u => ({ value: u.id, label: u.short }))]} />;
  const head = <div className={'vhead' + (searching ? ' searching' : '')}>{tabs}<span className="grow" /><SearchIcon value={q} onChange={setQ} open={searching} setOpen={setSearching} placeholder="Hostel, owner or area" /></div>;
  const body = error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <Skeleton rows={4} h={56} />
    : !list.length ? <EmptyState bare icon={<Building2 size={24} />} title="No hostels match" text="Try another tab, university or search." />
    : phone ? <div className="vgrid">{list.map(r => <button key={r.hostel.id} className="vcard vcard-m" style={{ textAlign: 'left' }} onClick={() => setOpen(r.hostel.id)}>
        <span className="rv-thumb lg"><Art hostel={r.hostel} /></span>
        <div className="vm-info"><div className="vm-line1"><b className="ink clamp1">{r.hostel.name || 'Untitled'}</b></div><div className="vm-line2"><span className="clamp1">{r.owner?.name} · {universityById(r.hostel.uni)?.short}</span></div>
          <div className="vm-line3"><HostelPill h={r.hostel} />{r.sub && listed(r) && r.sub.state !== 'paid' && r.sub.state !== 'due' && <SubPill state={r.sub.state} />}{r.flags > 0 && <span className="danger-t strong row-sm"><Flag size={12} />{r.flags}</span>}</div></div>
        <ChevronRight size={18} className="muted" /></button>)}</div>
    : <DataTable label="Hostels" noun="hostels" rows={list} rowKey={r => r.hostel.id} columns={cols} onRowClick={r => setOpen(r.hostel.id)} rowLabel={r => `Open ${r.hostel.name || "untitled hostel"}`} />;
  const row = all.find(r => r.hostel.id === open);
  const header = <PageHeader title="Hostels" search={false} actions={uniPick} />;
  return <>{header}{phone ? <>{head}{body}</> : <section className="card card-pad fill-card fill grow-y vcard-main">{head}<div className="card-body">{body}</div></section>}
    {row && <HostelDetail r={row} onClose={() => setOpen(null)} />}</>;
}

function HostelDetail({ r, onClose }: { r: Row; onClose: () => void }) {
  const toast = useToast(); const [sus, setSus] = useState(false); const [busy, setBusy] = useState(false); const h = r.hostel;
  const unpaid = h.pausedFor === 'subscription';
  const restore = async () => { setBusy(true); await restoreHostel(h.id); toast(`${h.name} is back on Explore`); setBusy(false); onClose(); };
  const facts: [string, React.ReactNode][] = [
    ['Owner', <Link key="o" to={`/a/users?u=${r.owner?.id}`} onClick={onClose}>{r.owner?.name}</Link>],
    ['Area', `${h.area}, ${h.km} km from ${universityById(h.uni)?.short}`],
    ['Prices', h.rooms.length ? `From ${ugx(minPrice(h))} per semester · booking fee ${ugx(h.fee)}` : 'None yet'],
    ['Taking bookings', r.sem ? `${semName(r.sem)}, ${r.next} of ${r.beds.total} beds booked` : 'No open semester'],
    ['Beds now', `${r.beds.taken} of ${r.beds.total} taken`],
    ['This month', `${h.views ?? 0} views · ${h.saves ?? 0} saves`],
    ['Subscription', r.sub ? <span key="s" className="row-sm"><SubPill state={r.sub.state} /><Link to={`/a/subscriptions?o=${r.owner?.id}`} onClick={onClose} className="small">Open</Link></span> : 'None'],
    ['Listed', h.listedAt ? shortDate(h.listedAt) : 'Not yet'],
  ];
  return <Overlay title={h.name || 'Untitled hostel'} onClose={onClose} width={540}
    footer={h.status === 'suspended' ? <Btn loading={busy} onClick={restore}><Play size={15} />{unpaid ? 'Put back now' : 'Put back on Explore'}</Btn> : h.status === 'live' ? <Btn kind="danger" onClick={() => setSus(true)}><Pause size={15} />Pause listing</Btn> : undefined}>
    <div className="stack">
      <div className="rv-photo sm">{h.photos?.length ? <img src={h.photos[0]} alt="" /> : <Art hostel={h} />}</div>
      <div className="row-sm wrap"><HostelPill h={h} />{h.suspendReason && <span className="small danger-t">{h.suspendReason}</span>}</div>
      {unpaid && <p className="tiny muted">Paused because the owner has not paid. It comes back by itself when they pay.</p>}
      {r.issues.length > 0 && <div className="ah-issues">{r.issues.map(i => <div key={i.text} className={'ah-issue ' + i.tone}>{i.tone === 'info' ? <Info size={15} /> : <AlertTriangle size={15} />}<span>{i.text}</span></div>)}</div>}
      <div className="review-list">{facts.map(([k, v]) => <div key={k} className="review-row"><div className="min0"><span className="tiny muted">{k}</span><b className="small ink">{v}</b></div></div>)}</div>
      {r.flags > 0 && <Link to="/a/flags" className="small" onClick={onClose}>See the reports about this hostel</Link>}
    </div>
    {sus && <ReasonDialog title={`Pause ${h.name}?`} intro="It leaves Explore straight away. Bookings already made stay valid. The owner sees your reason." quick={['Fake listing', 'Price is different from what students pay', 'Unsafe for students', 'Owner asked to pause']} cta="Pause listing"
      onClose={() => setSus(false)} onSend={async x => { await suspendHostel(h.id, x); toast(`${h.name} paused`); onClose(); }} />}
  </Overlay>;
}
