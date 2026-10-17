import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Share2, LocateFixed, Link2, Check, Info } from 'lucide-react';
import Logo from '../../components/Logo';
import LanguagePicker from '../../components/LanguagePicker';
import { useAuth, ROLE_HOME } from '../../auth';
import { cx } from '../../components/ui';
import { canonicalUrl } from '../../seo';
import './public.css';

// Shared frame for the public, no-login pages: a light header with the free tools, a footer, and helpers for
// sharing, "near me" and the sign-in-then-continue call to action.
export function PublicPage({ children }) {
  const { user } = useAuth();
  const home = user ? ROLE_HOME[user.role] : null;
  return (
    <div className="pb">
      <header className="pb-head">
        <div className="pb-wrap pb-head-row">
          <Logo />
          <div className="row pb-head-cta">
            <LanguagePicker compact />
            {home ? <Link className="btn sm" to={home}>Dashboard</Link> : <Link className="btn sm" to="/login">Sign in</Link>}
          </div>
        </div>
        <nav className="pb-wrap pb-tabs" aria-label="Free tools">
          <NavLink to="/medicines">Medicine prices</NavLink>
          <NavLink to="/lab-tests">Lab test prices</NavLink>
          <NavLink to="/find/doctors">Find a doctor</NavLink>
          <NavLink to="/find/labs">Labs near you</NavLink>
        </nav>
      </header>
      <main className="pb-wrap pb-main">{children}</main>
      <footer className="pb-foot">
        <div className="pb-wrap">
          <div className="pb-foot-links">
            <Link to="/">Home</Link>
            <Link to="/medicines">Medicine price checker</Link>
            <Link to="/lab-tests">Lab test prices</Link>
            <Link to="/find/doctors">Find a doctor</Link>
            <Link to="/find/labs">Labs</Link>
            <Link to="/join">Doctors &amp; clinics — join Nexus</Link>
          </div>
          <p className="tiny muted mb-0">Nexus Healthcare gives guidance, not diagnosis. Prices shown are indicative. In an emergency, call 108.</p>
        </div>
      </footer>
    </div>
  );
}

// "Share on WhatsApp" + the phone's own share sheet (when it has one) + copy link.
export function ShareBar({ title, path, text }) {
  const url = canonicalUrl(path);
  const message = `${text || title} ${url}`;
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const nativeShare = () => { navigator.share({ title, text: text || title, url }).catch(() => {}); };
  const copy = () => {
    navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {});
  };
  return (
    <div className="pb-share">
      <a className="btn sm pb-wa" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
        <WhatsAppIcon /> Share on WhatsApp
      </a>
      {canShare
        ? <button type="button" className="btn sm secondary" onClick={nativeShare}><Share2 /> Share</button>
        : <button type="button" className="btn sm secondary" onClick={copy}>{copied ? <Check /> : <Link2 />} {copied ? 'Link copied' : 'Copy link'}</button>}
    </div>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="currentColor"><path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35ZM12.04 21.5h-.01a9.4 9.4 0 0 1-4.8-1.31l-.34-.2-3.57.93.95-3.48-.22-.36A9.43 9.43 0 1 1 12.04 21.5Zm8.02-17.47A11.3 11.3 0 0 0 12.04.7C5.8.7.72 5.78.72 12.02c0 2 .52 3.94 1.51 5.65L.62 23.5l5.97-1.57a11.3 11.3 0 0 0 5.45 1.39h.01c6.24 0 11.32-5.08 11.32-11.32 0-3.02-1.18-5.87-3.31-8Z" /></svg>
  );
}

export function NearMeButton({ near }) {
  if (near.state === 'on') return <button type="button" className="chip on" onClick={near.clear}><LocateFixed size={14} /> Near me · on</button>;
  return (
    <span className="row wrap" style={{ gap: 8 }}>
      <button type="button" className="chip" onClick={near.request} disabled={near.state === 'asking'}><LocateFixed size={14} /> {near.state === 'asking' ? 'Finding you…' : 'Use my location'}</button>
      {near.state === 'denied' && <span className="tiny muted">Location is off — showing all of the network.</span>}
      {near.state === 'unsupported' && <span className="tiny muted">This browser can&apos;t share location.</span>}
    </span>
  );
}


export function Stars({ rating, count }) {
  if (!rating) return <span className="badge sky">New</span>;
  return <span className="pb-stars"><span aria-hidden="true">★</span> <strong>{rating.toFixed(1)}</strong> <span className="muted">({count} review{count === 1 ? '' : 's'})</span></span>;
}

export function Note({ children, tone }) {
  return <div className={cx('callout', tone)}><Info /><span>{children}</span></div>;
}

export function SkeletonList({ n = 3, h = 88 }) {
  return <div className="stack">{Array.from({ length: n }, (_, i) => <div key={i} className="skeleton" style={{ height: h, borderRadius: 14 }} />)}</div>;
}
