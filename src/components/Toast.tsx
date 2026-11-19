import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type Opts = { undo?: () => void; tone?: 'success' | 'danger' };
type T = { id: number; msg: string } & Opts;
const Ctx = createContext<(msg: string, opts?: Opts) => void>(() => {});

/** Dark pill toast. Pass `undo` to show an Undo button. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<T | null>(null);
  const timer = useRef<number>();
  const show = useCallback((msg: string, opts: Opts = {}) => {
    setT({ id: Date.now(), msg, ...opts }); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setT(null), 3000);
  }, []);
  return <Ctx.Provider value={show}>{children}
    <div role="status" aria-live="polite">{t && <div className="toast" key={t.id}>
      {t.tone === 'danger' ? <AlertCircle size={19} className="t-ic danger" /> : <CheckCircle2 size={19} className="t-ic" />}
      <span className="msg">{t.msg}</span>
      {t.undo && <button onClick={() => { t.undo!(); setT(null); }}>Undo</button>}
    </div>}</div>
  </Ctx.Provider>;
}
export const useToast = () => useContext(Ctx);
