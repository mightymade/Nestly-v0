import { useEffect, useState } from 'react';

/* The visitor log stores 24 h "HH:MM"; people read "2:15 pm". */
export const toMin = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
export const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
export const t12 = (t: string) => { const m = toMin(t), h = Math.floor(m / 60) % 24, mm = m % 60; return `${h % 12 || 12}:${String(mm).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`; };
export const span = (m: number) => m < 60 ? `${m} min` : m % 60 === 0 ? `${m / 60} h` : `${Math.floor(m / 60)} h ${m % 60} min`;
export const LONG_VISIT = 180; // minutes; longer than this gets flagged
/** "8:00 am to 9:00 pm" gives the closing time in minutes after midnight. */
export function closingMin(visit: string) {
  const m = /to\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i.exec(visit); if (!m) return null;
  const h = (+m[1]! % 12) + (m[3]!.toLowerCase() === 'pm' ? 12 : 0); return h * 60 + (+(m[2] ?? 0));
}
/** Re-render every half minute so "inside for" times stay current. */
export function useMinuteTick() {
  const [, set] = useState(0);
  useEffect(() => { const id = setInterval(() => set(x => x + 1), 30000); return () => clearInterval(id); }, []);
}
