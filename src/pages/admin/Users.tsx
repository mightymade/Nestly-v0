import { ChevronRight, KeyRound, Pause, Play, Users as UsersIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Dropdown } from '../../components/Dropdown';
import { SubPill, subLine } from './Subscriptions';
import { DataTable, type Column } from '../../components/DataTable';
import { Overlay } from '../../components/Overlay';
import { PageHeader } from '../../components/PageHeader';
import { Pill } from '../../components/Pill';
import { SearchIcon } from '../../components/SearchIcon';
import { Segmented } from '../../components/Segmented';
import { EmptyState, ErrorState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { Avatar, Btn, Skeleton, VerifiedName } from '../../components/ui';
import { timeAgo, ugx } from '../../lib/format';
type Pay = 'all' | 'late' | 'grace' | 'paid';
import { useIsPhone } from '../../lib/useIsPhone';
import { listUsers, restoreUser, sendResetLink, suspendUser } from '../../services/api';
import { useData } from '../../services/useData';
import { HostelPill, shortDate } from '../owner/shared';
import { ReasonDialog } from './Reviews';

type Row = Awaited<ReturnType<typeof listUsers>>[number];
type Tab = 'student' | 'owner' | 'custodian';

const status = (r: Row) => r.user.suspended ? <Pill tone="danger">Paused</Pill>
  : r.user.role === 'student' ? (r.user.emailVerified ? <Pill tone="success">Verified</Pill> : <Pill tone="warn">Email not confirmed</Pill>)
  : r.user.role === 'owner' ? (r.user.ownerStatus === 'approved' ? <Pill tone="success">Approved</Pill> : r.user.ownerStatus === 'rejected' ? <Pill tone="danger">Rejected</Pill> : <Pill tone="warn">{r.user.ownerStatus === 'pending' ? 'In review' : 'Signing up'}</Pill>)
  : <Pill tone="success">Active</Pill>;

export function AdminUsers() {
  const phone = useIsPhone(); const [params] = useSearchParams();
  const { data, loading, error, reload } = useData(() => listUsers(), []);
  const pre = (data ?? []).find(r => r.user.id === params.get('u'));
  const [tab, setTab] = useState<Tab | null>(null); const [q, setQ] = useState(''); const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState<string | null>(params.get('u')); const [pay, setPay] = useState<Pay>('all');
  const t: Tab = tab ?? (pre?.user.role as Tab) ?? 'student';
  const all = data ?? [];
  const payOk = (r: Row) => t !== 'owner' || pay === 'all' || (pay === 'paid' ? !!r.sub && (r.sub.state === 'paid' || r.sub.state === 'due') : r.sub?.state === pay);
  const list = useMemo(() => all.filter(r => r.user.role === t && payOk(r) && `${r.user.name} ${r.user.email} ${r.where}`.toLowerCase().includes(q.trim().toLowerCase())), [all, t, q, pay]);
  const n = (x: Tab) => all.filter(r => r.user.role === x).length;
  const cols: Column<Row>[] = [
    { key: 'n', header: 'Name', cell: r => <span className="who"><Avatar user={r.user} size={32} /><span className="min0"><VerifiedName user={r.user} /><span className="tiny muted clamp1" style={{ display: 'block' }}>{r.user.email}</span></span></span> },
    { key: 'w', header: t === 'student' ? 'University' : t === 'owner' ? 'Hostels' : 'Hostel', cell: r => r.where },
    { key: 's', header: 'Status', cell: status },
    ...(t === 'owner' ? [{ key: 'p', header: 'Subscription', cell: (r: Row) => r.sub ? <span className="row-sm"><SubPill state={r.sub.state} />{r.sub.state !== 'paid' && <span className="tiny muted nowrap">{subLine(r.sub)}</span>}</span> : <span className="muted">Not started</span> }] : []),
    ...(t === 'custodian' ? [{ key: 'by', header: 'Added by', cell: (r: Row) => r.addedBy || <span className="muted">Unknown</span> }] : []),
    { key: 'j', header: 'Joined', cell: r => r.user.joined ? shortDate(r.user.joined) : '' },
  ];
  const tabs = <Segmented label="Role" value={t} onChange={setTab} options={[{ value: 'student', label: 'Students', count: n('student') }, { value: 'owner', label: 'Owners', count: n('owner') }, { value: 'custodian', label: phone ? 'Custodians' : 'Custodians', count: n('custodian') }]} />;
  const head = <div className={'vhead' + (searching ? ' searching' : '')}>{tabs}<span className="grow" /><SearchIcon value={q} onChange={setQ} open={searching} setOpen={setSearching} placeholder="Name, email or place" /></div>;
  const body = error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <Skeleton rows={4} h={56} />
    : !list.length ? <EmptyState bare icon={<UsersIcon size={24} />} title="Nobody matches" text="Try another name or email." />
    : phone ? <div className="vgrid">{list.map(r => <button key={r.user.id} className="vcard vcard-m" style={{ textAlign: 'left' }} onClick={() => setOpen(r.user.id)}>
        <Avatar user={r.user} size={40} /><div className="vm-info"><div className="vm-line1"><VerifiedName user={r.user} className="ink strong" /></div><div className="vm-line2"><span className="clamp1">{r.where}</span></div><div className="vm-line3">{status(r)}</div></div>
        <ChevronRight size={18} className="muted" /></button>)}</div>
    : <DataTable label="People" noun="people" rows={list} rowKey={r => r.user.id} columns={cols} onRowClick={r => setOpen(r.user.id)} rowLabel={r => `Open ${r.user.name}`} />;
  const row = all.find(r => r.user.id === open);
  const payPick = t === 'owner' ? <Dropdown label="Subscription" value={pay} onChange={setPay} align="right" options={[{ value: 'all', label: 'All owners' }, { value: 'late', label: 'Late paying' }, { value: 'grace', label: 'In grace period' }, { value: 'paid', label: 'Paid up' }]} /> : undefined;
  return <><PageHeader title="Users" search={false} actions={payPick} />{phone ? <>{head}{body}</> : <section className="card card-pad fill-card fill grow-y vcard-main">{head}<div className="card-body">{body}</div></section>}
    {row && <UserDetail r={row} onClose={() => setOpen(null)} />}</>;
}

function UserDetail({ r, onClose }: { r: Row; onClose: () => void }) {
  const toast = useToast(); const [sus, setSus] = useState(false); const u = r.user;
  return <Overlay title={u.name} onClose={onClose} width={520}
    footer={<><Btn kind="secondary" onClick={async () => { const e = await sendResetLink(u.id); toast(`Reset link sent to ${e}`); }}><KeyRound size={15} />Send reset link</Btn>
      {u.suspended ? <Btn onClick={async () => { await restoreUser(u.id); toast(`${u.name} can log in again`); onClose(); }}><Play size={15} />Restore</Btn> : <Btn kind="danger" onClick={() => setSus(true)}><Pause size={15} />Pause account</Btn>}</>}>
    <div className="stack">
      <div className="row-sm"><Avatar user={u} size={44} /><div><b className="ink"><VerifiedName user={u} /></b><p className="small muted">{u.email}{u.phone ? ` · ${u.phone}` : ''}</p></div></div>
      <div className="row-sm wrap">{status(r)}<span className="small muted">{r.where}</span>{u.suspendReason && <span className="small danger-t">{u.suspendReason}</span>}</div>
      {u.role === 'student' && <><h3 className="rv-h">Bookings</h3>{r.bookings.length ? <div className="review-list">{r.bookings.map(b => <div key={b.id} className="review-row"><div className="min0"><b className="small ink">{b.hostel}</b><span className="tiny muted">{b.id} · {b.sem} · {b.status}</span></div></div>)}</div> : <p className="small muted">No bookings.</p>}</>}
      {r.sub && (() => { const s = r.sub; return <div className="review-list"><Link to={`/a/subscriptions?o=${u.id}`} className="review-row" onClick={onClose}><div className="min0"><span className="tiny muted">Subscription</span>
        <b className="small ink">{subLine(s)} · {ugx(s.fee)} a month</b></div><SubPill state={s.state} /></Link></div>; })()}
      {u.role === 'custodian' && r.addedBy && <p className="small muted">Added by {r.addedBy}, the owner of {r.where}.</p>}
      {u.role === 'owner' && <><h3 className="rv-h">Hostels</h3>{r.hostels.length ? <div className="stack-sm">{r.hostels.map(h => <div key={h.id} className="staff-row"><b className="ink small grow clamp1">{h.name || 'Untitled'}</b><HostelPill h={h} /></div>)}</div> : <p className="small muted">No hostels.</p>}</>}
      <h3 className="rv-h">Recent activity</h3>
      {r.activity.length ? <ul className="act-list">{r.activity.map(a => <li key={a.id}><span className="grow small">{a.action}: {a.target}</span><span className="tiny muted nowrap">{timeAgo(a.at)}</span></li>)}</ul> : <p className="small muted">Nothing recorded.</p>}
      <p className="tiny muted">Admins cannot see or set passwords.</p>
    </div>
    {sus && <ReasonDialog title={`Pause ${u.name.split(' ')[0]}'s account?`} intro="They are logged out and cannot log in until you restore the account." quick={u.role === 'student' ? ['Fake bookings', 'Abusive reviews', 'Harassment reported', 'Asked to close the account'] : u.role === 'owner' ? ['Fake owner', 'Payment fraud', 'Harassment reported', 'Asked to close the account'] : ['Left the hostel', 'Misusing visitor records', 'Asked to close the account']} cta="Pause account"
      onClose={() => setSus(false)} onSend={async x => { await suspendUser(u.id, x); toast(`${u.name} paused`); onClose(); }} />}
  </Overlay>;
}
