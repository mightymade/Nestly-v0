import { ArrowUpDown, Check, GraduationCap, MailWarning, Search, SlidersHorizontal, Undo2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Dropdown } from '../../components/Dropdown';
import { CampusMap } from '../../components/CampusMap';
import { HostelRow } from '../../components/HostelCard';
import { Overlay } from '../../components/Overlay';
import { PageHeader } from '../../components/PageHeader';
import { Pill } from '../../components/Pill';
import { EmptyState, ErrorState } from '../../components/States';
import { Btn } from '../../components/ui';
import { AMENITIES } from '../../data/catalog';
import type { Hostel } from '../../data/types';
import { ugx } from '../../lib/format';
import { useIsPhone } from '../../lib/useIsPhone';
import { allUniversities, listHostels, minPrice, savedIds, universityById } from '../../services/api';
import { useUser } from '../../services/session';
import { UniLogo } from '../../components/UniLogo';
import { useData } from '../../services/useData';

type Sort = 'distance' | 'rating' | 'price';
type Filters = { max: number; type: 'any' | 'single' | 'double'; sc: boolean; amen: string[]; minR: number };
const MAX = 1700000;
const DEFAULT: Filters = { max: MAX, type: 'any', sc: false, amen: [], minR: 0 };
const SORTS: { value: Sort; label: string }[] = [{ value: 'distance', label: 'Nearest first' }, { value: 'rating', label: 'Top rated' }, { value: 'price', label: 'Cheapest first' }];
// Kept outside the component so filters survive opening a hostel and coming back.
let memory = { f: DEFAULT, q: '', sort: 'distance' as Sort };

