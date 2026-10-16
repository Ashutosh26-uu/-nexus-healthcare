import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ShieldCheck, ChevronDown, Search } from 'lucide-react';
import { api } from '../api';
import { useI18n } from '../i18n';
import { COUNTRIES, guessCountry } from '../i18n/countries';
import { Button, Field, cx } from './ui';

export function OtpInput({ value, onChange, length = 6, autoFocus }) {
  const refs = useRef([]);
  const digits = value.padEnd(length, ' ').slice(0, length).split('');
  const set = (i, ch) => {
    const arr = digits.map((d) => (d === ' ' ? '' : d));
    arr[i] = ch;
    onChange(arr.join('').slice(0, length));
  };
  return (
    <div className="otp" dir="ltr" onPaste={(e) => { const t = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length); if (t) { e.preventDefault(); onChange(t); refs.current[Math.min(t.length, length - 1)]?.focus(); } }}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          autoFocus={autoFocus && i === 0}
          value={d.trim()}
          aria-label={`Digit ${i + 1}`}
          onChange={(e) => {
            const ch = e.target.value.replace(/\D/g, '').slice(-1);
            set(i, ch);
            if (ch && i < length - 1) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => { if (e.key === 'Backspace' && !d.trim() && i > 0) refs.current[i - 1]?.focus(); }}
        />
      ))}
    </div>
  );
}

export function PhoneField({ country, onCountry, value, onChange, autoFocus }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return COUNTRIES.filter((c) => !s || c.name.toLowerCase().includes(s) || c.dial.includes(s.replace(/^\+?/, '+')) || c.iso.toLowerCase() === s);
  }, [q]);
  return (
    <div className="phone-input" ref={ref} dir="ltr">
      <button type="button" className="cc-btn" onClick={() => setOpen((v) => !v)} aria-label="Country code">
        <span className="notranslate" translate="no">{country.flag} {country.dial}</span>
        <ChevronDown size={14} />
      </button>
      <input className="input" type="tel" inputMode="tel" aria-label="Mobile number" autoComplete="tel-national" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d\s-]/g, '').slice(0, 18))} placeholder={country.iso === 'IN' ? '98765 43210' : 'Mobile number'} autoFocus={autoFocus} required />
      {open && (
        <div className="cc-pop">
          <div className="lang-search"><Search size={15} /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search country or code" aria-label="Search country or code" /></div>
          <div className="cc-list">
            {list.map((c) => (
              <button type="button" key={c.iso} className={cx('cc-item', c.iso === country.iso && 'on')} onClick={() => { onCountry(c); setOpen(false); setQ(''); try { localStorage.setItem('oc_country', c.iso); } catch { /* ignore */ } }}>
                <span className="notranslate" translate="no">{c.flag}</span>
                <span className="grow">{c.name}</span>
                <span className="muted small notranslate" translate="no">{c.dial}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Full "send code → enter code" flow. One-time codes go by email only.
 * onDone receives the verify response: { token } for existing users or { newUser, ticket, target, channel }.
 */
export default function OtpFlow({ onDone }) {
  const { lang } = useI18n();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [timer, setTimer] = useState(0);

  useEffect(() => {
    if (timer <= 0) return undefined;
    const t = setTimeout(() => setTimer((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timer]);

  const canSend = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const request = async (e) => {
    e?.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await api.post('/auth/otp/request', { email, channel: 'email', lang });
      setSent(r);
      setCode('');
      setTimer(r.resendIn || 30);
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  };

  const verify = async (e) => {
    e?.preventDefault();
    if (code.length !== 6) { setError('Please enter all 6 digits.'); return; }
    setBusy(true); setError('');
    try {
      const r = await api.post('/auth/otp/verify', { target: sent.target, code });
      await onDone(r, { phone: '', email: sent.target, country: guessCountry() });
    } catch (err) {
      setError(err.message);
      setCode('');
    } finally { setBusy(false); }
  };

  if (sent) {
    return (
      <form className="stack" onSubmit={verify}>
        <p className="mb-0">
          {sent.message}. <button type="button" className="link-btn" onClick={() => { setSent(null); setError(''); }}>Change</button>
        </p>
        <DevCode sent={sent} />
        {error && <div className="form-error">{error}</div>}
        <OtpInput value={code} onChange={setCode} autoFocus />
        <Button type="submit" size="lg" block loading={busy} disabled={code.length !== 6}>Verify & continue</Button>
        <p className="small muted center mb-0">
          Didn&apos;t get it? Check your spam folder, or {timer > 0 ? <>resend in {timer}s</> : <button type="button" className="link-btn" onClick={request}>send a new code</button>}
        </p>
      </form>
    );
  }

  return (
    <form className="stack" onSubmit={request}>
      {error && <div className="form-error">{error}</div>}
      <Field label="Email address" hint="We'll email you a 6-digit code. No password needed.">
        <input className="input" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value.trim())} placeholder="you@example.com" autoComplete="email" autoFocus required />
      </Field>
      <Button type="submit" size="lg" block loading={busy} disabled={!canSend}>Send code <ArrowRight /></Button>
      <p className="tiny muted center mb-0">
        <ShieldCheck size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> Codes expire in 5 minutes and work only once.
      </p>
    </form>
  );
}

// Local development only: the server shows the code when nothing was really emailed (demo addresses),
// or links to the test mailbox when no real mail server is configured.
export function DevCode({ sent }) {
  if (sent?.devCode) return <div className="dev-otp">Demo mode — this address can&apos;t receive email, so here is the code: <strong className="mono notranslate" translate="no">{sent.devCode}</strong></div>;
  if (sent?.emailPreview) return <div className="dev-otp">Demo email sent. <a href={sent.emailPreview} target="_blank" rel="noopener noreferrer" className="notranslate" translate="no"><strong>Open the email to see your code →</strong></a></div>;
  return null;
}
