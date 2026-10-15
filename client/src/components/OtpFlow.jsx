import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, MessageSquare, Mail, ShieldCheck, ChevronDown, Search } from 'lucide-react';
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
      <input className="input" type="tel" inputMode="tel" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d\s-]/g, '').slice(0, 18))} placeholder={country.iso === 'IN' ? '98765 43210' : 'Mobile number'} autoFocus={autoFocus} required />
      {open && (
        <div className="cc-pop">
          <div className="lang-search"><Search size={15} /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search country or code" /></div>
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
 * Full "send code → enter code" flow.
 * onDone receives the verify response: { token } for existing users or { newUser, ticket, target, channel }.
 */
export default function OtpFlow({ mode = 'login', onDone, initialPhone = '' }) {
  const { lang } = useI18n();
  const [config, setConfig] = useState(null);
  const [channel, setChannel] = useState('sms');
  const [country, setCountry] = useState(guessCountry);
  const [phone, setPhone] = useState(initialPhone);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [timer, setTimer] = useState(0);

  useEffect(() => {
    api.get('/auth/otp/config').then((c) => {
      setConfig(c);
      // No SMS gateway yet but SMTP is live → email is the channel that actually delivers.
      if (c.emailLive && !c.live && c.channels?.includes('email')) setChannel('email');
    }).catch(() => setConfig({ channels: ['sms'], devMode: true }));
  }, []);
  useEffect(() => {
    if (timer <= 0) return undefined;
    const t = setTimeout(() => setTimer((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timer]);

  const digits = phone.replace(/\D/g, '');
  const canSend = channel === 'email' ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) : digits.length >= 6;

  const request = async (e) => {
    e?.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await api.post('/auth/otp/request', { phone: digits, dialCode: country.dial, email, channel, lang });
      if (mode === 'signup' && r.exists) { setError('This number already has an account. Please sign in instead.'); return; }
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
      await onDone(r, { phone: sent.channel === 'email' ? '' : sent.target, email: sent.channel === 'email' ? sent.target : '', country });
    } catch (err) {
      setError(err.message);
      setCode('');
    } finally { setBusy(false); }
  };

  const channels = config?.channels || ['sms'];

  if (sent) {
    return (
      <form className="stack" onSubmit={verify}>
        <p className="mb-0">
          {sent.message}. <button type="button" className="link-btn" onClick={() => { setSent(null); setError(''); }}>Change</button>
        </p>
        {sent.devCode && <div className="dev-otp">Demo mode — no SMS gateway connected yet. Your code is <strong className="mono notranslate" translate="no">{sent.devCode}</strong></div>}
        {sent.emailPreview && <div className="dev-otp">Demo email sent. <a href={sent.emailPreview} target="_blank" rel="noopener noreferrer" className="notranslate" translate="no"><strong>Open the email to see your code →</strong></a><br /><span className="tiny">Connect your SMTP in <span className="mono">server/.env</span> to deliver to real inboxes.</span></div>}
        {error && <div className="form-error">{error}</div>}
        <OtpInput value={code} onChange={setCode} autoFocus />
        <Button type="submit" size="lg" block loading={busy} disabled={code.length !== 6}>{sent.exists ? 'Verify & sign in' : 'Verify & continue'}</Button>
        <p className="small muted center mb-0">
          Didn&apos;t get it? {timer > 0 ? <>Resend in {timer}s</> : <button type="button" className="link-btn" onClick={request}>Send a new code</button>}
          {timer <= 0 && channels.length > 1 && <> · <button type="button" className="link-btn" onClick={() => { setSent(null); setChannel(channel === 'sms' && channels.includes('whatsapp') ? 'whatsapp' : 'sms'); }}>Try another way</button></>}
        </p>
      </form>
    );
  }

  return (
    <form className="stack" onSubmit={request}>
      {channels.length > 1 && (
        <div className="channel-row" role="radiogroup" aria-label="How should we send your code?">
          {channels.includes('sms') && <button type="button" role="radio" aria-checked={channel === 'sms'} className={cx('chip', channel === 'sms' && 'on')} onClick={() => setChannel('sms')}><MessageSquare size={14} /> SMS</button>}
          {channels.includes('whatsapp') && <button type="button" role="radio" aria-checked={channel === 'whatsapp'} className={cx('chip', channel === 'whatsapp' && 'on')} onClick={() => setChannel('whatsapp')}>WhatsApp</button>}
          {channels.includes('email') && <button type="button" role="radio" aria-checked={channel === 'email'} className={cx('chip', channel === 'email' && 'on')} onClick={() => setChannel('email')}><Mail size={14} /> Email</button>}
        </div>
      )}
      {error && <div className="form-error">{error}</div>}
      {channel === 'email' ? (
        <Field label="Email address" hint="We'll email you a 6-digit code.">
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value.trim())} placeholder="you@example.com" autoFocus required />
        </Field>
      ) : (
        <Field label="Mobile number" hint={channel === 'whatsapp' ? "We'll send a 6-digit code on WhatsApp." : "We'll text you a 6-digit code. No password needed."}>
          <PhoneField country={country} onCountry={setCountry} value={phone} onChange={setPhone} autoFocus />
        </Field>
      )}
      <Button type="submit" size="lg" block loading={busy} disabled={!canSend}>Send code <ArrowRight /></Button>
      {config && (
        <p className="tiny muted center mb-0">
          <ShieldCheck size={13} style={{ display: 'inline', verticalAlign: '-2px' }} />{' '}
          {config.live ? 'Codes expire in 5 minutes and work only once.' : 'Demo mode: codes appear on screen until an SMS provider is connected.'}
        </p>
      )}
    </form>
  );
}
