import { Building2, MapPin, Pencil, Plus, Trash2, UserCog } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AmenityChips } from '../../components/HostelCard';
import { Pill } from '../../components/Pill';
import { Overlay } from '../../components/Overlay';
import { useToast } from '../../components/Toast';
import type { Hostel } from '../../data/types';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState, ErrorState } from '../../components/States';
import { Art, Btn, Rating } from '../../components/ui';
import { useIsPhone } from '../../lib/useIsPhone';
import { createHostelDraft, deleteHostelDraft, listOwnerHostels, minPrice, universityById } from '../../services/api';
import { ugx } from '../../lib/format';
import { useData } from '../../services/useData';
import { HostelPill, useOwner } from './shared';

export function OwnerHostels() {
  const { me } = useOwner(); const nav = useNavigate(); const phone = useIsPhone();
  const { data, loading, error, reload } = useData(() => listOwnerHostels(me.id), [me.id]);
  const [busy, setBusy] = useState(false); const toast = useToast();
  const [del, setDel] = useState<Hostel | null>(null); const [deleting, setDeleting] = useState(false);
  const remove = async () => { if (!del) return; setDeleting(true); try { await deleteHostelDraft(del.id); toast('Hostel deleted'); setDel(null); reload(); } catch (x) { toast((x as Error).message); } finally { setDeleting(false); } };
  const add = async () => { setBusy(true); const h = await createHostelDraft(me.id); nav(`/o/hostels/${h.id}`); };
  const addBtn = <Btn loading={busy} onClick={add}><Plus size={17} />Add a hostel</Btn>;
  const list = data ?? [];
  return <>
    <PageHeader title="Hostels" actions={addBtn} />
    {error ? <ErrorState message={error} onRetry={reload} />
      : loading && !data ? <div className="saved-grid">{[0, 1, 2].map(i => <div key={i} className="skel" style={{ height: 340 }} />)}</div>
      : !list.length ? <div className="card card-pad"><EmptyState bare icon={<Building2 size={24} />} title="No hostels yet" text="Add your first hostel. It goes live after the Nestly team checks it." action={addBtn} /></div>
      : <div className={'saved-grid' + (phone ? '' : ' fill scroll-y oh-scroll')} style={{ alignContent: 'start' }}>{list.map(({ hostel: h, beds, custodians }, i) => <div key={h.id} className="saved-item" style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}>
        <Link to={`/o/hostels/${h.id}`} className="card lift h-card" aria-label={`Edit ${h.name || 'untitled hostel'}`}>
          <div className="h-media"><Art hostel={h} />
            <HostelPill h={h} />
            {h.km ? <span className="dist"><MapPin size={12} />{h.km} km</span> : null}</div>
          {h.status === 'draft'
            ? <button type="button" className="save-btn" aria-label={`Delete ${h.name || 'untitled hostel'}`} onClick={e => { e.preventDefault(); e.stopPropagation(); setDel(h); }}><Trash2 size={17} /></button>
            : <span className="save-btn" aria-hidden="true"><Pencil size={17} /></span>}
          <div className="h-body">
            <div className="h-title"><h3 className="clamp1" title={h.name}>{h.name || 'Untitled hostel'}</h3>{h.status === 'live' && <Rating value={h.rating} count={h.nRev} />}</div>
            <p className="h-area clamp1">{h.area ? `${h.area} · ${universityById(h.uni)?.short ?? ''}` : 'No area yet'}</p>
            {h.amen.length > 0 && <AmenityChips h={h} />}
            {h.status === 'live' || beds.total ? <div className="bar-line"><span className="bar"><i style={{ width: `${beds.total ? (beds.taken / beds.total) * 100 : 0}%` }} /></span><span className="tiny num">{beds.taken} of {beds.total} beds</span></div> : null}
            {h.status === 'changes_requested' && h.reviewNote && <p className="tiny danger-t clamp2">{h.reviewNote}</p>}
            <div className="h-foot">
              <div><div className="from">{h.rooms.length ? 'From' : 'Prices'}</div><div className="price">{h.rooms.length ? <>{ugx(minPrice(h))}<span> / sem</span></> : <span>Not set yet</span>}</div></div>
              {h.status === 'live' && (custodians ? <Pill tone="neutral"><UserCog size={13} />{custodians} custodian{custodians > 1 ? 's' : ''}</Pill> : <Pill tone="warn"><UserCog size={13} />No custodian</Pill>)}
            </div>
          </div>
        </Link></div>)}</div>}
    {del && <Overlay title="Delete this hostel?" onClose={() => setDel(null)} width={420}
      footer={<><Btn kind="secondary" onClick={() => setDel(null)}>Keep it</Btn><Btn kind="danger" loading={deleting} onClick={remove}><Trash2 size={16} />Delete hostel</Btn></>}>
      <p>{del.name ? <b className="ink">{del.name}</b> : 'This draft'} and everything you entered for it will be removed. This cannot be undone.</p></Overlay>}
  </>;
}
