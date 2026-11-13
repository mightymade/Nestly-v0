import type { ReactNode } from 'react';

export function Segmented<T extends string>({ value, onChange, options, label, full }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; count?: number }[]; label: string; full?: boolean }) {
  return <div className={'seg' + (full ? ' full' : '')} role="tablist" aria-label={label}>
    {options.map(o => <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
      {o.label}{o.count !== undefined && <span className="n">{o.count}</span>}</button>)}
  </div>;
}
