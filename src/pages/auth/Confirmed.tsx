import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sb } from '../../services/supabase';
import { useUser } from '../../services/session';

/**
 * Where the email confirmation link lands. Supabase signs the person in when they open the link, so this page
 * signs them out again on this device and sends them to the login page to log in themselves.
 */
export function Confirmed() {
  const nav = useNavigate(); const user = useUser(); const [out, setOut] = useState(false);
  useEffect(() => {
    (async () => {
      try { if (sb) { await sb.auth.getSession(); await sb.auth.signOut({ scope: 'local' }); } } catch { /* nothing to sign out */ }
      setOut(true);
    })();
  }, []);
  // Wait until the app knows nobody is signed in, or the login page would send them straight back inside.
  useEffect(() => {
    if (!out || user) return;
    const failed = /error/i.test(window.location.hash + window.location.search);
    nav(`/login?confirmed=${failed ? 0 : 1}`, { replace: true });
  }, [out, user, nav]);
  return <div className="boot" aria-busy="true"><span className="boot-dot" /><p>Email confirmed. Taking you to log in...</p></div>;
}
