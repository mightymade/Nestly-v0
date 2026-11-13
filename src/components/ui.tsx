import { LogoMark } from './LogoMark';
import { BadgeCheck, ChevronLeft, Eye, EyeOff, Star } from 'lucide-react';
import { useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Hostel, User } from '../data/types';
import { hostelArt } from '../lib/art';
import { initials } from '../lib/format';

type BtnKind = 'primary' | 'secondary' | 'soft' | 'danger' | 'text' | 'light';
export function Btn({ loading, kind = 'primary', size, block, children, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; kind?: BtnKind; size?: 'sm'; block?: boolean }) {
  const cls = ['btn', `btn-${kind}`, size === 'sm' && 'btn-sm', block && 'btn-block', className].filter(Boolean).join(' ');
  return <button type="button" {...rest} className={cls} disabled={rest.disabled || loading} aria-busy={loading || undefined}>
    {loading && <span className="spinner" aria-hidden="true" />}{children}</button>;
}

export function Field({ label, error, hint, id, children }: { label: string; error?: string | null; hint?: ReactNode; id: string; children: ReactNode }) {
  return <div className="field"><label htmlFor={id}>{label}</label>{children}
    {error ? <span className="err" id={id + '-err'} role="alert">{error}</span> : hint ? <span className="hint">{hint}</span> : null}</div>;
}

export function TextInput({ error, className = '', ...p }: InputHTMLAttributes<HTMLInputElement> & { error?: string | null }) {
  return <input {...p} className={'input' + (error ? ' bad' : '') + (className ? ' ' + className : '')} aria-invalid={!!error || undefined} aria-describedby={error ? p.id + '-err' : undefined} />;
}

export function PasswordInput({ error, ...p }: InputHTMLAttributes<HTMLInputElement> & { error?: string | null }) {
  const [show, setShow] = useState(false);
  return <div className="input-wrap has-trail">
    <input {...p} type={show ? 'text' : 'password'} className={'input' + (error ? ' bad' : '')} aria-invalid={!!error || undefined} aria-describedby={error ? p.id + '-err' : undefined} />
    <button type="button" className="trail icon-btn" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
  </div>;
}

export function Avatar({ user, size = 40 }: { user: Pick<User, 'name' | 'photo'>; size?: number }) {
  const s = { width: size, height: size, fontSize: Math.round(size * 0.36) };
  return user.photo ? <img className="avatar" src={user.photo} alt="" style={s} /> : <span className="avatar" style={s} aria-hidden="true">{initials(user.name)}</span>;
}

/** Hostel photo when the owner uploaded one, otherwise a calm illustration. */
export function Art({ hostel, alt = 0, className = '' }: { hostel: Hostel; alt?: number; className?: string }) {
  const [loaded, setLoaded] = useState(false);
  // The owner's own photos come first. Hostels with no photos yet show a drawing.
  const src = hostel.photos?.length ? hostel.photos[alt] : alt === 0 ? hostel.photoUrl : undefined;
  if (src) return <div className={'art ' + className}>{!loaded && <div className="skel" style={{ position: 'absolute', inset: 0, borderRadius: 0 }} />}
    <img src={src} alt={hostel.name} onLoad={() => setLoaded(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>;
  const v = [[hostel.floors, hostel.cols], [2, 6], [3, 3]][alt] ?? [hostel.floors, hostel.cols];
  return <div className={'art ' + className} dangerouslySetInnerHTML={{ __html: hostelArt(hostel.seed + alt, v[0], v[1]) }} />;
}

export function Stars({ n, size = 15 }: { n: number; size?: number }) {
  return <span className="stars" role="img" aria-label={`${n} out of 5 stars`}>{[1, 2, 3, 4, 5].map(i =>
    <Star key={i} size={size} className="ic" style={{ color: i <= n ? 'var(--star)' : 'var(--bar-muted)', fill: i <= n ? 'var(--star)' : 'var(--bar-muted)' }} />)}</span>;
}

export function Rating({ value, count }: { value: number; count?: number }) {
  if (count === 0) return <span className="rating new" aria-label="New on Nestly, no reviews yet"><Star size={15} className="ic" />New</span>;
  return <span className="rating" aria-label={`Rated ${value.toFixed(1)} out of 5${count !== undefined ? ` from ${count} reviews` : ''}`}><Star size={15} className="ic" />{value.toFixed(1)}{count !== undefined && <span className="n">({count})</span>}</span>;
}

/** Phone-only header for screens opened on top of a tab. */
export function BackBar({ title, to, right }: { title: string; to: string; right?: ReactNode }) {
  return <header className="back-bar"><Link to={to} className="round-btn" aria-label="Back"><ChevronLeft size={22} /></Link>
    <h2 className="clamp1">{title}</h2><div>{right}</div></header>;
}

export function Skeleton({ rows = 3, h = 88 }: { rows?: number; h?: number }) {
  return <div className="stack" aria-busy="true" aria-label="Loading">{Array.from({ length: rows }, (_, i) => <div key={i} className="skel" style={{ height: h }} />)}</div>;
}

export function Logo() {
  return <span className="logo"><span className="logo-mark"><LogoMark /></span>Nestly</span>;
}

/** A person's name with the blue verified tick once their student email is confirmed. */
export function VerifiedName({ user, className = '' }: { user: { name: string; role: string; emailVerified: boolean }; className?: string }) {
  const ok = user.role === 'student' && user.emailVerified;
  return <span className={'vname ' + className}><span className="clamp1">{user.name}</span>
    {ok && <span className="vbadge" title="Verified student" role="img" aria-label="Verified student"><BadgeCheck size={16} /></span>}</span>;
}
