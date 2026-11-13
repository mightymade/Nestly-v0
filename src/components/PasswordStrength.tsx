import { Check, Circle } from 'lucide-react';

export const passwordRules = (p: string) => [
  { ok: p.length >= 8, label: '8+ characters' },
  { ok: /[a-zA-Z]/.test(p) && /\d/.test(p), label: 'Letters and numbers' },
  { ok: /[a-z]/.test(p) && /[A-Z]/.test(p), label: 'Upper and lower case' },
  { ok: /[^a-zA-Z0-9]/.test(p) || p.length >= 12, label: 'A symbol or 12+' },
];
export const passwordOk = (p: string) => passwordRules(p).slice(0, 2).every(r => r.ok);

/** Compact strength meter: one bar and one line of rules, so it never pushes the form off the screen. */
export function PasswordStrength({ value }: { value: string }) {
  const rules = passwordRules(value);
  const score = rules.filter(r => r.ok).length;
  const color = score <= 1 ? 'var(--danger)' : score === 2 ? 'var(--warn)' : 'var(--success)';
  const next = rules.find(r => !r.ok);
  const word = !value ? '' : score <= 1 ? 'Weak' : score === 2 ? 'Okay' : score === 3 ? 'Strong' : 'Very strong';
  if (!value) return <span className="hint pw-empty">Use 8 or more characters with letters and numbers.</span>;
  return <div className="pw-meter" aria-live="polite">
    <div className="pw-top"><div className="meter grow">{[0, 1, 2, 3].map(i => <i key={i} style={{ background: i < score && value ? color : undefined }} />)}</div>
      {word && <span className="pw-word" style={{ color }}>{word}</span>}</div>
    <ul className="pw-rules">{rules.map(r => <li key={r.label} className={r.ok ? 'ok' : ''}>{r.ok ? <Check size={13} /> : <Circle size={11} />}{r.label}</li>)}</ul>
    <span className="pw-next">{next ? <><Circle size={11} />Next: {next.label.toLowerCase()}</> : <><Check size={13} />Strong password</>}</span>
  </div>;
}
