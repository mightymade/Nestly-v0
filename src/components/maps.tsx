import L from 'leaflet';
import { ArrowRight, Crosshair, LoaderCircle, MapPin, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { searchPlaces, type LatLng, type Place } from '../lib/geo';

/* Map tiles from OpenStreetMap via CARTO, in a light and a dark style that follow the app theme. */
const TILES = {
  light: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
};
const ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>';
const theme = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

/** Creates a Leaflet map on a div and keeps its tiles in step with light or dark mode. */
export function useLeaflet(opts: L.MapOptions) {
  const el = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<L.Map | null>(null);
  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { attributionControl: true, zoomControl: false, ...opts });
    m.attributionControl.setPrefix(false);
    let layer = L.tileLayer(TILES[theme()], { attribution: ATTR, subdomains: 'abcd', maxZoom: 19 }).addTo(m);
    const mo = new MutationObserver(() => { layer.remove(); layer = L.tileLayer(TILES[theme()], { attribution: ATTR, subdomains: 'abcd', maxZoom: 19 }).addTo(m); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    setMap(m);
    return () => { mo.disconnect(); ro.disconnect(); m.remove(); setMap(null); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return { el, map };
}

export const uniIcon = (label: string, logo?: string) => L.divIcon({ className: 'lf-plain', iconSize: [0, 0],
  html: `<div class="cmap-uni"><span class="pulse"></span>${logo ? `<span class="dot logo"><img src="${escapeHtml(logo)}" alt=""></span>` : `<span class="dot">${GRAD}</span>`}<span class="label">${escapeHtml(label)}</span></div>` });
const pinIcon = () => L.divIcon({ className: 'lf-plain', iconSize: [0, 0], html: `<div class="pick-pin">${PIN}</div>` });
export const escapeHtml = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const GRAD = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/></svg>';
const PIN = '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" fill="currentColor" fill-opacity=".25"/><circle cx="12" cy="10" r="3" fill="#fff"/></svg>';

/**
 * A map to choose one exact spot: tap or drag the pin, or search for a place.
 * `reference` shows another point (the campus) so the owner can judge the distance.
 */
export function PickMap({ value, onChange, center, reference, height = 360 }: {
  value: LatLng | null; onChange: (p: LatLng) => void; center: LatLng; reference?: LatLng & { label: string; logo?: string }; height?: number;
}) {
  const { el, map } = useLeaflet({ center: value ?? center, zoom: value ? 16 : 14, zoomControl: true });
  const marker = useRef<L.Marker | null>(null);
  const cb = useRef(onChange); cb.current = onChange;
  const [q, setQ] = useState(''); const [res, setRes] = useState<Place[] | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!map) return;
    map.zoomControl?.setPosition('bottomright');
    const click = (e: L.LeafletMouseEvent) => cb.current({ lat: e.latlng.lat, lng: e.latlng.lng });
    map.on('click', click);
    let ref: L.Marker | null = null;
    if (reference) ref = L.marker(reference, { icon: uniIcon(reference.label, reference.logo), interactive: false, keyboard: false }).addTo(map);
    // Show the hostel and the campus together at first, so the owner sees the distance straight away.
    if (reference && value && (Math.abs(reference.lat - value.lat) > 1e-5 || Math.abs(reference.lng - value.lng) > 1e-5))
      map.fitBounds(L.latLngBounds([reference, value]), { padding: [70, 70], maxZoom: 17, animate: false });
    return () => { map.off('click', click); ref?.remove(); };
  }, [map, reference?.lat, reference?.lng, reference?.label, reference?.logo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!map) return;
    if (!value) { marker.current?.remove(); marker.current = null; return; }
    if (!marker.current) {
      marker.current = L.marker(value, { icon: pinIcon(), draggable: true, keyboard: true, title: 'Drag to move' }).addTo(map);
      marker.current.on('dragend', () => { const p = marker.current!.getLatLng(); cb.current({ lat: p.lat, lng: p.lng }); });
    } else marker.current.setLatLng(value);
  }, [map, value?.lat, value?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  async function find(e?: React.FormEvent) {
    e?.preventDefault(); if (q.trim().length < 3) return;
    setBusy(true); setErr(null);
    try { const r = await searchPlaces(q.trim()); setRes(r); if (!r.length) setErr('No place found. Try a nearby landmark or road.'); }
    catch { setErr('Search needs an internet connection. You can still tap the map.'); setRes(null); }
    finally { setBusy(false); }
  }
  const go = (p: LatLng, z = 17) => { map?.flyTo(p, z, { duration: 0.6 }); cb.current(p); setRes(null); };
  const locate = () => navigator.geolocation?.getCurrentPosition(
    pos => go({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
    () => setErr('Could not get your location. Allow location access or tap the map.'), { enableHighAccuracy: true, timeout: 8000 });

  return <div className="pick">
    <form className="pick-search" onSubmit={find} role="search">
      <div className="input-wrap has-lead grow"><span className="lead"><Search size={16} /></span>
        <input className="input" value={q} onChange={e => { setQ(e.target.value); setErr(null); }} placeholder="Search a place" aria-label="Search for a place" enterKeyHint="search" />
        {q && <button type="button" className="pick-x" onClick={() => { setQ(''); setRes(null); }} aria-label="Clear search"><X size={15} /></button>}</div>
      <button type="submit" className="btn btn-secondary pick-go" disabled={busy} aria-label="Search">{busy ? <LoaderCircle size={16} className="spin" /> : <><ArrowRight size={17} className="i" /><span className="t">Search</span></>}</button>
      <button type="button" className="tool-btn" onClick={locate} aria-label="Use my location" title="Use my location"><Crosshair size={18} /></button>
    </form>
    {res && res.length > 0 && <ul className="pick-res" role="listbox">{res.map((p, i) => <li key={i}><button type="button" onClick={() => go(p)}><MapPin size={15} /><span className="min0"><b className="clamp1">{p.name}</b><span className="tiny muted clamp1">{p.full}</span></span></button></li>)}</ul>}
    {err && <span className="small warn-t">{err}</span>}
    <div className="pick-map" style={{ height }}><div ref={el} className="lf" />{!value && <div className="pick-hint">Tap the map to drop the pin</div>}</div>
  </div>;
}

