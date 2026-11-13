import { CalendarDays, Check, ChevronDown, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export type Range = { key: string; label: string; from?: string; to?: string };
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const nice = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** Ready-made periods people think in, plus a custom from/to. */
export function presets(): Range[] {
  const n = new Date(); const y = n.getFullYear(), m = n.getMonth();
  const wk = new Date(n); wk.setDate(n.getDate() - ((n.getDay() + 6) % 7));
  const semStart = m >= 6 ? new Date(y, 6, 1) : new Date(y, 0, 1);
  return [
    { key: 'all', label: 'Any date' },
    { key: 'week', label: 'This week', from: iso(wk), to: iso(n) },
    { key: 'month', label: 'This month', from: iso(new Date(y, m, 1)), to: iso(n) },
    { key: 'last', label: 'Last month', from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) },
    { key: 'sem', label: 'This semester', from: iso(semStart), to: iso(n) },
  ];
}
export const inRange = (at: string | undefined, r: Range) => { if (!at) return r.key === 'all'; const d = at.slice(0, 10); return (!r.from || d >= r.from) && (!r.to || d <= r.to); };

/** A pill that opens a small menu of periods and a custom date range. */
export function DateFilter({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const [open, setOpen] = useState(false); const box = useRef<HTMLDivElement>(null);
  const [from, setFrom] = useState(value.from ?? ''); const [to, setTo] = useState(value.to ?? '');
  useEffect(() => { if (!open) return; const off = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); }; const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', off); document.addEventListener('keydown', esc); return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc); }; }, [open]);
  const pick = (r: Range) => { onChange(r); setOpen(false); };
  const on = value.key !== 'all';
  const label = value.key === 'custom' ? `${value.from ? nice(value.from) : 'Start'} to ${value.to ? nice(value.to) : 'today'}` : value.label;
  return <div className="dfilter" ref={box}>
    <button type="button" className={'dfilter-btn' + (on ? ' on' : '')} onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="dialog">
      <CalendarDays size={16} /><span className="clamp1">{label}</span>{on ? <span className="dfilter-x" role="button" aria-label="Clear date filter" onClick={e => { e.stopPropagation(); pick(presets()[0]!); }}><X size={14} /></span> : <ChevronDown size={15} />}
    </button>
    {open && <div className="dfilter-pop" role="dialog" aria-label="Filter by date">
      <ul>{presets().map(p => <li key={p.key}><button type="button" className={value.key === p.key ? 'on' : ''} onClick={() => pick(p)}><span>{p.label}</span>{p.from && <span className="tiny muted">{nice(p.from)} to {nice(p.to!)}</span>}{value.key === p.key && <Check size={15} />}</button></li>)}</ul>
      <div className="dfilter-custom"><span className="tiny strong muted">Custom dates</span>
        <div className="row-sm"><input type="date" className="input" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} aria-label="From" /><span className="muted small">to</span>
          <input type="date" className="input" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} aria-label="To" /></div>
        <button type="button" className="btn btn-primary btn-sm btn-block" disabled={!from && !to} onClick={() => pick({ key: 'custom', label: 'Custom', from: from || undefined, to: to || undefined })}>Apply dates</button></div>
    </div>}
  </div>;
}
