import type { ReactNode } from 'react';

/** White card. `fill` lets it stretch to the space left on a one-screen page; `scroll` makes its body scroll inside. */
export function Card({ title, subtitle, action, children, className = '', pad = true, id, fill, scroll }: {
  title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; children?: ReactNode; className?: string; pad?: boolean; id?: string; fill?: boolean; scroll?: boolean;
}) {
  const cls = ['card', pad && 'card-pad', fill && 'fill-card fill grow-y', className].filter(Boolean).join(' ');
  return <section className={cls} id={id} aria-label={typeof title === 'string' ? title : undefined}>
    {(title || action) && <div className="card-head"><div className="grow">{title && <h2>{title}</h2>}{subtitle && <p className="sub">{subtitle}</p>}</div>{action}</div>}
    {fill ? <div className={'card-body' + (scroll ? ' scroll-y' : '')}>{children}</div> : children}
  </section>;
}
