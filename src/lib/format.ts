export const ugx = (n: number) => 'UGX ' + Math.round(n).toLocaleString('en-US');
/** Short money for dashboards: UGX 1.35M, UGX 250K. */
export const ugxCompact = (n: number) => n >= 1e6 ? `UGX ${(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 2).replace(/\.?0+$/, '')}M` : n >= 1e3 ? `UGX ${Math.round(n / 1e3)}K` : ugx(n);
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]!.toUpperCase()).join('');
/** A date as YYYY-MM-DD in the person's own time zone (toISOString would give the UTC date, a day off around midnight in Uganda). */
export const ymd = (d: Date = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Moves a YYYY-MM-DD date by n days. */
export const addDays = (d: string, n: number) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + n); return ymd(x); };
/** A YYYY-MM-DD date for people, like 31 Aug 2027. Other text is returned as it is. */
export const dayLabel = (d?: string) => !d ? '' : /^\d{4}-\d\d-\d\d$/.test(d) ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : d;
export const nowTime = () => new Date().toTimeString().slice(0, 5);
export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
export const fullDate = (iso: string) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 172800) return 'Yesterday';
  if (s < 604800) return `${Math.floor(s / 86400)} days ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
/** Minutes between two HH:MM times, shown as "1 h 12 min". */
export function duration(a: string, b: string | null) {
  const toMin = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
  const m = Math.max(0, toMin(b ?? nowTime()) - toMin(a));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}
export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
