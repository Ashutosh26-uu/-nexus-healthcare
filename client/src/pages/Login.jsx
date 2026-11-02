import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Mail, ArrowRight, ArrowLeft, Lock, ShieldCheck, ChevronRight, Eye, EyeOff, UserPlus, Stethoscope } from 'lucide-react';
import Logo from '../components/Logo';
import LanguagePicker from '../components/LanguagePicker';
import OtpFlow from '../components/OtpFlow';
import MfaPrompt from '../components/MfaPrompt';
import { api } from '../api';
import { useAuth, ROLE_HOME, ROLE_LABEL } from '../auth';
import { Button, Field, cx } from '../components/ui';
import './auth.css';
import { usePublicConfig } from '../config';
import { startGoogle, finishGoogle, returningFromGoogle } from '../googleSignIn';

const DEMO = [
  { role: 'patient', email: 'patient@omnicare.in', who: 'Sunita Devi', note: 'Health Passport, family, consults' },
  { role: 'doctor', email: 'doctor@omnicare.in', who: 'Dr. Meera Iyer', note: '3 patients waiting in queue' },
  { role: 'kiosk_operator', email: 'kiosk@omnicare.in', who: 'Pooja Verma, ASHA', note: 'E-Clinic touchscreen flow' },
  { role: 'hospital_admin', email: 'hospital@omnicare.in', who: 'District Hospital', note: 'Beds, referrals, roster' },
  { role: 'lab_tech', email: 'lab@omnicare.in', who: 'Barabanki Diagnostics', note: 'Orders and reports' },
  { role: 'pharmacist', email: 'pharmacy@omnicare.in', who: 'Jan Aushadhi Kendra', note: 'E-prescriptions, stock' },
  { role: 'distributor', email: 'distributor@omnicare.in', who: 'UP State Drug Store', note: 'Warehouse & dispatch' },
  { role: 'delivery', email: 'rider@omnicare.in', who: 'Manoj, rider', note: 'Pickups and drops' },
  { role: 'official', email: 'official@omnicare.in', who: 'CMO Barabanki', note: 'District command center' },
  { role: 'official', email: 'national@omnicare.in', who: 'National officer', note: 'Country-wide view' },
  { role: 'super_admin', email: 'admin@omnicare.in', who: 'Ops team', note: 'Verification, AI rules, audit' },
];

const TAB_KEY = 'oc_login_tab';
// Most people signing in are patients, so the one-time-code tab comes first; the last tab used wins after
// that, and someone bounced here from a staff portal link gets the password form.
function initialTab(from) {
  try { const t = localStorage.getItem(TAB_KEY); if (t === 'patient' || t === 'staff') return t; } catch { /* ignore */ }
  return from && !/^\/(patient|rx|lab-report)\b/.test(from) ? 'staff' : 'patient';
}

