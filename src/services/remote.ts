import { sb } from './supabase';

export let authUid: string | null = null;

if (sb) {
  sb.auth.getSession().then(({ data }) => {
    authUid = data.session?.user.id ?? null;
  });
  sb.auth.onAuthStateChange((_event, session) => {
    authUid = session?.user.id ?? null;
  });
}

export async function loadRemoteData() {
  if (!sb) return null;
  const [profiles, hostels, rooms, bookings, tenants, visitors, reviews, notices, flags, audit] = await Promise.all([
    sb.from('profiles').select('*'),
    sb.from('hostels').select('*'),
    sb.from('rooms').select('*'),
    sb.from('bookings').select('*'),
    sb.from('tenants').select('*'),
    sb.from('visitors').select('*'),
    sb.from('reviews').select('*'),
    sb.from('notices').select('*'),
    sb.from('flags').select('*'),
    sb.from('audit').select('*'),
  ]);

  return {
    users: profiles.data ?? [], hostels: hostels.data ?? [], rooms: rooms.data ?? [],
    bookings: bookings.data ?? [], tenants: tenants.data ?? [], visitors: visitors.data ?? [],
    reviews: reviews.data ?? [], notices: notices.data ?? [], flags: flags.data ?? [], audit: audit.data ?? []
  };
}
