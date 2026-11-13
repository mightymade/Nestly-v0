import { useEffect, useState } from 'react';

const QUERY = '(max-width: 899px)';

/** True on phone-sized screens. Phone and PC get different layouts, not just smaller ones. */
export function useIsPhone() {
  const [phone, setPhone] = useState(() => window.matchMedia(QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const on = (e: MediaQueryListEvent) => setPhone(e.matches);
    mq.addEventListener('change', on);
    document.body.classList.toggle('is-phone', mq.matches);
    return () => mq.removeEventListener('change', on);
  }, []);
  useEffect(() => { document.body.classList.toggle('is-phone', phone); }, [phone]);
  return phone;
}
