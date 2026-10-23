import { useCallback, useEffect, useRef, useState } from 'react';
import { api, session, subscribe } from './api';

// Identical GETs fired together (e.g. several screens reacting to one SSE event) share one request.
const inflight = new Map();
function sharedGet(url) {
  const key = `${session.profile || ''}|${url}`;
  let p = inflight.get(key);
  if (!p) {
    p = api.get(url).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

// Stale-while-revalidate: the last answer for each URL is kept in memory, so going back to a screen shows it at
// once while a fresh copy loads quietly in the background. Memory only (gone on reload, never written to the
// device), keyed by the signed-in session and family profile so one person never sees another's data.
const cache = new Map();
const CACHE_MAX = 60;
const cacheKey = (url) => `${String(session.token || '').slice(-16)}|${session.profile || ''}|${url}`;
const cached = (url) => (url ? cache.get(cacheKey(url)) : undefined);
function remember(url, data) {
  const k = cacheKey(url);
  cache.delete(k);
  cache.set(k, data);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

/**
 * Warm the memory for screens the person is likely to open next, so even their first visit is instant.
 * One request at a time while the phone is idle; skipped on data-saver and 2G, and for what's already there.
 */
export function prefetchLive(urls) {
  const c = typeof navigator !== 'undefined' ? navigator.connection : null;
  if (c?.saveData || /(^|-)2g$/.test(c?.effectiveType || '')) return () => {};
  let cancelled = false;
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 200));
  (async () => {
    for (const url of urls) {
      if (cancelled) return;
      await new Promise((r) => idle(r, { timeout: 3000 }));
      if (cancelled || cached(url) !== undefined) continue;
      try { remember(url, await sharedGet(url)); } catch { /* the screen will load it itself */ }
    }
  })();
  return () => { cancelled = true; };
}

// Fetch a URL and refetch automatically whenever the server broadcasts one of `topics`.
export function useLive(url, topics = [], deps = []) {
  const [data, setData] = useState(() => cached(url) ?? null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(() => !!url && cached(url) === undefined);
  const topicsRef = useRef(topics);
  topicsRef.current = topics;
  const reqId = useRef(0);

  const load = useCallback(async (silent, fresh) => {
    const id = ++reqId.current;
    if (!url) { setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      const d = await (fresh ? api.get(url) : sharedGet(url));
      if (id !== reqId.current) return; // a newer request superseded this one
      remember(url, d);
      setData(d);
      setError(null);
    } catch (e) {
      if (id === reqId.current) setError(e.message);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);

  // New url/deps → show what we remember for the new key (or nothing — the previous screen's data must never
  // flash under it), then refresh: quietly when there was something to show, with a loading state when not.
  useEffect(() => {
    const c = cached(url);
    setData(c ?? null);
    setError(null);
    load(c !== undefined);
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => subscribe((incoming) => {
    if (incoming.includes('all') || incoming.some((t) => topicsRef.current.includes(t))) load(true);
  }), [load]);

  // Explicit reloads (usually after a mutation) must not join an older in-flight GET.
  // Stable identity: callers put `reload` in memo/effect deps (e.g. the patient context value).
  const reload = useCallback(() => load(true, true), [load]);
  return { data, error, loading, reload, setData };
}

// A counter that goes up whenever the server broadcasts one of `topics` (or 'all' after a reconnect). Put it in
// an effect's dependencies to refetch hand-built requests live, the same way useLive does.
export function useTopicTick(topics) {
  const [tick, setTick] = useState(0);
  const key = topics.join('|');
  useEffect(() => {
    const want = key.split('|');
    return subscribe((incoming) => { if (incoming.includes('all') || incoming.some((t) => want.includes(t))) setTick((n) => n + 1); });
  }, [key]);
  return tick;
}
