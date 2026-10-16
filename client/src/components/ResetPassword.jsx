import { useEffect, useState } from 'react';
import { ArrowRight, KeyRound } from 'lucide-react';
import { api } from '../api';
import { useI18n } from '../i18n';
import { Button, Field } from './ui';
import { OtpInput, DevCode } from './OtpFlow';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const maskEmail = (e) => String(e || '').replace(/^(.)(.*)(.@.*)$/, (_, a, b, c) => a + '•'.repeat(Math.min(6, b.length)) + c);

// Set a new password with a 6-digit code sent to the account's email: email → code + new password → done.
// Used by the "Forgot password?" page and the account menu in every portal. The server changes the one
// account behind that email (so the password is new in every portal) and signs out all other devices;
// onDone receives { token, user } for this device.
// accountEmail (signed in): the email typed must be this account's own — we only hint at it.
export default function ResetPassword({ initialEmail = '', accountEmail = '', onDone }) {
  const { lang } = useI18n();
  const [email, setEmail] = useState(initialEmail);
  const [sent, setSent] = useState(null);
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [timer, setTimer] = useState(0);

  useEffect(() => {
    if (timer <= 0) return undefined;
    const t = setTimeout(() => setTimer((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timer]);

  const request = async (e) => {
    e?.preventDefault();
    const addr = email.trim().toLowerCase();
    if (!EMAIL_RE.test(addr)) { setError('Please enter a valid email address.'); return; }
    if (accountEmail && addr !== accountEmail.toLowerCase()) { setError(`Enter the email of the account you're signed in to (${maskEmail(accountEmail)}).`); return; }
    setBusy(true); setError('');
    try {
      const r = await api.post('/auth/password-reset/request', { email: addr, lang });
      setSent({ ...r, email: addr });
      setCode('');
      setTimer(r.resendIn || 30);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const confirm = async (e) => {
    e?.preventDefault();
    if (code.length !== 6) { setError('Please enter all 6 digits of the code.'); return; }
    if (pw.length < 8) { setError('Choose a password of at least 8 characters.'); return; }
    if (pw !== pw2) { setError('The two passwords don\'t match.'); return; }
    setBusy(true); setError('');
    try {
      const r = await api.post('/auth/password-reset/confirm', { email: sent.email, code, password: pw });
      await onDone(r);
    } catch (err) { setError(err.message); setCode(''); } finally { setBusy(false); }
  };

  if (!sent) {
    return (
      <form className="stack" onSubmit={request}>
        {error && <div className="form-error">{error}</div>}
        <Field label="Your email address" hint={accountEmail ? `The email on this account: ${maskEmail(accountEmail)}` : 'We\'ll email you a 6-digit code to set a new password.'}>
          <input className="input" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value.trim())} placeholder="you@example.com" autoComplete="email" autoFocus required />
        </Field>
        <Button type="submit" size="lg" block loading={busy}>Send code <ArrowRight /></Button>
      </form>
    );
  }

  return (
    <form className="stack" onSubmit={confirm}>
      <p className="mb-0">{sent.message} <button type="button" className="link-btn" onClick={() => { setSent(null); setError(''); }}>Change email</button></p>
      <DevCode sent={sent} />
      {error && <div className="form-error">{error}</div>}
      <Field label="6-digit code from the email"><OtpInput value={code} onChange={setCode} autoFocus /></Field>
      <Field label="New password" hint="At least 8 characters">
        <input className="input" type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" minLength={8} required />
      </Field>
      <Field label="Type the new password again">
        <input className="input" type={show ? 'text' : 'password'} value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" minLength={8} required />
      </Field>
      <label className="check small"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show password</label>
      <Button type="submit" size="lg" block loading={busy} icon={KeyRound}>Save new password</Button>
      <p className="small muted center mb-0">
        Didn&apos;t get it? Check your spam folder, or {timer > 0 ? <>resend in {timer}s</> : <button type="button" className="link-btn" onClick={request}>send a new code</button>}
      </p>
    </form>
  );
}
