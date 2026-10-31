import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';
import App from './App';
import { applyEasy } from './components/easyMode';
import { installErrorReporting } from './errorReport';
applyEasy(); // bigger text from the first paint, before React renders
installErrorReporting(); // JavaScript errors → Admin → Monitoring (errorReport.js)

// Remember whether a language was explicitly saved before the i18n provider writes its default,
// so the patient portal can adopt the profile language on first login.
try { window.__ocLangSaved = Boolean(localStorage.getItem('oc_lang')); } catch { window.__ocLangSaved = true; }

// Web fonts: index.html preloads the stylesheet; applying it here (not as a <link rel=stylesheet> in the HTML)
// means it never blocks the first paint — on a slow connection the page shows at once in system fonts.
{
  const href = document.querySelector('link[rel="preload"][as="style"][href*="fonts.googleapis.com"]')?.href;
  if (href && !document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }
}

// The app opens from the saved shell; after a release, a page still on the old build can ask for a code chunk
// the server no longer has. Load the new build once instead of showing an error (guarded against loops).
window.addEventListener('vite:preloadError', (e) => {
  try {
    if (sessionStorage.getItem('oc_reloaded_for') === location.pathname) return;
    sessionStorage.setItem('oc_reloaded_for', location.pathname);
  } catch { /* storage blocked: still reload once */ }
  e.preventDefault();
  window.location.reload();
});

// Installable app (PWA): the service worker caches the app shell only — never /api health data.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
// Keep the browser's install prompt so our own "Install app" button can show it later.
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); window.__installPrompt = e; window.dispatchEvent(new Event('oc:installable')); });

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
