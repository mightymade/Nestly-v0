import { Megaphone, Send } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Card } from '../../components/Card';
import { Overlay } from '../../components/Overlay';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState, ErrorState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { Btn, Skeleton } from '../../components/ui';
import { fullDate, timeAgo } from '../../lib/format';
import { useIsPhone } from '../../lib/useIsPhone';
import { listNotices, postNotice } from '../../services/api';
import { useMe } from '../../services/session';
import { useData } from '../../services/useData';
import { useHostelId } from './shared';

/** Custodian notices: short messages that go to every tenant (water off, cleaning day, fees due). */
export function Notices() {
  const hid = useHostelId(); const phone = useIsPhone();
  const { data, loading, error, reload } = useData(() => listNotices(hid), [hid]);
  const [open, setOpen] = useState(false);
  const list = data ?? [];
  const items = error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <Skeleton rows={3} h={70} />
    : list.length ? <ul className="timeline-list">{list.map(n => <li key={n.id}><span className="dot" /><div><p className="ink">{n.text}</p><p className="small muted" style={{ marginTop: 4 }} title={fullDate(n.at)}>{n.by} · {timeAgo(n.at)}</p></div></li>)}</ul>
    : <EmptyState bare icon={<Megaphone size={24} />} title="No notices yet" text="Notices you send show up in every tenant's My Hostel tab." />;
  const sent = <Card fill={!phone} scroll title="Sent notices" subtitle="Every tenant sees these">{items}</Card>;
  return <>
    <PageHeader title="Notices" actions={phone ? <Btn onClick={() => setOpen(true)}><Megaphone size={17} />New notice</Btn> : undefined} />
    {phone ? sent : <div className="split-57 fill"><div className="fill-col">{sent}</div>
      <div className="fill-col"><Card title="Send a notice" subtitle="Sent to every tenant as a notification"><NoticeForm /></Card></div></div>}
    {open && <Overlay title="New notice" onClose={() => setOpen(false)}><NoticeForm onDone={() => setOpen(false)} /></Overlay>}
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
