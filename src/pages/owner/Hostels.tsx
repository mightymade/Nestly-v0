import { Building2, ChevronRight, Plus, UserCog } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState, ErrorState } from '../../components/States';
import { Art, Btn } from '../../components/ui';
import { useIsPhone } from '../../lib/useIsPhone';
import { createHostelDraft, listOwnerHostels, minPrice, universityById } from '../../services/api';
import { ugx } from '../../lib/format';
import { useData } from '../../services/useData';
import { HostelPill, useOwner } from './shared';

export function OwnerHostels() {
  const { me } = useOwner(); const nav = useNavigate(); const phone = useIsPhone();
  const { data, loading, error, reload } = useData(() => listOwnerHostels(me.id), [me.id]);
  const [busy, setBusy] = useState(false);
  const add = async () => { setBusy(true); const h = await createHostelDraft(me.id); nav(`/o/hostels/${h.id}`); };
  const addBtn = <Btn loading={busy} onClick={add}><Plus size={17} />Add a hostel</Btn>;
  const list = data ?? [];
  return <>
    <PageHeader title="Hostels" actions={addBtn} />
    {error ? <ErrorState message={error} onRetry={reload} />
      : loading && !data ? <div className="oh-grid">{[0, 1, 2].map(i => <div key={i} className="skel" style={{ height: 260 }} />)}</div>
      : !list.length ? <div className="card card-pad"><EmptyState bare icon={<Building2 size={24} />} title="No hostels yet" text="Add your first hostel. It goes live after the Nestly team checks it." action={addBtn} /></div>
      : <div className={phone ? 'x-list' : 'oh-grid fill scroll-y oh-scroll'}>{list.map(({ hostel: h, beds, custodians }, i) => <Link key={h.id} to={`/o/hostels/${h.id}`}
          className={'card oh-card' + (phone ? ' m' : '')} style={{ animationDelay: `${i * 50}ms` }} aria-label={`Edit ${h.name || 'untitled hostel'}`}>
          <div className="oh-media"><Art hostel={h} /><span className="oh-pill"><HostelPill h={h} /></span></div>
          <div className="oh-body">
            <div className="row between" style={{ gap: 8 }}><b className="ink clamp1">{h.name || 'Untitled hostel'}</b><ChevronRight size={18} className="muted" /></div>
            <span className="tiny muted clamp1">{h.area || 'No area yet'}{h.area && ` · ${universityById(h.uni)?.short}`}</span>
            {h.status === 'live' || beds.total ? <div className="bar-line"><span className="bar"><i style={{ width: `${beds.total ? (beds.taken / beds.total) * 100 : 0}%` }} /></span><span className="tiny num">{beds.taken} of {beds.total} beds</span></div> : null}
            <div className="row between tiny muted" style={{ gap: 8 }}>
              <span>{h.rooms.length ? `From ${ugx(minPrice(h))}` : 'No prices yet'}</span>
              {h.status === 'live' && <span className={'row-sm' + (custodians ? '' : ' warn-t strong')}><UserCog size={13} />{custodians ? `${custodians} custodian${custodians > 1 ? 's' : ''}` : 'No custodian'}</span>}
            </div>
            {h.status === 'changes_requested' && h.reviewNote && <p className="tiny danger-t clamp2">{h.reviewNote}</p>}
          </div>
        </Link>)}</div>}
  </>;
}
