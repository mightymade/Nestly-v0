import L from 'leaflet';
import { Footprints, Navigation } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Hostel } from '../data/types';
import { directionsUrl, kmLabel, walkRoute, type Walk } from '../lib/geo';
import { hostelPoint, universityById } from '../services/api';
import { pinIcon, uniIcon, useLeaflet } from './maps';

/**
 * Where a hostel is: a small street map with the hostel and the campus, the walking route between them,
 * how long the walk takes, and a link that opens walking directions from the hostel to the campus in Google Maps.
 */
export function HostelLocation({ h, height = 200 }: { h: Hostel; height?: number }) {
  const uni = universityById(h.uni); const p = hostelPoint(h);
  const [walk, setWalk] = useState<Walk | null | undefined>(undefined);
  const { el, map } = useLeaflet({ center: p ?? uni ?? { lat: 0.35, lng: 32.6 }, zoom: 15, scrollWheelZoom: false, zoomControl: true });

  useEffect(() => { if (p && uni) walkRoute(p, uni).then(setWalk); else setWalk(null); }, [p?.lat, p?.lng, uni?.lat, uni?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!map || !p) return;
    map.zoomControl?.setPosition('bottomright');
    const layer = L.layerGroup().addTo(map);
    L.marker(p, { icon: pinIcon(), keyboard: false, title: h.name }).addTo(layer);
    if (uni) L.marker(uni, { icon: uniIcon(uni.short, uni.logo), interactive: false, keyboard: false }).addTo(layer);
    // The real walking route when we have it; a dashed straight line until then (or when offline).
    const line = walk?.line.length ? L.polyline(walk.line, { className: 'hl-route', weight: 5 }) : uni ? L.polyline([p, uni], { className: 'hl-straight', weight: 3, dashArray: '6 8' }) : null;
    line?.addTo(layer);
    const pts = [p, ...(uni ? [uni] : []), ...(walk?.line ?? [])];
    if (pts.length > 1) map.fitBounds(L.latLngBounds(pts).pad(0.15), { maxZoom: 17, animate: false }); else map.setView(p, 16, { animate: false });
    return () => { layer.remove(); };
  }, [map, p?.lat, p?.lng, uni, walk]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!p) return <p className="small muted">The owner has not pinned the exact spot yet. It is in {h.area}.</p>;
  const exact = !!h.location;
  return <div className="hl">
    <div className="hl-map" ref={el} style={{ height }} role="img" aria-label={`Map of ${h.name}${uni ? ` and ${uni.short}` : ''}`} />
    <div className="hl-row">
      <span className="hl-walk"><Footprints size={16} />{walk ? <span><b className="ink">{walk.minutes} min walk</b> to {uni?.short} · {kmLabel(walk.km)}</span>
        : walk === null ? <span><b className="ink">{kmLabel(h.km)}</b> to {uni?.short} in a straight line</span> : <span className="muted">Working out the walk...</span>}</span>
    </div>
    {!exact && <p className="tiny muted">Approximate spot. The owner has not pinned the exact building yet.</p>}
    <div className="hl-acts">
      {/* Directions run from the hostel to the university. directionsUrl(to, from). */}
      <a className="btn btn-secondary btn-sm" href={uni ? directionsUrl(uni, p) : directionsUrl(p)} target="_blank" rel="noreferrer"><Navigation size={15} />Directions{uni ? ` to ${uni.short}` : ''}</a>
    </div>
  </div>;
}
