import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useIsPhone } from '../lib/useIsPhone';
import { Pagination } from './Pagination';

export type Column<R> = {
  key: string; header: string; cell: (r: R) => ReactNode; align?: 'right';
  /** Where the value goes on the phone card. */
  phone?: 'title' | 'lead' | 'badge' | 'meta' | 'action' | 'hide';
};

const ROW_H = 61, HEAD_H = 34;

/**
 * One column definition, two layouts: a table on PC and cards on phone.
 * Rows are split into pages. On a one-screen PC page, the page size is worked out from the space available,
 * so the table always fits without the page scrolling.
 */
export function DataTable<R>({ rows, columns, rowKey, label, noun = 'rows', pageSize: fixed, onRowClick, rowLabel }: {
  rows: R[]; columns: Column<R>[]; rowKey: (r: R) => string; label: string; noun?: string; pageSize?: number;
  /** Makes the whole row open something. Links and buttons inside the row still do their own thing. */
  onRowClick?: (r: R) => void; rowLabel?: (r: R) => string;
}) {
  const phone = useIsPhone();
  const body = useRef<HTMLDivElement>(null);
  const [auto, setAuto] = useState(8);
  const [page, setPage] = useState(0);
  useLayoutEffect(() => {
    const el = body.current; if (!el || phone) return;
    const fit = () => { const h = el.clientHeight; if (h > 0 && getComputedStyle(el).flexGrow !== '0') setAuto(Math.max(3, Math.floor((h - HEAD_H) / ROW_H))); };
    fit(); const ro = new ResizeObserver(fit); ro.observe(el); return () => ro.disconnect();
  }, [phone]);
  const size = fixed ?? (phone ? 6 : auto);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const cur = Math.min(page, pages - 1);
  const slice = rows.slice(cur * size, cur * size + size);
  const pager = <Pagination page={cur} pages={pages} total={rows.length} from={rows.length ? cur * size + 1 : 0} to={cur * size + slice.length} noun={noun} onPage={setPage} />;
  const pick = (k: Column<R>['phone']) => columns.filter(c => c.phone === k);
  const own = (e: React.SyntheticEvent) => !!(e.target as HTMLElement).closest('a, button, input, select, textarea, label') && e.target !== e.currentTarget;
  const act = (r: R) => onRowClick ? {
    onClick: (e: React.MouseEvent) => { if (!own(e)) onRowClick(r); },
    onKeyDown: (e: React.KeyboardEvent) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); onRowClick(r); } },
    tabIndex: 0, 'aria-label': rowLabel?.(r),
  } : {};

  if (phone) return <div className="dt"><div className="m-rows" role="list" aria-label={label}>{slice.map(r => <article key={rowKey(r)} className={'card m-row' + (onRowClick ? ' click' : '')} role="listitem" {...act(r)}>
    <div className="head">{pick('lead').map(c => <span key={c.key}>{c.cell(r)}</span>)}
      <div className="grow">{pick('title').map(c => <div key={c.key} className="t clamp1">{c.cell(r)}</div>)}</div>
      {pick('badge').map(c => <span key={c.key}>{c.cell(r)}</span>)}</div>
    {pick('meta').length > 0 && <div className="meta">{pick('meta').map(c => <span key={c.key}>{c.header}: <b>{c.cell(r)}</b></span>)}</div>}
    {pick('action').map(c => { const a = c.cell(r); return a ? <div key={c.key} className="m-actions">{a}</div> : null; })}
  </article>)}</div>{pages > 1 && pager}</div>;

  return <div className="dt">
    <div className="dt-body" ref={body}><div className="table-wrap"><table className="table" aria-label={label}>
      <thead><tr>{columns.map(c => <th key={c.key} className={c.align === 'right' ? 'r' : undefined} scope="col">{c.header || <span className="sr-only">Actions</span>}</th>)}</tr></thead>
      <tbody>{slice.map(r => <tr key={rowKey(r)} className={onRowClick ? 'click' : undefined} {...act(r)}>{columns.map(c => <td key={c.key} className={c.align === 'right' ? 'r' : undefined}>{c.cell(r)}</td>)}</tr>)}</tbody>
    </table></div></div>
    {pager}
  </div>;
}
