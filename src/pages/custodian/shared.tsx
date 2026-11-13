import { AlertTriangle, Check, Clock, LogIn, LogOut, Printer, Search, ShieldCheck, Smartphone } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Overlay } from '../../components/Overlay';
import { useToast } from '../../components/Toast';
import { Art, Avatar, Btn, Field, TextInput } from '../../components/ui';
import type { Visitor } from '../../data/types';
import { closingMin, nowMin, t12 } from '../../lib/visitTime';
import { qrSvg } from '../../lib/art';
import { LOGO_SVG } from '../../components/LogoMark';
import { hostelById, listTenants, listVisitors, signInVisitor, signOutVisitor } from '../../services/api';
import { useMe } from '../../services/session';
import { useData } from '../../services/useData';

export const useHostelId = () => useMe().hostelId!;

/** Residents a visitor can choose from. Only people currently living here. */
function useResidents(hid: string) {
  const { data } = useData(() => listTenants(hid), [hid]);
  return (data ?? []).filter(t => t.status === 'in' && t.roomId).sort((a, b) => a.name.localeCompare(b.name));
}
type Host = { name: string; room: string };

/**
 * "Who are you visiting?" Search by name or room. For privacy, a visitor at the gate sees residents only
 * after typing two letters, so nobody can scroll a full list of who lives in which room.
 */
export function HostPicker({ hid, id, value, onChange, error, showAll = false }: { hid: string; id: string; value: Host | null; onChange: (h: Host | null) => void; error?: string | null; showAll?: boolean }) {
  const people = useResidents(hid); const [q, setQ] = useState('');
  const s = q.trim().toLowerCase();
  const list = s.length >= 2 || (showAll && !s) ? people.filter(t => !s || `${t.name} ${t.room}`.toLowerCase().includes(s)).slice(0, 6) : [];
  if (value) return <div className={'host-chosen' + (error ? ' bad' : '')}>
    <Avatar user={{ name: value.name }} size={38} />
    <span className="grow min0"><b className="ink clamp1">{value.name}</b><span className="small muted">Room {value.room}</span></span>
    <button type="button" className="btn btn-text btn-sm" onClick={() => { onChange(null); setQ(''); }}>Change</button></div>;
  return <div className="host-pick">
    <div className="input-wrap has-lead"><span className="lead"><Search size={17} /></span>
      <input id={id} className={'input' + (error ? ' bad' : '')} value={q} onChange={e => setQ(e.target.value)} placeholder="Type their name or room" autoComplete="off" aria-invalid={!!error || undefined} /></div>
    {list.length > 0 && <ul className="host-list" role="listbox" aria-label="Residents">{list.map(t => <li key={t.id}>
      <button type="button" role="option" aria-selected={false} onClick={() => onChange({ name: t.name, room: t.room })}>
        <Avatar user={{ name: t.name }} size={32} /><span className="grow min0"><b className="ink clamp1">{t.name}</b></span><span className="room-tag">{t.room}</span></button></li>)}</ul>}
    {s.length >= 2 && !list.length && <span className="hint">Nobody matches "{q}". Check the spelling or ask the custodian.</span>}
  </div>;
}

export function LogVisitor({ onClose }: { onClose: () => void }) {
  const hid = useHostelId(); const toast = useToast();
  const [f, setF] = useState<{ name: string; host: Host | null; phone: string }>({ name: '', host: null, phone: '' }); const [err, setErr] = useState<Record<string, string | null>>({}); const [busy, setBusy] = useState(false);
  async function go(e?: FormEvent) {
    e?.preventDefault();
    const x = { name: f.name.trim().split(/\s+/).length < 2 ? 'Enter the visitor’s first and last name.' : null, host: !f.host ? 'Choose who they are visiting.' : null,
      phone: !phoneValid(f.phone) ? 'Enter a 10-digit number, like 0772 123 456.' : null };
    setErr(x); if (x.name || x.host || x.phone) { document.getElementById(x.name ? 'lv-name' : x.host ? 'lv-host' : 'lv-phone')?.focus(); return; }
    setBusy(true); await signInVisitor(hid, { name: f.name.trim(), room: f.host!.room, host: f.host!.name, phone: f.phone.trim() }, 'Custodian'); toast(`${f.name.split(' ')[0]} signed in`); onClose();
  }
  return <Overlay title="Log a visitor" onClose={onClose} width={460} footer={<Btn block loading={busy} onClick={() => go()}><LogIn size={16} />Sign visitor in</Btn>}>
    <form className="stack" onSubmit={go} noValidate>
      <p className="muted small">For visitors without a smartphone. The entry is marked as logged by you.</p>
      <Field id="lv-name" label="Visitor's full name" error={err.name}><TextInput id="lv-name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} error={err.name} /></Field>
      <Field id="lv-host" label="Visiting" error={err.host}><HostPicker hid={hid} id="lv-host" showAll value={f.host} onChange={host => { setF({ ...f, host }); setErr({ ...err, host: null }); }} error={err.host} /></Field>
      <Field id="lv-phone" label="Phone number" error={err.phone} hint="So you can reach them if needed."><TextInput id="lv-phone" type="tel" inputMode="tel" value={f.phone} onChange={e => { setF({ ...f, phone: e.target.value }); setErr({ ...err, phone: null }); }} error={err.phone} placeholder="0772 123 456" /></Field>
      <button type="submit" hidden />
    </form></Overlay>;
}

