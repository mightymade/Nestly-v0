import { BellRing, CalendarPlus, ChevronRight, Download, Pause, Receipt, Settings2, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DataTable, type Column } from '../../components/DataTable';
import { DateFilter, inRange, presets, type Range } from '../../components/DateFilter';
import { Overlay } from '../../components/Overlay';
import { PageHeader } from '../../components/PageHeader';
import { Pill, type Tone } from '../../components/Pill';
import { SearchIcon } from '../../components/SearchIcon';
import { Segmented } from '../../components/Segmented';
import { EmptyState, ErrorState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { Avatar, BackBar, Btn, Field, Skeleton, TextInput } from '../../components/ui';
import { downloadCsv } from '../../lib/csv';
import { timeAgo, ugx } from '../../lib/format';
import { useIsPhone } from '../../lib/useIsPhone';
import { ApiError, giveMoreTime, listSubPayments, listSubscriptions, pauseForUnpaid, recordSubPayment, remindSubscription, SUB_STATE_LABEL, subConfig, subSummary, type SubState } from '../../services/api';
import { useData } from '../../services/useData';
import { HostelPill, shortDate } from '../owner/shared';

type Row = Awaited<ReturnType<typeof listSubscriptions>>[number];
type Paid = Awaited<ReturnType<typeof listSubPayments>>[number];
type Tab = 'action' | 'all' | 'payments';

const TONE: Record<SubState, Tone> = { paid: 'success', due: 'warn', grace: 'warn', late: 'danger', off: 'neutral' };
export const SubPill = ({ state }: { state: SubState }) => <Pill tone={TONE[state]}>{SUB_STATE_LABEL[state]}</Pill>;
/** UGX 650K, UGX 1.2M: fits a small phone. */
const short = (n: number) => n >= 1e6 ? `UGX ${(n / 1e6).toFixed(n % 1e6 ? 1 : 0)}M` : n >= 1e3 ? `UGX ${Math.round(n / 1e3)}K` : `UGX ${n}`;
const ORDER: Record<SubState, number> = { late: 0, grace: 1, due: 2, paid: 3, off: 4 };
const needsAction = (r: Row) => r.sub.state === 'late' || r.sub.state === 'grace' || r.sub.state === 'due';
/** "13 days late", "In grace until 18 Nov", "Due in 5 days", "Paid until 30 Nov 2026" */
export function subLine(s: Row['sub']) {
  if (s.state === 'late') return `${s.daysLate} ${s.daysLate === 1 ? 'day' : 'days'} late`;
  if (s.state === 'grace') return `Late, has until ${shortDate(s.graceEnd)}`;
  if (s.state === 'due') return `Due in ${s.daysLeft} ${s.daysLeft === 1 ? 'day' : 'days'}`;
  return `Paid until ${shortDate(s.paidUntil)}`;
}

export function AdminSubscriptions() {
  const phone = useIsPhone(); const [params] = useSearchParams();
  const { data, loading, error, reload } = useData(() => listSubscriptions(), []);
  const { data: pays } = useData(() => listSubPayments(), []);
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) ?? 'action');
  const [q, setQ] = useState(''); const [searching, setSearching] = useState(false);
  const [range, setRange] = useState<Range>(() => presets()[0]!);
  const [open, setOpen] = useState<string | null>(params.get('o'));
  const sum = subSummary(); const cfg = subConfig();

  const all = useMemo(() => (data ?? []).slice().sort((a, b) => ORDER[a.sub.state] - ORDER[b.sub.state] || b.sub.daysLate - a.sub.daysLate || a.user.name.localeCompare(b.user.name)), [data]);
  const match = (s: string) => s.toLowerCase().includes(q.trim().toLowerCase());
  const owners = all.filter(r => (tab === 'all' || needsAction(r)) && match(`${r.user.name} ${r.user.phone ?? ''} ${r.user.email}`));
  const payments = (pays ?? []).filter(p => inRange(p.at, range) && match(`${p.owner} ${p.ref} ${p.note ?? ''}`));
  const payTotal = payments.reduce((a, p) => a + p.amount, 0);

  const remind = async (r: Row) => { await remindSubscription(r.user.id); toast(`Reminder sent to ${r.user.name.split(' ')[0]}`); };
  const toast = useToast();

  const csv = () => tab === 'payments'
    ? downloadCsv('nestly-subscription-payments.csv', [['Date', 'Owner', 'Covers', 'Amount (UGX)', 'How', 'Reference', 'Note'], ...payments.map(p => [shortDate(p.at), p.owner, `${p.months} month${p.months > 1 ? 's' : ''}`, p.amount, p.via === 'app' ? 'In the app' : 'Recorded by admin', p.ref, p.note ?? ''])])
    : downloadCsv('nestly-subscriptions.csv', [['Owner', 'Phone', 'Hostels', 'Price a month (UGX)', 'Paid until', 'Status', 'Owes (UGX)'], ...owners.map(r => [r.user.name, r.user.phone ?? '', r.live, r.sub.fee, r.sub.paidUntil, SUB_STATE_LABEL[r.sub.state], r.sub.owed])]);

  const max = Math.max(1, ...sum.trend.map(t => t.value));
  const strip = <div className="card sstrip" aria-label="Subscription summary">
    <div className="sc"><span className="sc-l">Received this month</span><span className="sc-v num">{ugx(sum.month)}<span className="sub-bars" aria-label="Last 6 months">{sum.trend.map((t, i) => <i key={t.label} title={`${t.label}: ${ugx(t.value)}`} className={i === 5 ? 'on' : ''} style={{ height: `${Math.max(12, (t.value / max) * 100)}%` }} />)}</span></span>
      <span className="sc-s">Last month {ugx(sum.lastMonth)}</span></div>
    <div className="sc"><span className="sc-l">Expected each month</span><span className="sc-v num">{ugx(sum.expected)}</span><span className="sc-s">From {sum.owners} {sum.owners === 1 ? 'owner' : 'owners'}</span></div>
    <button type="button" className={'sc' + (sum.late ? ' due' : '')} onClick={() => setTab('action')}><span className="sc-l">Owed by late owners</span><span className={'sc-v num' + (sum.owed ? ' danger-t' : '')}>{ugx(sum.owed)}</span>
      <span className="sc-s">{sum.late} late · {sum.grace} in grace period</span></button>
    <Link to="/a/settings/pricing" className="sc"><span className="sc-l"><Settings2 size={13} />Price</span><span className="sc-v num">{ugx(cfg.subFee)}<small>/ {cfg.perHostel ? 'hostel' : 'owner'}</small></span>
      <span className="sc-s">A month · {cfg.graceDays} days to pay late</span></Link>
  </div>;

  const cols: Column<Row>[] = [
    { key: 'o', header: 'Owner', cell: r => <span className="who"><Avatar user={r.user} size={32} /><span className="min0"><b className="ink clamp1" style={{ display: 'block' }}>{r.user.name}</b><span className="tiny muted num">{r.user.phone}</span></span></span> },
    { key: 'h', header: 'Hostels', cell: r => <span className="num">{r.live} live{r.paused > 0 && <span className="danger-t strong"> · {r.paused} paused</span>}</span> },
    { key: 'f', header: 'A month', cell: r => <span className="num">{ugx(r.sub.fee)}</span> },
    { key: 's', header: 'Status', cell: r => <span className="row-sm"><SubPill state={r.sub.state} /><span className="small muted nowrap">{r.sub.state === 'paid' ? `until ${shortDate(r.sub.paidUntil)}` : subLine(r.sub)}</span></span> },
    { key: 'w', header: 'Owes', cell: r => r.sub.owed ? <b className="num danger-t">{ugx(r.sub.owed)}</b> : <span className="muted">Nothing</span> },
    { key: 'a', header: '', align: 'right', cell: r => r.sub.state === 'paid' ? null : r.sub.remindedAt && Date.now() - +new Date(r.sub.remindedAt) < 3 * 86400000
      ? <span className="tiny muted nowrap">Reminded {timeAgo(r.sub.remindedAt)}</span>
      : <Btn size="sm" kind="secondary" onClick={e => { e.stopPropagation(); remind(r); }}><BellRing size={14} />Remind</Btn> },
  ];
  const payCols: Column<Paid>[] = [
    { key: 'd', header: 'Date', cell: p => <span className="nowrap">{shortDate(p.at)}</span> },
    { key: 'o', header: 'Owner', cell: p => <span className="who"><Avatar user={{ name: p.owner }} size={30} /><b className="ink clamp1">{p.owner}</b></span> },
    { key: 'm', header: 'Covers', cell: p => `${p.months} month${p.months > 1 ? 's' : ''}` },
    { key: 'a', header: 'Amount', cell: p => <b className="num ink">{ugx(p.amount)}</b> },
    { key: 'v', header: 'How', cell: p => p.via === 'app' ? <span className="muted">Paid in the app</span> : <span title={p.note}>Recorded by admin<span className="tiny muted clamp1" style={{ display: 'block' }}>{p.note}</span></span> },
    { key: 'r', header: 'Reference', cell: p => <span className="num muted">{p.ref}</span> },
  ];

  const nAction = all.filter(needsAction).length;
  const tabs = <Segmented label="Show" value={tab} onChange={setTab} options={[{ value: 'action', label: phone ? 'To chase' : 'Needs action', count: nAction }, { value: 'all', label: phone ? 'All' : 'All owners', count: all.length }, { value: 'payments', label: 'Payments', count: (pays ?? []).length }]} />;
  const search = <SearchIcon value={q} onChange={setQ} open={searching} setOpen={setSearching} placeholder={tab === 'payments' ? 'Owner or reference' : 'Owner name or phone'} />;
  const head = <div className={'vhead mn-head' + (searching ? ' searching' : '')}>{tabs}{tab === 'payments' && !phone && <DateFilter value={range} onChange={setRange} />}
    {tab === 'payments' && !phone && <span className="mn-total"><b className="num ink">{ugx(payTotal)}</b> from {payments.length}</span>}<span className="grow" />{search}</div>;

  const body = error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <Skeleton rows={4} h={56} />
    : tab === 'payments' ? (!payments.length ? <EmptyState bare icon={<Receipt size={24} />} title="No payments match" text="Try another date range or search." />
      : phone ? <div className="vgrid">{payments.map(p => <div key={p.id} className="vcard vcard-m"><Avatar user={{ name: p.owner }} size={40} />
          <div className="vm-info"><div className="vm-line1" style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><b className="ink clamp1">{p.owner}</b><b className="num ink nowrap">{ugx(p.amount)}</b></div>
            <div className="vm-line2"><span className="clamp1">{p.months} month{p.months > 1 ? 's' : ''} · {p.via === 'app' ? 'In the app' : 'Recorded by admin'}</span></div>
            <div className="vm-line3"><span>{shortDate(p.at)}</span><span className="clamp1">· {p.ref}</span></div></div></div>)}</div>
      : <DataTable label="Subscription payments" noun="payments" rows={payments} rowKey={p => p.id} columns={payCols} onRowClick={p => setOpen(p.ownerId)} rowLabel={p => `Open ${p.owner}`} />)
    : !owners.length ? <EmptyState bare icon={<Wallet size={24} />} title={q ? 'No owner matches' : 'Every owner is paid up'} text={q ? 'Try another name or phone number.' : 'Owners who are late or due soon show up here.'} />
    : phone ? <div className="vgrid">{owners.map(r => <button key={r.user.id} className="vcard vcard-m" style={{ textAlign: 'left' }} onClick={() => setOpen(r.user.id)}>
        <Avatar user={r.user} size={40} />
        <div className="vm-info"><div className="vm-line1"><b className="ink clamp1">{r.user.name}</b></div>
          <div className="vm-line2"><span className="clamp1">{r.live} {r.live === 1 ? 'hostel' : 'hostels'} · {ugx(r.sub.fee)} a month</span></div>
          <div className="vm-line3"><SubPill state={r.sub.state} /><span className={'clamp1' + (r.sub.owed ? ' danger-t strong' : '')}>{r.sub.owed ? `Owes ${ugx(r.sub.owed)}` : subLine(r.sub)}</span></div></div>
        <ChevronRight size={18} className="muted" /></button>)}</div>
    : <DataTable label="Owner subscriptions" noun="owners" rows={owners} rowKey={r => r.user.id} columns={cols} onRowClick={r => setOpen(r.user.id)} rowLabel={r => `Open ${r.user.name}`} />;

  const row = all.find(r => r.user.id === open);
  const exportBtn = <Btn kind="secondary" size="sm" onClick={csv}><Download size={15} />Export CSV</Btn>;
  const detail = row && <SubDetail r={row} onClose={() => setOpen(null)} />;
  if (phone) return <><BackBar title="Subscriptions" to="/a/overview" /><main className="m-main pushed">
    <div className="sub-phone-sum"><div><span className="tiny muted">This month</span><b className="num">{short(sum.month)}</b></div><div><span className="tiny muted">Owed</span><b className={'num' + (sum.owed ? ' danger-t' : '')}>{short(sum.owed)}</b></div>
      <div><span className="tiny muted">Late</span><b className="num">{sum.late}</b></div></div>
    {head}{tab === 'payments' && <div className="row between" style={{ marginBottom: 12 }}><DateFilter value={range} onChange={setRange} /><span className="small muted"><b className="num ink">{ugx(payTotal)}</b> from {payments.length}</span></div>}{body}</main>{detail}</>;
  return <>
    <PageHeader title="Subscriptions" search={false} actions={exportBtn} />
    {strip}
    <section className="card card-pad fill-card fill grow-y vcard-main" aria-label="Subscriptions">{head}<div className="card-body">{body}
      <p className="tiny muted" style={{ marginTop: 10 }}>This is Nestly's only income. Students' booking fees go straight to owners and never pass through Nestly.</p></div></section>
    {detail}
  </>;
}

