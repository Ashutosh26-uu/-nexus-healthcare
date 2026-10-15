import { useEffect, useState } from 'react';
import { Download, X, Share } from 'lucide-react';
import { LogoMark } from './Logo';

const DISMISS_KEY = 'oc_install_dismissed';
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);

// "Install Nexus Healthcare" — uses the browser's real install prompt (Android/desktop Chrome, Edge),
// and shows Add-to-Home-Screen steps on iPhone Safari, which has no prompt.
export default function InstallPrompt() {
  const [can, setCan] = useState(Boolean(window.__installPrompt));
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; } });
  const [ios] = useState(() => isIos() && !isStandalone());

  useEffect(() => {
    const on = () => setCan(true);
    const installed = () => { setCan(false); setHidden(true); };
    window.addEventListener('oc:installable', on);
    window.addEventListener('appinstalled', installed);
    return () => { window.removeEventListener('oc:installable', on); window.removeEventListener('appinstalled', installed); };
  }, []);

  if (hidden || isStandalone() || (!can && !ios)) return null;
  const dismiss = () => { setHidden(true); try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ } };
  const install = async () => {
    const p = window.__installPrompt;
    if (!p) return;
    p.prompt();
    const { outcome } = await p.userChoice;
    window.__installPrompt = null;
    if (outcome === 'accepted') setHidden(true); else setCan(false);
  };

  return (
    <div className="install-bar" role="dialog" aria-label="Install the app">
      <LogoMark size={36} />
      <div className="grow">
        <strong>Install Nexus Healthcare</strong>
        <span>{ios ? <>Tap <Share size={13} style={{ verticalAlign: '-2px' }} /> Share, then “Add to Home Screen”.</> : 'Opens like an app, works on slow networks, one tap from your home screen.'}</span>
      </div>
      {!ios && <button type="button" className="btn sm" onClick={install}><Download size={15} /> Install</button>}
      <button type="button" className="install-x" onClick={dismiss} aria-label="Not now"><X size={16} /></button>
    </div>
  );
}
