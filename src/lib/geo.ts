/** Small geography helpers. Distances are straight-line, which is what students compare. */
export type LatLng = { lat: number; lng: number };
const R = 6371; const rad = (d: number) => (d * Math.PI) / 180; const deg = (r: number) => (r * 180) / Math.PI;

export function distanceKm(a: LatLng, b: LatLng) {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
/** Compass bearing from a to b, 0 = north, clockwise. */
export function bearing(a: LatLng, b: LatLng) {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}
/** The point `km` away from `p` in direction `dir` (degrees from north). */
export function offset(p: LatLng, km: number, dir: number): LatLng {
  return { lat: p.lat + (km * Math.cos(rad(dir))) / 111.32, lng: p.lng + (km * Math.sin(rad(dir))) / (111.32 * Math.cos(rad(p.lat))) };
}
const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
export const compass = (dir: number) => COMPASS[Math.round(dir / 45) % 8]!;
export const kmLabel = (km: number) => (km < 1 ? `${Math.round(km * 1000 / 10) * 10} m` : `${km.toFixed(1)} km`);

/* OpenStreetMap place search (Nominatim). Free, needs internet, about one request a second. */
const NOM = 'https://nominatim.openstreetmap.org';
export type Place = { name: string; full: string; lat: number; lng: number };
export async function searchPlaces(q: string): Promise<Place[]> {
  const r = await fetch(`${NOM}/search?format=jsonv2&countrycodes=ug&limit=6&q=${encodeURIComponent(q)}`, { headers: { 'Accept-Language': 'en' } });
  if (!r.ok) throw new Error('Search is not available right now.');
  const j = (await r.json()) as { display_name: string; name?: string; lat: string; lon: string }[];
  return j.map(x => ({ name: x.name || x.display_name.split(',')[0]!, full: x.display_name, lat: +x.lat, lng: +x.lon }));
}
/** A short area name like "Kampala Road, Mukono" for a point, or null when offline. */
export async function placeName(p: LatLng): Promise<string | null> {
  try {
    const r = await fetch(`${NOM}/reverse?format=jsonv2&zoom=17&lat=${p.lat}&lon=${p.lng}`, { headers: { 'Accept-Language': 'en' } });
    if (!r.ok) return null;
    const a = ((await r.json()) as { address?: Record<string, string> }).address ?? {};
    const near = a.road || a.neighbourhood || a.suburb || a.quarter || a.village;
    const town = a.town || a.city || a.municipality || a.county;
    return [near, town].filter(Boolean).join(', ') || null;
  } catch { return null; }
}

/* Walking routes from the FOSSGIS routing service (the one openstreetmap.org uses). Free, needs internet, light use only. */
const ROUTE = 'https://routing.openstreetmap.de/routed-foot/route/v1/driving';
export type Walk = { km: number; minutes: number; line: LatLng[] };
const walks = new Map<string, Promise<Walk | null>>();
/** The walking route between two points, or null when the service cannot be reached. Results are kept for the session. */
export function walkRoute(a: LatLng, b: LatLng): Promise<Walk | null> {
  const key = [a.lat, a.lng, b.lat, b.lng].map(n => n.toFixed(5)).join(',');
  if (!walks.has(key)) walks.set(key, (async () => {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
      const r = await fetch(`${ROUTE}/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`, { signal: ctl.signal }); clearTimeout(t);
      if (!r.ok) return null;
      const j = (await r.json()) as { routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[] };
      const x = j.routes?.[0]; if (!x) return null;
      // The service's walking times are slow; a student walks about 5 km an hour.
      return { km: x.distance / 1000, minutes: Math.max(1, Math.round((x.distance / 1000) / 5 * 60)), line: x.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })) };
    } catch { return null; }
  })());
  return walks.get(key)!;
}
/** A Google Maps link with walking directions to a place, from where the phone is now, or from `from`. */
export const directionsUrl = (to: LatLng, from?: LatLng) =>
  `https://www.google.com/maps/dir/?api=1${from ? `&origin=${from.lat},${from.lng}` : ''}&destination=${to.lat},${to.lng}&travelmode=walking`;
