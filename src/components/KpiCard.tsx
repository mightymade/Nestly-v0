import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DeltaPill } from './Pill';

type Props = { icon: LucideIcon; label: string; value: ReactNode; caption?: string; delta?: number; goodWhen?: 'up' | 'down'; hero?: boolean; to?: string; badge?: ReactNode; title?: string };

export function KpiCard({ icon: Icon, label, value, caption, delta, goodWhen, hero, to, badge, title }: Props) {
  const body = <>
    <div className="top"><span className="icon-tile"><Icon size={21} /></span>{badge ?? (delta !== undefined && <DeltaPill delta={delta} goodWhen={goodWhen} onHero={hero} />)}</div>
    <span className="k-label">{label}</span>
    <div className="k-value"><span className="k-num num" title={title}>{value}</span>{caption && <span className="k-cap">{caption}</span>}</div>
  </>;
  const cls = 'card kpi' + (hero ? ' hero' : '') + (to ? ' lift' : '');
  return to ? <Link to={to} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

/** Smaller KPI used in summary strips; can act as a filter toggle. */
export function MiniKpi({ icon: Icon, label, value, tone = '', pressed, onClick }: { icon: LucideIcon; label: string; value: ReactNode; tone?: '' | 'primary' | 'warn' | 'success' | 'danger'; pressed?: boolean; onClick?: () => void }) {
  const inner = <div className="row"><span className={'icon-tile sm ' + tone}><Icon size={18} /></span><div className="grow"><div className="k-label">{label}</div><div className="k-num num">{value}</div></div></div>;
  return onClick ? <button className="card kpi compact" aria-pressed={pressed} onClick={onClick}>{inner}</button> : <div className="card kpi compact">{inner}</div>;
}
