import { AlertTriangle, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Btn } from './ui';

export function EmptyState({ icon, title, text, action, bare }: { icon: ReactNode; title: string; text?: string; action?: ReactNode; bare?: boolean }) {
  return <div className={bare ? 'state' : 'card state'}><span className="icon-tile primary">{icon}</span><h2>{title}</h2>{text && <p>{text}</p>}{action}</div>;
}
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="card state" role="alert"><span className="icon-tile danger"><AlertTriangle size={24} /></span><h2>That did not load</h2><p>{message}</p>
    <Btn kind="secondary" onClick={onRetry}><RotateCcw size={16} />Try again</Btn></div>;
}
