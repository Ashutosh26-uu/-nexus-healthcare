import { useEffect, useState } from 'react';
import { ShieldCheck, ShieldOff, Copy, Download, RefreshCw, Smartphone, Check } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Button, Field, Modal, useToast, fmtDate } from './ui';
import { OtpInput } from './OtpFlow';
import QR from './QR';

// Two-step login with an authenticator app, from the account menu of every portal.
// Off → scan the QR (or type the key) → first code turns it on → 10 backup codes, shown once.
// On → make new backup codes, or turn it off (both need a current code).
export default function TwoStepModal({ open, onClose }) {
  const toast = useToast();
  const { signIn, refresh } = useAuth();
  const [status, setStatus] = useState(null);
  const [stage, setStage] = useState('status'); // status | scan | codes | renew | off
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [codeSentTo, setCodeSentTo] = useState('');
  const [backupCodes, setBackupCodes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => api.get('/auth/mfa').then(setStatus).catch((e) => setErr(e.message));
  useEffect(() => {
    if (!open) return;
    setStage('status'); setSetup(null); setCode(''); setBackupCodes(null); setErr(''); setStatus(null);
    load();
  }, [open]);

  const run = async (fn) => { setBusy(true); setErr(''); try { await fn(); } catch (e) { setErr(e.message); setCode(''); } finally { setBusy(false); } };
  const start = () => run(async () => {
    if (status?.needsPassword && !password) { setErr('Enter your current password to turn on two-step login.'); return; }
    if (status?.needsEmailCode && emailCode.length !== 6) { setErr('Enter the 6-digit code we emailed you.'); return; }
    setSetup(await api.post('/auth/mfa/setup', { ...(status?.needsPassword ? { password } : {}), ...(status?.needsEmailCode ? { emailCode } : {}) }));
    setPassword(''); setEmailCode(''); setCode(''); setStage('scan');
  });
  const sendEmailCode = () => run(async () => {
    const r = await api.post('/auth/mfa/setup-code');
    setCodeSentTo(r.masked || 'your email');
    if (r.devCode) setEmailCode(r.devCode);
  });
  const enable = () => run(async () => {
    const r = await api.post('/auth/mfa/enable', { code });
    await signIn(r.token); // other devices were signed out; this one continues
    setBackupCodes(r.backupCodes); setStage('codes'); load();
  });
  const renew = () => run(async () => { const r = await api.post('/auth/mfa/backup-codes', { code: code.trim() }); setBackupCodes(r.backupCodes); setStage('codes'); load(); });
  const turnOff = () => run(async () => { await api.post('/auth/mfa/disable', { code: code.trim() }); await refresh(); toast('Two-step login is off.'); onClose(); });

  const copy = () => { navigator.clipboard?.writeText(backupCodes.join('\n')).then(() => toast('Backup codes copied.')).catch(() => {}); };
  const download = () => {
    const text = `Sehatra — two-step login backup codes\nEach code works once. Keep them somewhere safe and private.\n\n${backupCodes.join('\n')}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a'); a.href = url; a.download = 'nexus-backup-codes.txt'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  const keyGroups = (k) => String(k || '').match(/.{1,4}/g)?.join(' ') || '';

  return (
    <Modal open={open} onClose={onClose} title="Two-step login" subtitle="Your password plus a code from your phone — so a stolen password alone can't open your account.">
      {err && <div className="form-error mb-2">{err}</div>}

      {stage === 'status' && !status && <div className="spinner" />}

      {stage === 'status' && status && !status.enabled && (
        <div className="stack">
          {status.required ? <div className="badge rose" style={{ alignSelf: 'flex-start' }}>Required for your role</div> : status.recommended && <div className="badge sun" style={{ alignSelf: 'flex-start' }}>Recommended for your role</div>}
          <p className="small mb-0">You&apos;ll need a free authenticator app on your phone — Google Authenticator, Microsoft Authenticator, Authy or similar. Each time you sign in, the app shows a new 6-digit code. Codes work even without internet on the phone.</p>
          {status.needsPassword && <Field label="Confirm your current password" hint="So only you can turn this on."><input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>}
          {status.needsEmailCode && (codeSentTo
            ? <Field label={`Code sent to ${codeSentTo}`} hint="Proves this is really your inbox."><input className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={emailCode} onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, ''))} /></Field>
            : <Button variant="secondary" onClick={sendEmailCode} loading={busy}>Email me a code first</Button>)}
          <Button icon={ShieldCheck} onClick={start} loading={busy} disabled={status.needsEmailCode && !codeSentTo}>Set up two-step login</Button>
        </div>
      )}

      {stage === 'status' && status?.enabled && (
        <div className="stack">
          <div className="row" style={{ gap: 10 }}><ShieldCheck size={22} style={{ color: 'var(--green)' }} /><div><strong>On</strong> <span className="small muted">since {fmtDate(status.enabledAt)}</span><div className="tiny muted">{status.backupCodesLeft} backup code{status.backupCodesLeft === 1 ? '' : 's'} left</div></div></div>
          <div className="row wrap" style={{ gap: 8 }}>
            <Button variant="secondary" icon={RefreshCw} onClick={() => { setCode(''); setErr(''); setStage('renew'); }}>New backup codes</Button>
            <Button variant="ghost" icon={ShieldOff} onClick={() => { setCode(''); setErr(''); setStage('off'); }}>Turn off</Button>
          </div>
        </div>
      )}

      {stage === 'scan' && setup && (
        <div className="stack">
          <ol className="small" style={{ paddingInlineStart: 18, margin: 0 }}>
            <li>Open your authenticator app and tap <strong>+</strong> / <strong>Add account</strong>.</li>
            <li>Scan this QR code. On this phone? Choose &ldquo;Enter a setup key&rdquo; and type the key below.</li>
            <li>Type the 6-digit code the app now shows for Sehatra.</li>
          </ol>
          <div className="row wrap" style={{ gap: 16, alignItems: 'center' }}>
            <QR value={setup.otpauth} size={176} />
            <div style={{ minWidth: 0 }}>
              <div className="tiny muted">Setup key</div>
              <div className="mono notranslate" translate="no" dir="ltr" style={{ wordBreak: 'break-all', fontWeight: 600 }}>{keyGroups(setup.secret)}</div>
              <div className="tiny muted mt-1">Account: <span translate="no">{setup.account}</span></div>
            </div>
          </div>
          <Field label="6-digit code from the app"><OtpInput value={code} onChange={setCode} autoFocus /></Field>
          <Button icon={Smartphone} onClick={enable} loading={busy} disabled={code.length !== 6}>Turn on</Button>
        </div>
      )}

      {stage === 'codes' && backupCodes && (
        <div className="stack">
          <div className="row" style={{ gap: 8 }}><Check size={18} style={{ color: 'var(--green)' }} /><strong>Save your backup codes</strong></div>
          <p className="small mb-0">If you lose your phone, each of these lets you sign in once. They&apos;re shown only now — download or copy them and keep them somewhere private.</p>
          <div className="mono notranslate" translate="no" dir="ltr" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px 16px', padding: 12, borderRadius: 10, background: 'var(--surface-2, #f4f6f5)' }}>
            {backupCodes.map((c) => <span key={c}>{c}</span>)}
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            <Button variant="secondary" icon={Download} onClick={download}>Download</Button>
            <Button variant="secondary" icon={Copy} onClick={copy}>Copy</Button>
            <Button onClick={() => { toast('Two-step login is on.'); onClose(); }}>I&apos;ve saved them</Button>
          </div>
        </div>
      )}

      {(stage === 'renew' || stage === 'off') && (
        <div className="stack">
          <p className="small mb-0">{stage === 'off' ? 'Enter a current code to turn two-step login off. Your account will then sign in with just the password.' : 'Enter a current code. Your old backup codes stop working and you get 10 new ones.'}</p>
          <Field label="Code from the app, or a backup code">
            <input className="input mono" dir="ltr" value={code} onChange={(e) => setCode(e.target.value.slice(0, 12))} autoComplete="one-time-code" autoCapitalize="none" spellCheck={false} autoFocus />
          </Field>
          <div className="row wrap" style={{ gap: 8 }}>
            <Button variant="ghost" onClick={() => { setStage('status'); setErr(''); }}>Back</Button>
            {stage === 'off'
              ? <Button variant="danger" icon={ShieldOff} onClick={turnOff} loading={busy} disabled={!code.trim()}>Turn off two-step login</Button>
              : <Button icon={RefreshCw} onClick={renew} loading={busy} disabled={!code.trim()}>Make new codes</Button>}
          </div>
        </div>
      )}
    </Modal>
  );
}
