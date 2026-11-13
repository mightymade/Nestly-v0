import { AlertTriangle, Copy, MessageCircle, Phone, RefreshCw, UserMinus, UserPlus, X } from 'lucide-react';
import { useState } from 'react';
import { Dropdown } from '../../components/Dropdown';
import { Overlay } from '../../components/Overlay';
import { PageHeader } from '../../components/PageHeader';
import { Pill } from '../../components/Pill';
import { EmptyState, ErrorState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { Avatar, Btn, Field, Skeleton, TextInput } from '../../components/ui';
import type { Hostel, User } from '../../data/types';
import { copyText, timeAgo } from '../../lib/format';
import { useIsPhone } from '../../lib/useIsPhone';
import { ApiError, cancelInvite, inviteCustodian, inviteExpired, listCustodians, removeCustodian, resendInvite } from '../../services/api';
import { useData } from '../../services/useData';
import { Locked, useOwner } from './shared';

export function Staff() {
  const { me, approved } = useOwner();
  if (!approved) return <><PageHeader title="Staff" search={false} /><Locked what="Staff" /></>;
  return <View ownerId={me.id} />;
}

function View({ ownerId }: { ownerId: string }) {
  const phone = useIsPhone(); const toast = useToast();
  const { data, loading, error, reload } = useData(() => listCustodians(ownerId), [ownerId]);
  const [invite, setInvite] = useState<string | null>(null); const [remove, setRemove] = useState<User | null>(null);
  if (error) return <><PageHeader title="Staff" /><ErrorState message={error} onRetry={reload} /></>;
  const live = (data?.hostels ?? []).filter(h => h.status === 'live' || h.status === 'suspended');
  const inviteBtn = (hid?: string) => <Btn size="sm" onClick={() => setInvite(hid ?? live[0]?.id ?? null)} disabled={!live.length}><UserPlus size={15} />Invite a custodian</Btn>;
  return <>
    <PageHeader title="Staff" actions={!phone ? inviteBtn() : undefined} />
    {phone && <div className="row end">{inviteBtn()}</div>}
    {loading && !data ? <Skeleton rows={2} h={150} />
      : !live.length ? <div className="card card-pad"><EmptyState bare icon={<UserPlus size={24} />} title="No live hostels yet" text="Custodians can be invited once a hostel is live." /></div>
      : <div className={phone ? 'stack' : 'staff-grid fill scroll-y'}>{live.map(h => {
          const staff = data!.staff.filter(u => u.hostelId === h.id); const inv = data!.invites.filter(i => i.hostelId === h.id);
          return <section key={h.id} className="card card-pad staff-card" aria-label={h.name}>
            <div className="row between" style={{ gap: 8 }}><h2 style={{ fontSize: 17 }} className="clamp1">{h.name}</h2>{!phone && <button className="btn btn-text btn-sm" onClick={() => setInvite(h.id)}><UserPlus size={15} />Invite</button>}</div>
            {!staff.length && <div className="att warn"><AlertTriangle size={16} /><span className="grow">No custodian yet. Visitors and arrivals are not being handled.</span></div>}
            {staff.map(u => <div key={u.id} className="staff-row">
              <Avatar user={u} size={40} />
              <div className="min0 grow"><b className="ink clamp1">{u.name}</b><span className="tiny muted clamp1">@{u.username}{u.lastActive ? ` · active ${timeAgo(u.lastActive)}` : ''}</span></div>
              <Pill tone="success">Active</Pill>
              {u.phone && <a className="vm-btn" href={`tel:${u.phone.replace(/\s/g, '')}`} aria-label={`Call ${u.name}`}><Phone size={16} /></a>}
              <button className="vm-btn" onClick={() => setRemove(u)} aria-label={`Remove ${u.name}`} title="Remove"><UserMinus size={16} /></button>
            </div>)}
            {inv.map(i => { const old = inviteExpired(i); return <div key={i.code} className="staff-row">
              <Avatar user={{ name: i.name }} size={40} />
              <div className="min0 grow"><b className="ink clamp1">{i.name}</b><span className="tiny muted clamp1">Code <b className="num">{i.code}</b> · {old ? 'expired' : `sent ${i.at ? timeAgo(i.at) : ''}`}</span></div>
              <Pill tone={old ? 'danger' : 'warn'}>{old ? 'Expired' : 'Invited'}</Pill>
              <button className="vm-btn" onClick={async () => { await resendInvite(i.code); toast(`Invite for ${i.name.split(' ')[0]} renewed for 7 days`); }} aria-label={`Resend invite to ${i.name}`} title="Resend"><RefreshCw size={16} /></button>
              <button className="vm-btn" onClick={async () => { await cancelInvite(i.code); toast('Invite cancelled'); }} aria-label={`Cancel invite to ${i.name}`} title="Cancel"><X size={16} /></button>
            </div>; })}
          </section>; })}</div>}
    {invite && data && <InviteDialog hostels={live} start={invite} onClose={() => setInvite(null)} />}
    {remove && <Overlay title={`Remove ${remove.name.split(' ')[0]}?`} onClose={() => setRemove(null)} width={440}
      footer={<><Btn kind="secondary" onClick={() => setRemove(null)}>Keep</Btn><Btn kind="danger" onClick={async () => { await removeCustodian(remove.id); toast(`${remove.name} removed`); setRemove(null); }}><UserMinus size={15} />Remove</Btn></>}>
      <p>{remove.name.split(' ')[0]} will be logged out and can no longer open {data?.hostels.find(h => h.id === remove.hostelId)?.name}. This cannot be undone.</p></Overlay>}
  </>;
}

function InviteDialog({ hostels, start, onClose }: { hostels: Hostel[]; start: string; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ hid: start, name: '', contact: '' }); const [err, setErr] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false); const [code, setCode] = useState<string | null>(null);
  const h = hostels.find(x => x.id === f.hid)!;
  async function go() { setBusy(true); setErr({}); try { setCode(await inviteCustodian(f.hid, f.name, f.contact)); } catch (x) { const a = x as ApiError; setErr({ [a.field ?? 'name']: a.message }); } finally { setBusy(false); } }
  const msg = code && `Hello ${f.name.split(' ')[0]}, you are invited to work as custodian at ${h.name} on Nestly. Open nestly.app, choose "I have an invite code" and enter ${code}. The code works for 7 days.`;
  if (code) return <Overlay title="Invite ready" onClose={onClose} width={440} footer={<Btn onClick={onClose}>Done</Btn>}>
    <div className="stack center">
      <p className="muted">Share this code with {f.name.split(' ')[0]}. It works for 7 days.</p>
      <div className="code-big num">{code}</div>
      <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
        <Btn kind="secondary" size="sm" onClick={async () => toast((await copyText(code)) ? 'Code copied' : 'Could not copy. Select the code instead.')}><Copy size={15} />Copy</Btn>
        <a className="btn btn-secondary btn-sm" href={`https://wa.me/?text=${encodeURIComponent(msg!)}`} target="_blank" rel="noreferrer"><MessageCircle size={15} />Share on WhatsApp</a>
      </div></div></Overlay>;
  return <Overlay title="Invite a custodian" onClose={onClose} width={460} footer={<><Btn kind="secondary" onClick={onClose}>Cancel</Btn><Btn loading={busy} onClick={go}><UserPlus size={15} />Create invite</Btn></>}>
    <div className="stack">
      {hostels.length > 1 && <div className="field"><span className="label">Hostel</span><Dropdown variant="field" label="Hostel" value={f.hid} onChange={hid => setF({ ...f, hid })} options={hostels.map(x => ({ value: x.id, label: x.name }))} /></div>}
      <Field id="iv-n" label="Their full name" error={err.name}><TextInput id="iv-n" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} error={err.name} placeholder="Agnes Nakato" /></Field>
      <Field id="iv-c" label="Phone number or email" error={err.contact}><TextInput id="iv-c" value={f.contact} onChange={e => setF({ ...f, contact: e.target.value })} error={err.contact} placeholder="0772 123 456" /></Field>
      <p className="tiny muted">They set their own username and password with the code.</p>
    </div></Overlay>;
}
