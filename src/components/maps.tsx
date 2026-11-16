import L from 'leaflet';
import { ArrowRight, Crosshair, LoaderCircle, MapPin, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { searchPlaces, type LatLng, type Place } from '../lib/geo';

/*
 * Two map styles, switched with a button on every map:
 * - Street map from OpenStreetMap: free, no key. Their rules: show the attribution, keep usage light.
 *   Dark mode darkens it with a CSS filter (.lf-darktiles in components.css).
 * - Satellite photos from Esri World Imagery: free to view with the attribution shown. For heavy commercial use
 *   Esri asks for an ArcGIS account, so check their terms before a real launch.
 */
const STREET = { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors' };
const SATELLITE = { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', maxZoom: 19,
  attribution: 'Imagery &copy; <a href="https://www.esri.com" target="_blank" rel="noreferrer">Esri</a>, Maxar, Earthstar Geographics' };
const theme = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
type Style = 'street' | 'satellite';
const STYLE_KEY = 'nestly.mapStyle';
const savedStyle = (): Style => { try { return localStorage.getItem(STYLE_KEY) === 'satellite' ? 'satellite' : 'street'; } catch { return 'street'; } };
/** Every open map switches together when the style changes. */
const styleListeners = new Set<(s: Style) => void>();
const ICON_SAT = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 7 9 3 5 7l4 4"/><path d="m17 11 4 4-4 4-4-4"/><path d="m8 12 4 4 6-6-4-4Z"/><path d="m16 8 3-3"/><path d="M9 21a6 6 0 0 0-6-6"/></svg>';
const ICON_MAP = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/></svg>';

/** Creates a Leaflet map on a div, with a street or satellite style button, and keeps the street map in step with dark mode. */
export function useLeaflet(opts: L.MapOptions) {
  const el = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<L.Map | null>(null);
  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { attributionControl: true, zoomControl: false, ...opts });
    m.attributionControl.setPrefix(false);
    let style = savedStyle(); let layer: L.TileLayer | null = null;
    const dark = () => el.current?.classList.toggle('lf-darktiles', theme() === 'dark' && style === 'street');
    // The button shows what you switch TO: a satellite icon on the street map, a map icon on satellite.
    const btn = L.DomUtil.create('button', 'lf-style');
    btn.type = 'button';
    const show = (s: Style) => {
      style = s; layer?.remove();
      const t = s === 'satellite' ? SATELLITE : STREET;
      layer = L.tileLayer(t.url, { attribution: t.attribution, maxZoom: t.maxZoom }).addTo(m);
      btn.innerHTML = `${s === 'satellite' ? ICON_MAP : ICON_SAT}<span>${s === 'satellite' ? 'Map' : 'Satellite'}</span>`;
      btn.setAttribute('aria-label', s === 'satellite' ? 'Show street map' : 'Show satellite view');
      btn.setAttribute('aria-pressed', String(s === 'satellite'));
      el.current?.classList.toggle('lf-satellite', s === 'satellite'); dark();
    };
    const Toggle = L.Control.extend({ onAdd: () => { L.DomEvent.disableClickPropagation(btn); L.DomEvent.disableScrollPropagation(btn); return btn; } });
    new Toggle({ position: 'topright' }).addTo(m);
    L.DomEvent.on(btn, 'click', e => {
      L.DomEvent.stop(e); const next: Style = style === 'street' ? 'satellite' : 'street';
      try { localStorage.setItem(STYLE_KEY, next); } catch { /* the choice just is not remembered */ }
      styleListeners.forEach(f => f(next));
    });
    show(style); styleListeners.add(show);
    const mo = new MutationObserver(dark);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    setMap(m);
    return () => { styleListeners.delete(show); mo.disconnect(); ro.disconnect(); m.remove(); setMap(null); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return { el, map };
}

export const uniIcon = (label: string, logo?: string) => L.divIcon({ className: 'lf-plain', iconSize: [0, 0],
  html: `<div class="cmap-uni"><span class="pulse"></span>${logo ? `<span class="dot logo"><img src="${escapeHtml(logo)}" alt=""></span>` : `<span class="dot">${GRAD}</span>`}<span class="label">${escapeHtml(label)}</span></div>` });
export const pinIcon = () => L.divIcon({ className: 'lf-plain', iconSize: [0, 0], html: `<div class="pick-pin">${PIN}</div>` });
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

