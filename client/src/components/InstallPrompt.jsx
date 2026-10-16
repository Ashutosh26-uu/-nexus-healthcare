import { lazy, Suspense, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, X, Share, SquarePlus, MoreVertical, Smartphone, Zap, WifiOff, Bell } from 'lucide-react';
import { LogoMark } from './Logo';
import { useConsent } from '../consent';

const QR = lazy(() => import('./QR'));
const SNOOZE_KEY = 'oc_install_snooze_until';
const SNOOZE_DAYS = 7;
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isIosSafari = () => isIos() && !/crios|fxios|edgios/i.test(navigator.userAgent);
const isMobile = () => isIos() || /android|mobile/i.test(navigator.userAgent);
const snoozed = () => { try { return Date.now() < Number(localStorage.getItem(SNOOZE_KEY) || 0); } catch { return false; } };

// "Get the Nexus app" — shown on the website after the visitor has made their cookie choice (so the two
// never stack). Nexus is an installable app (PWA): one-tap install on Android/Chrome/Edge, Add-to-Home-
// Screen steps on iPhone, and a QR code on computers to open it on a phone. "Not now" snoozes for a week.
export default function InstallPrompt() {
  const consentCtx = useConsent();
  const [can, setCan] = useState(Boolean(window.__installPrompt));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const on = () => setCan(true);
    const installed = () => { setCan(false); setOpen(false); try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + 3650 * 86400000)); } catch { /* ignore */ } };
    window.addEventListener('oc:installable', on);
    window.addEventListener('appinstalled', installed);
    return () => { window.removeEventListener('oc:installable', on); window.removeEventListener('appinstalled', installed); };
  }, []);

  // Open a moment after the cookie choice, once per snooze period, never inside the installed app.
  const decided = Boolean(consentCtx?.consent);
  useEffect(() => {
    if (!decided || isStandalone() || snoozed()) return undefined;
    const t = setTimeout(() => setOpen(true), 1200);
    return () => clearTimeout(t);
  }, [decided]);

  if (!open) return null;
  const close = () => { setOpen(false); try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86400000)); } catch { /* ignore */ } };
  const install = async () => {
    const p = window.__installPrompt;
    if (!p) return;
    let outcome;
    try { p.prompt(); ({ outcome } = await p.userChoice); } catch { /* a prompt can only be shown once per event */ }
    window.__installPrompt = null;
    setCan(false);
    if (outcome === 'accepted') close();
  };
  const ios = isIosSafari();
  const mobile = isMobile();
  const url = `${window.location.origin}/?source=qr`;

  return createPortal(
    <div className="app-pop-wrap" role="presentation" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="app-pop" role="dialog" aria-modal="true" aria-label="Get the Nexus Healthcare app">
        <button type="button" className="app-pop-x" onClick={close} aria-label="Not now"><X size={18} /></button>
        <div className="app-pop-head">
          <LogoMark size={52} />
          <div>
            <strong className="app-pop-title">Get the Nexus Healthcare app</strong>
            <span className="small muted">Free · works on any phone</span>
          </div>
        </div>
        <ul className="app-pop-perks small">
          <li><Zap size={15} /> Opens in one tap from your home screen</li>
          <li><WifiOff size={15} /> Fast, even on slow internet</li>
          <li><Bell size={15} /> Booking, medicine and report updates</li>
        </ul>

        {can ? (
          <button type="button" className="btn lg block" onClick={install}><Download size={18} /> Install app</button>
        ) : ios ? (
          <ol className="app-pop-steps small">
            <li><span className="app-pop-n">1</span> Tap <Share size={15} className="inline-ic" /> <strong>Share</strong> at the bottom of Safari</li>
            <li><span className="app-pop-n">2</span> Choose <SquarePlus size={15} className="inline-ic" /> <strong>Add to Home Screen</strong></li>
            <li><span className="app-pop-n">3</span> Tap <strong>Add</strong> — Nexus appears with your apps</li>
          </ol>
        ) : mobile ? (
          <ol className="app-pop-steps small">
            <li><span className="app-pop-n">1</span> Open your browser menu <MoreVertical size={15} className="inline-ic" /></li>
            <li><span className="app-pop-n">2</span> Tap <strong>Install app</strong> or <strong>Add to Home screen</strong></li>
          </ol>
        ) : (
          <div className="app-pop-qr">
            <Suspense fallback={<div className="app-pop-qr-ph" />}><QR value={url} size={132} label="Scan to open Nexus Healthcare on your phone" /></Suspense>
            <div className="small"><Smartphone size={15} className="inline-ic" /> <strong>Scan with your phone camera</strong> to open Nexus, then add it to your home screen.<span className="tiny muted" style={{ display: 'block', marginTop: 4 }}>On this computer: use the install icon in the address bar.</span></div>
          </div>
        )}
        <button type="button" className="btn ghost block app-pop-later" onClick={close}>Not now</button>
      </div>
    </div>,
    document.body,
  );
}
