// Tell our own server about JavaScript errors people hit, so the team sees them under Admin → Monitoring.
// Sends only the error message, the first stack lines and the page path (no query string, no user data);
// the server scrubs it again. At most 5 reports per page load, each distinct error once.
const seen = new Set();
let sent = 0;

export function reportError(error, extra = '') {
  try {
    if (!import.meta.env.PROD || sent >= 5) return;
    const message = `${error?.name && error.name !== 'Error' ? `${error.name}: ` : ''}${error?.message || String(error || '')}${extra ? ` (${extra})` : ''}`.slice(0, 300);
    if (!message || seen.has(message)) return;
    seen.add(message); sent += 1;
    const body = JSON.stringify({ message, stack: String(error?.stack || '').split('\n').slice(0, 6).join('\n').slice(0, 2000), path: location.pathname });
    if (navigator.sendBeacon) navigator.sendBeacon('/api/client-errors', new Blob([body], { type: 'application/json' }));
    else fetch('/api/client-errors', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch { /* reporting must never break the page */ }
}

export function installErrorReporting() {
  window.addEventListener('error', (e) => { if (e.error || e.message) reportError(e.error || { message: e.message, stack: `at ${e.filename}:${e.lineno}:${e.colno}` }); });
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason instanceof Error ? e.reason : { message: `Unhandled promise: ${String(e.reason).slice(0, 200)}` }));
}
