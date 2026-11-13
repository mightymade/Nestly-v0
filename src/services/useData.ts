import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribe } from './db';

/**
 * Loads data from the api and reloads it whenever any write happens,
 * so every screen stays in sync (a stand-in for realtime updates later).
 */
export function useData<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(load); loadRef.current = load;
  const run = useCallback((quiet = false) => {
    if (!quiet) setLoading(true);
    let live = true;
    loadRef.current().then(d => { if (live) { setData(d); setError(null); } })
      .catch(e => { if (live) setError(e.message ?? 'Something went wrong'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => run(false), deps);
  useEffect(() => subscribe(() => { run(true); }), [run]);
  return { data, error, loading, reload: () => run(true) };
}