/** 07XXXXXXXX or +2567XXXXXXXX, spaces and dashes allowed. */
export const phoneValid = (p: string) => { const x = p.replace(/[\s-]/g, ''); return /^07\d{8}$/.test(x) || /^\+?2567\d{8}$/.test(x); };
/** The link the gate QR opens on a visitor's phone. */
export const visitUrl = (hid: string) => `${location.origin}/visit/${hid}`;
const visitKey = (hid: string) => `nestly.visit.${hid}`;

/** The phone screen a visitor gets after scanning the gate QR. On a real phone it remembers the visit, so scanning again on the way out shows the pass and Sign out. */
export function VisitorScreen({ hid, onDone, remember }: { hid: string; onDone: () => void; remember?: boolean }) {
  const h = hostelById(hid)!; const toast = useToast();
  const [f, setF] = useState<{ name: string; phone: string; host: Host | null; ok: boolean }>({ name: '', phone: '', host: null, ok: false });
  const [busy, setBusy] = useState(false); const [done, setDone] = useState<Visitor | null>(null); const [left, setLeft] = useState(false);
  const close = closingMin(h.visit); const open = close === null || nowMin() < close;
  const phoneOk = phoneValid(f.phone);
  useEffect(() => { if (!remember) return; let id: string | null = null; try { id = localStorage.getItem(visitKey(hid)); } catch { /* storage blocked */ }
    if (id) listVisitors(hid).then(vs => { const v = vs.find(x => x.id === id && !x.tout); if (v) setDone(v); }); }, [hid, remember]);
  const keep = (v: Visitor | null) => { if (!remember) return; try { v ? localStorage.setItem(visitKey(hid), v.id) : localStorage.removeItem(visitKey(hid)); } catch { /* storage blocked */ } };
  const ready = f.name.trim().split(/\s+/).length >= 2 && !!f.host && phoneOk && f.ok;
  const [tried, setTried] = useState(false);
  async function go(e: FormEvent) { e.preventDefault(); setTried(true); if (!ready) return; setBusy(true); const v = await signInVisitor(hid, { name: f.name.trim(), room: f.host!.room, host: f.host!.name, phone: f.phone.trim() }, 'QR'); keep(v); setDone(v); setBusy(false); }
  return <div className="visitor-phone"><div className="screen">
    <div className="vp-head">
      <div className="vp-brand"><span className="vp-thumb"><Art hostel={h} /></span><span className="min0"><b className="clamp1">{h.name}</b><span>Visitor sign-in</span></span></div>
      <span className={'vp-hours' + (open ? '' : ' closed')}><Clock size={13} />{open ? `Open today ${h.visit.replace(/:00/g, '')}` : 'Visiting hours are over'}</span>
    </div>
    {left ? <div className="vp-body vp-done">
        <span className="vp-badge out"><LogOut size={26} /></span><h3>Signed out</h3><p className="small muted">Thanks for visiting {h.name}. Have a safe trip.</p>
        <Btn kind="secondary" block onClick={onDone}>Close</Btn></div>
      : done ? <div className="vp-body vp-done">
        <span className="vp-badge"><Check size={28} /></span><h3>You're signed in</h3>
        <div className="vp-pass">
          <div className="row-sm"><Avatar user={{ name: done.host ?? '' }} size={40} /><div className="min0"><span className="tiny muted">Visiting</span><b className="ink clamp1">{done.host}</b></div></div>
          <div className="vp-pass-grid"><div><span className="tiny muted">Room</span><b className="ink">{done.room}</b></div><div><span className="tiny muted">Time in</span><b className="ink">{t12(done.tin)}</b></div><div><span className="tiny muted">Visitor</span><b className="ink clamp1">{done.name.split(' ')[0]}</b></div></div>
        </div>
        <p className="tiny muted center">Show this screen at the gate if asked. Scan the same code when you leave.</p>
        <Btn block onClick={async () => { await signOutVisitor(done.id); keep(null); setLeft(true); toast('Visitor signed out'); }}><LogOut size={16} />Sign out now</Btn>
        <button type="button" className="btn btn-text btn-sm" onClick={onDone}>Done</button></div>
      : <form className="vp-body" onSubmit={go} noValidate>
        {!open && <div className="banner warn small"><AlertTriangle size={15} className="ic" /><span>Visiting hours are over. You can still sign in, but the custodian may ask you to leave.</span></div>}
        <Field id="vq-name" label="Your full name"><TextInput id="vq-name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} autoComplete="name" placeholder="First and last name" /></Field>
        <Field id="vq-host" label="Who are you visiting?"><HostPicker hid={hid} id="vq-host" value={f.host} onChange={host => setF({ ...f, host })} /></Field>
        <Field id="vq-phone" label="Your phone number" error={tried && !phoneOk ? 'Enter a 10-digit number, like 0772 123 456.' : null} hint="The custodian may call if they need to reach you.">
          <TextInput id="vq-phone" type="tel" inputMode="tel" autoComplete="tel" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} error={tried && !phoneOk ? 'x' : null} placeholder="0772 123 456" /></Field>
        <label className="check small"><input type="checkbox" checked={f.ok} onChange={e => setF({ ...f, ok: e.target.checked })} />
          <span>I agree that {h.name} keeps my name and visit time for security.</span></label>
        <Btn type="submit" block loading={busy} disabled={!f.ok}><LogIn size={16} />Sign in</Btn>
        <p className="tiny muted center row-sm" style={{ justifyContent: 'center' }}><ShieldCheck size={13} />Only {h.name} can see this. Powered by Nestly.</p>
      </form>}
  </div></div>;
}

