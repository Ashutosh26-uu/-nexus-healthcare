import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import Logo from '../components/Logo';
import LanguagePicker from '../components/LanguagePicker';
import ResetPassword from '../components/ResetPassword';
import { useAuth, ROLE_HOME } from '../auth';
import { useToast } from '../components/ui';
import './auth.css';

// "Forgot password?" — works for every account (patients, doctors, labs, pharmacies, hospitals, admins).
export default function ForgotPassword() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const done = async (r) => {
    // An account still awaiting verification gets its new password but no session until it's approved.
    if (!r.token) { toast(r.message || 'Password changed. You can sign in once your account is approved.'); navigate('/login', { replace: true }); return; }
    await signIn(r.token);
    toast('Password changed — you\'re signed in. Other devices have been signed out.');
    navigate(ROLE_HOME[r.user?.role] || '/', { replace: true });
  };

  return (
    <div className="auth">
      <div className="auth-form-side">
        <div className="auth-top"><Logo /><div className="row"><LanguagePicker /><Link to="/login" className="small muted row" style={{ gap: 6 }}><ArrowLeft size={15} /> Sign in</Link></div></div>
        <div className="auth-card fade-in">
          <h1 className="auth-title">Set a new password</h1>
          <p className="muted">Enter your email. We&apos;ll send you a 6-digit code, then you choose a new password — it works everywhere you sign in.</p>
          <ResetPassword initialEmail={location.state?.email || ''} onDone={done} />
          <p className="tiny muted center mt-2 mb-0"><ShieldCheck size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> For your safety, changing your password signs you out on every other device.</p>
        </div>
      </div>
      <aside className="auth-side">
        <div className="auth-side-inner">
          <span className="eyebrow" style={{ color: '#f3b89f' }}>Nexus Healthcare</span>
          <h2>Locked out? It takes a minute.</h2>
          <p>Use the email address you signed up with. Codes expire in 5 minutes and work only once.</p>
        </div>
      </aside>
    </div>
  );
}
