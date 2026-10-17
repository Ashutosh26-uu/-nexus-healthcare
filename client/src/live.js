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

// Fetch a URL and refetch automatically whenever the server broadcasts one of `topics`.
export function useLive(url, topics = [], deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(!!url);
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
      setData(d);
      setError(null);
    } catch (e) {
      if (id === reqId.current) setError(e.message);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);

  // New url/deps → drop the previous screen's data so it never flashes under the new key.
  useEffect(() => { setData(null); setError(null); load(); }, [load]);

  useEffect(() => subscribe((incoming) => {
    if (incoming.includes('all') || incoming.some((t) => topicsRef.current.includes(t))) load(true);
  }), [load]);

  // Explicit reloads (usually after a mutation) must not join an older in-flight GET.
  // Stable identity: callers put `reload` in memo/effect deps (e.g. the patient context value).
  const reload = useCallback(() => load(true, true), [load]);
  return { data, error, loading, reload, setData };
}
