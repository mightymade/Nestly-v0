import { useLayoutEffect, useRef, type InputHTMLAttributes } from 'react';

const group = (digits: string) => digits.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * A UGX amount box. The owner types numbers and sees them grouped as they type, like 45,000.
 * `value` and `onChange` work with plain digits ("45000"), so saving needs no clean-up.
 */
export function MoneyInput({ value, onChange, error, max = 99_999_999, id, ...p }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string; onChange: (digits: string) => void; error?: string | null; max?: number;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null); // digits to the left of the caret after the last edit
  useLayoutEffect(() => {
    const el = ref.current; if (!el || caret.current === null || document.activeElement !== el) return;
    let seen = 0, pos = 0; const s = el.value;
    while (pos < s.length && seen < caret.current) { if (/\d/.test(s[pos]!)) seen++; pos++; }
    el.setSelectionRange(pos, pos); caret.current = null;
  });
  return <div className="input-wrap has-lead money">
    <span className="lead tiny strong">UGX</span>
    <input {...p} id={id} ref={ref} className={'input num' + (error ? ' bad' : '')} inputMode="numeric" autoComplete="off" value={group(value)}
      aria-invalid={!!error || undefined} aria-describedby={error && id ? id + '-err' : undefined}
      onChange={e => {
        const el = e.target; const left = el.value.slice(0, el.selectionStart ?? el.value.length).replace(/\D/g, '').length;
        const d = el.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, String(max).length);
        if (d && +d > max) return;
        caret.current = left; onChange(d);
      }} />
  </div>;
}
