import { useEffect, useState } from 'react';
import { MailCheck, ArrowRight } from 'lucide-react';
import { api } from '../api';
import { Button, Field, Modal } from './ui';
import { OtpInput, DevCode } from './OtpFlow';

// Proves a partner applicant owns the email before their account is created. Sends a 6-digit code to the
// address, and on success hands back a short signup ticket the join routes require. Reused by all three
// Join forms (doctor, pharmacy, facility).
export default function VerifyEmailModal({ email, open, onClose, onVerified }) {
  const [sent, setSent] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [timer, setTimer] = useState(0);

  useEffect(() => { if (!open) return; setSent(null); setCode(''); setErr(''); send(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- send once each time it opens
  useEffect(() => { if (timer <= 0) return undefined; const t = setTimeout(() => setTimer((s) => s - 1), 1000); return () => clearTimeout(t); }, [timer]);

  const send = async () => {
    setBusy(true); setErr('');
    try { const r = await api.post('/auth/otp/request', { email: email.trim().toLowerCase() }); setSent(r); setCode(''); setTimer(r.resendIn || 30); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const verify = async (e) => {
    e?.preventDefault();
    if (code.length !== 6) { setErr('Enter all 6 digits of the code.'); return; }
    setBusy(true); setErr('');
    try {
      const r = await api.post('/auth/otp/verify', { target: email.trim().toLowerCase(), code });
      if (r.ticket) onVerified(r.ticket);
      else setErr('This email already has a Sehatra account. Please sign in, or use a different email.');
    } catch (e2) { setErr(e2.message); setCode(''); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Verify your email" subtitle={`We sent a 6-digit code to ${email}. Enter it to continue.`}>
      <form className="stack" onSubmit={verify}>
        <DevCode sent={sent} />
        {err && <div className="form-error">{err}</div>}
        <Field label="6-digit code"><OtpInput value={code} onChange={setCode} autoFocus /></Field>
        <Button type="submit" size="lg" block loading={busy} icon={MailCheck}>Verify and continue <ArrowRight /></Button>
        <p className="small muted center mb-0">Didn&apos;t get it? Check spam, or {timer > 0 ? <>resend in {timer}s</> : <button type="button" className="link-btn" onClick={send}>send a new code</button>}</p>
      </form>
    </Modal>
  );
}
