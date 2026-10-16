import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, HeartHandshake, Mail, MessageSquare, ShieldCheck, UserRound } from 'lucide-react';
import Logo from '../components/Logo';
import { api } from '../api';
import { useAuth, ROLE_HOME } from '../auth';
import { Button, Field, cx } from '../components/ui';
import { OtpInput, PhoneField } from '../components/OtpFlow';
import LanguagePicker from '../components/LanguagePicker';
import { useI18n, LANGUAGES as APP_LANGS } from '../i18n';
import { COUNTRIES, guessCountry } from '../i18n/countries';
import './auth.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Quick sign-up: name, email and mobile only. A one-time code proves the person owns the
// mobile (or email) — then they're straight in, and complete the rest of the profile later.
export default function Signup() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { lang } = useI18n();
  // Arriving from the sign-in screen after verifying a new number/email: skip the code step.
  const preTicket = location.state?.ticket || null;
  const [ticket] = useState(preTicket);
  const [config, setConfig] = useState(null);
  const [country, setCountry] = useState(() => COUNTRIES.find((c) => c.iso === location.state?.country) || guessCountry());
  const [form, setForm] = useState({ name: '', email: location.state?.email || '', phone: (location.state?.phone || '').replace(/^\+\d{1,3}/, '') });
  const [channel, setChannel] = useState('sms');
  const [sent, setSent] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    api.get('/auth/otp/config').then((c) => {
      setConfig(c);
      const list = c.channels?.length ? c.channels : ['sms'];
      // Only channels the server lists deliver; prefer email while SMS isn't live (older servers still list sms).
      setChannel((cur) => (!c.live && c.emailLive && list.includes('email') ? 'email' : list.includes(cur) ? cur : list[0]));
    }).catch(() => setConfig({ channels: ['sms'] }));
  }, []);
  useEffect(() => { if (user && !busy) navigate(ROLE_HOME[user.role], { replace: true }); }, [user, busy, navigate]);

  const channels = config?.channels?.length ? config.channels : ['sms'];
  const emailOnly = channels.length === 1 && channels[0] === 'email';
  const digits = form.phone.replace(/\D/g, '');
  const lockedPhone = !!(preTicket && location.state?.phone);
  const lockedEmail = !!(preTicket && location.state?.email);

  const validate = () => {
    if (form.name.trim().length < 2) return 'Please tell us your name.';
    if (!EMAIL_RE.test(form.email.trim())) return 'Please enter a valid email address.';
    if (!lockedPhone && digits.length < 6) return 'Please enter your mobile number.';
    return '';
  };

  const create = async (tk) => {
    const r = await api.post('/auth/register/quick', {
      ticket: tk, name: form.name.trim(), email: form.email.trim(), phone: digits, dialCode: country.dial, country: country.iso,
      language: APP_LANGS.find((l) => l.code === lang)?.name || 'English',
    });
    await signIn(r.token);
    navigate('/patient', { replace: true, state: { justJoined: true } });
  };

  const sendCode = async (e) => {
    e?.preventDefault();
    const v = validate();
    if (v) { setError(v); return; }
    setBusy(true); setError('');
    try {
      if (ticket) { await create(ticket); return; }
      const r = await api.post('/auth/otp/request', { phone: digits, dialCode: country.dial, email: form.email.trim(), channel, lang });
      setSent(r); setCode('');
    } catch (err) {
      setError(err.message);
      // 503 = no gateway behind this channel; fall back to email so the person can still get a code.
      if (err.status === 503 && channel !== 'email' && channels.includes('email')) setChannel('email');
    } finally { setBusy(false); }
  };

  const verify = async (e) => {
    e?.preventDefault();
    if (code.length !== 6) { setError('Please enter all 6 digits.'); return; }
    setBusy(true); setError('');
    try {
      const r = await api.post('/auth/otp/verify', { target: sent.target, code });
      if (r.token) { await signIn(r.token); navigate('/patient', { replace: true }); return; } // already had an account
      await create(r.ticket);
    } catch (err) { setError(err.message); setCode(''); } finally { setBusy(false); }
  };

  return (
    <div className="auth">
      <div className="auth-form-side">
        <div className="auth-top"><Logo /><div className="row"><LanguagePicker /><Link to="/login" className="small muted">Already have an account? <strong>Sign in</strong></Link></div></div>
        <div className="auth-card fade-in" key={sent ? 'code' : 'details'}>
          {!sent ? (
            <form className="stack" onSubmit={sendCode}>
              <span className="eyebrow">Create your Health Passport · free</span>
              <h1 className="auth-title mb-0">Just three things to start</h1>
              <p className="muted mb-0">Your name, email and mobile number. You can add the rest later, whenever you like.</p>
              <Field label="Your full name"><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Sunita Devi" autoFocus autoComplete="name" /></Field>
              <Field label="Email">
                <input className="input" type="email" dir="ltr" value={form.email} onChange={(e) => set('email', e.target.value.trim())} placeholder="you@example.com" readOnly={lockedEmail} autoComplete="email" />
              </Field>
              <Field label="Mobile number">
                {lockedPhone
                  ? <div className="input readonly-line" dir="ltr">{location.state.phone} <Check size={15} color="var(--green-2)" /></div>
                  : <PhoneField country={country} onCountry={setCountry} value={form.phone} onChange={(v) => set('phone', v)} />}
              </Field>
              {!ticket && channels.length > 1 && (
                <Field label="Send my 6-digit code by">
                  <div className="channel-row" role="radiogroup">
                    {channels.includes('sms') && <button type="button" role="radio" aria-checked={channel === 'sms'} className={cx('chip', channel === 'sms' && 'on')} onClick={() => setChannel('sms')}><MessageSquare size={14} /> SMS</button>}
                    {channels.includes('whatsapp') && <button type="button" role="radio" aria-checked={channel === 'whatsapp'} className={cx('chip', channel === 'whatsapp' && 'on')} onClick={() => setChannel('whatsapp')}>WhatsApp</button>}
                    {channels.includes('email') && <button type="button" role="radio" aria-checked={channel === 'email'} className={cx('chip', channel === 'email' && 'on')} onClick={() => setChannel('email')}><Mail size={14} /> Email</button>}
                  </div>
                </Field>
              )}
              {error && <div className="form-error">{error} {/sign in/i.test(error) && <Link to="/login">Sign in →</Link>}</div>}
              <Button type="submit" size="lg" variant="clay" block loading={busy}>{ticket ? <>Create my account <ArrowRight /></> : <>Send code <ArrowRight /></>}</Button>
              <p className="tiny muted center mb-0"><ShieldCheck size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> {emailOnly ? 'We send a one-time code to make sure your email is really yours. No password needed — SMS codes are coming soon.' : 'We send a one-time code to make sure the number or email is really yours. No password needed.'}</p>
            </form>
          ) : (
            <form className="stack" onSubmit={verify}>
              <span className="eyebrow">Almost there</span>
              <h1 className="auth-title mb-0">Enter the 6-digit code</h1>
              <p className="mb-0">{sent.message}. <button type="button" className="link-btn" onClick={() => { setSent(null); setError(''); }}>Change</button></p>
              {sent.devCode && <div className="dev-otp">Demo mode — no SMS gateway connected yet. Your code is <strong className="mono notranslate" translate="no">{sent.devCode}</strong></div>}
              {sent.emailPreview && <div className="dev-otp">Demo email sent. <a href={sent.emailPreview} target="_blank" rel="noopener noreferrer"><strong>Open the email to see your code →</strong></a></div>}
              {error && <div className="form-error">{error}</div>}
              <OtpInput value={code} onChange={setCode} autoFocus />
              <Button type="submit" size="lg" block loading={busy} disabled={code.length !== 6}>Verify & create my account</Button>
              <p className="small muted center mb-0"><UserRound size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> Creating a passport for <strong translate="no">{form.name}</strong></p>
            </form>
          )}
        </div>
      </div>
      <aside className="auth-side">
        <div className="auth-side-inner">
          <HeartHandshake size={34} color="#f3b89f" />
          <h2 style={{ marginTop: 18 }}>“My mother-in-law&apos;s reports used to live in a plastic bag.”</h2>
          <p>With a Health Passport, every prescription, lab report and allergy lives in one place — and goes wherever you go.</p>
          <ul className="side-points">
            <li><Check size={16} /> Free, forever, for every family member</li>
            <li><Check size={16} /> Find the best doctors near you for your symptoms</li>
            <li><Check size={16} /> Works with your ABHA and Ayushman card</li>
            <li><Check size={16} /> You approve every single access</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
