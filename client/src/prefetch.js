import { createElement, lazy, useEffect, useState } from 'react';

// Lazy pages that download themselves in the background once the portal has settled, so the first click on any
// menu item opens instantly instead of showing a loading skeleton. Only code is fetched — never data — and
// nothing is fetched on Data Saver or 2G connections.
export function pageLoader() {
  const loaders = [];
  // Once a page's code is here, it renders directly. Going through React.lazy every time would "suspend" for a
  // moment, and React then keeps the loading skeleton up for ~300 ms — the lag people felt on every first tap.
  const page = (load) => {
    let Ready = null;
    const loadAndKeep = () => load().then((m) => { Ready = m.default; return m; });
    loaders.push(loadAndKeep);
    const Lazy = lazy(loadAndKeep);
    // Chosen once per mount: switching from Lazy to Ready mid-life would remount the page and lose what was typed.
    return function Page(props) { const [Comp] = useState(() => Ready || Lazy); return createElement(Comp, props); };
  };
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
