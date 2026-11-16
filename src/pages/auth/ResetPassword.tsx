import { Check } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PasswordStrength, passwordOk } from '../../components/PasswordStrength';
import { useToast } from '../../components/Toast';
import { Btn, Field, PasswordInput } from '../../components/ui';
import { ApiError, setNewPassword } from '../../services/api';
import { useUser } from '../../services/session';
import { home } from '../../App';
import { AuthLayout } from './AuthLayout';

/** Where the "reset your password" email link lands. The link signs the person in for this one job. */
export function ResetPassword() {
  const me = useUser(); const nav = useNavigate(); const toast = useToast();
  const [pw, setPw] = useState(''); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  async function go(e: FormEvent) {
    e.preventDefault();
    if (!passwordOk(pw)) return setErr('Use 8+ characters with letters and numbers.');
    setBusy(true);
    try { await setNewPassword(pw); toast('Password changed. You are logged in.'); nav(me ? home(me) : '/login', { replace: true }); }
    catch (x) { setErr((x as ApiError).message); } finally { setBusy(false); }
  }
  if (!me) return <AuthLayout title="This link has expired" sub="Reset links work once and for one hour." back="/login">
    <Link to="/login" className="btn btn-primary btn-block">Back to log in</Link>
    <p className="small muted">On the log in page, choose "Forgot password?" to get a new link.</p>
  </AuthLayout>;
  return <AuthLayout title="Choose a new password" sub={`For ${me.email}`} back="/login">
    <form className="stack" onSubmit={go} noValidate>
      <Field id="rp-pw" label="New password" error={err}><PasswordInput id="rp-pw" autoComplete="new-password" value={pw} onChange={e => { setPw(e.target.value); setErr(null); }} error={err} /></Field>
      {!err && <PasswordStrength value={pw} />}
      <Btn type="submit" block loading={busy}><Check size={18} />Save new password</Btn>
    </form>
  </AuthLayout>;
}
