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
