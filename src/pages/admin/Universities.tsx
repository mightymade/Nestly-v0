import { CalendarDays, Check, GraduationCap, MapPin, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import { useState } from 'react';
import { DataTable, type Column } from '../../components/DataTable';
import { Overlay } from '../../components/Overlay';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState, ErrorState } from '../../components/States';
import { useToast } from '../../components/Toast';
import { BackBar, Btn, Field, Skeleton, TextInput } from '../../components/ui';
import type { University } from '../../data/types';
import { useIsPhone } from '../../lib/useIsPhone';
import { uniHostelCounts, ApiError, listUniversities, saveUniversity, semDates, semName } from '../../services/api';
import { PickMap } from '../../components/maps';
import { readLogo, UniLogo } from '../../components/UniLogo';
import { placeName, type LatLng } from '../../lib/geo';

const hostelsNear = (uid: string) => uniHostelCounts(uid).live;
/** Live hostels that use the university calendar because they have no dates of their own. */
const following = (uid: string) => uniHostelCounts(uid).following;
const addDays = (d: string, n: number) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const KAMPALA: LatLng = { lat: 0.3476, lng: 32.5825 };
import { useData } from '../../services/useData';

export function AdminUniversities() {
  const today = new Date().toISOString().slice(0, 10);
  const phone = useIsPhone();
  const { data, loading, error, reload } = useData(() => listUniversities(), []);
  const [edit, setEdit] = useState<University | 'new' | null>(null);
  const list = data ?? [];
  const cols: Column<University>[] = [
    { key: 'n', header: 'University', cell: u => <span className="who"><UniLogo uni={u} size={36} /><span className="min0"><b className="ink clamp1">{u.name}</b></span></span> },
    { key: 's', header: 'Short name', cell: u => u.short }, { key: 'a', header: 'Town', cell: u => u.area },
    { key: 'd', header: 'Student email ends with', cell: u => <code className="dom">@{u.domain}</code> },
    { key: 'h', header: 'Hostels', cell: u => <span className="num">{hostelsNear(u.id)}</span> },
    { key: 'c', header: 'Semester dates', cell: u => u.sems?.length ? <span className="small nowrap" title={u.sems.map(x => semDates({ ...x, open: false })).join(', ')}>Next: {semName({ ...(u.sems.find(x => x.end >= today) ?? u.sems[u.sems.length - 1]!), open: false })}</span> : <span className="small warn-t strong">Not set</span> },
    { key: 'm', header: 'Map', cell: u => u.lat ? <span className="row-sm small ok-t strong"><MapPin size={14} />Pinned</span> : <span className="small warn-t strong">No pin</span> },
  ];
  const add = <Btn size="sm" onClick={() => setEdit('new')}><Plus size={15} />Add university</Btn>;
  const body = error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <Skeleton rows={4} h={56} />
    : !list.length ? <EmptyState bare icon={<GraduationCap size={24} />} title="No universities" text="Add one so students can sign up." action={add} />
    : phone ? <div className="vgrid">{list.map(u => <button key={u.id} className="vcard vcard-m" style={{ textAlign: 'left' }} onClick={() => setEdit(u)}>
        <UniLogo uni={u} size={44} /><div className="vm-info"><div className="vm-line1"><b className="ink clamp1">{u.short}</b></div><div className="vm-line2"><span className="clamp1">{u.name}</span></div><div className="vm-line3"><code className="dom">@{u.domain}</code>{!u.sems?.length && <span className="warn-t strong">No dates</span>}</div></div>
        <Pencil size={16} className="muted" /></button>)}</div>
    : <DataTable label="Universities" noun="universities" rows={list} rowKey={u => u.id} columns={cols} onRowClick={setEdit} rowLabel={u => `Edit ${u.name}`} />;
  const note = <p className="tiny muted">Students can only sign up with an email ending in their university’s domain. The four domains in the demo are samples; confirm each one with the university before launch.</p>;
  return <>
    {phone ? <><BackBar title="Universities" to="/a/settings" /><main className="m-main pushed"><div className="row end">{add}</div>{body}{note}</main></>
      : <><PageHeader title="Universities" actions={add} /><section className="card card-pad fill-card fill grow-y"><div className="card-body">{body}{note}</div></section></>}
    {edit && <UniDialog u={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
  </>;
}

function UniDialog({ u, onClose }: { u: University | null; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState<University>(u ?? { id: '', name: '', short: '', area: '', domain: '', lat: 0, lng: 0 });
  const [test, setTest] = useState(''); const [err, setErr] = useState<Record<string, string | null>>({}); const [busy, setBusy] = useState(false);
  const dom = f.domain.trim().toLowerCase().replace(/^@/, '');
  const t = test.trim().toLowerCase(); const match = t.includes('@') && dom && (t.endsWith('@' + dom) || t.endsWith('.' + dom));
  const pin = f.lat || f.lng ? { lat: f.lat, lng: f.lng } : null;
  const moved = !!u && pin && (Math.abs(u.lat - f.lat) > 1e-6 || Math.abs(u.lng - f.lng) > 1e-6);
  const n = u ? hostelsNear(u.id) : 0;
  const setSem = (i: number, p: Partial<{ start: string; end: string }>) => { setF(v => ({ ...v, sems: v.sems!.map((x, j) => (j === i ? { ...x, ...p } : x)) })); setErr(e => ({ ...e, sems: null })); };
  const addSem = () => setF(v => { const l = v.sems ?? []; const last = l[l.length - 1]; const st = last?.end ? addDays(last.end, 56) : addDays(new Date().toISOString().slice(0, 10), 60); return { ...v, sems: [...l, { start: st, end: addDays(st, 18 * 7) }] }; });
  async function place(p: LatLng) {
    setF(x => ({ ...x, lat: p.lat, lng: p.lng })); setErr(e => ({ ...e, location: null }));
    if (!f.area.trim()) { const a = await placeName(p); if (a) setF(x => (x.area.trim() ? x : { ...x, area: a.split(', ').pop() ?? a })); }
  }
  async function go() {
    setBusy(true); setErr({});
    try { await saveUniversity({ ...f, id: u?.id ?? f.short.toLowerCase().replace(/[^a-z]/g, '').slice(0, 8) }, !u); toast(`${f.short} saved`); onClose(); }
    catch (x) { const a = x as ApiError; setErr({ [a.field ?? 'name']: a.message }); requestAnimationFrame(() => document.querySelector('.overlay [role=alert], .uni-form .err, .uni-sems .err')?.scrollIntoView({ block: 'center', behavior: 'smooth' })); } finally { setBusy(false); }
  }
  return <Overlay title={u ? `Edit ${u.short}` : 'Add a university'} onClose={onClose} width={720} footer={<><Btn kind="secondary" onClick={onClose}>Cancel</Btn><Btn loading={busy} onClick={go}>Save</Btn></>}>
    <div className="uni-form">
      <div className="stack">
        <div className="field"><span className="label">Logo</span>
          <div className="uni-logo-edit"><UniLogo uni={{ ...f, short: f.short || 'U' }} size={64} />
            <div className="stack-sm"><div className="acts">
              <label className="btn btn-secondary btn-sm"><Upload size={15} />{f.logo ? 'Change logo' : 'Upload logo'}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={async e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
                  try { const logo = await readLogo(file); setF(x => ({ ...x, logo })); setErr(x => ({ ...x, logo: null })); } catch (x) { setErr(v => ({ ...v, logo: (x as Error).message })); } }} /></label>
              {f.logo && <button type="button" className="btn btn-text btn-sm" onClick={() => setF(x => ({ ...x, logo: undefined }))}>Remove</button>}</div>
              {err.logo ? <span className="err" role="alert">{err.logo}</span> : <span className="hint">Square PNG or SVG with a clear background works best. Shown on the map, in the university list and at sign up.</span>}</div></div></div>
        <Field id="un-n" label="Full name" error={err.name}><TextInput id="un-n" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} error={err.name} placeholder="Uganda Christian University" /></Field>
        <div className="field-grid"><Field id="un-s" label="Short name"><TextInput id="un-s" value={f.short} onChange={e => setF({ ...f, short: e.target.value })} placeholder="UCU Mukono" /></Field>
          <Field id="un-a" label="Town"><TextInput id="un-a" value={f.area} onChange={e => setF({ ...f, area: e.target.value })} placeholder="Mukono" /></Field></div>
        <Field id="un-d" label="Student email domain" hint="The part after the @, like ucu.ac.ug." error={err.domain}><TextInput id="un-d" value={f.domain} onChange={e => setF({ ...f, domain: e.target.value })} error={err.domain} placeholder="ucu.ac.ug" /></Field>
        <div className="uni-test"><Field id="un-t" label="Test an email"><TextInput id="un-t" value={test} onChange={e => setTest(e.target.value)} placeholder="sarah.atim@ucu.ac.ug" /></Field>
          {t.includes('@') && <span className={'small strong row-sm ' + (match ? 'ok-t' : 'danger-t')}>{match ? <><Check size={15} />This email would be accepted</> : <><X size={15} />This email would be refused</>}</span>}</div>
      </div>
      <div className="field">
        <span className="label">Exact location</span>
        <PickMap value={pin} onChange={place} center={pin ?? KAMPALA} height={300} />
        {err.location ? <span className="err" role="alert">{err.location}</span>
          : <span className="hint">{pin ? `Pinned at ${f.lat.toFixed(5)}, ${f.lng.toFixed(5)}. ` : ''}Put the pin on the main gate. Students see hostels around this spot, and distances are measured from it.</span>}
        {moved && n > 0 && <span className="small warn-t strong">Saving updates the distance shown for {n} {n === 1 ? 'hostel' : 'hostels'}.</span>}
      </div>
    </div>
    <div className="uni-sems">
      <div className="row between wrap" style={{ gap: 8 }}><span className="label row-sm" style={{ margin: 0 }}><CalendarDays size={16} />Semester dates</span>
        {(f.sems?.length ?? 0) < 4 && <Btn kind="secondary" size="sm" onClick={addSem}><Plus size={15} />Add semester</Btn>}</div>
      <span className="hint">Hostels near {f.short || 'this university'} use these dates unless the owner sets their own.{u ? ` ${following(u.id)} live ${following(u.id) === 1 ? 'hostel uses' : 'hostels use'} them now.` : ''}</span>
      {f.sems?.length ? <div className="uni-sem-list">{f.sems.map((x, i) => <div key={i} className="uni-sem">
        <b className="small ink uni-sem-n">{x.start && x.end > x.start ? semName({ ...x, open: false }) : `Semester ${i + 1}`}</b>
        <Field id={`us-a${i}`} label="Starts"><TextInput id={`us-a${i}`} type="date" value={x.start} onChange={e => setSem(i, { start: e.target.value })} /></Field>
        <Field id={`us-b${i}`} label="Ends"><TextInput id={`us-b${i}`} type="date" value={x.end} min={x.start || undefined} onChange={e => setSem(i, { end: e.target.value })} /></Field>
        <button type="button" className="icon-btn" onClick={() => setF(v => ({ ...v, sems: v.sems!.filter((_, j) => j !== i) }))} aria-label={`Remove semester ${i + 1}`}><Trash2 size={16} /></button>
      </div>)}</div> : <p className="small muted">No dates yet. Owners near this university see sample dates until you add them.</p>}
      {err.sems && <span className="err" role="alert">{err.sems}</span>}
    </div></Overlay>;
}
