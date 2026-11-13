import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '../data/types';
import { sessionUser } from './api';
import { subscribe } from './db';

const Ctx = createContext<User | null>(null);

/** Keeps the signed-in user in sync with the fake database. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(sessionUser);
  useEffect(() => subscribe(() => setUser(sessionUser())), []);
  return <Ctx.Provider value={user}>{children}</Ctx.Provider>;
}
export const useUser = () => useContext(Ctx);
export const useMe = () => { const u = useContext(Ctx); if (!u) throw new Error('Not signed in'); return u; };