const esc = (x: string) => x.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
/**
 * Prints an A4 poster for the gate. It is built in a hidden frame of its own, so the app's
 * phone or PC layout can never get mixed into the printout.
 */
function printPoster(hostel: string, visit: string, url: string) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(hostel)} gate QR</title><style>
  @page { size: A4 portrait; margin: 0 }
  * { box-sizing: border-box; margin: 0 } html, body { height: 100% }
  body { font-family: "Plus Jakarta Sans", "Segoe UI", Arial, sans-serif; color: #111321; -webkit-print-color-adjust: exact; print-color-adjust: exact }
  .p { width: 210mm; height: 296mm; padding: 18mm; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6mm; text-align: center }
  .top { display: flex; align-items: center; gap: 3mm; font-size: 20pt; font-weight: 800; color: #4F5BEA }
  .logo { width: 14mm; height: 14mm; display: block } .logo svg { display: block; width: 100%; height: 100% }
  h1 { font-size: 34pt; line-height: 1.1; margin-top: 4mm } .lead { font-size: 18pt; color: #4F5BEA; font-weight: 700 }
  .qr { width: 110mm; padding: 6mm; border: 1.2mm solid #111321; border-radius: 6mm; margin: 4mm 0 } .qr svg { display: block; width: 100%; height: auto }
  ol { list-style: none; padding: 0; display: flex; gap: 6mm; font-size: 12pt; text-align: left }
  li { display: flex; align-items: center; gap: 2.5mm; max-width: 52mm }
  li b { flex: none; width: 8mm; height: 8mm; border-radius: 50%; background: #4F5BEA; color: #fff; display: grid; place-items: center; font-size: 11pt }
  .hours { font-size: 14pt; font-weight: 700; margin-top: 4mm } .foot { font-size: 11pt; color: #555A6E; max-width: 150mm }
  </style></head><body><div class="p">
  <div class="top"><span class="logo">${LOGO_SVG('#4F5BEA')}</span>Nestly</div>
  <h1>${esc(hostel)}</h1><p class="lead">Visitors, please sign in</p>
  <div class="qr">${qrSvg(url)}</div>
  <ol><li><b>1</b>Open your phone camera</li><li><b>2</b>Point it at this code</li><li><b>3</b>Enter your name and who you are visiting</li></ol>
  <p class="hours">Visiting hours: ${esc(visit)}</p>
  <p class="foot">No smartphone? Ask the custodian to sign you in. Scan again when you leave.</p>
  </div></body></html>`;
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(f);
  const w = f.contentWindow; if (!w) return;
  w.document.open(); w.document.write(html); w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } finally { setTimeout(() => f.remove(), 1000) } }, 250);
}

export function GateQR({ onClose }: { onClose: () => void }) {
  const me = useMe(); const hid = me.hostelId!; const h = hostelById(hid)!;
  const [view, setView] = useState<'qr' | 'visitor'>('qr');
  const url = visitUrl(hid); const print = () => printPoster(h.name, h.visit, url);
  if (view === 'visitor') return <Overlay title="What a visitor sees" onClose={onClose} width={440}><VisitorScreen hid={hid} onDone={() => setView('qr')} /></Overlay>;
  return <Overlay title="Gate QR code" onClose={onClose} width={440}
    footer={<><Btn kind="secondary" onClick={() => setView('visitor')}><Smartphone size={16} />Try it</Btn><Btn onClick={print}><Printer size={16} />Print poster</Btn></>}>
    <div className="gq">
      <div className="gq-card"><div className="qr" dangerouslySetInnerHTML={{ __html: qrSvg(url) }} /><b>{h.name}</b><span className="tiny muted">Visitors, scan to sign in</span></div>
      <ul className="gq-tips"><li><Printer size={15} />Print it on A4 and stick it at the gate, at eye level.</li><li><Smartphone size={15} />Visitors scan it with their phone camera to sign in and out.</li><li><Clock size={15} />Visiting hours on the poster: {h.visit}.</li></ul>
    </div>
  </Overlay>;
}
