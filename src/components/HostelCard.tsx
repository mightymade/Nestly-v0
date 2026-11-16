import { Heart, MapPin, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AMENITIES } from '../data/catalog';
import type { Hostel } from '../data/types';
import { ugx } from '../lib/format';
import { minPrice, roomsLeft, toggleSaved } from '../services/api';
import { amenIcon } from './amenityIcons';
import { Pill } from './Pill';
import { useToast } from './Toast';
import { useNeedAccount } from './AccountGate';
import { Art, Rating } from './ui';

export function SaveButton({ userId, hostel, saved, className = 'save-btn' }: { userId?: string; hostel: Hostel; saved: boolean; className?: string }) {
  const toast = useToast(); const need = useNeedAccount();
  return <button className={className + (saved ? ' on' : '')} aria-pressed={saved} aria-label={saved ? `Remove ${hostel.name} from saved` : `Save ${hostel.name}`}
    onClick={async e => {
      e.preventDefault(); e.stopPropagation();
      if (!need('save') || !userId) return;
      const now = await toggleSaved(userId, hostel.id);
      toast(now ? 'Saved to your shortlist' : 'Removed from saved', { undo: () => { toggleSaved(userId, hostel.id); } });
    }}>
    <Heart size={18} fill={saved ? 'currentColor' : 'none'} /></button>;
}

export function LeftPill({ h }: { h: Hostel }) {
  const left = roomsLeft(h);
  return left === 0 ? <Pill tone="danger">Full</Pill> : <Pill tone={left <= 4 ? 'warn' : 'success'}>{left} {left === 1 ? 'room' : 'rooms'} left</Pill>;
}

export function AmenityChips({ h, max = 2 }: { h: Hostel; max?: number }) {
  const rest = h.amen.slice(max);
  return <div className="amen-chips">{h.amen.slice(0, max).map(a => { const I = amenIcon(a); return <span key={a} className="amen-chip"><I size={14} className="ic" />{AMENITIES[a]}</span>; })}
    {rest.length > 0 && <span className="amen-chip" title={rest.map(a => AMENITIES[a]).join(', ')}>+{rest.length}</span>}</div>;
}

export function HostelCard({ h, userId, saved }: { h: Hostel; userId?: string; saved: boolean }) {
  return <Link to={`/s/explore/${h.id}`} className="card lift h-card" aria-label={`${h.name}, from ${ugx(minPrice(h))} per semester`}>
    <div className="h-media"><Art hostel={h} />
      {h.verified && <Pill tone="solid"><ShieldCheck size={13} color="var(--primary)" />Verified</Pill>}
      <span className="dist"><MapPin size={12} />{h.km} km</span></div>
    <SaveButton userId={userId} hostel={h} saved={saved} />
    <div className="h-body">
      <div className="h-title"><h3 className="clamp1" title={h.name}>{h.name}</h3><Rating value={h.rating} count={h.nRev} /></div>
      <p className="h-area clamp1">{h.area}</p>
      <AmenityChips h={h} />
      <div className="h-foot"><div><div className="from">From</div><div className="price">{ugx(minPrice(h))}<span> / sem</span></div></div><LeftPill h={h} /></div>
    </div>
  </Link>;
}

/** Wide list row for the PC Explore page, next to the map. */
export function HostelRow({ h, userId, saved, on, onHover, i = 0 }: { i?: number; h: Hostel; userId?: string; saved: boolean; on: boolean; onHover: (id: string | null) => void }) {
  return <Link to={`/s/explore/${h.id}`} id={`row-${h.id}`} className={'card h-row' + (on ? ' on' : '')} style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }} aria-label={`${h.name}, ${h.km} km from campus, from ${ugx(minPrice(h))} per semester`}
    onMouseEnter={() => onHover(h.id)} onMouseLeave={() => onHover(null)} onFocus={() => onHover(h.id)} onBlur={() => onHover(null)}>
    <div className="h-row-media"><Art hostel={h} />{h.verified && <span className="ver-badge" title="Verified hostel" aria-label="Verified hostel" role="img"><ShieldCheck size={15} /></span>}</div>
    <div className="h-row-body">
      <div className="h-row-top">
        <div className="h-row-title"><h3 className="clamp1" title={h.name}>{h.name}</h3><span className="km-tag"><MapPin size={12} />{h.km} km</span></div>
        <SaveButton userId={userId} hostel={h} saved={saved} className="save-btn inline" />
      </div>
      <div className="h-row-mid"><Rating value={h.rating} count={h.nRev} /><span className="km-inline"><MapPin size={12} />{h.km} km</span><AmenityChips h={h} max={2} /></div>
      <div className="h-row-foot"><div className="price">{ugx(minPrice(h))}<span> / sem</span></div><LeftPill h={h} /></div>
    </div>
  </Link>;
}
