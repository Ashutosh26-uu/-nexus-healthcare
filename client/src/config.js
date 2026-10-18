import { useEffect, useState } from 'react';

// Deployment facts from the server (demo vs live network, which code channels are live). Cached once.
let cache = null;
let pending = null;
const load = () => {
  if (!pending) pending = fetch('/api/public/config').then((r) => r.json()).then((c) => { cache = c; return c; }).catch(() => ({ demo: false })); // unknown → never show demo-only UI
  return pending;
};

export function usePublicConfig() {
  const [config, setConfig] = useState(cache);
  useEffect(() => { if (!cache) load().then(setConfig); }, []);
  return config;
}

// Support contact from the server (SUPPORT_PHONE / SUPPORT_EMAIL / SUPPORT_HOURS). Each is null until set —
// callers hide the line then, so no placeholder number is ever shown.
export function useSupport() {
  const s = usePublicConfig()?.support;
  return { phone: s?.phone || null, email: s?.email || null, hours: s?.hours || null };
}
export const telHref = (phone) => `tel:${String(phone || '').replace(/[^\d+]/g, '')}`;
