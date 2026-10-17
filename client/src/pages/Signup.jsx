import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Gift, HeartHandshake, ShieldCheck, UserRound } from 'lucide-react';
import Logo from '../components/Logo';
import { api } from '../api';
import { useAuth, ROLE_HOME } from '../auth';
import { Button, Field } from '../components/ui';
import { OtpInput, PhoneField, DevCode } from '../components/OtpFlow';
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
  // Arriving from the sign-in screen after verifying a new email: skip the code step.
  const preTicket = location.state?.ticket || null;
  const [ticket] = useState(preTicket);
  const [country, setCountry] = useState(() => COUNTRIES.find((c) => c.iso === location.state?.country) || guessCountry());
  const [form, setForm] = useState({ name: '', email: location.state?.email || '', phone: '' });
  const [sent, setSent] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  // Invite link (/signup?ref=CODE). Kept for this tab so a detour through "Sign in" doesn't lose it.
  const [ref] = useState(() => {
    const fromUrl = new URLSearchParams(location.search).get('ref');
    try { if (fromUrl) sessionStorage.setItem('oc_ref', fromUrl); return fromUrl || sessionStorage.getItem('oc_ref') || ''; } catch { return fromUrl || ''; }
  });
  const [inviter, setInviter] = useState(null);
  useEffect(() => {
    if (!/^[A-Za-z0-9]{6,12}$/.test(ref)) return undefined;
    let alive = true;
    api.get(`/referrals/code/${encodeURIComponent(ref)}`).then((r) => alive && setInviter(r)).catch(() => {});
    return () => { alive = false; };
  }, [ref]);
  // Sent here from a public page's "Book" / "Order" button: continue there once the account exists (patient app only).
  const from = location.state?.from;
  const next = typeof from === 'string' && /^\/patient(\/|\?|$)/.test(from) ? from : '/patient';

  useEffect(() => { if (user && !busy) navigate(ROLE_HOME[user.role], { replace: true }); }, [user, busy, navigate]);

  const digits = form.phone.replace(/\D/g, '');
  const lockedEmail = !!(preTicket && location.state?.email);

  const validate = () => {
    if (form.name.trim().length < 2) return 'Please tell us your name.';
    if (!EMAIL_RE.test(form.email.trim())) return 'Please enter a valid email address.';
    if (digits.length < 6) return 'Please enter your mobile number.';
    return '';
  };

  const create = async (tk) => {
    const r = await api.post('/auth/register/quick', {
      ticket: tk, name: form.name.trim(), email: form.email.trim(), phone: digits, dialCode: country.dial, country: country.iso,
      language: APP_LANGS.find((l) => l.code === lang)?.name || 'English', ...(inviter ? { ref } : {}),
    });
    try { sessionStorage.removeItem('oc_ref'); } catch { /* ignore */ }
    await signIn(r.token);
    navigate(next, { replace: true, state: { justJoined: true } });
  };

  const sendCode = async (e) => {
    e?.preventDefault();
    const v = validate();
    if (v) { setError(v); return; }
    setBusy(true); setError('');
    try {
      if (ticket) { await create(ticket); return; }
      // One-time codes go by email only; the mobile number is saved as a contact detail.
      const r = await api.post('/auth/otp/request', { email: form.email.trim(), channel: 'email', lang });
      setSent(r); setCode('');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const verify = async (e) => {
    e?.preventDefault();
    if (code.length !== 6) { setError('Please enter all 6 digits.'); return; }
    setBusy(true); setError('');
    try {
      const r = await api.post('/auth/otp/verify', { target: sent.target, code });
      if (r.token) { await signIn(r.token); navigate(next, { replace: true }); return; } // already had an account
      await create(r.ticket);
    } catch (err) { setError(err.message); setCode(''); } finally { setBusy(false); }
  };

  return (
    <div className="auth">
      <div className="auth-form-side">
        <div className="auth-top"><Logo /><div className="row"><LanguagePicker /><Link to="/login" state={from ? { from } : undefined} className="small muted">Already have an account? <strong>Sign in</strong></Link></div></div>
        <div className="auth-card fade-in" key={sent ? 'code' : 'details'}>
          {!sent ? (
            <form className="stack" onSubmit={sendCode}>
              <span className="eyebrow">Create your Health Passport · free</span>
              <h1 className="auth-title mb-0">Just three things to start</h1>
              <p className="muted mb-0">Your name, email and mobile number. You can add the rest later, whenever you like.</p>
              {inviter && (
                <div className="callout green small"><Gift size={16} /><div>You were invited by <strong translate="no">{inviter.firstName}</strong> — you&apos;ll get ₹{inviter.reward} Nexus credit after your first consult.</div></div>
              )}
              <Field label="Your full name"><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Sunita Devi" autoFocus autoComplete="name" /></Field>
              <Field label="Email">
                <input className="input" type="email" dir="ltr" value={form.email} onChange={(e) => set('email', e.target.value.trim())} placeholder="you@example.com" readOnly={lockedEmail} autoComplete="email" />
              </Field>
              <Field label="Mobile number" hint="So your doctor and pharmacy can reach you.">
                <PhoneField country={country} onCountry={setCountry} value={form.phone} onChange={(v) => set('phone', v)} />
              </Field>
              {error && <div className="form-error">{error} {/sign in/i.test(error) && <Link to="/login">Sign in →</Link>}</div>}
              <Button type="submit" size="lg" variant="clay" block loading={busy}>{ticket ? <>Create my account <ArrowRight /></> : <>Send code <ArrowRight /></>}</Button>
              <p className="tiny muted center mb-0"><ShieldCheck size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> We email you a one-time code to make sure the address is really yours. No password needed.</p>
            </form>
          ) : (
            <form className="stack" onSubmit={verify}>
              <span className="eyebrow">Almost there</span>
              <h1 className="auth-title mb-0">Enter the 6-digit code</h1>
              <p className="mb-0">{sent.message}. <button type="button" className="link-btn" onClick={() => { setSent(null); setError(''); }}>Change</button></p>
              <DevCode sent={sent} />
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
