import { AlertTriangle, Copy, MailCheck, MailX, MessageCircle, Phone, RefreshCw, Send, UserMinus, UserPlus, X } from 'lucide-react';
import { useState } from 'react';
import { Dropdown } from '../../components/Dropdown';
import { Overlay } from '../../components/Overlay';
import { PageHeader } from '../../components/PageHeader';
import { Pill } from '../../components/Pill';
import { EmptyState, ErrorState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { Avatar, Btn, Field, Skeleton, TextInput, ActionButton } from '../../components/ui';
import type { Hostel, User } from '../../data/types';
import { copyText, timeAgo } from '../../lib/format';
import { useIsPhone } from '../../lib/useIsPhone';
import { live } from '../../services/supabase';
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
              <ActionButton className="vm-btn" onClick={async () => { try { const to = await resendInvite(i.code); toast(to ? `Invite emailed again to ${to}` : `Invite for ${i.name.split(' ')[0]} renewed for 7 days`); } catch (x) { toast(`Renewed for 7 days, but ${(x as Error).message.charAt(0).toLowerCase()}${(x as Error).message.slice(1)}`); } }} aria-label={`Resend invite to ${i.name}`} title="Resend"><RefreshCw size={16} /></ActionButton>
              <ActionButton className="vm-btn" onClick={async () => { try { await cancelInvite(i.code); toast('Invite cancelled'); } catch (x) { toast((x as Error).message); } }} aria-label={`Cancel invite to ${i.name}`} title="Cancel"><X size={16} /></ActionButton>
            </div>; })}
          </section>; })}</div>}
    {invite && data && <InviteDialog hostels={live} start={invite} onClose={() => setInvite(null)} />}
    {remove && <Overlay title={`Remove ${remove.name.split(' ')[0]}?`} onClose={() => setRemove(null)} width={440}
      footer={<><Btn kind="secondary" onClick={() => setRemove(null)}>Keep</Btn><Btn kind="danger" onClick={async () => { try { await removeCustodian(remove.id); toast(`${remove.name} removed`); setRemove(null); } catch (x) { toast((x as Error).message); } }}><UserMinus size={15} />Remove</Btn></>}>
      <p>{remove.name.split(' ')[0]} will be logged out and can no longer open {data?.hostels.find(h => h.id === remove.hostelId)?.name}. This cannot be undone.</p></Overlay>}
  </>;
}

function InviteDialog({ hostels, start, onClose }: { hostels: Hostel[]; start: string; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ hid: start, name: '', contact: '' }); const [err, setErr] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false); const [res, setRes] = useState<{ code: string; emailed: string | null; emailError: string | null } | null>(null);
  const code = res?.code ?? null;
  const h = hostels.find(x => x.id === f.hid)!;
  async function go() { setBusy(true); setErr({}); try { setRes(await inviteCustodian(f.hid, f.name, f.contact)); } catch (x) { const a = x as ApiError; setErr({ [a.field ?? 'name']: a.message }); } finally { setBusy(false); } }
  // The link opens the invite screen with the code already filled in, on whatever address Nestly is running at.
  const link = code && `${window.location.origin}/invite?code=${encodeURIComponent(code)}`;
  const msg = code && `Hello ${f.name.split(' ')[0]}, you are invited to work as custodian at ${h.name} on Nestly. Open this link to set up your account: ${link}\nYour invite code is ${code} if it asks. It works for 7 days.`;
  if (code) return <Overlay title={res?.emailed ? 'Invite sent' : 'Invite ready'} onClose={onClose} width={440} footer={<Btn onClick={onClose}>Done</Btn>}>
    <div className="stack center">
      {res?.emailed
        ? <div className="banner success" style={{ textAlign: 'left' }}><MailCheck size={18} className="ic" /><span className="grow">{live ? <>We emailed the invite to <b>{res.emailed}</b>. Ask {f.name.split(' ')[0]} to check their inbox, and spam if it is not there.</> : <>Demo mode: on the live site this invite is emailed to <b>{res.emailed}</b>. No email is sent here.</>}</span></div>
        : res?.emailError ? <div className="banner warn" style={{ textAlign: 'left' }}><MailX size={18} className="ic" /><span className="grow">{res.emailError}</span></div> : null}
      <p className="muted">{res?.emailed ? 'You can also send it yourself. The link opens the invite screen with this code filled in, and works for 7 days.' : `Send ${f.name.split(' ')[0]} the link. It opens the invite screen with this code already filled in, and works for 7 days.`}</p>
      <div className="code-big num">{code}</div>
      <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
        <Btn kind="secondary" size="sm" onClick={async () => toast((await copyText(msg!)) ? 'Invite message copied' : 'Could not copy. Select the code instead.')}><Copy size={15} />Copy message</Btn>
        <a className="btn btn-secondary btn-sm" href={`https://wa.me/?text=${encodeURIComponent(msg!)}`} target="_blank" rel="noreferrer"><MessageCircle size={15} />Share on WhatsApp</a>
      </div></div></Overlay>;
  return <Overlay title="Invite a custodian" onClose={onClose} width={460} footer={<><Btn kind="secondary" onClick={onClose}>Cancel</Btn><Btn loading={busy} onClick={go}>{f.contact.includes('@') ? <><Send size={15} />Send invite</> : <><UserPlus size={15} />Create invite</>}</Btn></>}>
    <div className="stack">
      {hostels.length > 1 && <div className="field"><span className="label">Hostel</span><Dropdown variant="field" label="Hostel" value={f.hid} onChange={hid => setF({ ...f, hid })} options={hostels.map(x => ({ value: x.id, label: x.name }))} /></div>}
      <Field id="iv-n" label="Their full name" error={err.name}><TextInput id="iv-n" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} error={err.name} placeholder="Agnes Nakato" /></Field>
      <Field id="iv-c" label="Their email" error={err.contact} hint={err.contact ? undefined : 'We email them the invite. No email? Enter their phone number and share the invite on WhatsApp.'}><TextInput id="iv-c" type="text" inputMode="email" autoComplete="off" value={f.contact} onChange={e => setF({ ...f, contact: e.target.value })} error={err.contact} placeholder="agnes@gmail.com" /></Field>
      <p className="tiny muted">They set their own username and password from the invite.</p>
    </div></Overlay>;
}
