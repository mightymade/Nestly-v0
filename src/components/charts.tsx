import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

type Series = { name: string; values: number[]; tone: 'muted' | 'primary' };

function useSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 600, h: 250 });
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    read(); const ro = new ResizeObserver(read); ro.observe(el); return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

const roundedTop = (x: number, y: number, w: number, h: number, r: number) => {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
};

/** Paired bar chart with a dark tooltip, drawn in plain SVG. */
export function BarChart({ labels, series, height: fixedH = 250, unit = '', fill }: { labels: string[]; series: Series[]; height?: number; unit?: string; fill?: boolean }) {
  const [ref, box] = useSize();
  const [outer, obox] = useSize();
  const cw = box.w;
  // In a one-screen layout the chart takes whatever height its card has left.
  const height = fill ? Math.max(150, obox.h - 10) : fixedH;
  const [hover, setHover] = useState<number | null>(null);
  const left = 34, bottom = 28, top = 14;
  const minGroup = 40;
  const w = Math.max(cw, left + labels.length * minGroup);
  const plotW = w - left, plotH = height - top - bottom;
  const max = Math.max(1, ...series.flatMap(s => s.values));
  const step = Math.max(1, Math.ceil(max / 4));
  const yMax = step * 4;
  const gw = plotW / labels.length;
  const bw = Math.max(8, Math.min(22, (gw * 0.72) / series.length - 4));
  const y = (v: number) => top + plotH - (v / yMax) * plotH;
  const groupX = (i: number) => left + i * gw + (gw - (bw * series.length + 6 * (series.length - 1))) / 2;
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  const tipTop = hover === null ? 0 : Math.min(...series.map(s => y(s.values[hover] ?? 0)));
  return <div ref={outer} className={'chart-scroll' + (fill ? ' chart-fill' : '')}><div ref={ref} className="bar-chart" style={{ minWidth: left + labels.length * minGroup }} onMouseLeave={() => setHover(null)}>
    <svg width={w} height={height} role="img" aria-label={`Bar chart: ${series.map(s => s.name).join(' and ')}`}>
      <g className="grid">{[0, 1, 2, 3, 4].map(i => <line key={i} x1={left} x2={w} y1={y(step * i)} y2={y(step * i)} />)}</g>
      {[0, 1, 2, 3, 4].map(i => <text key={i} className="axis" x={0} y={y(step * i) + 4}>{step * i}{unit}</text>)}
      {labels.map((l, i) => <g key={l + i}>
        <rect className="hit" x={left + i * gw} y={top} width={gw} height={plotH} tabIndex={0} role="button"
          aria-label={`${l}: ${series.map(s => `${s.name} ${fmt(s.values[i] ?? 0)}`).join(', ')}`}
          onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} onClick={() => setHover(h => (h === i ? null : i))} />
        <g className={hover === i ? 'active' : ''} pointerEvents="none">
          {series.map((s, k) => { const v = s.values[i] ?? 0; const x = groupX(i) + k * (bw + 6);
            return <path key={s.name} className={'bar ' + s.tone} style={{ animationDelay: `${i * 20}ms` } as CSSProperties} d={roundedTop(x, y(v), bw, top + plotH - y(v), 7)} />; })}
          {hover === i && <circle className="marker" cx={groupX(i) + bw / 2} cy={y(series[0]!.values[i] ?? 0) - 1} r={5} />}
        </g>
        <text className="axis" x={left + i * gw + gw / 2} y={height - 8} textAnchor="middle">{l}</text>
      </g>)}
    </svg>
    {hover !== null && <div className="chart-tip" style={{ left: left + hover * gw + gw / 2, top: tipTop }}>
      <div className="t-label">{labels[hover]}</div>
      {series.map(s => <div key={s.name} className="t-row"><i style={{ background: s.tone === 'primary' ? 'var(--primary)' : 'var(--bar-muted)' }} /><b className="num">{fmt(s.values[hover] ?? 0)}</b><span className="t-label">{s.name}</span></div>)}
    </div>}
  </div></div>;
}

export function Legend({ items }: { items: { label: string; tone: 'muted' | 'primary' | string }[] }) {
  return <div className="legend">{items.map(i => <span key={i.label}><i style={{ background: i.tone === 'primary' ? 'var(--primary)' : i.tone === 'muted' ? 'var(--bar-muted)' : i.tone }} />{i.label}</span>)}</div>;
}

/** Concentric ring chart, one ring per item, like the reference "Product Statistic". */
export function RingChart({ items, total, size = 190, center }: { items: { label: string; value: number; color: string }[]; total: number; size?: number; center?: React.ReactNode }) {
  const stroke = 13, gap = 9;
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  return <div style={{ position: 'relative', width: size, height: size }}>
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={items.map(i => `${i.label} ${i.value} of ${total}`).join(', ')}>
      {items.map((it, k) => {
        const r = size / 2 - stroke / 2 - k * (stroke + gap); const C = 2 * Math.PI * r;
        const len = total ? Math.max(0.0001, (it.value / total) * C) : 0;
        return <g key={it.label} transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle className="track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
          {mounted && <circle className="arc" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} stroke={it.color} strokeDasharray={`${len} ${C}`} style={{ ['--len' as string]: `${len}`, animationDelay: `${k * 80}ms` } as CSSProperties} />}
        </g>;
      })}
    </svg>
    {center && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>{center}</div>}
  </div>;
}