export function Explore() {
  const me = useUser(); const phone = useIsPhone();
  const [params, setParams] = useSearchParams();
  const home = me?.universityId ?? 'ucu';
  const uniId = params.get('uni') ?? home; // default: the university chosen at sign-up
  const uni = universityById(uniId)!;
  const [f, setF] = useState<Filters>(memory.f); const [q, setQ] = useState(memory.q); const [sort, setSort] = useState<Sort>(memory.sort);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(!!memory.q);
  const [active, setActive] = useState<string | null>(null); const [hover, setHover] = useState<string | null>(null);
  memory = { f, q, sort };
  useHideTopOnScroll(phone);
  const listRef = useRef<HTMLDivElement>(null);
  const { data, loading, error, reload } = useData(() => listHostels(uniId), [uniId]);
  const saved = me ? savedIds(me.id) : [];
  const list = useMemo(() => applyFilters(data ?? [], f, q, sort), [data, f, q, sort]);
  const chips = activeChips(f, setF);
  const pickUni = (id: string) => setParams(id === home ? {} : { uni: id });
  const clear = () => { setF(DEFAULT); setQ(''); };
  useEffect(() => { if (active && !list.some(h => h.id === active)) setActive(null); }, [list, active]);
  useEffect(() => { setActive(null); }, [uniId]);
  const pager = usePager(listRef, !phone && !!data, list.length);
  const pickPin = (id: string | null) => { setActive(id); if (id) pager.reveal(list.findIndex(h => h.id === id)); };
  usePhonePager(phone && !!data, list.length);

  const uniOptions = [...allUniversities()].sort((a, b) => (a.id === home ? -1 : b.id === home ? 1 : 0)).map(u => ({
    value: u.id, label: u.short, sub: u.name, lead: <UniLogo uni={u} size={32} />,
    badge: me && u.id === home ? <Pill tone="primary">Yours</Pill> : undefined }));

  if (!phone) return <>
    <PageHeader title="Find a room" search={false} />
    <div className="explore-split fill">
      <div className="fill-col explore-left">
    <div className={'toolbar-card' + (searchOpen ? ' searching' : '')}>
      <div className="uni"><Dropdown variant="field" label="University" icon={GraduationCap} lead={<UniLogo uni={uni} size={26} className="ic" />} value={uniId} options={uniOptions} onChange={pickUni}
        extra={me && uniId === home && !phone ? <Pill tone="primary">Your university</Pill> : undefined} /></div>
      <button className={'tool-btn' + (chips.length ? ' active' : '')} onClick={() => setFiltersOpen(true)} aria-label={`Filters${chips.length ? `, ${chips.length} on` : ''}`} title="Filters">
        <SlidersHorizontal size={19} />{chips.length > 0 && <span className="dot">{chips.length}</span>}</button>
      <SearchExpand value={q} onChange={setQ} open={searchOpen} setOpen={setSearchOpen} />
      <span className="spacer" />
    </div>

    {chips.length > 0 && <div className="row wrap" style={{ gap: 8 }}>{chips.map(c => <span key={c.key} className="f-chip">{c.label}<button onClick={c.remove} aria-label={`Remove ${c.label}`}><X size={14} /></button></span>)}
      <button className="btn btn-text btn-sm" onClick={() => setF(DEFAULT)}>Clear all</button></div>}

    {me && uniId !== home && <div className="banner warn"><GraduationCap size={18} className="ic" /><span className="grow">You are looking at hostels near <b>{uni.short}</b>, not your university.</span>
      <Btn kind="secondary" size="sm" onClick={() => pickUni(home)}><Undo2 size={15} />Back to {universityById(home)?.short}</Btn></div>}
    {me && !me.emailVerified && <div className="banner primary"><MailWarning size={18} className="ic" /><span className="grow"><b>Confirm your student email to book.</b> You can browse now.</span>
      <Link to="/signup" className="btn btn-primary btn-sm">Confirm email</Link></div>}

        <div className="results-head"><span className="count">{loading && !data ? 'Loading hostels' : <>Showing <b className="num">{list.length}</b>{list.length === 1 ? 'hostel' : 'hostels'}{q && <> matching "{q}"</>}</>}</span>
          <Dropdown label="Sort hostels" icon={ArrowUpDown} value={sort} options={SORTS} onChange={setSort} align="right" /></div>
        <div className="explore-list scroll-y grow-y" ref={listRef}>
          {error ? <ErrorState message={error} onRetry={reload} />
            : loading && !data ? Array.from({ length: 4 }, (_, i) => <div key={i} className="skel" style={{ height: 148, flex: 'none' }} />)
            : list.length === 0 ? <EmptyState icon={<Search size={24} />} title={q ? `Nothing matches "${q}"` : 'No hostels match these filters'} text="Try a higher price, fewer amenities or a different search." action={<Btn kind="secondary" onClick={clear}>Clear search and filters</Btn>} />
            : list.map(h => <HostelRow key={h.id} i={list.indexOf(h)} h={h} userId={me?.id} saved={saved.includes(h.id)} on={h.id === active || h.id === hover} onHover={setHover} />)}
        </div>
      </div>
      <div className="card cmap-card">{data ? <CampusMap uni={uni} hostels={list} active={active} setActive={pickPin} hover={hover} setHover={setHover} /> : <div className="skel" style={{ position: 'absolute', inset: 0 }} />}</div>
    </div>
    {filtersOpen && <FilterModal f={f} setF={setF} count={applyFilters(data ?? [], f, q, sort).length} onClose={() => setFiltersOpen(false)} />}
  </>;

  return <>
    <PageHeader title="Find a room" />
    <div className="m-dock"><div className={'toolbar-card' + (searchOpen ? ' searching' : '')}>
      <div className="uni"><Dropdown variant="field" label="University" icon={GraduationCap} lead={<UniLogo uni={uni} size={26} className="ic" />} value={uniId} options={uniOptions} onChange={pickUni}
        extra={me && uniId === home && !phone ? <Pill tone="primary">Your university</Pill> : undefined} /></div>
      <button className={'tool-btn' + (chips.length ? ' active' : '')} onClick={() => setFiltersOpen(true)} aria-label={`Filters${chips.length ? `, ${chips.length} on` : ''}`} title="Filters">
        <SlidersHorizontal size={19} />{chips.length > 0 && <span className="dot">{chips.length}</span>}</button>
      <SearchExpand value={q} onChange={setQ} open={searchOpen} setOpen={setSearchOpen} />
      <span className="spacer" />
    </div></div>

    {chips.length > 0 && <div className="row wrap" style={{ gap: 8 }}>{chips.map(c => <span key={c.key} className="f-chip">{c.label}<button onClick={c.remove} aria-label={`Remove ${c.label}`}><X size={14} /></button></span>)}
      <button className="btn btn-text btn-sm" onClick={() => setF(DEFAULT)}>Clear all</button></div>}

    {me && uniId !== home && <div className="banner warn"><GraduationCap size={18} className="ic" /><span className="grow">You are looking at hostels near <b>{uni.short}</b>, not your university.</span>
      <Btn kind="secondary" size="sm" onClick={() => pickUni(home)}><Undo2 size={15} />Back to {universityById(home)?.short}</Btn></div>}
    {me && !me.emailVerified && <div className="banner primary"><MailWarning size={18} className="ic" /><span className="grow"><b>Confirm your student email to book.</b> You can browse now.</span>
      <Link to="/signup" className="btn btn-primary btn-sm">Confirm email</Link></div>}

    {error ? <ErrorState message={error} onRetry={reload} />
      : loading && !data ? <div className="x-list">{Array.from({ length: 5 }, (_, i) => <div key={i} className="skel" style={{ height: 124 }} />)}</div>
      : <>
        <div className="results-head"><span className="count"><b className="num">{list.length}</b>{list.length === 1 ? 'hostel' : 'hostels'}{q && <> matching "{q}"</>}</span>
          <Dropdown label="Sort hostels" icon={ArrowUpDown} value={sort} options={SORTS} onChange={setSort} align="right" /></div>
        {list.length === 0 ? <EmptyState icon={<Search size={24} />} title={q ? `Nothing matches "${q}"` : 'No hostels match these filters'} text="Try a higher price, fewer amenities or a different search." action={<Btn kind="secondary" onClick={clear}>Clear search and filters</Btn>} />
          : <div className="x-list">{list.map((h, n) => <HostelRow key={h.id} i={n} h={h} userId={me?.id} saved={saved.includes(h.id)} on={false} onHover={() => {}} />)}</div>}
      </>}
    {filtersOpen && <FilterModal f={f} setF={setF} count={applyFilters(data ?? [], f, q, sort).length} onClose={() => setFiltersOpen(false)} />}
    <div className="m-fade-bottom" aria-hidden="true" />
  </>;
}

