import { Flag, Star, AlertTriangle, BedDouble, CalendarCheck, CheckCircle2, ChevronRight, Clock, Eye, Heart, KeyRound, Lightbulb, MessageSquare, Plus, UserPlus, Wallet, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { ErrorState } from '../../components/States';
import { Art, Btn, Skeleton, Stars } from '../../components/ui';
import { Overlay } from '../../components/Overlay';
import { useToast } from '../../components/Toast';
import { timeAgo, ugx } from '../../lib/format';
import { useIsPhone } from '../../lib/useIsPhone';
import { createHostelDraft, docsOf, listOwnerHostels, ownerHome, replyReview, reportListing } from '../../services/api';
import { useMe } from '../../services/session';
import { useData } from '../../services/useData';
import { HostelPill, HostelSwitcher, maskTo, useOwner } from './shared';

export function OwnerOverview() {
  const { me, approved } = useOwner();
  if (!approved) return <StatusPage />;
  return <Dashboard ownerId={me.id} />;
}

/** What an owner sees until Nestly approves them, or after a rejection. */
function StatusPage() {
  const { me } = useOwner(); const nav = useNavigate();
  const { data: docs } = useData(async () => docsOf(me.id), [me.id]);
  const { data: mine } = useData(() => listOwnerHostels(me.id), [me.id]);
  const hasHostel = (mine ?? []).length > 0;
  const rejected = me.ownerStatus === 'rejected';
  const has = (k: string) => (docs ?? []).some(d => d.kind === k && !d.hostelId);
  const items: [string, boolean][] = [['Phone number confirmed', true], ['National ID', has('national_id')], ['Selfie', has('selfie')], ['Payment account', !!me.payout]];
  const add = async () => { const h = await createHostelDraft(me.id); nav(`/o/hostels/${h.id}`); };
  return <>
    <PageHeader title="Overview" search={false} />
    <div className="card card-pad ow-status">
      <span className={'icon-tile lg ' + (rejected ? 'danger' : 'warn')}>{rejected ? <XCircle size={26} /> : <Clock size={26} />}</span>
      <h2>{rejected ? 'We could not approve your details' : 'We are checking your details'}</h2>
      <p className="muted">{rejected ? 'Fix the item below and send it again. We check again within 1 to 2 working days.' : 'This usually takes 1 to 2 working days. We will send you a notification when it is done.'}</p>
      {rejected && me.ownerNote && <div className="banner warn"><AlertTriangle size={16} className="ic" /><span><b>Reason:</b> {me.ownerNote}</span></div>}
      <ul className="ow-check">{items.map(([l, ok]) => <li key={l}>{ok ? <CheckCircle2 size={18} className="ok" /> : <XCircle size={18} className="no" />}{l}</li>)}</ul>
      <div className="row wrap" style={{ gap: 10 }}>
        {rejected ? <Link to="/owner/signup?fix=1" className="btn btn-primary">Fix and resubmit</Link>
          : hasHostel ? <Link to="/o/hostels" className="btn btn-primary">See your hostels</Link> : <Btn onClick={add}><Plus size={17} />Add your hostel</Btn>}
        {(rejected || !hasHostel) ? (hasHostel && <Link to="/o/hostels" className="btn btn-secondary">See your hostels</Link>) : <Btn kind="secondary" onClick={add}><Plus size={17} />Add another hostel</Btn>}
      </div>
      {!rejected && <p className="small muted">{hasHostel ? 'Your hostel goes live once we approve you and check the listing.' : 'You can start adding your hostel now. It goes live after we approve it.'}</p>}
    </div>
  </>;
}

type Home = Awaited<ReturnType<typeof ownerHome>>;

function Dashboard({ ownerId }: { ownerId: string }) {
  const phone = useIsPhone();
  const { data, loading, error, reload } = useData(() => ownerHome(ownerId), [ownerId]);
  const [hid, setHid] = useState('all'); const [reply, setReply] = useState<string | null>(null); const [allTodo, setAllTodo] = useState(false);
  if (error) return <><PageHeader title="Overview" /><ErrorState message={error} onRetry={reload} /></>;
  if (loading && !data) return <><PageHeader title="Overview" /><Skeleton rows={3} h={140} /></>;
  const d = data!;
  const one = hid !== 'all' ? d.hostels.find(h => h.hostel.id === hid) : null;
  const k = one ? { total: one.total, booked: one.booked, rating: one.rating, nRev: one.nRev } : d.kpi;
  const pct = k.total ? Math.round((k.booked / k.total) * 100) : 0;
  const week = one ? null : d.kpi.week - d.kpi.lastWeek;
  const f = one ? { views: one.views, saves: one.saves, booked: one.month } : d.funnel;
  const todo = d.todo.filter(t => !one || t.key.includes(one.hostel.id) || t.key === 'sub' || (t.review && d.reviews[t.review]?.hostelId === one.hostel.id));
  const list = one ? [one] : d.hostels;

  const kpis = <div className="card sstrip oh-strip" aria-label="Summary">
    <Link to="/o/hostels" className="sc"><span className="sc-l"><BedDouble size={13} />Next semester</span>
      <span className="sc-v num">{k.booked}<small>of {k.total} beds · {pct}%</small></span>
      <span className="sc-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></span></Link>
    <Link to="/o/bookings" className="sc"><span className="sc-l"><CalendarCheck size={13} />{one ? 'Bookings this month' : 'Bookings this week'}</span>
      <span className="sc-v num">{one ? one.month : d.kpi.week}</span>
      {week === null ? <span className="sc-s">at {one!.hostel.name}</span>
        : <span className={'sc-s ' + (week > 0 ? 'up' : week < 0 ? 'down' : '')}>{week === 0 ? 'Same as last week' : `${week > 0 ? '+' : '−'}${Math.abs(week)} vs last week`}</span>}</Link>
    <Link to="/o/money" className="sc"><span className="sc-l"><Wallet size={13} />Fees this month</span>
      <span className="sc-v num">{ugx(d.kpi.feesMonth)}</span>
      <span className="sc-s">{d.account ? `To ${maskTo(d.account.method, d.account.to)}` : 'Add your payment account'}</span></Link>
    <div className="sc"><span className="sc-l"><Star size={13} />Student rating</span>
      <span className="sc-v num">{k.nRev ? k.rating.toFixed(1) : 'New'}{k.nRev > 0 && <Stars n={Math.round(k.rating)} size={13} />}</span>
      <span className="sc-s">{k.nRev ? `${k.nRev} ${k.nRev === 1 ? 'review' : 'reviews'}` : 'No reviews yet'}</span></div>
  </div>;

  const todoCard = <section className="card oh-card" aria-label="To do">
    <div className="td-head"><h2>To do</h2>{todo.length > 0 && <span className="td-count">{todo.length}</span>}</div>
    {todo.length ? <ul className="td-list">{todo.slice(0, phone && !allTodo ? 4 : undefined).map(t => <li key={t.key} className={'td-task ' + t.tone}>
      <span className="td-ic">{t.review ? <MessageSquare size={17} /> : t.key === 'sub' ? <Wallet size={17} /> : t.key.startsWith('so') ? <BedDouble size={17} /> : t.key.startsWith('cu') ? <UserPlus size={17} /> : <AlertTriangle size={17} />}</span>
      <span className="grow min0"><span className="td-t"><b>{t.text}</b></span><span className="td-s clamp1">{t.sub}</span></span>
      {t.review ? <Btn size="sm" kind="secondary" onClick={() => setReply(t.review!)}>{t.cta}</Btn> : <Link to={t.to!} className={'btn btn-sm ' + (t.tone === 'bad' ? 'btn-primary' : 'btn-secondary')}>{t.cta}</Link>}</li>)}</ul>
      : <p className="td-clear"><CheckCircle2 size={18} />You're all caught up.</p>}
    {phone && todo.length > 4 && <button className="td-more" onClick={() => setAllTodo(a => !a)}>{allTodo ? 'Show less' : `Show all ${todo.length}`}<ChevronRight size={15} style={{ transform: allTodo ? 'rotate(-90deg)' : 'rotate(90deg)' }} /></button>}
  </section>;

  const hostelsCard = <section className="card oh-card" aria-label="Your hostels">
    <div className="td-head"><h2>{list.length === 1 ? 'Your hostel' : 'Your hostels'}</h2><span className="grow" /><Link to="/o/hostels" className="td-link">Manage<ChevronRight size={15} /></Link></div>
    <div className="oh-hostels">{list.map(p => { const pc = p.total ? Math.round((p.booked / p.total) * 100) : 0; const h = p.hostel;
      return <Link key={h.id} to={`/o/hostels/${h.id}`} className="oh-h">
        <span className="oh-thumb">{h.photos?.length ? <img src={h.photos[0]} alt="" /> : <Art hostel={h} />}</span>
        <span className="grow min0 oh-h-body">
          <span className="oh-h-top"><b className="ink clamp1">{h.name || 'Untitled hostel'}</b><HostelPill h={h} /></span>
          {p.total ? <>
            <span className="oh-h-bar"><span className="oh-bar"><i style={{ width: `${pc}%` }} /></span><span className="num strong ink">{pc}%</span></span>
            <span className="oh-types">{p.types.map(t => <span key={t.t} className={t.left === 0 ? 'full' : ''}>{short(t.t)} <b>{t.left === 0 ? 'full' : `${t.left} left`}</b></span>)}</span>
          </> : <span className="small muted">Add room types and rooms, then send it for review.</span>}
        </span>
        <ChevronRight size={18} className="muted oh-chev" />
      </Link>; })}</div>
  </section>;

  const max = Math.max(1, f.views);
  const funnel = <section className="card oh-card oh-funnel" aria-label="How students find you">
    <div className="td-head"><h2>How students find you</h2><span className="grow" /><span className="tiny muted">This month</span></div>
    <div className="oh-funnel">{([['Viewed your listing', f.views, Eye], ['Saved it', f.saves, Heart], ['Booked', f.booked, CalendarCheck]] as const).map(([l, v, I], i, arr) =>
      <div key={l} className="oh-step">
        <div className="oh-step-top"><span className="row-sm"><I size={15} />{l}</span><b className="num ink">{v.toLocaleString('en-US')}</b></div>
        <span className="oh-fbar"><i style={{ width: `${Math.max(3, (v / max) * 100)}%`, opacity: 1 - i * 0.22 }} /></span>
        {i > 0 && arr[i - 1]![1] > 0 && <span className="tiny muted">{Math.round((v / arr[i - 1]![1]) * 100)}% of {i === 1 ? 'viewers saved it' : 'savers booked'}</span>}
      </div>)}</div>
    {d.tips.length > 0 && <ul className="oh-tips">{d.tips.map(t => <li key={t}><Lightbulb size={15} />{t}</li>)}</ul>}
  </section>;

  const recent = <section className="card oh-card" aria-label="Latest activity">
    <div className="td-head"><h2>Latest activity</h2></div>
    {d.recent.length ? <ul className="act-list">{d.recent.slice(0, phone ? 4 : 6).map((r, i) => <li key={i}><span className={'icon-tile sm ' + (r.kind === 'booking' ? 'primary' : 'success')}>{r.kind === 'booking' ? <CalendarCheck size={16} /> : <KeyRound size={16} />}</span>
      <span className="grow small">{r.text}</span><span className="tiny muted nowrap">{timeAgo(r.at)}</span></li>)}</ul> : <p className="small muted">No activity yet.</p>}
  </section>;

  const header = <PageHeader title="Overview" actions={d.hostels.length > 1 ? <HostelSwitcher hostels={d.hostels.map(x => x.hostel)} value={hid} onChange={setHid} /> : undefined} />;
  const dialog = reply && <ReplyDialog r={d.reviews[reply]!} onClose={() => setReply(null)} />;
  if (phone) return <>{header}{kpis}{todoCard}{hostelsCard}{funnel}{recent}{dialog}</>;
  return <>{header}{kpis}
    <div className="oh-grid fill">
      <div className="oh-col">{todoCard}{hostelsCard}</div>
      <div className="oh-col">{funnel}{recent}</div>
    </div>{dialog}
  </>;
}

const short = (t: string) => t.replace('self-contained', 'self-cont.').replace('shared bathroom', 'shared bath');

function ReplyDialog({ r, onClose }: { r: Home['reviews'][string]; onClose: () => void }) {
  const toast = useToast(); const [text, setText] = useState(''); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const me = useMe(); const [rep, setRep] = useState(false); const [why, setWhy] = useState('');
  const report = async () => { await reportListing(me.id, r.hostelId, 'Owner says it is unfair', why.trim(), { kind: 'review', reviewId: r.id }); toast('Sent. Nestly checks reported reviews within 2 working days'); onClose(); };
  async function go() { setBusy(true); try { await replyReview(r.id, text); toast('Reply posted under the review'); onClose(); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); } }
  return <Overlay title="Reply to a review" onClose={onClose} width={480} footer={<><Btn kind="secondary" onClick={onClose}>Cancel</Btn><Btn loading={busy} onClick={go}>Post reply</Btn></>}>
    <div className="stack">
      <div className="oh-review"><div className="row between"><b className="ink">{r.who}</b><Stars n={r.stars} size={14} /></div><p className="small">{r.text}</p><span className="tiny muted">{r.hostel} · {r.when}</span></div>
      <div className="field"><label htmlFor="rr-t">Your reply</label><textarea id="rr-t" className={'input' + (err ? ' bad' : '')} rows={3} maxLength={400} value={text} onChange={e => { setText(e.target.value); setErr(null); }} placeholder="Thank the student, and say what you are doing about any problem they mention." />
        {err ? <span className="err">{err}</span> : <span className="hint">Shown publicly under the review, with your hostel's name.</span>}</div>
      {rep ? <div className="field"><label htmlFor="rr-why">Why should Nestly look at it?</label><textarea id="rr-why" className="input" rows={2} maxLength={240} value={why} onChange={e => setWhy(e.target.value)} placeholder="For example: this person never stayed with us" />
          <div className="row" style={{ gap: 8 }}><Btn size="sm" kind="secondary" onClick={() => setRep(false)}>Cancel</Btn><Btn size="sm" kind="danger" disabled={!why.trim()} onClick={report}><Flag size={14} />Send to Nestly</Btn></div></div>
        : <button type="button" className="btn btn-text btn-sm" style={{ alignSelf: 'flex-start', color: 'var(--muted)' }} onClick={() => setRep(true)}><Flag size={14} />Report this review to Nestly</button>}
    </div></Overlay>;
}
