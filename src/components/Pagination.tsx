import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useIsPhone } from '../lib/useIsPhone';

/** "Showing 1 to 8 of 14" with Previous, page numbers and Next. */
export function Pagination({ page, pages, total, from, to, noun, onPage }: { page: number; pages: number; total: number; from: number; to: number; noun: string; onPage: (p: number) => void }) {
  const phone = useIsPhone();
  if (total === 0) return null;
  const nums = pageList(page, pages);
  return <nav className="pager" aria-label="Pagination">
    <span className="pager-info">Showing <b>{from}</b> to <b>{to}</b> of <b>{total}</b> {noun}</span>
    <div className="pager-ctl">
      <button className="pager-btn" disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft size={16} />{!phone && 'Previous'}</button>
      {phone ? <span className="pager-of num">{page + 1} / {pages}</span>
        : nums.map((n, i) => n === -1 ? <span key={'gap' + i} className="pager-gap">...</span>
          : <button key={n} className={'pager-num' + (n === page ? ' on' : '')} aria-current={n === page ? 'page' : undefined} aria-label={`Page ${n + 1}`} onClick={() => onPage(n)}>{n + 1}</button>)}
      <button className="pager-btn" disabled={page >= pages - 1} onClick={() => onPage(page + 1)} aria-label="Next page">{!phone && 'Next'}<ChevronRight size={16} /></button>
    </div>
  </nav>;
}

function pageList(p: number, n: number): number[] {
  if (n <= 7) return Array.from({ length: n }, (_, i) => i);
  const s = new Set([0, n - 1, p - 1, p, p + 1].filter(x => x >= 0 && x < n));
  const arr = [...s].sort((a, b) => a - b); const out: number[] = [];
  arr.forEach((x, i) => { if (i && x - arr[i - 1]! > 1) out.push(-1); out.push(x); });
  return out;
}
