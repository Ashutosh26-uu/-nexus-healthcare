import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Bell, LogOut, Menu, X, ChevronDown, KeyRound, Cookie, MapPin, ShieldCheck } from 'lucide-react';
import Logo from './Logo';
import LanguagePicker from './LanguagePicker';
import { LocationChip, openCookieSettings, openLocationSettings } from '../consent';
import { useAuth, ROLE_LABEL } from '../auth';
import { api, subscribe } from '../api';
import { useSupport, telHref } from '../config';
import { Avatar, timeAgo, cx, Modal, Field, Button, useToast } from './ui';
import './portal.css';

// Only needed once someone opens "Change password".
const ResetPassword = lazy(() => import('./ResetPassword'));
const TwoStepModal = lazy(() => import('./TwoStep'));

/**
 * Shared shell for every portal.
 * nav: [{ to, label, icon, end, badge }]
 */
export default function PortalLayout({ portal, nav, children, headerExtra }) {
  const { user, facility, signOut } = useAuth();
  const support = useSupport();
  const [open, setOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [mfaOpen, setMfaOpen] = useState(false);
  // Admins and officials can see many people's data: until two-step login is on, the menu button carries a dot.
  const nudgeMfa = ['super_admin', 'official'].includes(user?.role) && user?.mfaEnabled === false;
  // Admins, officials and hospital admins must use two-step login: show a standing banner until it's on.
  const mustMfa = user?.mfaSetupRequired === true;
  const [notes, setNotes] = useState([]);
  const location = useLocation();
  const navigate = useNavigate();
  const bellRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => { setOpen(false); setBellOpen(false); setMenuOpen(false); }, [location.pathname]);

  // Popovers close on a tap anywhere else or Escape, like every other dropdown in the app.
  useEffect(() => {
    if (!bellOpen && !menuOpen) return undefined;
    const closeAll = () => { setBellOpen(false); setMenuOpen(false); };
    const onDoc = (e) => { if (!bellRef.current?.contains(e.target) && !menuRef.current?.contains(e.target)) closeAll(); };
    const onKey = (e) => e.key === 'Escape' && closeAll();
    document.addEventListener('pointerdown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [bellOpen, menuOpen]);

  useEffect(() => {
    let alive = true;
    let last = 0;
    let timer = null;
    const load = () => { last = Date.now(); timer = null; api.get('/notifications').then((n) => alive && setNotes(n)).catch(() => {}); };
    load();
    // Any broadcast may carry a notification (no route uses a dedicated topic), so refetch on all but
    // 'hello' — throttled to once per 2 s, with a trailing call so the last event isn't missed.
    const unsub = subscribe((topics) => {
      if (timer || topics.every((t) => t === 'hello')) return;
      timer = setTimeout(load, Math.max(0, 2000 - (Date.now() - last)));
    });
    return () => { alive = false; clearTimeout(timer); unsub(); };
  }, []);

  const unread = notes.filter((n) => !n.read).length;
  const openBell = () => {
    setBellOpen((v) => !v);
    setMenuOpen(false);
    if (unread) api.post('/notifications/read').then(() => setNotes((n) => n.map((x) => ({ ...x, read: true })))).catch(() => {});
  };

  return (
    <div className="portal">
      <aside className={cx('sidebar', open && 'open')}>
        <div className="sidebar-top">
          <Logo to={nav[0]?.to || '/'} sub={portal} />
          <button className="icon-btn only-mobile" onClick={() => setOpen(false)} aria-label="Close menu"><X /></button>
        </div>
        <nav className="side-nav">
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => cx('side-link', isActive && 'active')}>
              {item.icon && <item.icon />}
              <span className="grow">{item.label}</span>
              {item.badge ? <span className="side-badge">{item.badge}</span> : null}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          {facility && (
            <div className="facility-chip">
              <span className={cx('dot', facility.status === 'offline' ? 'rose' : 'green')} />
              <span className="grow small">{facility.name}</span>
            </div>
          )}
          <div className="help-card">
            <strong>Need a hand?</strong>
            <span>{support.phone ? <>Call <a href={telHref(support.phone)} translate="no">{support.phone}</a> or tap the chat bubble.</> : 'Tap the chat bubble to ask Saathi.'}</span>
          </div>
        </div>
      </aside>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}

      <div className="portal-main">
        <header className="topbar">
          <button className="icon-btn only-mobile" onClick={() => setOpen(true)} aria-label="Open menu"><Menu /></button>
          <div className="grow topbar-extra">{headerExtra}</div>
          {['patient', 'caregiver'].includes(user?.role) && <LocationChip />}
          <LanguagePicker compact />
          <div className="pop-wrap" ref={bellRef}>
            <button className="icon-btn" onClick={openBell} aria-label="Notifications" aria-expanded={bellOpen}>
              <Bell />
              {unread > 0 && <span className="bell-dot">{unread}</span>}
            </button>
            {bellOpen && (
              <div className="popover notif-pop">
                <div className="pop-head"><strong>Notifications</strong><span className="tiny muted">{notes.length} recent</span></div>
                <div className="notif-list">
                  {notes.length === 0 && <p className="muted small center" style={{ padding: 24 }}>You&apos;re all caught up.</p>}
                  {notes.map((n) => (
                    <div key={n.id} className={cx('notif', !n.read && 'unread', n.kind)}>
                      <div className="small"><strong>{n.title}</strong></div>
                      <div className="small muted">{n.body}</div>
                      <div className="tiny muted mt-1">{timeAgo(n.at)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="pop-wrap" ref={menuRef}>
            <button className="user-btn" onClick={() => { setMenuOpen((v) => !v); setBellOpen(false); }} aria-haspopup="menu" aria-expanded={menuOpen}>
              <Avatar name={user?.name} size="sm" />
              <span className="user-meta">
                <span className="small notranslate" translate="no" style={{ fontWeight: 600 }}>{user?.name}</span>
                <span className="tiny muted">{ROLE_LABEL[user?.role]}</span>
              </span>
              <ChevronDown size={16} className="muted" />
              {nudgeMfa && <span className="bell-dot" title="Turn on two-step login" aria-label="Two-step login is off">!</span>}
            </button>
            {menuOpen && (
              <div className="popover menu-pop">
                <div className="pop-head"><div><strong className="small">{user?.name}</strong><div className="tiny muted">{user?.email}</div></div></div>
                <button className="menu-item" onClick={() => { setPwOpen(true); setMenuOpen(false); }}><KeyRound size={16} /> Change password</button>
                <button className="menu-item" onClick={() => { setMfaOpen(true); setMenuOpen(false); }}><ShieldCheck size={16} /> Two-step login <span className={cx('badge tiny', user?.mfaEnabled ? 'green' : nudgeMfa ? 'sun' : '')} style={{ marginInlineStart: 'auto' }}>{user?.mfaEnabled ? 'On' : 'Off'}</span></button>
                {['patient', 'caregiver'].includes(user?.role) && <button className="menu-item" onClick={() => { openLocationSettings(); setMenuOpen(false); }}><MapPin size={16} /> My location</button>}
                <button className="menu-item" onClick={() => { openCookieSettings(); setMenuOpen(false); }}><Cookie size={16} /> Cookie preferences</button>
                <button className="menu-item" onClick={() => { signOut(); navigate('/'); }}><LogOut size={16} /> Sign out</button>
                {/* Ends every session on every device at once — for a lost phone or a shared computer left signed in. */}
                <button className="menu-item" onClick={async () => { if (!window.confirm('Sign out on every device, including this one?')) return; try { await api.post('/auth/logout-all'); } catch { /* signed out below either way */ } signOut(); navigate('/'); }}><LogOut size={16} /> Sign out of all devices</button>
              </div>
            )}
          </div>
        </header>
        {mustMfa && (
          <div className="mfa-gate" role="alert">
            <ShieldCheck size={18} />
            <span className="grow"><strong>Turn on two-step login.</strong> Your role can see many people&apos;s health data, so Sehatra requires a second step at sign-in. It takes about a minute.</span>
            <button type="button" className="btn sm" onClick={() => setMfaOpen(true)}>Set up now</button>
          </div>
        )}
        <main className="portal-content" key={location.pathname}>{children}</main>
      </div>
      <PasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
      {mfaOpen && <Suspense fallback={null}><TwoStepModal open={mfaOpen} onClose={() => setMfaOpen(false)} /></Suspense>}
    </div>
  );
}

// Change password: by default with a 6-digit code sent to the account's email (works even if the current
// password is forgotten, and sets one for accounts that never had it). "I know my current password" is the
// quick alternative. Either way the server signs out every other device and this one gets a fresh token.
function PasswordModal({ open, onClose }) {
  const toast = useToast();
  const { user, signIn } = useAuth();
  const [mode, setMode] = useState('code');
  const [form, setForm] = useState({ current: '', next: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (open) { setMode('code'); setErr(''); setForm({ current: '', next: '' }); } }, [open]);
  const finish = async (token) => {
    if (token) await signIn(token);
    toast('Password changed. You stay signed in here; other devices were signed out.');
    onClose();
  };
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const r = await api.post('/auth/password', form);
      await finish(r.token);
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Change password" subtitle={mode === 'code' ? 'We\'ll email you a 6-digit code, then you choose a new password.' : undefined}>
      {mode === 'code' ? (
        <div className="stack">
          {open && <Suspense fallback={<div className="spinner" />}><ResetPassword accountEmail={user?.email || ''} onDone={(r) => finish(r.token)} /></Suspense>}
          <button type="button" className="link-btn small" onClick={() => { setMode('current'); setErr(''); }}>I know my current password</button>
        </div>
      ) : (
        <form className="stack" onSubmit={submit}>
          {err && <div className="form-error">{err}</div>}
          <Field label="Current password"><input className="input" type="password" autoComplete="current-password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} required /></Field>
          <Field label="New password" hint="At least 8 characters"><input className="input" type="password" autoComplete="new-password" minLength={8} value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} required /></Field>
          <Button loading={busy} type="submit">Update password</Button>
          <button type="button" className="link-btn small" onClick={() => { setMode('code'); setErr(''); }}>Forgot it? Change with an email code</button>
        </form>
      )}
    </Modal>
  );
}

export function PageHeader({ title, subtitle, children, eyebrow }) {
  return (
    <div className="page-header">
      <div className="grow">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="muted mb-0">{subtitle}</p>}
      </div>
      {children && <div className="row wrap page-actions">{children}</div>}
    </div>
  );
}