/** A search icon that grows into a search bar when tapped. */
function SearchExpand({ value, onChange, open, setOpen }: { value: string; onChange: (v: string) => void; open: boolean; setOpen: (o: boolean) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const close = () => { onChange(''); setOpen(false); input.current?.blur(); }; // blur hides the phone keyboard
  return <div className={'search-x' + (open ? ' open' : '')} role="search">
    <div className="sx-pane">
      <button className="s-icon" onClick={() => { setOpen(true); input.current?.focus({ preventScroll: true }); }} aria-label="Search hostels" aria-expanded={open} tabIndex={open ? -1 : 0}><Search size={19} /></button>
      <input ref={input} value={value} onChange={e => onChange(e.target.value)} placeholder="Search hostel or area" aria-label="Search hostel or area" tabIndex={open ? 0 : -1}
        onKeyDown={e => { if (e.key === 'Escape') close(); }} onBlur={() => { if (!value.trim()) setOpen(false); }} />
      <button className="s-clear" onMouseDown={e => e.preventDefault()} onClick={close} aria-label="Close search" tabIndex={open ? 0 : -1}><X size={17} /></button>
    </div>
  </div>;
}

function applyFilters(all: Hostel[], f: Filters, q: string, sort: Sort) {
  const s = q.trim().toLowerCase();
  return all.filter(h => minPrice(h) <= f.max && h.rating >= f.minR
    && (f.type === 'any' || h.rooms.some(r => r.t.toLowerCase().startsWith(f.type)))
    && (!f.sc || h.rooms.some(r => r.sc)) && f.amen.every(a => h.amen.includes(a))
    && (!s || (h.name + ' ' + h.area).toLowerCase().includes(s)))
    .sort((a, b) => sort === 'rating' ? b.rating - a.rating : sort === 'price' ? minPrice(a) - minPrice(b) : a.km - b.km);
}

function activeChips(f: Filters, setF: (f: Filters) => void) {
  const c: { key: string; label: string; remove: () => void }[] = [];
  if (f.max < MAX) c.push({ key: 'max', label: `Up to ${ugx(f.max)}`, remove: () => setF({ ...f, max: MAX }) });
  if (f.type !== 'any') c.push({ key: 'type', label: f.type === 'single' ? 'Single rooms' : 'Double rooms', remove: () => setF({ ...f, type: 'any' }) });
  if (f.sc) c.push({ key: 'sc', label: 'Self-contained', remove: () => setF({ ...f, sc: false }) });
  f.amen.forEach(a => c.push({ key: a, label: AMENITIES[a]!, remove: () => setF({ ...f, amen: f.amen.filter(x => x !== a) }) }));
  if (f.minR > 0) c.push({ key: 'r', label: `${f.minR}+ stars`, remove: () => setF({ ...f, minR: 0 }) });
  return c;
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button className={'chip' + (on ? ' on' : '')} aria-pressed={on} onClick={onClick}>{on && <Check size={14} />}{children}</button>;
}
function Group({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return <div className="stack-sm" style={{ padding: '16px 0', borderTop: '1px solid var(--line)' }}>{title}{children}</div>;
}

function FilterModal({ f, setF, count, onClose }: { f: Filters; setF: (f: Filters) => void; count: number; onClose: () => void }) {
  return <Overlay title="Filters" onClose={onClose} width={540}
    footer={<><Btn kind="secondary" onClick={() => setF(DEFAULT)}>Clear all</Btn><Btn className="grow" onClick={onClose} disabled={count === 0}>{count === 0 ? 'No hostels match' : `Show ${count} ${count === 1 ? 'hostel' : 'hostels'}`}</Btn></>}>
    <div className="stack-sm" style={{ paddingBottom: 16 }}>
      <div className="row between"><h3>Max price per semester</h3><output className="strong num">{f.max >= MAX ? 'Any price' : ugx(f.max)}</output></div>
      <input type="range" min={400000} max={MAX} step={50000} value={f.max} onChange={e => setF({ ...f, max: +e.target.value })} aria-label="Maximum price per semester" />
      <div className="row between tiny muted num"><span>{ugx(400000)}</span><span>{ugx(MAX)}</span></div>
    </div>
    <Group title={<h3>Room type</h3>}><div className="chips">{(['any', 'single', 'double'] as const).map(k => <Chip key={k} on={f.type === k} onClick={() => setF({ ...f, type: k })}>{k === 'any' ? 'Any' : k === 'single' ? 'Single' : 'Double'}</Chip>)}</div>
      <label className="check" style={{ marginTop: 6 }}><input type="checkbox" checked={f.sc} onChange={e => setF({ ...f, sc: e.target.checked })} />Self-contained only (own bathroom)</label></Group>
    <Group title={<h3>Amenities</h3>}><div className="chips">{Object.entries(AMENITIES).map(([k, l]) => <Chip key={k} on={f.amen.includes(k)} onClick={() => setF({ ...f, amen: f.amen.includes(k) ? f.amen.filter(x => x !== k) : [...f.amen, k] })}>{l}</Chip>)}</div></Group>
    <Group title={<h3>Minimum rating</h3>}><div className="chips">{([[0, 'Any'], [4, '4.0 and up'], [4.5, '4.5 and up']] as const).map(([k, l]) => <Chip key={k} on={f.minR === k} onClick={() => setF({ ...f, minR: k })}>{l}</Chip>)}</div></Group>
  </Overlay>;
}

/** Phone: scrolling down slides the page header away so the search toolbar docks at the top; scrolling up brings it back. */
function useHideTopOnScroll(on: boolean) {
  useEffect(() => {
    if (!on) return;
    let last = window.scrollY, hidden = false, ticking = false;
    const set = (h: boolean) => { if (h !== hidden) { hidden = h; document.body.classList.toggle('m-top-hidden', h); } };
    const docked = () => document.body.classList.toggle('m-docked', window.scrollY > 150);
    const onScroll = () => {
      if (ticking) return; ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY, d = y - last;
        docked();
        set(y > 80); // paging lands each screen under the docked bar, so the header only returns at the top
        if (Math.abs(d) > 6 || y < 80) last = y;
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); document.body.classList.remove('m-top-hidden', 'm-docked'); };
  }, [on]);
}

/**
 * PC list paging. One wheel or trackpad gesture glides the list by three hostels with an eased animation,
 * so every stop shows three whole cards. Dragging the scrollbar or using the keyboard settles on the nearest card.
 */
function usePager(ref: React.RefObject<HTMLDivElement>, on: boolean, count: number) {
  const api = useRef({ reveal: (_i: number) => {} });
  useEffect(() => {
    const el = ref.current; if (!el || !on) return;
    let raf = 0, target = el.scrollTop, lastWheel = 0, used = false, acc = 0, idle = 0;
    const step = () => { const r = el.querySelector<HTMLElement>('.h-row'); if (!r) return 0; return r.offsetHeight + (parseFloat(getComputedStyle(el).rowGap) || 12); };
    const max = () => el.scrollHeight - el.clientHeight;
    const ease = (t: number) => 1 - Math.pow(1 - t, 4);
    const glide = (y: number) => {
      y = Math.max(0, Math.min(max(), Math.round(y))); target = y;
      cancelAnimationFrame(raf);
      const from = el.scrollTop, d = y - from; if (Math.abs(d) < 1) { raf = 0; return; }
      const dur = Math.min(720, 420 + Math.abs(d) * 0.18), t0 = performance.now();
      const tick = (now: number) => { const t = Math.min(1, (now - t0) / dur); el.scrollTop = from + d * ease(t); raf = t < 1 ? requestAnimationFrame(tick) : 0; };
      raf = requestAnimationFrame(tick);
    };
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      const now = performance.now();
      if (now - lastWheel > 200) { used = false; acc = 0; } // a new gesture starts after a short pause
      lastWheel = now;
      if (used) return; // one move per gesture, so trackpad momentum does not skip pages
      acc += e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY;
      if (Math.abs(acc) < 18) return;
      used = true; const s = step(); if (!s) return;
      // pages always start at hostel 1, 4, 7 ...; the last page simply lines up with the end of the list
      const at = Math.round((raf ? target : el.scrollTop) / s);
      glide((acc > 0 ? Math.floor(at / 3) * 3 + 3 : Math.ceil(at / 3) * 3 - 3) * s);
    };
    const onScroll = () => {
      if (raf) return;
      clearTimeout(idle);
      idle = window.setTimeout(() => { const s = step(); if (s && !raf && el.scrollTop < max() - 1) glide(Math.round(el.scrollTop / s) * s); }, 140);
    };
    const onKey = (e: KeyboardEvent) => {
      const s = step(); if (!s) return; const at = Math.round(target / s);
      if ((e.target as HTMLElement).closest('input, textarea')) return;
      const to: Record<string, number> = { PageDown: Math.floor(at / 3) * 3 + 3, PageUp: Math.ceil(at / 3) * 3 - 3, ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: 999 };
      if (to[e.key] === undefined) return;
      e.preventDefault(); glide(to[e.key]! * s);
    };
    api.current.reveal = (i: number) => {
      const s = step(); if (!s || i < 0) return; const at = Math.round(el.scrollTop / s);
      if (i < at) glide(i * s); else if (i > at + 2) glide((i - 2) * s);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('keydown', onKey);
    return () => { cancelAnimationFrame(raf); clearTimeout(idle); el.removeEventListener('wheel', onWheel); el.removeEventListener('scroll', onScroll); el.removeEventListener('keydown', onKey); };
  }, [ref, on, count]);
  return { reveal: (i: number) => api.current.reveal(i) };
}

/**
 * Phone paging, the same feel as PC. The page follows your finger while you drag; when you let go it glides
 * (eased, like PC) to the next or previous screenful of hostels, lined up just under the docked search bar.
 */
function usePhonePager(on: boolean, count: number) {
  useEffect(() => {
    if (!on) return;
    const root = document.scrollingElement || document.documentElement;
    let raf = 0, target = root.scrollTop;
    const ease = (t: number) => 1 - Math.pow(1 - t, 4);
    const max = () => root.scrollHeight - innerHeight;
    const glide = (y: number, speed = 0) => {
      y = Math.max(0, Math.min(max(), Math.round(y))); target = y;
      cancelAnimationFrame(raf);
      const from = root.scrollTop, d = y - from; if (Math.abs(d) < 1) { raf = 0; return; }
      let dur = Math.min(720, 420 + Math.abs(d) * 0.18);
      if (speed > 1.2) dur *= 0.8; // a quick flick lands a little faster
      const t0 = performance.now();
      const tick = (now: number) => { const t = Math.min(1, (now - t0) / dur); root.scrollTop = from + d * ease(t); raf = t < 1 ? requestAnimationFrame(tick) : 0; };
      raf = requestAnimationFrame(tick);
    };
    /** Resting spots: the very top, then the start of each screenful of hostels, then the end of the page. */
    const stops = () => {
      const rows = [...document.querySelectorAll<HTMLElement>('.x-list > .h-row')]; if (!rows.length) return [0];
      const dock = document.querySelector<HTMLElement>('.m-dock'); const tab = document.querySelector<HTMLElement>('.tabbar');
      const safeTop = parseFloat(getComputedStyle(document.querySelector('.m-top') ?? document.body).paddingTop) || 0;
      const pad = (dock?.offsetHeight ?? 84) + safeTop;
      const step = rows.length > 1 ? rows[1]!.getBoundingClientRect().top - rows[0]!.getBoundingClientRect().top : rows[0]!.offsetHeight + 10;
      const avail = innerHeight - pad - (tab?.offsetHeight ?? 67);
      const per = Math.max(1, Math.floor((avail + 10) / step));
      const out = [0];
      rows.forEach((r, i) => { if (i % per === 0) out.push(r.getBoundingClientRect().top + root.scrollTop - pad); });
      const m = max(); return [...new Set(out.map(v => Math.min(m, Math.max(0, Math.round(v)))))].sort((a, b) => a - b);
    };
    const nearest = (list: number[], y: number) => list.reduce((a, b) => (Math.abs(b - y) < Math.abs(a - y) ? b : a), list[0]!);

    let y0 = 0, x0 = 0, s0 = 0, tracking = false, decided = false, vertical = false, startStop = 0;
    let hist: { y: number; t: number }[] = [];
    const blocked = (e: Event) => !!(e.target as HTMLElement).closest('.overlay, .menu, .sheet, input, textarea, [role="dialog"]');
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || blocked(e)) { tracking = false; return; }
      cancelAnimationFrame(raf); raf = 0;
      const t = e.touches[0]!; y0 = t.clientY; x0 = t.clientX; s0 = root.scrollTop; tracking = true; decided = false; vertical = false;
      hist = [{ y: t.clientY, t: performance.now() }];
      const st = stops(); startStop = nearest(st, target === s0 || Math.abs(target - s0) < 2 ? target : s0);
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const t = e.touches[0]!; const dy = t.clientY - y0, dx = t.clientX - x0;
      if (!decided) { if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return; decided = true; vertical = Math.abs(dy) >= Math.abs(dx); }
      if (!vertical) return;
      e.preventDefault();
      let y = s0 - dy; const m = max();
      if (y < 0) y = y * 0.35; else if (y > m) y = m + (y - m) * 0.35; // soft resistance past either end
      root.scrollTop = y;
      hist.push({ y: t.clientY, t: performance.now() }); if (hist.length > 6) hist.shift();
    };
    const onEnd = () => {
      if (!tracking) return; tracking = false;
      if (!vertical) return;
      const a = hist[0]!, b = hist[hist.length - 1]!; const v = (b.y - a.y) / Math.max(1, b.t - a.t); // px per ms, + is finger down
      const moved = root.scrollTop - s0;
      const st = stops(); const i = st.indexOf(startStop);
      let to = nearest(st, root.scrollTop);
      if (Math.abs(v) > 0.25 || Math.abs(moved) > 48) {
        const dir = Math.abs(v) > 0.25 ? (v < 0 ? 1 : -1) : (moved > 0 ? 1 : -1);
        to = st[Math.max(0, Math.min(st.length - 1, (i < 0 ? st.indexOf(to) : i) + dir))]!;
      }
      glide(to, Math.abs(v));
    };
    // Mouse wheel on small windows gets the same one-move-per-gesture paging as PC.
    let lastWheel = 0, used = false, acc = 0;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || blocked(e)) return; e.preventDefault();
      const now = performance.now(); if (now - lastWheel > 200) { used = false; acc = 0; } lastWheel = now;
      if (used) return; acc += e.deltaY; if (Math.abs(acc) < 18) return; used = true;
      const st = stops(); const from = raf ? target : root.scrollTop; const cur = nearest(st, from);
      glide(st[Math.max(0, Math.min(st.length - 1, st.indexOf(cur) + (acc > 0 ? 1 : -1)))]!);
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd); document.addEventListener('touchcancel', onEnd);
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => { cancelAnimationFrame(raf); document.removeEventListener('touchstart', onStart); document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd); document.removeEventListener('touchcancel', onEnd); window.removeEventListener('wheel', onWheel); };
  }, [on, count]);
}
