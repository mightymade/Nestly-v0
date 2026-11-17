import { seed } from '../data/seed';
const listeners = new Set<() => void>();
export function subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export async function reload() { listeners.forEach(fn => fn()); }
