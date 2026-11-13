import { Download, History, Lock } from 'lucide-react';
import { DateFilter, inRange, presets, type Range } from '../../components/DateFilter';
import { downloadCsv } from '../../lib/csv';
import { useState } from 'react';
import { DataTable, type Column } from '../../components/DataTable';
import { Dropdown } from '../../components/Dropdown';
import { PageHeader } from '../../components/PageHeader';
import { Pill } from '../../components/Pill';
import { EmptyState, ErrorState } from '../../components/States';
import { BackBar, Btn, Skeleton } from '../../components/ui';
import { useIsPhone } from '../../lib/useIsPhone';
import { listAudit, ROLE_LABEL } from '../../services/api';
import { useData } from '../../services/useData';

type Row = Awaited<ReturnType<typeof listAudit>>[number];
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).replace(',', '');

export function AdminActivity() {
  const phone = useIsPhone();
  const { data, loading, error, reload } = useData(() => listAudit(), []);
  const [action, setAction] = useState('all'); const [who, setWho] = useState('all'); const [range, setRange] = useState<Range>(() => presets()[0]!);
  const all = data ?? [];
  const list = all.filter(a => (action === 'all' || a.action === action) && (who === 'all' || a.actorId === who) && inRange(a.at, range));
  const csv = () => downloadCsv('nestly-activity-log.csv', [['When', 'Who', 'Role', 'Action', 'On', 'Detail'], ...list.map(a => [new Date(a.at).toISOString().replace('T', ' ').slice(0, 16), a.actor, ROLE_LABEL[a.actorRole], a.action, a.target, a.detail])]);
  const actions = Array.from(new Set(all.map(a => a.action))).sort();
  const people = Array.from(new Map(all.map(a => [a.actorId, a.actor])).entries());
  const cols: Column<Row>[] = [
    { key: 'w', header: 'When', cell: a => <span className="num nowrap">{when(a.at)}</span> },
    { key: 'p', header: 'Who', cell: a => <span className="row-sm"><b className="ink">{a.actor}</b><Pill tone="neutral">{ROLE_LABEL[a.actorRole]}</Pill></span> },
    { key: 'a', header: 'Action', cell: a => a.action },
    { key: 't', header: 'On', cell: a => <span className="clamp1">{a.target}</span> },
    { key: 'd', header: 'Detail', cell: a => <span className="muted clamp1">{a.detail}</span> },
  ];
  const filters = <div className="row wrap" style={{ gap: 8 }}>
    <DateFilter value={range} onChange={setRange} />
    <Dropdown label="Action" value={action} onChange={setAction} options={[{ value: 'all', label: 'All actions' }, ...actions.map(a => ({ value: a, label: a }))]} />
    <Dropdown label="Person" value={who} onChange={setWho} options={[{ value: 'all', label: 'Everyone' }, ...people.map(([id, n]) => ({ value: id, label: n }))]} />
    <Btn kind="secondary" size="sm" onClick={csv} disabled={!list.length}><Download size={15} />{phone ? 'CSV' : 'Export CSV'}</Btn></div>;
  const lock = <p className="vfoot"><Lock size={13} />Entries are time-stamped and cannot be edited or deleted.</p>;
  const body = error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <Skeleton rows={4} h={56} />
    : !list.length ? <EmptyState bare icon={<History size={24} />} title="Nothing recorded" text="Try another filter." />
    : phone ? <div className="vgrid">{list.map(a => <div key={a.id} className="vcard vcard-m"><div className="vm-info"><div className="vm-line1"><b className="ink clamp1">{a.action}</b></div>
        <div className="vm-line2"><span className="clamp1">{a.target}</span></div><div className="vm-line3"><span className="clamp1">{a.actor} · {when(a.at)}</span></div></div></div>)}</div>
    : <DataTable label="Activity log" noun="entries" rows={list} rowKey={a => a.id} columns={cols} />;
  if (phone) return <><BackBar title="Activity log" to="/a/settings" /><main className="m-main pushed">{filters}{body}{lock}</main></>;
  return <><PageHeader title="Activity log" actions={filters} /><section className="card card-pad fill-card fill grow-y"><div className="card-body">{body}{lock}</div></section></>;
}
