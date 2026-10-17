import { lazy } from 'react';

// React.lazy with a .preload(): nav hover/touch and idle time fetch the chunk before the tap, so the
// Suspense skeleton rarely shows. Memoised (preloading twice is free); a failed load may be retried.
export function lazyPage(factory) {
  let p = null;
  const load = () => (p ||= factory().catch((e) => { p = null; throw e; }));
  const Page = lazy(load);
  Page.preload = load;
  return Page;
}

// Background work for when the main thread is free. Skipped on Data Saver / 2G: those users pay per MB.
export function whenIdle(fn) {
  const c = navigator.connection;
  if (c?.saveData || /2g/.test(c?.effectiveType || '')) return () => {};
  if (window.requestIdleCallback) { const id = window.requestIdleCallback(fn, { timeout: 4000 }); return () => window.cancelIdleCallback(id); }
  const id = setTimeout(fn, 1500); // Safari has no requestIdleCallback
  return () => clearTimeout(id);
}