function SubDetail({ r, onClose }: { r: Row; onClose: () => void }) {
  const toast = useToast(); const s = r.sub; const u = r.user;
  const [rec, setRec] = useState(false); const [more, setMore] = useState(false); const [pause, setPause] = useState(false); const [busy, setBusy] = useState(false);
  const hostels = r.hostels;
  const first = u.name.split(' ')[0];
  const remind = async () => { setBusy(true); await remindSubscription(u.id); toast(`Reminder sent to ${first}`); setBusy(false); };
  const facts: [string, string][] = [
    ['Price', `${ugx(s.fee)} a month${s.perHostel ? `, ${s.hostels || 1} ${s.hostels === 1 ? 'hostel' : 'hostels'} at ${ugx(s.unit)}` : ''}`],
    ['Paid until', shortDate(s.paidUntil)],
    ...(s.overdue ? [['Grace period', s.state === 'grace' ? `Ends ${shortDate(s.graceEnd)}${s.extraUntil ? ', you gave more time' : ''}` : `Ended ${shortDate(s.graceEnd)}`] as [string, string]] : [['Next due', shortDate(s.due)] as [string, string]]),
    ['Last reminder', s.remindedAt ? timeAgo(s.remindedAt) : 'Never'],
  ];
  return <Overlay title={u.name} onClose={onClose} width={540}
    footer={<>{s.state === 'late' && r.live > 0 && <Btn kind="danger" onClick={() => setPause(true)}><Pause size={15} />Pause listings</Btn>}<span className="grow" />
      {s.state !== 'paid' && <Btn kind="secondary" loading={busy} onClick={remind}><BellRing size={15} />Remind</Btn>}
      <Btn onClick={() => setRec(true)}><Receipt size={15} />Record payment</Btn></>}>
    <div className="stack">
      <div className={'sub-status ' + s.state}>
        <div className="min0"><SubPill state={s.state} /><b className="ink">{s.state === 'paid' || s.state === 'due' ? subLine(s) : `${s.daysLate} ${s.daysLate === 1 ? 'day' : 'days'} late`}</b>
          <span className="small muted">{u.phone} · {u.email}</span></div>
        {s.owed > 0 && <div className="sub-owed"><span className="tiny muted">Owes</span><b className="num">{ugx(s.owed)}</b></div>}
      </div>
      {r.paused > 0 && <div className="banner warn small"><span>{r.paused} {r.paused === 1 ? 'hostel is' : 'hostels are'} off Explore for not paying. They come back by themselves as soon as a payment is recorded.</span></div>}
      <div className="review-list">{facts.map(([k, v]) => <div key={k} className="review-row"><div className="min0"><span className="tiny muted">{k}</span><b className="small ink">{v}</b></div></div>)}</div>
      {s.overdue && <button type="button" className="btn btn-text btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setMore(true)}><CalendarPlus size={15} />Give more time to pay</button>}
      <h3 className="rv-h">Hostels</h3>
      {hostels.length ? <div className="stack-sm">{hostels.map(h => <Link key={h.id} to={`/a/hostels?h=${h.id}`} className="staff-row" onClick={onClose}><b className="ink small grow clamp1">{h.name || 'Untitled'}</b><HostelPill h={h} /></Link>)}</div> : <p className="small muted">No hostels yet.</p>}
      <h3 className="rv-h">Payments</h3>
      <div className="review-list">{s.history.map(h => <div key={h.ref} className="review-row"><div className="min0"><b className="small ink">{h.month}</b><span className="tiny muted">{shortDate(h.paidOn)} · {h.via === 'recorded' ? 'Recorded by admin' : 'In the app'} · {h.ref}</span></div><b className="num small ink">{ugx(h.amount)}</b></div>)}</div>
    </div>
    {rec && <RecordPayment r={r} onClose={() => setRec(false)} />}
    {more && <MoreTime name={first} onClose={() => setMore(false)} onPick={async d => { await giveMoreTime(u.id, d); toast(`${first} has ${d} more days`); setMore(false); }} />}
    {pause && <Overlay title={`Pause ${first}'s listings?`} onClose={() => setPause(false)} width={460}
      footer={<><Btn kind="secondary" onClick={() => setPause(false)}>Cancel</Btn><Btn kind="danger" onClick={async () => { const n = await pauseForUnpaid(u.id); toast(`${n} ${n === 1 ? 'hostel' : 'hostels'} paused`); setPause(false); }}><Pause size={15} />Pause {r.live} {r.live === 1 ? 'hostel' : 'hostels'}</Btn></>}>
      <div className="stack-sm small"><p>Students will not find {r.live === 1 ? 'this hostel' : `these ${r.live} hostels`} on Nestly until {first} pays {ugx(s.owed)}.</p>
        <p className="muted">Bookings already made stay valid. {first} gets a message, and the listings come back by themselves as soon as a payment is recorded.</p></div>
    </Overlay>}
  </Overlay>;
}

const HOW = ['Cash at the Nestly office', 'MTN Mobile Money', 'Airtel Money', 'Bank deposit'];
function RecordPayment({ r, onClose }: { r: Row; onClose: () => void }) {
  const toast = useToast(); const behind = r.sub.owed ? Math.round(r.sub.owed / r.sub.fee) : 1;
  const [months, setMonths] = useState(behind); const [how, setHow] = useState(''); const [ref, setRef] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const go = async () => {
    if (!how) return setErr('Choose how they paid.');
    setBusy(true); setErr(null);
    try { const s = await recordSubPayment(r.user.id, months, [how, ref.trim()].filter(Boolean).join(', ')); toast(`Recorded. Paid until ${shortDate(s.paidUntil)}`); onClose(); }
    catch (x) { setErr((x as ApiError).message); setBusy(false); }
  };
  const opts = Array.from(new Set([1, behind, 3, 6, 12])).sort((a, b) => a - b);
  return <Overlay title="Record a payment" onClose={onClose} width={460} footer={<><Btn kind="secondary" onClick={onClose}>Cancel</Btn><Btn loading={busy} onClick={go}>Record {ugx(r.sub.fee * months)}</Btn></>}>
    <div className="stack">
      <p className="small muted">For money {r.user.name.split(' ')[0]} paid outside the app. Use the app's own payment when you can, so it is checked by the mobile money network.</p>
      <div className="field"><span className="label">Months paid for</span>
        <div className="chips">{opts.map(m => <button key={m} className={'chip' + (months === m ? ' on' : '')} aria-pressed={months === m} onClick={() => setMonths(m)}>{m} {m === 1 ? 'month' : 'months'}{m === behind && r.sub.owed > 0 ? ', all owed' : ''}</button>)}</div></div>
      <div className="field"><span className="label">How they paid</span>
        <div className="chips">{HOW.map(h => <button key={h} className={'chip' + (how === h ? ' on' : '')} aria-pressed={how === h} onClick={() => { setHow(h); setErr(null); }}>{h}</button>)}</div></div>
      <Field id="rp-ref" label="Receipt or transaction number" hint="Optional, but it helps if there is a question later."><TextInput id="rp-ref" value={ref} onChange={e => setRef(e.target.value)} placeholder="For example MP261104.1532" /></Field>
      {err && <span className="err" role="alert">{err}</span>}
    </div></Overlay>;
}

function MoreTime({ name, onClose, onPick }: { name: string; onClose: () => void; onPick: (days: number) => Promise<void> }) {
  const [d, setD] = useState(7); const [busy, setBusy] = useState(false);
  return <Overlay title={`More time for ${name}`} onClose={onClose} width={420} footer={<><Btn kind="secondary" onClick={onClose}>Cancel</Btn><Btn loading={busy} onClick={async () => { setBusy(true); await onPick(d); }}>Give {d} days</Btn></>}>
    <div className="stack"><p className="small muted">Their hostels stay on Explore until then. The time ends early if they pay.</p>
      <Segmented full label="Days" value={String(d)} onChange={v => setD(+v)} options={[{ value: '3', label: '3 days' }, { value: '7', label: '7 days' }, { value: '14', label: '14 days' }]} /></div>
  </Overlay>;
}
