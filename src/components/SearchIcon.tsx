import { Search, X } from 'lucide-react';
import { useRef } from 'react';

/* Use inside a row with class "vhead" (position: relative). Add "searching" to that row while open so phones can fade the tabs. */
/** A search icon that grows into a search box. It slides over empty space, so the tabs beside it never move. */
export function SearchIcon({ value, onChange, open, setOpen, placeholder = 'Search' }: { value: string; onChange: (v: string) => void; open: boolean; setOpen: (o: boolean) => void; placeholder?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const close = () => { onChange(''); setOpen(false); input.current?.blur(); }; // blur hides the phone keyboard
  return <div className={'vsx' + (open ? ' open' : '')} role="search">
    <div className="vsx-pane">
      <button className="vsx-icon" onClick={() => { setOpen(true); input.current?.focus({ preventScroll: true }); }} aria-label={placeholder} aria-expanded={open} tabIndex={open ? -1 : 0}><Search size={18} /></button>
      <input ref={input} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} tabIndex={open ? 0 : -1}
        onKeyDown={e => { if (e.key === 'Escape') close(); }} onBlur={() => { if (!value.trim()) setOpen(false); }} />
      <button className="vsx-clear" onMouseDown={e => e.preventDefault()} onClick={close} aria-label="Close search" tabIndex={open ? 0 : -1}><X size={16} /></button>
    </div>
  </div>;
}

