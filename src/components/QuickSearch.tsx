import { Building2, ChevronRight, DoorOpen, FileText, Search, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { quickSearch, type SearchHit } from '../services/api';
import { useMe } from '../services/session';
import { Overlay } from './Overlay';

const ICON = { page: FileText, hostel: Building2, tenant: UserRound, visitor: DoorOpen };

export function QuickSearch() {
  const [open, setOpen] = useState(false);
  return <>
    <button className="round-btn" aria-label="Search" onClick={() => setOpen(true)}><Search size={19} /></button>
    {open && <SearchPanel onClose={() => setOpen(false)} />}
  </>;
}

function SearchPanel({ onClose }: { onClose: () => void }) {
  const me = useMe(); const nav = useNavigate();
  const [q, setQ] = useState(''); const [hits, setHits] = useState<SearchHit[]>([]); const [sel, setSel] = useState(0);
  useEffect(() => { let live = true; quickSearch(me, q).then(h => { if (live) { setHits(h); setSel(0); } }); return () => { live = false; }; }, [q, me]);
  const go = (h?: SearchHit) => { if (!h) return; onClose(); nav(h.to); };
  return <Overlay title="Search" onClose={onClose} width={560}>
    <div className="search-panel">
      <div className="input-wrap has-lead"><span className="lead"><Search size={18} /></span>
        <input className="input" value={q} onChange={e => setQ(e.target.value)} aria-label="Search Nestly"
          placeholder={me.role === 'student' ? 'Search hostels or pages' : 'Search tenants, visitors or pages'}
          onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, hits.length - 1)); } if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); } if (e.key === 'Enter') go(hits[sel]); }} /></div>
      <div className="results" role="listbox" aria-label="Results">
        {hits.length === 0 && <p className="muted small" style={{ padding: 12 }}>Nothing matches "{q}".</p>}
        {hits.map((h, i) => { const I = ICON[h.kind]; return <button key={h.kind + h.id} role="option" aria-selected={i === sel} className={'menu-item' + (i === sel ? ' on' : '')} onMouseEnter={() => setSel(i)} onClick={() => go(h)}>
          <span className="icon-tile sm"><I size={17} /></span><span className="grow">{h.title}<span className="sub">{h.sub}</span></span><ChevronRight size={16} className="muted" /></button>; })}
      </div>
    </div>
  </Overlay>;
}
