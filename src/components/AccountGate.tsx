import { Bookmark, CalendarCheck, Flag, Heart, Home, LogIn, UserPlus, type LucideIcon } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { storage } from '../lib/storage';
import { useUser } from '../services/session';
import { Overlay } from './Overlay';

export type Need = 'save' | 'book' | 'report' | 'saved' | 'bookings' | 'my-hostel' | 'account';
const COPY: Record<Need, { icon: LucideIcon; title: string; text: string }> = {
  save: { icon: Heart, title: 'Create an account to save hostels', text: 'Saved hostels stay on your account, so you can compare them later on any phone or computer.' },
  book: { icon: CalendarCheck, title: 'Create an account to book', text: 'Bookings are linked to your student email, so the owner and custodian know the room is really yours.' },
  report: { icon: Flag, title: 'Log in to report a listing', text: 'Reports come from real students, which helps the Nestly team act on them quickly.' },
  saved: { icon: Bookmark, title: 'Your saved hostels live in your account', text: 'Create a free account to keep a shortlist of hostels you like.' },
  bookings: { icon: CalendarCheck, title: 'Your bookings live in your account', text: 'Create a free account to book a room and follow your booking.' },
  'my-hostel': { icon: Home, title: 'My Hostel is for students with a room', text: 'After you book and move in, your room, custodian and receipts show here.' },
  account: { icon: UserPlus, title: 'You are browsing as a guest', text: 'Create a free account with your university email, or log in if you already have one.' },
};

const NEXT = 'nestly.next';
/** Where to go after logging in or confirming email, set when a guest hits something that needs an account. */
export const takeNext = (): string | null => { const n = storage.get<string | null>(NEXT, null); storage.set(NEXT, null); return n; };

const Ctx = createContext<(need: Need) => boolean>(() => true);
/** `need('save')` returns true when someone is signed in. For a guest it opens the sign-up prompt and returns false. */
export const useNeedAccount = () => useContext(Ctx);

export function AccountGateProvider({ children }: { children: ReactNode }) {
  const user = useUser(); const loc = useLocation();
  const [why, setWhy] = useState<Need | null>(null);
  useEffect(() => setWhy(null), [loc.pathname]); // never left open on another page
  const need = useCallback((n: Need) => { if (user) return true; setWhy(n); return false; }, [user]);
  const c = why && COPY[why];
  const keep = () => { setWhy(null); storage.set(NEXT, loc.pathname.startsWith('/s/explore') ? loc.pathname + loc.search : '/s/explore'); };
  return <Ctx.Provider value={need}>{children}
    {c && <Overlay title={c.title} onClose={() => setWhy(null)} width={440}>
      <div className="gate">
        <span className="icon-tile lg primary"><c.icon size={24} /></span>
        <p className="muted">{c.text}</p>
        <Link to="/signup" className="btn btn-primary btn-block btn-lg" onClick={keep}><UserPlus size={18} />Create a free student account</Link>
        <Link to="/login" className="btn btn-secondary btn-block btn-lg" onClick={keep}><LogIn size={18} />I already have an account</Link>
        <button className="btn btn-text btn-sm" onClick={() => setWhy(null)}>Keep browsing</button>
      </div>
    </Overlay>}
  </Ctx.Provider>;
}
