import { Check, ChevronDown, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useFloating } from './useFloating';
import { useIsPhone } from '../lib/useIsPhone';
import { Overlay } from './Overlay';

export type Option<T extends string> = { value: T; label: string; sub?: string; badge?: ReactNode; lead?: ReactNode };

/** A dropdown: popover menu on PC, bottom sheet on phone. Looks like a pill or a form field. */
export function Dropdown<T extends string>({ value, options, onChange, label, variant = 'pill', icon: Icon, lead, align = 'left', onSurface, extra }: {
  value: T; options: Option<T>[]; onChange: (v: T) => void; label: string; variant?: 'pill' | 'field'; icon?: LucideIcon; lead?: ReactNode; align?: 'left' | 'right'; onSurface?: boolean; extra?: ReactNode;
}) {
  const phone = useIsPhone();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null); const menu = useRef<HTMLDivElement>(null);
  const cur = options.find(o => o.value === value);
  const pos = useFloating(box, open && !phone, { align, minWidth: variant === 'field' ? 320 : 220, matchWidth: variant === 'field' });
  useEffect(() => {
    if (!open || phone) return;
    const out = (e: MouseEvent) => { const t = e.target as Node; if (!box.current?.contains(t) && !menu.current?.contains(t)) setOpen(false); };
    // Escape closes only the menu, not a dialog it sits in.
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); setOpen(false); box.current?.querySelector<HTMLElement>('button')?.focus(); } };
    document.addEventListener('mousedown', out); document.addEventListener('keydown', key, true);
    menu.current?.querySelector<HTMLElement>('.on, button')?.focus({ preventScroll: true });
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', key, true); };
  }, [open, phone]);
  const pick = (v: T) => { onChange(v); setOpen(false); };
  const items = options.map(o => <button key={o.value} role="option" aria-selected={o.value === value} className={'menu-item' + (o.value === value ? ' on' : '')} onClick={() => pick(o.value)}>
    {o.lead}<span className="grow">{o.label}{o.sub && <span className="sub">{o.sub}</span>}</span>{o.badge}{o.value === value && !o.badge && <Check size={17} />}</button>);
  const trigger = variant === 'field'
    ? <button className="dd-field" aria-haspopup="listbox" aria-expanded={open} aria-label={`${label}: ${cur?.label}`} onClick={() => setOpen(o => !o)}>
        {lead ?? (Icon && <Icon size={19} className="ic" color="var(--primary)" />)}<span className="clamp1">{cur?.label}</span>{extra}<ChevronDown size={18} className="chev" /></button>
    : <button className={'dd-pill' + (onSurface ? ' on-surface' : '')} aria-haspopup="listbox" aria-expanded={open} aria-label={`${label}: ${cur?.label}`} onClick={() => setOpen(o => !o)}>
        {Icon && <Icon size={16} />}<span className="clamp1">{cur?.label}</span><span className="chev"><ChevronDown size={15} /></span></button>;
  return <div className="dd" ref={box}>
    {trigger}
    {open && !phone && createPortal(<div ref={menu} className="menu floating" role="listbox" aria-label={label} style={pos}>{items}</div>, document.body)}
    {open && phone && <Overlay title={label} onClose={() => setOpen(false)}><div className="stack-sm" role="listbox" aria-label={label}>{items}</div></Overlay>}
  </div>;
}
