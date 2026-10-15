import { useEffect, useState } from 'react';

// Deployment facts from the server (demo vs live network, which code channels are live). Cached once.
let cache = null;
let pending = null;
const load = () => {
  if (!pending) pending = fetch('/api/public/config').then((r) => r.json()).then((c) => { cache = c; return c; }).catch(() => ({ demo: true }));
  return pending;
};

export function usePublicConfig() {
  const [config, setConfig] = useState(cache);
  useEffect(() => { if (!cache) load().then(setConfig); }, []);
  return config;
}
