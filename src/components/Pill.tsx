import type { ReactNode } from 'react';

export type Tone = 'success' | 'danger' | 'warn' | 'primary' | 'neutral' | 'onhero' | 'solid';
/** A small coloured label, like "Live" or "Late". */
export function Pill({ tone = 'neutral', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return <span className={'pill ' + tone} title={title}>{children}</span>;
}
