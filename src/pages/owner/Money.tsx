import { ChevronRight, Download, Info, Receipt, ShieldCheck, Smartphone, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DataTable, type Column } from '../../components/DataTable';
import { Overlay } from '../../components/Overlay';
import { PageHeader } from '../../components/PageHeader';
import { Pill } from '../../components/Pill';
import { Segmented } from '../../components/Segmented';
import { EmptyState, ErrorState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { Avatar, Btn, Field, Skeleton, TextInput } from '../../components/ui';
import { DateFilter, inRange, presets, type Range } from '../../components/DateFilter';
import { SearchIcon } from '../../components/SearchIcon';
import { ugx } from '../../lib/format';
import { useIsPhone } from '../../lib/useIsPhone';
import { ownerMoney, paySubscription } from '../../services/api';
import { useData } from '../../services/useData';
import { dayDate, HostelSwitcher, Locked, maskTo, shortDate, useOwner } from './shared';

type Data = Awaited<ReturnType<typeof ownerMoney>>;
type Fee = Data['fees'][number];
const METHOD = { mtn: 'MTN Mobile Money', airtel: 'Airtel Money', bank: 'Bank account' } as const;

export function Money() {
  const { me, approved } = useOwner();
  if (!approved) return <><PageHeader title="Money" search={false} /><Locked what="Money" /></>;
  return <View ownerId={me.id} phone0={me.phone ?? ''} />;
}

/**
 * Nestly never holds an owner's money. Students pay booking fees straight into the owner's own
 * mobile money or bank account. The owner pays Nestly a monthly subscription, shown here too.
 */
function View({ ownerId, phone0 }: { ownerId: string; phone0: string }) {
  const phone = useIsPhone();
  const { data, loading, error, reload } = useData(() => ownerMoney(ownerId), [ownerId]);
  const [open, setOpen] = useState<Fee | null>(null);
  const [pay, setPay] = useState(false); const [receipts, setReceipts] = useState(false); const [subOpen, setSubOpen] = useState(false);
  const [range, setRange] = useState<Range>(() => presets()[2]!); const [hid, setHid] = useState('all');
  const [q, setQ] = useState(''); const [searching, setSearching] = useState(false);
  const fees = useMemo(() => (data?.fees ?? []).filter(f => (hid === 'all' || f.hostelId === hid) && inRange(f.at, range)
    && `${f.student} ${f.hostel} ${f.room} ${f.payRef ?? ''} ${f.id}`.toLowerCase().includes(q.trim().toLowerCase())), [data, hid, range, q]);
  if (error) return <><PageHeader title="Money" /><ErrorState message={error} onRetry={reload} /></>;
  if (loading && !data) return <><PageHeader title="Money" /><Skeleton rows={3} h={120} /></>;
  const d = data!; const s = d.sub;
  const total = fees.reduce((a, f) => a + f.fee, 0);
  const hostels = Array.from(new Map(d.fees.map(f => [f.hostelId, { id: f.hostelId, name: f.hostel }])).values());

  const csv = () => {
    const rows = [['Date', 'Student', 'Hostel', 'Room type', 'Booking fee (UGX)', 'Payment reference'], ...fees.map(f => [shortDate(f.at!), f.student, f.hostel, f.room, String(f.fee), f.payRef ?? ''])];
    const blob = new Blob([rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'nestly-booking-fees.csv'; a.click(); URL.revokeObjectURL(a.href);
  };

  const strip = <div className="card sstrip" aria-label="Money summary">
    <div className="sc"><span className="sc-l">Booking fees this month</span><span className="sc-v num">{ugx(d.month)}</span><span className="sc-s">{d.monthCount} {d.monthCount === 1 ? 'booking' : 'bookings'} · {ugx(d.collected)} this semester</span></div>
    <Link to="/o/settings/payout" className="sc"><span className="sc-l"><ShieldCheck size={13} />Paid straight into</span>
      <span className="sc-v">{d.account ? maskTo(d.account.method, d.account.to) : <small className="warn-t">No account yet</small>}</span><span className="sc-s">{d.account ? `${d.account.name} · tap to change` : 'Add one so students can pay you'}</span></Link>
    <button type="button" className={'sc' + (s.overdue ? ' due' : '')} onClick={() => setSubOpen(true)}><span className="sc-l">Nestly subscription</span>
      <span className="sc-v num">{ugx(s.fee)}<small>/ month</small></span><span className={'sc-s' + (s.overdue ? ' down' : '')}>{s.overdue ? `Overdue since ${dayDate(s.due)}` : `Paid until ${dayDate(s.paidUntil)}`}</span>
      <span className="tag">{s.overdue ? <Pill tone="danger">Pay now</Pill> : <Pill tone="success">Paid</Pill>}</span></button>
  </div>;

  const cols: Column<Fee>[] = [
    { key: 'd', header: 'Date', cell: f => shortDate(f.at!) },
    { key: 's', header: 'Student', cell: f => <span className="who"><Avatar user={{ name: f.student }} size={32} /><b className="ink">{f.student}</b></span> },
    ...(hostels.length > 1 ? [{ key: 'h', header: 'Hostel', cell: (f: Fee) => <span className="clamp1">{f.hostel}</span> }] : []),
    { key: 'r', header: 'Room type', cell: f => <span className="clamp1">{f.room}</span> },
    { key: 'a', header: 'Booking fee', cell: f => <b className="num ink">{ugx(f.fee)}</b> },
    { key: 'p', header: 'Reference', cell: f => <span className="num muted">{f.payRef ?? f.id}</span> },
  ];
  const search = <SearchIcon value={q} onChange={setQ} open={searching} setOpen={setSearching} placeholder="Student, hostel or reference" />;
  const totalLine = <span className="mn-total"><b className="num ink">{ugx(total)}</b> from {fees.length} {fees.length === 1 ? 'payment' : 'payments'}</span>;
  const head = <div className={'vhead mn-head' + (searching ? ' searching' : '')}>
    <DateFilter value={range} onChange={setRange} />
    {!phone && totalLine}
    <span className="grow" />{search}</div>;
  const body = !fees.length ? <EmptyState bare icon={<Wallet size={24} />} title={q || range.key !== 'all' ? 'No payments match' : 'No booking fees yet'}
      text={q || range.key !== 'all' ? 'Try another date range or search.' : 'When a student books, the fee goes straight to your account and shows here.'} />
    : phone ? <div className="vgrid">{fees.map(f => <button key={f.id} className="vcard vcard-m" onClick={() => setOpen(f)} style={{ textAlign: 'left' }}>
        <Avatar user={{ name: f.student }} size={40} />
        <div className="vm-info"><div className="vm-line1" style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><b className="ink clamp1">{f.student}</b><b className="num ink nowrap">{ugx(f.fee)}</b></div>
          <div className="vm-line2"><span className="clamp1">{f.room}</span></div>
          <div className="vm-line3"><span>{shortDate(f.at!)}</span><span className="clamp1">· {f.hostel}</span></div></div>
        <ChevronRight size={18} className="muted" /></button>)}</div>
    : <DataTable label="Booking fees received" noun="payments" rows={fees} rowKey={f => f.id} columns={cols} onRowClick={setOpen} rowLabel={f => `Booking fee from ${f.student}`} />;
  const note = <p className="tiny muted row-sm"><Info size={13} />Students pay booking fees straight into your account. Rent is paid to you at check-in, so it is not shown here.</p>;

  const detail = open && <Overlay title="Booking fee received" onClose={() => setOpen(null)} width={440}>
    <div className="review-list">{([['Student', open.student], ['Hostel', open.hostel], ['Room type', open.room], ['Semester', open.sem], ['Amount', ugx(open.fee)], ['Paid on', shortDate(open.at!)],
      ['Paid to', d.account ? maskTo(d.account.method, d.account.to) : 'Your account'], ['Payment reference', open.payRef ?? open.id]] as [string, string][]).map(([k, v]) =>
      <div key={k} className="review-row"><div className="min0"><span className="tiny muted">{k}</span><b className="small ink">{v}</b></div></div>)}</div>
  </Overlay>;
  const subSheet = subOpen && <Overlay title="Nestly subscription" onClose={() => setSubOpen(false)} width={440}
    footer={<><Btn kind="secondary" onClick={() => { setSubOpen(false); setReceipts(true); }}><Receipt size={15} />Receipts</Btn><Btn onClick={() => { setSubOpen(false); setPay(true); }}>{s.overdue ? 'Pay now' : 'Pay next month'}</Btn></>}>
    <div className="review-list">{([['Price', `${ugx(s.fee)} a month${s.perHostel ? `, ${s.hostels || 1} ${s.hostels === 1 ? 'hostel' : 'hostels'} at ${ugx(s.unit)} each` : ', for all your hostels'}`], ['Status', s.overdue ? `Overdue since ${dayDate(s.due)}${s.state === 'grace' ? `, pay by ${dayDate(s.graceEnd)} to stay on Explore` : ''}` : 'Paid'], ['Paid until', dayDate(s.paidUntil)], s.overdue ? ['You owe', `${ugx(s.owed)}${s.paused ? `. ${s.paused} paused ${s.paused === 1 ? 'hostel comes' : 'hostels come'} back as soon as you pay` : ''}`] : ['Next due', dayDate(s.due)],
      ['Students pay into', d.account ? maskTo(d.account.method, d.account.to) : 'No account yet']] as [string, string][]).map(([k, v]) =>
      <div key={k} className="review-row"><div className="min0"><span className="tiny muted">{k}</span><b className="small ink">{v}</b></div></div>)}</div>
    <p className="tiny muted" style={{ marginTop: 10 }}>Nestly makes money only from this subscription. There is no commission on bookings.</p>
  </Overlay>;
  const overlays = <>{detail}{subSheet}{pay && <PaySub fee={s.fee} months={s.overdue ? Math.max(1, Math.round(s.owed / s.fee)) : 1} phone0={phone0} ownerId={ownerId} onClose={() => setPay(false)} />}
    {receipts && <Overlay title="Subscription receipts" onClose={() => setReceipts(false)} width={460}>
      <div className="review-list">{s.history.map(h => <div key={h.ref} className="review-row"><div className="min0"><b className="small ink">{h.month}</b><span className="tiny muted">{h.ref}</span></div><b className="num small ink">{ugx(h.amount)}</b></div>)}</div></Overlay>}</>;

  const exportBtn = <Btn kind="secondary" size="sm" onClick={csv} disabled={!fees.length}><Download size={15} />Export CSV</Btn>;
  const switcher = <HostelSwitcher hostels={hostels.map(h => ({ id: h.id, name: h.name }) as never)} value={hid} onChange={setHid} />;
  const subBtn = <button type="button" className={'mn-subbtn' + (s.overdue ? ' due' : '')} onClick={() => setSubOpen(true)}>{s.overdue ? 'Subscription overdue' : 'Subscription paid'}<ChevronRight size={15} /></button>;
  if (phone) return <><PageHeader title="Money" actions={<>{subBtn}{switcher}</>} />{s.overdue && <div className="banner danger small"><span className="grow"><b>You owe {ugx(s.owed)}.</b> {s.paused ? `${s.paused} ${s.paused === 1 ? 'hostel is' : 'hostels are'} off Explore until you pay.` : s.state === 'grace' ? `Pay by ${dayDate(s.graceEnd)} to stay on Explore.` : 'Pay now to keep your hostels on Explore.'}</span><Btn size="sm" onClick={() => setPay(true)}>Pay</Btn></div>}{head}{totalLine}{body}{note}{overlays}</>;
  return <>
    <PageHeader title="Money" actions={<>{switcher}{exportBtn}</>} />
    {strip}
    <section className="card card-pad fill-card fill grow-y vcard-main" aria-label="Booking fees received">{head}<div className="card-body">{body}{note}</div></section>
    {overlays}
  </>;
}

/** Pay the monthly Nestly subscription with mobile money. */
function PaySub({ fee, months, phone0, ownerId, onClose }: { fee: number; months: number; phone0: string; ownerId: string; onClose: () => void }) {
  const toast = useToast();
  const [m, setM] = useState<'mtn' | 'airtel'>('mtn'); const [num, setNum] = useState(phone0); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  async function go() {
    if (!/^0?7\d{8}$/.test(num.replace(/\s/g, ''))) return setErr('Enter a 10-digit mobile money number.');
    setBusy(true); const s = await paySubscription(ownerId, months); toast(`Subscription paid until ${dayDate(s.paidUntil)}`); onClose();
  }
  return <Overlay title="Pay your Nestly subscription" onClose={onClose} width={440} footer={<Btn block loading={busy} onClick={go}><Smartphone size={16} />Pay {ugx(fee * months)}</Btn>}>
    <div className="stack">
      <p className="small muted">{months > 1 ? `${months} months you are behind on, ${ugx(fee)} each.` : 'One month of Nestly for your hostels.'} You get a prompt on your phone to approve. Paused hostels come back straight away.</p>
      <Segmented full label="Pay with" value={m} onChange={setM} options={[{ value: 'mtn', label: 'MTN MoMo' }, { value: 'airtel', label: 'Airtel Money' }]} />
      <Field id="ps-num" label="Mobile money number" error={err}><TextInput id="ps-num" type="tel" inputMode="tel" value={num} onChange={e => { setNum(e.target.value); setErr(null); }} error={err} placeholder="0772 123 456" /></Field>
      <p className="hint row-sm"><ShieldCheck size={13} />Test mode. No real money moves yet. {METHOD[m]}.</p>
    </div></Overlay>;
}
