import L from 'leaflet';
import { MapPin, ShieldCheck, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Hostel, University } from '../data/types';
import { kmLabel } from '../lib/geo';
import { ugx, ugxCompact } from '../lib/format';
import { hostelPoint, minPrice } from '../services/api';
import { escapeHtml, uniIcon, useLeaflet } from './maps';
import { Art, Rating } from './ui';

/**
 * A real street map with the university at its exact spot and every listed hostel pinned at its own.
 * It is fixed: no dragging or zooming. The view is fitted so the campus and all hostels always show.
 */
export function CampusMap({ uni, hostels, active, setActive, hover, setHover, badge = true }: {
  uni: University; hostels: Hostel[]; active: string | null; setActive: (id: string | null) => void;
  hover: string | null; setHover: (id: string | null) => void; badge?: boolean;
}) {
  const { el, map } = useLeaflet({
    center: uni, zoom: 15, dragging: false, touchZoom: false, scrollWheelZoom: false, doubleClickZoom: false,
    boxZoom: false, keyboard: false, zoomSnap: 0.25, zoomAnimation: false, inertia: false,
  });
  const markers = useRef(new Map<string, L.Marker>());
  const cb = useRef({ setActive, setHover }); cb.current = { setActive, setHover };
  const [tick, setTick] = useState(0); // re-render the popup when the view changes

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setActive(null); };
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc);
  }, [setActive]);

  // Campus, rings and pins. Rebuilt when the hostels or university change, and re-fitted on resize.
  useEffect(() => {
    if (!map) return;
    const layer = L.layerGroup().addTo(map);
    const pts = hostels.map(h => ({ h, p: hostelPoint(h) })).filter((x): x is { h: Hostel; p: L.LatLngLiteral } => !!x.p);
    L.marker(uni, { icon: uniIcon(uni.short, uni.logo), interactive: false, keyboard: false, zIndexOffset: -100 }).addTo(layer);
    const far = Math.max(0.6, ...pts.map(x => x.h.km));
    // Ring labels go in the direction with the fewest hostels, so prices are never hidden behind them.
    const dirs = pts.map(x => x.h.dir ?? 0);
    const gap = (a: number) => Math.min(...dirs.map(d => { const g = Math.abs(((a - d) % 360 + 540) % 360 - 180); return g; }), 180);
    const best = [45, 135, 225, 315, 90, 270, 0, 180, 20, 70, 110, 160, 200, 250, 290, 340].reduce((m, a) => (gap(a) > gap(m) ? a : m), 45);
    const lab = (best * Math.PI) / 180;
    [0.5, 1, 2, 3, 5].filter(k => k <= far * 1.15 && k >= far / 3.5).forEach(k => {
      L.circle(uni, { radius: k * 1000, className: 'cmap-ring', interactive: false, fill: false }).addTo(layer);
      const ne = L.latLng(uni.lat + (k * Math.cos(lab)) / 111.32, uni.lng + (k * Math.sin(lab)) / (111.32 * Math.cos((uni.lat * Math.PI) / 180)));
      L.marker(ne, { interactive: false, keyboard: false, icon: L.divIcon({ className: 'lf-plain', iconSize: [0, 0], html: `<span class="cmap-ring-label">${kmLabel(k)}</span>` }) }).addTo(layer);
    });
    markers.current.clear();
    pts.forEach(({ h, p }) => {
      const m = L.marker(p, { keyboard: true, riseOnHover: true, icon: L.divIcon({ className: 'lf-plain', iconSize: [0, 0],
        html: `<span class="cmap-pin"><span class="bubble">${escapeHtml(ugxCompact(minPrice(h)).replace('UGX ', ''))}</span><span class="tip"></span></span>` }) });
      m.on('click', e => { L.DomEvent.stopPropagation(e); cb.current.setActive(h.id); });
      m.on('mouseover', () => cb.current.setHover(h.id)); m.on('mouseout', () => cb.current.setHover(null));
      m.addTo(layer);
      const node = m.getElement(); node?.setAttribute('aria-label', `${h.name}, ${kmLabel(h.km)} away, from ${ugx(minPrice(h))}`); node?.setAttribute('role', 'button');
      node?.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); cb.current.setActive(h.id); } });
      markers.current.set(h.id, m);
    });
    const close = () => cb.current.setActive(null);
    map.on('click', close);

    const fit = () => {
      const size = map.getSize(); if (!size.x || !size.y) return;
      const b = L.latLngBounds([uni, ...pts.map(x => x.p)]);
      if (!pts.length) map.setView(uni, 15, { animate: false });
      else map.fitBounds(b.pad(0.05), { paddingTopLeft: [60, 110], paddingBottomRight: [60, 70], maxZoom: 17, animate: false });
      // Price pins that land on top of each other or on the campus are pushed apart a little.
      const c = map.latLngToContainerPoint(uni);
      const sp = pts.map(x => ({ id: x.h.id, ...map.latLngToContainerPoint(x.p) }));
      const BW = 66, BH = 36;
      for (let it = 0; it < 40; it++) {
        let moved = false;
        for (let i = 0; i < sp.length; i++) {
          const a = sp[i]!; const dx = a.x - c.x, dy = a.y - c.y;
          if (Math.abs(dx) < 70 && a.y - 38 < c.y + 60 && a.y > c.y - 26) { const l = Math.hypot(dx, dy) || 1; a.x += (dx / l) * 4; a.y += (dy / l) * 4 || 4; moved = true; }
          for (let j = i + 1; j < sp.length; j++) {
            const q = sp[j]!; const ox = BW - Math.abs(a.x - q.x), oy = BH - Math.abs(a.y - q.y);
            if (ox > 0 && oy > 0) { moved = true;
              if (oy < ox) { const s = (a.y <= q.y ? -1 : 1) * (oy / 2 + 1); a.y += s; q.y -= s; }
              else { const s = (a.x <= q.x ? -1 : 1) * (ox / 2 + 1); a.x += s; q.x -= s; } }
          }
        }
        if (!moved) break;
      }
      sp.forEach(s => markers.current.get(s.id)?.setLatLng(map.containerPointToLatLng([Math.max(40, Math.min(size.x - 40, s.x)), Math.max(90, Math.min(size.y - 40, s.y))])));
      setTick(t => t + 1);
    };
    fit();
    map.on('resize', fit);
    return () => { map.off('resize', fit); map.off('click', close); layer.remove(); markers.current.clear(); };
  }, [map, uni.id, uni.lat, uni.lng, uni.logo, hostels.map(h => h.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps

  // Highlight the hovered and opened pins.
  useEffect(() => {
    markers.current.forEach((m, id) => {
      const pin = m.getElement()?.querySelector('.cmap-pin');
      pin?.classList.toggle('on', id === active || id === hover); pin?.classList.toggle('open', id === active);
      m.setZIndexOffset(id === active ? 1000 : id === hover ? 500 : 0);
    });
  }, [active, hover, tick]);

  const open = hostels.find(x => x.id === active);
  const m = open && markers.current.get(open.id);
  const at = map && m ? map.latLngToContainerPoint(m.getLatLng()) : null;
  const w = map?.getSize().x ?? 0;

  return <div className="cmap" role="region" aria-label={`Map of ${hostels.length} hostels around ${uni.name}`}>
    <div ref={el} className="lf" />
    {open && at && <Popup h={open} at={at} w={w} onClose={() => setActive(null)} />}
    {badge && <div className="cmap-badge"><MapPin size={15} /><span><b>{hostels.length}</b> {hostels.length === 1 ? 'hostel' : 'hostels'} around {uni.short}</span></div>}
  </div>;
}

function Popup({ h, at, w, onClose }: { h: Hostel; at: { x: number; y: number }; w: number; onClose: () => void }) {
  const below = at.y < 190; const W = 280;
  const left = Math.max(12, Math.min(w - W - 12, at.x - W / 2));
  return <div className={'cmap-pop' + (below ? ' below' : '')} style={{ left, top: below ? at.y + 14 : at.y - 48, width: W }} onClick={e => e.stopPropagation()} role="dialog" aria-label={h.name}>
    <Link to={`/s/explore/${h.id}`} className="cmap-pop-link">
      <div className="thumb"><Art hostel={h} /></div>
      <div className="body">
        <div className="name clamp1">{h.name}</div>
        <div className="meta"><Rating value={h.rating} count={h.nRev} />{h.verified && <span className="ver"><ShieldCheck size={13} />Verified</span>}</div>
        <div className="price">{ugx(minPrice(h))}<span> / sem</span></div>
        <div className="km">{kmLabel(h.km)} from campus</div>
      </div>
    </Link>
    <button className="x" onClick={onClose} aria-label="Close"><X size={15} /></button>
  </div>;
}
