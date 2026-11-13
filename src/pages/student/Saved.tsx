import { ArrowUpDown, Compass, Heart } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Dropdown } from '../../components/Dropdown';
import { HostelCard, HostelRow } from '../../components/HostelCard';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState, ErrorState } from '../../components/States';
import type { Hostel } from '../../data/types';
import { useIsPhone } from '../../lib/useIsPhone';
import { listSaved, minPrice } from '../../services/api';
import { useMe } from '../../services/session';
import { useData } from '../../services/useData';

type Sort = 'recent' | 'distance' | 'price' | 'rating';
const SORTS: { value: Sort; label: string }[] = [
  { value: 'recent', label: 'Recently saved' }, { value: 'distance', label: 'Nearest first' },
  { value: 'price', label: 'Cheapest first' }, { value: 'rating', label: 'Top rated' },
];
let remembered: Sort = 'recent';

function order(list: Hostel[], s: Sort) {
  const l = [...list];
  if (s === 'recent') return l.reverse();
  return l.sort((a, b) => s === 'distance' ? a.km - b.km : s === 'price' ? minPrice(a) - minPrice(b) : b.rating - a.rating);
}

/** The student's saved hostels. Tap one to see its rooms and book; the heart removes it (with undo). */
export function Saved() {
  const me = useMe(); const phone = useIsPhone();
  const { data, loading, error, reload } = useData(() => listSaved(me.id), [me.id]);
  const [sort, setSortState] = useState<Sort>(remembered);
  const setSort = (s: Sort) => { remembered = s; setSortState(s); };
  const list = useMemo(() => order(data ?? [], sort), [data, sort]);
  const n = list.length;

  const sortMenu = n > 1 && <Dropdown label="Sort saved hostels" icon={ArrowUpDown} value={sort} options={SORTS} onChange={setSort} align="right" />;
  const head = <div className="results-head saved-head">
    <span className="count">{loading && !data ? 'Loading' : <><b className="num">{n}</b>{n === 1 ? 'saved hostel' : 'saved hostels'}</>}</span>{sortMenu}</div>;

  const body = error ? <ErrorState message={error} onRetry={reload} />
    : loading && !data ? <div className={phone ? 'x-list' : 'saved-grid'}>{Array.from({ length: phone ? 4 : 6 }, (_, i) => <div key={i} className="skel" style={{ height: phone ? 112 : 330 }} />)}</div>
    : n === 0 ? <EmptyState icon={<Heart size={24} />} title="No saved hostels yet"
        text="Tap the heart on any hostel while you browse and it will wait for you here."
        action={<Link to="/s/explore" className="btn btn-primary"><Compass size={17} />Explore hostels</Link>} />
    : phone ? <div className="x-list">{list.map((h, i) => <HostelRow key={h.id} i={i} h={h} userId={me.id} saved on={false} onHover={() => {}} />)}</div>
    : <div className="saved-grid">{list.map((h, i) => <div key={h.id} className="saved-item" style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}><HostelCard h={h} userId={me.id} saved /></div>)}</div>;

  if (phone) return <>
    <PageHeader title="Saved" />
    {n > 0 && head}{body}
  </>;

  return <>
    <PageHeader title="Saved" />
    <div className="saved fill">
      {n > 0 && head}
      <div className="saved-scroll scroll-y grow-y">{body}</div>
    </div>
  </>;
}
