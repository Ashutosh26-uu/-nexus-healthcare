import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { api, session, subscribe } from './api';

// Stale-while-revalidate: revisiting a screen paints its last data at once and refreshes behind it.
// In memory only, never localStorage/IndexedDB — health data, often on a shared family phone — so it dies
// with the tab, and is wiped on sign-in/out, a family-profile switch and any 401 (signOut).
const MAX_ENTRIES = 60;
const MAX_AGE = 15 * 60 * 1000; // older than this is too stale to show even for a moment
const FRESH_MS = 2000; // younger than this (e.g. warmed on nav hover) isn't refetched on mount
const cache = new Map(); // `${profile}|${url}` → { data, at, seq }; Map order = LRU order
const inflight = new Map(); // same key → promise: identical GETs fired together share one request
let owner; // token the cache was filled under — another account never reads it, even if a clear was missed
let gen = 0; // bumped on every clear, so a response still in flight can't refill it for the old session
let seq = 0; // request order: an older response landing late never overwrites a newer one

const keyOf = (url) => `${session.profile || ''}|${url}`;

export function clearLiveCache() {
  cache.clear();
  inflight.clear();
  gen += 1;
  owner = session.token;
}

function cacheGet(url) {
  if (session.token !== owner) clearLiveCache();
  const key = keyOf(url);
  const e = cache.get(key);
  if (!e) return null;
  cache.delete(key);
  if (Date.now() - e.at > MAX_AGE) return null;
  cache.set(key, e); // most recently used goes last
  return e;
}

function cachePut(key, data, g, s = ++seq) {
  if (g !== gen || data === undefined) return;
  const old = cache.get(key);
  if (old && old.seq > s) return;
  cache.delete(key);
  cache.set(key, { data, at: Date.now(), seq: s });
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value);
}

// `fresh` (explicit reloads after a mutation) never joins an older in-flight GET; later callers join it.
function sharedGet(url, fresh) {
  if (session.token !== owner) clearLiveCache();
  const key = keyOf(url);
  let p = !fresh && inflight.get(key);
  if (!p) {
    const g = gen;
    const s = ++seq;
    p = api.get(url)
      .then((d) => { cachePut(key, d, g, s); return d; })
      .finally(() => { if (inflight.get(key) === p) inflight.delete(key); });
    inflight.set(key, p);
  }
  return p;
}

// Warm the cache before a tap (nav hover/touch, idle time): the next screen mounts with its data.
export function prefetchLive(url) {
  if (!url || !session.token) return;
  const hit = cacheGet(url);
  if (hit && Date.now() - hit.at < 30000) return;
  sharedGet(url).catch(() => {});
}

// How many screens are quietly refreshing cached data — PortalLayout shows a thin bar meanwhile.
let refreshing = 0;
const refreshSubs = new Set();
const bumpRefreshing = (n) => { refreshing += n; refreshSubs.forEach((f) => f()); };
export const useRefreshing = () => useSyncExternalStore((f) => { refreshSubs.add(f); return () => refreshSubs.delete(f); }, () => refreshing > 0);

// Fetch a URL and refetch automatically whenever the server broadcasts one of `topics`.
// `loading` is true only while there's nothing to show (first visit → skeleton); a revisit renders the
// cached data with loading=false and refreshes quietly. `cache: false` for shared public screens (kiosk).
export function useLive(url, topics = [], deps = [], { cache: useCache = true } = {}) {
  const [data, setDataState] = useState(() => (url && useCache ? cacheGet(url)?.data ?? null : null));
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(() => !!url && data === null);
  const topicsRef = useRef(topics);
  topicsRef.current = topics;
  const reqId = useRef(0);
  const slot = useRef(null); // { key, gen } this hook reads/writes — fixed when the url/profile loads

  const load = useCallback(async (silent, fresh) => {
    const id = ++reqId.current;
    if (!url) { setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      const d = await (useCache ? sharedGet(url, fresh) : api.get(url));
      if (id !== reqId.current) return; // a newer request superseded this one
      setDataState(d);
      setError(null);
    } catch (e) {
      if (id === reqId.current) setError(e.message);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, useCache, ...deps]);

  // New url/deps → show that key's cached data (or nothing, so the previous screen's never flashes under
  // it), then revalidate: quietly behind cached data, with the skeleton when there's none.
  useEffect(() => {
    const hit = url && useCache ? cacheGet(url) : null;
    slot.current = url && useCache ? { key: keyOf(url), gen } : null;
    setDataState(hit ? hit.data : null);
    setError(null);
    if (!hit) { load(); return undefined; }
    setLoading(false);
    if (Date.now() - hit.at < FRESH_MS) return undefined;
    let counted = true;
    bumpRefreshing(1);
    load(true).finally(() => { if (counted) { counted = false; bumpRefreshing(-1); } });
    return () => { if (counted) { counted = false; bumpRefreshing(-1); } };
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => subscribe((incoming) => {
    if (incoming.includes('all') || incoming.some((t) => topicsRef.current.includes(t))) load(true);
  }), [load]);

  // Callers' local edits (optimistic updates, results of a mutation) go into the cache too, so a revisit
  // doesn't flash the pre-edit data — but only into this hook's own slot, and only if no sign-out or
  // profile switch happened since (a late write must never land under another person's key).
  const setData = useCallback((v) => setDataState((prev) => {
    const next = typeof v === 'function' ? v(prev) : v;
    if (slot.current) cachePut(slot.current.key, next, slot.current.gen);
    return next;
  }), []);

  // Explicit reloads (usually after a mutation) must not join an older in-flight GET.
  // Stable identity: callers put `reload` in memo/effect deps (e.g. the patient context value).
  const reload = useCallback(() => load(true, true), [load]);
  return { data, error, loading, reload, setData };
}
