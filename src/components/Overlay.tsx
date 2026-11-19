import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useIsPhone } from '../lib/useIsPhone';

/** A bottom sheet on phone, a centred dialog on PC. `footer` stays pinned at the bottom. */
export function Overlay({ title, onClose, children, footer, width, full, dismissable = true }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number; full?: boolean; dismissable?: boolean }) {
  const phone = useIsPhone();
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) close.current();
      // Keep Tab inside the dialog, so keyboard users cannot wander into the page behind it.
      if (e.key === 'Tab' && box.current) {
        const f = [...box.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"])')].filter(el => el.offsetParent !== null);
        if (!f.length) return; const first = f[0]!, last = f[f.length - 1]!; const a = document.activeElement;
        if (e.shiftKey && (a === first || a === box.current)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (a === last || !box.current.contains(a))) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    const o = document.body.style.overflow; document.body.style.overflow = 'hidden';
    // On touch screens, focusing a text field pops the keyboard up before the person has chosen to type.
    // So there we only focus the dialog itself; with a mouse and keyboard we jump to the first field as before.
    const touch = window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(max-width: 899px)').matches;
    const isField = (el: Element | null) => !!el && el.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea, select, [contenteditable="true"]');
    const first = touch ? null : box.current?.querySelector<HTMLElement>('[data-autofocus], input:not([type=checkbox]):not([type=range]), textarea, select');
    (first ?? box.current)?.focus({ preventScroll: true });
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = o; if (!(touch && isField(prev))) prev?.focus?.({ preventScroll: true }); };
  }, [dismissable]);
  const head = <div className="ov-head"><h2>{title}</h2>{dismissable && <button className="ov-close" onClick={onClose} aria-label="Close"><X size={18} /></button>}</div>;
  return createPortal(
    <div className="overlay">
      <div className="scrim" onClick={dismissable ? onClose : undefined} />
      {phone
        ? <div ref={box} tabIndex={-1} className={'sheet' + (full ? ' full' : '')} role="dialog" aria-modal="true" aria-label={title}>
            <div className="grabber" />{head}<div className="sheet-body">{children}{footer && <div className="ov-foot">{footer}</div>}</div></div>
        : <div ref={box} tabIndex={-1} className="dialog" role="dialog" aria-modal="true" aria-label={title} style={width ? { width: `min(${width}px, calc(100vw - 32px))` } : undefined}>
            {head}{children}{footer && <div className="ov-foot">{footer}</div>}</div>}
    </div>, document.body);
}