export default function Login() {
  const config = usePublicConfig();
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setModeState] = useState(() => initialTab(location.state?.from));
  const setMode = (m) => { setModeState(m); try { localStorage.setItem(TAB_KEY, m); } catch { /* ignore */ } };
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Two-step login: after the password / email code the server may ask for the authenticator code.
  const [mfaTicket, setMfaTicket] = useState(null);
  const googleUrl = config?.neonAuthUrl || null;
  const [googleBusy, setGoogleBusy] = useState(false);

  // Back from Google (Neon Auth): sign in to the Sehatra account with that verified email.
  useEffect(() => {
    if (!googleUrl || user || !returningFromGoogle()) return;
    setGoogleBusy(true); setError('');
    finishGoogle(googleUrl)
      .then((r) => (r.mfaRequired ? setMfaTicket(r.ticket) : signIn(r.token)))
      .catch((err) => setError(err.message))
      .finally(() => setGoogleBusy(false));
  }, [googleUrl]); // eslint-disable-line react-hooks/exhaustive-deps
  const google = async () => {
    setGoogleBusy(true); setError('');
    try { await startGoogle(googleUrl); } catch (err) { setError(err.message); setGoogleBusy(false); }
  };

  useEffect(() => {
    if (!user) return;
    // Back to where they were bounced from: their own portal, or a document link (prescription, report, invoice,
    // statement — those routes check the role again). Internal paths only.
    const from = location.state?.from;
    const ok = typeof from === 'string' && /^\/(?!\/)/.test(from)
      && (from.startsWith(ROLE_HOME[user.role]) || /^\/(rx|lab-report|lab-label|invoice|statement|bill|circle|s\/[pv])\//.test(from) || from === '/testimonials');
    navigate(ok ? from : ROLE_HOME[user.role], { replace: true });
  }, [user, navigate, location.state]);

  const loginPassword = async (e) => {
    e?.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await api.post('/auth/login', { identifier: identifier.trim(), password });
      if (r.mfaRequired) setMfaTicket(r.ticket);
      else await signIn(r.token);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const onOtp = async (r, who) => {
    if (r.newUser) navigate('/signup', { state: { ticket: r.ticket, email: who.email, country: who.country?.iso, from: location.state?.from } });
    else if (r.mfaRequired) setMfaTicket(r.ticket);
    else await signIn(r.token);
  };

  const pickDemo = (d) => {
    setMode('staff');
    setIdentifier(d.email);
    setPassword('Demo@123');
    setError('');
  };

  return (
    <div className="auth">
      <div className="auth-form-side">
        <div className="auth-top"><Logo /><div className="row"><LanguagePicker /><Link to="/" className="small muted row" style={{ gap: 6 }}><ArrowLeft size={15} /> Home</Link></div></div>
        <div className="auth-card fade-in">
          <h1 className="auth-title">Welcome back</h1>
          <p className="muted">Sign in to your Sehatra account.</p>

          <div className="pills auth-pills" role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'patient'} className={cx('pill', mode === 'patient' && 'active')} onClick={() => { setMode('patient'); setError(''); setMfaTicket(null); }}><Mail size={15} /> Email code</button>
            <button type="button" role="tab" aria-selected={mode === 'staff'} className={cx('pill', mode === 'staff' && 'active')} onClick={() => { setMode('staff'); setError(''); setMfaTicket(null); }}><Lock size={15} /> Password</button>
          </div>

          {error && <div className="form-error mb-2">{error}</div>}

          {mfaTicket && <MfaPrompt ticket={mfaTicket} onDone={(r) => signIn(r.token)} onCancel={() => { setMfaTicket(null); setPassword(''); }} />}

          {!mfaTicket && mode === 'staff' && (
            <form className="stack" onSubmit={loginPassword}>
              <Field label="Email">
                <div className="input-wrap"><Mail /><input className="input" type="email" inputMode="email" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="you@hospital.in" autoComplete="username" aria-label="Email" required /></div>
              </Field>
              <Field label="Password">
                <div className="input-wrap">
                  <Lock />
                  <input className="input pw-input" type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" autoComplete="current-password" aria-label="Password" required />
                  <button type="button" className="pw-toggle" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? 'Hide password' : 'Show password'}>{showPw ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                </div>
              </Field>
              <div className="row" style={{ justifyContent: 'flex-end', marginTop: -6 }}>
                <Link to="/forgot-password" state={{ email: identifier.includes('@') ? identifier.trim() : '' }} className="small">Forgot password?</Link>
              </div>
              <Button type="submit" size="lg" block loading={busy}>Sign in <ArrowRight /></Button>
              <p className="tiny muted center mb-0"><ShieldCheck size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> Staff accounts always sign in with their password — one-time codes are only for patients.</p>
            </form>
          )}

          {!mfaTicket && mode === 'patient' && (
            <>
              <OtpFlow onDone={onOtp} />
            </>
          )}

          {!mfaTicket && googleUrl && (
            <>
              <div className="auth-divider" role="separator"><span>or</span></div>
              <Button type="button" variant="secondary" size="lg" block loading={googleBusy} onClick={google} className="auth-google">
                <GoogleMark /> Continue with Google
              </Button>
              <p className="tiny muted center mb-0">For an existing Sehatra account with the same email.</p>
            </>
          )}

          {/* One calm "new here?" block instead of three crowded lines. */}
          <div className="auth-divider" role="separator"><span>New to Sehatra?</span></div>
          <Link to="/signup" state={location.state?.from ? { from: location.state.from } : undefined} className="btn secondary lg block auth-alt"><UserPlus size={17} /> Create your free Health Passport</Link>
          <Link to="/join" className="auth-join"><Stethoscope size={16} /><span>Doctor, clinic, lab or pharmacy? <strong>Join the network</strong></span><ChevronRight size={16} /></Link>
        </div>
      </div>

      {/* Demo accounts only on a demo deployment — while the config loads (or if it can't be read) show the live panel. */}
      {config?.demo !== true ? (
        <aside className="auth-side">
          <div className="auth-side-inner">
            <span className="eyebrow" style={{ color: '#f3b89f' }}>Sehatra</span>
            <h2>One secure sign-in for every part of the network.</h2>
            <p>Patients sign in with a one-time code sent to their email. Doctors, hospitals, labs, pharmacies and E-Clinic staff use their email and password — every access is logged and you control who sees your records.</p>
          </div>
        </aside>
      ) : (
      <aside className="auth-side">
          <div className="auth-side-inner">
            <span className="eyebrow" style={{ color: '#f3b89f' }}>Exploring the proof of concept?</span>
            <h2>Try any portal with a demo account</h2>
            <p>Tap an account to fill it in. Every password is <span className="mono demo-pw">Demo@123</span>. Changes you make show up live in the other portals — try booking as a patient and watching the doctor&apos;s queue.</p>
            <div className="demo-list">
              {DEMO.map((d) => (
                <button key={d.email} className={cx('demo-item', identifier === d.email && 'on')} onClick={() => pickDemo(d)}>
                  <span className="demo-role">{ROLE_LABEL[d.role]}</span>
                  <span className="grow">
                    <span className="demo-who">{d.who}</span>
                    <span className="demo-note">{d.note}</span>
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}

// Google's "G" mark (their sign-in button guidelines ask for it next to the label).
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
