import { useEffect, useState, useCallback } from 'react';
export function useData<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { const res = await fn(); setData(res); } catch (e) { setError((e as Error).message ?? 'An error occurred.'); } finally { setLoading(false); }
  }, deps);
  useEffect(() => { void load(); }, [load]);
  return { data, loading, error, reload: load };
}
