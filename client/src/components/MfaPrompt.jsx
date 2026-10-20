import { useState } from 'react';
import { ShieldCheck, ArrowRight, KeyRound } from 'lucide-react';
import { api } from '../api';
import { Button, Field } from './ui';
import { OtpInput } from './OtpFlow';

// Second step of signing in when two-step login is on: the 6-digit code from the authenticator app, or one of
// the backup codes. `ticket` is the 5-minute ticket the server returned after the password / email code.
// onDone receives { token, user, backupCodesLeft, usedBackup }.
export default function MfaPrompt({ ticket, onDone, onCancel }) {
  const [backup, setBackup] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e?.preventDefault();
    const c = code.trim();
    if (!backup && c.length !== 6) { setError('Please enter all 6 digits.'); return; }
    if (backup && c.replace(/[^a-z0-9]/gi, '').length !== 8) { setError('Backup codes look like abcd-2345.'); return; }
    setBusy(true); setError('');
    try {
      const r = await api.post('/auth/mfa', { ticket, code: c });
      await onDone(r);
    } catch (err) {
      setError(err.status === 401 ? 'That took too long — please sign in again.' : err.message);
      setCode('');
    } finally { setBusy(false); }
  };

  return (
    <form className="stack fade-in" onSubmit={submit}>
      <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
        <ShieldCheck size={22} style={{ flex: 'none', marginTop: 2, color: 'var(--green)' }} />
        <div>
          <strong>Two-step login</strong>
          <p className="small muted mb-0">{backup ? 'Type one of the backup codes you saved when you turned two-step login on. Each one works once.' : 'Open your authenticator app (Google Authenticator, Microsoft Authenticator…) and type the 6-digit code for Sehatra.'}</p>
        </div>
      </div>
      {error && <div className="form-error">{error}</div>}
      {backup ? (
        <Field label="Backup code">
          <input className="input mono" dir="ltr" value={code} onChange={(e) => setCode(e.target.value.slice(0, 12))} placeholder="abcd-2345" autoComplete="one-time-code" autoCapitalize="none" spellCheck={false} autoFocus />
        </Field>
      ) : (
        <Field label="6-digit code"><OtpInput value={code} onChange={setCode} autoFocus /></Field>
      )}
      <Button type="submit" size="lg" block loading={busy}>Verify <ArrowRight /></Button>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className="link-btn small" onClick={() => { setBackup((v) => !v); setCode(''); setError(''); }}>
          <KeyRound size={13} style={{ verticalAlign: '-2px' }} /> {backup ? 'Use the authenticator app instead' : 'Lost your phone? Use a backup code'}
        </button>
        {onCancel && <button type="button" className="link-btn small muted" onClick={onCancel}>Start again</button>}
      </div>
    </form>
  );
}
