import { Megaphone, Send, Wrench } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Card } from '../../components/Card';
import { Overlay } from '../../components/Overlay';
import { PageHeader } from '../../components/PageHeader';
import { Pill } from '../../components/Pill';
import { Segmented } from '../../components/Segmented';
import { EmptyState, ErrorState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { Btn, Skeleton } from '../../components/ui';
import type { ProblemStatus } from '../../data/types';
import { fullDate, timeAgo } from '../../lib/format';
import { useIsPhone } from '../../lib/useIsPhone';
import { listNotices, listProblems, postNotice, setProblemStatus } from '../../services/api';
import { useMe } from '../../services/session';
import { useData } from '../../services/useData';
import { catIcon, STATUS_TONE } from '../student/MyHostel';
import { useHostelId } from './shared';

export function Problems() {
  const hid = useHostelId(); const phone = useIsPhone(); const toast = useToast();
  const { data, loading, error, reload } = useData(() => listProblems(hid), [hid]);
  const notices = useData(() => listNotices(hid), [hid]);
  const [filter, setFilter] = useState<'active' | 'Fixed' | 'all'>('active');
  const [noticeOpen, setNoticeOpen] = useState(false);
  const all = data ?? [];
  const list = all.filter(p => filter === 'all' || (filter === 'active' ? p.status !== 'Fixed' : p.status === 'Fixed'));

  const seg = <Segmented label="Filter problems" value={filter} onChange={setFilter} options={[{ value: 'active', label: 'Needs work', count: all.filter(p => p.status !== 'Fixed').length }, { value: 'Fixed', label: 'Fixed', count: all.filter(p => p.status === 'Fixed').length }, { value: 'all', label: 'All', count: all.length }]} />;
  const items = error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <Skeleton rows={3} h={120} />
    : !list.length ? <EmptyState bare icon={<Wrench size={24} />} title={filter === 'active' ? 'Nothing to fix' : 'No problems here'} text="Tenants report problems from their My Hostel tab." />
    : <div className="problem-list">{list.map(p => { const I = catIcon(p.cat); return <article key={p.id} className="problem">
      <div className="row start"><span className={'icon-tile ' + (p.status === 'Open' ? 'warn' : p.status === 'Fixed' ? 'success' : 'primary')}><I size={20} /></span>
        <div className="grow"><div className="row between start"><b className="ink">{p.cat} · Room {p.room}</b><Pill tone={STATUS_TONE[p.status]}>{p.status}</Pill></div>
          <div className="small muted" title={fullDate(p.at)}>{p.who} · {timeAgo(p.at)}</div>
          <p style={{ marginTop: 6 }}>{p.text}</p></div></div>
      <Segmented full={phone} label="Status" value={p.status} onChange={async (s: ProblemStatus) => { await setProblemStatus(p.id, s); toast(`Marked as ${s.toLowerCase()}. ${p.who.split(' ')[0]} can see it.`); }}
        options={[{ value: 'Open', label: 'Open' }, { value: 'In progress', label: 'In progress' }, { value: 'Fixed', label: 'Fixed' }]} />
    </article>; })}</div>;
  const problems = <Card fill={!phone} scroll title="Reported by tenants" subtitle="Tenants see each status change" action={!phone ? seg : undefined}>{phone && <div style={{ marginBottom: 12 }}>{seg}</div>}{items}</Card>;
  const noticeList = <Card fill={!phone} scroll title="Recent notices" subtitle="Every tenant sees these" action={phone ? <Btn size="sm" onClick={() => setNoticeOpen(true)}><Megaphone size={15} />New</Btn> : undefined}>
    {(notices.data ?? []).length ? <ul className="timeline-list">{(notices.data ?? []).map(n => <li key={n.id}><span className="dot" /><div><p className="ink">{n.text}</p><p className="small muted" style={{ marginTop: 4 }} title={fullDate(n.at)}>{n.by} · {timeAgo(n.at)}</p></div></li>)}</ul>
      : <p className="muted">No notices yet.</p>}</Card>;
  return <>
    <PageHeader title="Problems" actions={phone ? <Btn kind="secondary" onClick={() => setNoticeOpen(true)}><Megaphone size={17} />New notice</Btn> : undefined} />
    {phone ? <>{problems}{noticeList}</> : <div className="split-75 fill"><div className="fill-col">{problems}</div>
      <div className="fill-col"><Card title="Post a notice" subtitle="Sent to every tenant as a notification"><NoticeForm /></Card>{noticeList}</div></div>}
    {noticeOpen && <Overlay title="Post a notice" onClose={() => setNoticeOpen(false)}><NoticeForm onDone={() => setNoticeOpen(false)} /></Overlay>}
  </>;
}

function NoticeForm({ onDone }: { onDone?: () => void }) {
  const hid = useHostelId(); const me = useMe(); const toast = useToast();
  const [text, setText] = useState(''); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  async function go(e: FormEvent) {
    e.preventDefault(); if (text.trim().length < 10) return setErr('Write at least a short sentence so tenants know what is happening.');
    setBusy(true); setErr(null); await postNotice(hid, text.trim(), `${me.name}, custodian`); setBusy(false); setText(''); toast('Notice sent to all tenants'); onDone?.();
  }
  return <form className="stack" onSubmit={go} noValidate>
    <div className="field"><label htmlFor="nt-text">Message</label><textarea id="nt-text" className={'input' + (err ? ' bad' : '')} maxLength={280} value={text} onChange={e => setText(e.target.value)} placeholder="For example: Water will be off tomorrow from 9 am to 1 pm." style={{ minHeight: 84 }} />
      <div className="row between">{err ? <span className="err" role="alert">{err}</span> : <span className="hint">Shows in every tenant's My Hostel tab.</span>}<span className="hint num">{text.length}/280</span></div></div>
    <Btn type="submit" loading={busy}><Send size={16} />Send notice</Btn></form>;
}
