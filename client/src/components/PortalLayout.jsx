import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Bell, LogOut, Menu, X, ChevronDown, KeyRound } from 'lucide-react';
import Logo from './Logo';
import LanguagePicker from './LanguagePicker';
import { useAuth, ROLE_LABEL } from '../auth';
import { api, subscribe, session } from '../api';
import { Avatar, timeAgo, cx, Modal, Field, Button, useToast } from './ui';
import './portal.css';

/**
 * Shared shell for every portal.
 * nav: [{ to, label, icon, end, badge }]
 */
export default function PortalLayout({ portal, nav, children, headerExtra }) {
  const { user, facility, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [notes, setNotes] = useState([]);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => { setOpen(false); setBellOpen(false); setMenuOpen(false); }, [location.pathname]);

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
            <span>Call 1800-200-4455 or tap the chat bubble.</span>
          </div>
        </div>
      </aside>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}

      <div className="portal-main">
        <header className="topbar">
          <button className="icon-btn only-mobile" onClick={() => setOpen(true)} aria-label="Open menu"><Menu /></button>
          <div className="grow topbar-extra">{headerExtra}</div>
          <LanguagePicker compact />
          <div className="pop-wrap">
            <button className="icon-btn" onClick={openBell} aria-label="Notifications">
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
          <div className="pop-wrap">
            <button className="user-btn" onClick={() => { setMenuOpen((v) => !v); setBellOpen(false); }}>
              <Avatar name={user?.name} size="sm" />
              <span className="user-meta">
                <span className="small notranslate" translate="no" style={{ fontWeight: 600 }}>{user?.name}</span>
                <span className="tiny muted">{ROLE_LABEL[user?.role]}</span>
              </span>
              <ChevronDown size={16} className="muted" />
            </button>
            {menuOpen && (
              <div className="popover menu-pop">
                <div className="pop-head"><div><strong className="small">{user?.name}</strong><div className="tiny muted">{user?.email}</div></div></div>
                <button className="menu-item" onClick={() => { setPwOpen(true); setMenuOpen(false); }}><KeyRound size={16} /> Change password</button>
                <button className="menu-item" onClick={() => { signOut(); navigate('/'); }}><LogOut size={16} /> Sign out</button>
              </div>
            )}
          </div>
        </header>
        <main className="portal-content" key={location.pathname}>{children}</main>
      </div>
      <PasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  );
}

function PasswordModal({ open, onClose }) {
  const toast = useToast();
  const [form, setForm] = useState({ current: '', next: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const r = await api.post('/auth/password', form);
      if (r.token) session.token = r.token; // other devices are signed out; keep this one
      toast('Password updated');
      setForm({ current: '', next: '' });
      onClose();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Change password">
      <form className="stack" onSubmit={submit}>
        {err && <div className="form-error">{err}</div>}
        <Field label="Current password"><input className="input" type="password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} required /></Field>
        <Field label="New password" hint="At least 8 characters"><input className="input" type="password" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} required /></Field>
        <Button loading={busy} type="submit">Update password</Button>
      </form>
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
