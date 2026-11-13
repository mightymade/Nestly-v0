import { Building2, Clock, FileText, Lock, RefreshCw, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Dropdown } from '../../components/Dropdown';
import { Pill, type Tone } from '../../components/Pill';
import { EmptyState } from '../../components/States';
import type { Hostel, HostelStatus, VerificationDoc } from '../../data/types';
import { fitImage } from '../../lib/art';
import { STATUS_LABEL } from '../../services/api';
import { useMe } from '../../services/session';

export const HOSTEL_TONE: Record<HostelStatus, Tone> = { draft: 'neutral', in_review: 'warn', live: 'success', changes_requested: 'danger', suspended: 'danger' };
export const HostelPill = ({ h }: { h: Hostel }) => <Pill tone={HOSTEL_TONE[h.status ?? 'live']}>{h.status === 'suspended' && h.pausedFor === 'subscription' ? 'Paused, unpaid' : STATUS_LABEL[h.status ?? 'live']}</Pill>;

export function useOwner() { const me = useMe(); return { me, approved: me.ownerStatus === 'approved' }; }

/** Shown on Bookings, Money and Staff until Nestly approves the owner. */
export function Locked({ what }: { what: string }) {
  return <div className="card card-pad"><EmptyState bare icon={<Lock size={24} />} title={`${what} opens after we check your details`}
    text="This usually takes 1 to 2 working days. You can add your hostel in the meantime." /></div>;
}

export function HostelSwitcher({ hostels, value, onChange }: { hostels: Hostel[]; value: string; onChange: (v: string) => void }) {
  if (hostels.length < 2) return null;
  return <Dropdown label="Hostel" icon={Building2} value={value} onChange={onChange} align="right"
    options={[{ value: 'all', label: 'All hostels' }, ...hostels.map(h => ({ value: h.id, label: h.name || 'Untitled hostel' }))]} />;
}

const MAX = 5 * 1024 * 1024;
const OK = ['image/jpeg', 'image/png', 'application/pdf'];
/** Upload box for ID, selfie and ownership papers. Images are shrunk and previewed; PDFs show their name. */
export function DocUpload({ label, hint, doc, onFile, accept = 'image/jpeg,image/png,application/pdf' }: {
  label: string; hint: string; doc?: VerificationDoc; onFile: (name: string, url: string) => Promise<void>; accept?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false); const [pct, setPct] = useState(0); const [err, setErr] = useState<string | null>(null);
  async function pick(f?: File) {
    if (!f) return; setErr(null);
    if (!OK.includes(f.type) || !accept.includes(f.type)) return setErr('Use a JPG, PNG or PDF file.');
    if (f.size > MAX) return setErr('That file is over 5 MB. Take a smaller photo or scan.');
    setBusy(true); setPct(8);
    const tick = setInterval(() => setPct(p => Math.min(92, p + 9)), 90);
    try { const url = f.type === 'application/pdf' ? '' : await fitImage(f, 900); await onFile(f.name, url); setPct(100); }
    catch (x) { setErr((x as Error).message); } finally { clearInterval(tick); setBusy(false); if (input.current) input.current.value = ''; }
  }
  const isPdf = doc && !doc.url;
  return <div className="doc-up">
    <div className="doc-label"><b className="ink">{label}</b><span className="tiny muted">{hint}</span></div>
    {doc && !busy ? <div className="doc-has">
      <div className="doc-thumb">{isPdf ? <FileText size={28} /> : <img src={doc.url} alt={label} />}</div>
      <div className="min0 grow"><b className="clamp1 small ink">{doc.fileName}</b>
        <span className="tiny muted row-sm">{doc.status === 'accepted' ? <Pill tone="success">Accepted</Pill> : doc.status === 'rejected' ? <Pill tone="danger">Rejected</Pill> : <><Clock size={12} />In review</>}</span>
        {doc.note && <span className="tiny danger-t">{doc.note}</span>}</div>
      <button type="button" className="btn btn-secondary btn-sm doc-replace" onClick={() => input.current?.click()} aria-label={`Replace ${label}`} title="Replace"><RefreshCw size={14} /><span className="lbl">Replace</span></button>
    </div> : <button type="button" className={'doc-drop' + (busy ? ' busy' : '')} onClick={() => input.current?.click()} disabled={busy}
      onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); pick(e.dataTransfer.files[0]); }}>
      {busy ? <><span className="small strong">Uploading...</span><span className="prog"><i style={{ width: `${pct}%` }} /></span></>
        : <><Upload size={20} /><span className="small strong">Choose a file</span><span className="tiny muted">JPG, PNG or PDF, up to 5 MB</span></>}
    </button>}
    {err && <span className="err" role="alert">{err}</span>}
    <input ref={input} type="file" accept={accept} hidden onChange={e => pick(e.target.files?.[0])} />
  </div>;
}

export const maskTo = (method: string, to: string) => method === 'bank' ? `Bank ••• ${to.replace(/\D/g, '').slice(-4)}` : `${method === 'mtn' ? 'MTN' : 'Airtel'} ••• ${to.replace(/\D/g, '').slice(-4)}`;
export const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
export const dayDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
