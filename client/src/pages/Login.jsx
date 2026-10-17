import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Mail, ArrowRight, ArrowLeft, Lock, ShieldCheck, ChevronRight, Eye, EyeOff, UserPlus, Stethoscope } from 'lucide-react';
import Logo from '../components/Logo';
import LanguagePicker from '../components/LanguagePicker';
import OtpFlow from '../components/OtpFlow';
import { api } from '../api';
import { useAuth, ROLE_HOME, ROLE_LABEL } from '../auth';
import { Button, Field, cx } from '../components/ui';
import './auth.css';
import { usePublicConfig } from '../config';

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

  useEffect(() => {
    if (user) navigate(location.state?.from && location.state.from.startsWith(ROLE_HOME[user.role]) ? location.state.from : ROLE_HOME[user.role], { replace: true });
  }, [user, navigate, location.state]);

  const loginPassword = async (e) => {
    e?.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await api.post('/auth/login', { identifier, password, dialCode: '+91' });
      await signIn(r.token);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const onOtp = async (r, who) => {
    if (r.newUser) navigate('/signup', { state: { ticket: r.ticket, email: who.email, country: who.country?.iso } });
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
          <p className="muted">Sign in to your Nexus Healthcare account.</p>

          <div className="pills auth-pills" role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'patient'} className={cx('pill', mode === 'patient' && 'active')} onClick={() => { setMode('patient'); setError(''); }}><Mail size={15} /> Email code</button>
            <button type="button" role="tab" aria-selected={mode === 'staff'} className={cx('pill', mode === 'staff' && 'active')} onClick={() => { setMode('staff'); setError(''); }}><Lock size={15} /> Password</button>
          </div>

          {error && <div className="form-error mb-2">{error}</div>}

          {mode === 'staff' && (
            <form className="stack" onSubmit={loginPassword}>
              <Field label="Email or mobile number">
                <div className="input-wrap"><Mail /><input className="input" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="you@hospital.in" autoComplete="username" aria-label="Email or mobile number" required /></div>
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
              <p className="tiny muted center mb-0"><ShieldCheck size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> Doctors, admins and officials get a second factor in production.</p>
            </form>
          )}

          {mode === 'patient' && (
            <>
              <OtpFlow onDone={onOtp} />
            </>
          )}

          {/* One calm "new here?" block instead of three crowded lines. */}
          <div className="auth-divider" role="separator"><span>New to Nexus Healthcare?</span></div>
          <Link to="/signup" className="btn secondary lg block auth-alt"><UserPlus size={17} /> Create your free Health Passport</Link>
          <Link to="/join" className="auth-join"><Stethoscope size={16} /><span>Doctor, clinic, lab or pharmacy? <strong>Join the network</strong></span><ChevronRight size={16} /></Link>
        </div>
      </div>

      {config?.demo === false ? (
        <aside className="auth-side">
          <div className="auth-side-inner">
            <span className="eyebrow" style={{ color: '#f3b89f' }}>Nexus Healthcare</span>
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
