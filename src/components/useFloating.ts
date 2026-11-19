import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';

/**
 * Places a popup menu next to its button, on top of everything (it is rendered into document.body), so a dialog,
 * a card or a scrolling list can never cut it off. It opens below the button, or above when there is more room there,
 * and gets its own scroll bar when even that is too small. It follows the button while the page scrolls.
 */
export function useFloating(anchor: RefObject<HTMLElement>, open: boolean, opts: { align?: 'left' | 'right'; minWidth?: number; matchWidth?: boolean; gap?: number } = {}) {
  const [style, setStyle] = useState<CSSProperties>({ position: 'fixed', visibility: 'hidden' });
  const { align = 'left', minWidth = 220, matchWidth = false, gap = 8 } = opts;
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const a = anchor.current; if (!a) return;
      const r = a.getBoundingClientRect(); const vw = window.innerWidth, vh = window.innerHeight, edge = 12;
      const below = vh - r.bottom - gap - edge, above = r.top - gap - edge;
      const up = below < 240 && above > below;
      const width = Math.min(Math.max(minWidth, matchWidth ? r.width : 0), vw - edge * 2);
      let left = align === 'right' ? r.right - width : r.left;
      left = Math.max(edge, Math.min(left, vw - width - edge));
      setStyle({ position: 'fixed', left, width: matchWidth ? width : undefined, minWidth: matchWidth ? undefined : Math.min(minWidth, vw - edge * 2),
        maxWidth: vw - edge * 2, maxHeight: Math.max(160, up ? above : below), overflowY: 'auto', zIndex: 200,
        ...(up ? { bottom: vh - r.top + gap, transformOrigin: 'bottom' } : { top: r.bottom + gap, transformOrigin: 'top' }) });
    };
    place();
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, align, minWidth, matchWidth, gap]); // eslint-disable-line react-hooks/exhaustive-deps
  return style;
}
