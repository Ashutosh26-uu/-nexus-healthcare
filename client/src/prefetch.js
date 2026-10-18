import { lazy, useEffect } from 'react';

// Lazy pages that download themselves in the background once the portal has settled, so the first click on any
// menu item opens instantly instead of showing a loading skeleton. Only code is fetched — never data — and
// nothing is fetched on Data Saver or 2G connections.
export function pageLoader() {
  const loaders = [];
  const page = (load) => { loaders.push(load); return lazy(load); };
  const usePrefetch = () => useEffect(() => {
    const c = navigator.connection;
    if (c?.saveData || /(^|-)2g$/.test(c?.effectiveType || '')) return undefined;
    let cancelled = false;
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1));
    const run = async () => {
      // One at a time, so it never competes with what the user is doing right now.
      for (const load of loaders) {
        if (cancelled) return;
        await load().catch(() => {});
        await new Promise((r) => idle(r, { timeout: 2000 }));
      }
    };
    const t = setTimeout(() => idle(run, { timeout: 4000 }), 2500);
    return () => { cancelled = true; clearTimeout(t); };
  }, []);
  return { page, usePrefetch };
}
