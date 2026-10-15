import { ROLE_LABEL } from '../../auth';
import { Empty, Button, Loading } from '../../components/ui';

export const ROLE_TONE = {
  patient: '', caregiver: '', kiosk_operator: 'sun', doctor: 'green', hospital_admin: 'sky', lab_tech: 'plum',
  pharmacist: 'clay', distributor: 'clay', delivery: '', official: 'rose', super_admin: 'solid-ink',
};
export function RoleBadge({ role }) {
  return <span className={`badge ${ROLE_TONE[role] || ''}`}>{ROLE_LABEL[role] || role}</span>;
}

/* Deterministic noise so synthesized monitoring series stay put between renders. */
export function seeded(str) {
  let h = 2166136261;
  for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}
export function around(key, value, n, spread, { min = 0, max = Infinity, digits = 2, end = true } = {}) {
  const rnd = seeded(key);
  const out = Array.from({ length: n }, () => {
    const v = value + (rnd() - 0.5) * 2 * spread;
    return Number(Math.min(max, Math.max(min, v)).toFixed(digits));
  });
  if (end) out[n - 1] = value;
  return out;
}

/* Common loading / error wrapper for useLive results. */
export function LiveGate({ live, children }) {
  if (live.loading && !live.data) return <Loading />;
  if (live.error && !live.data) {
    return (
      <Empty title="Couldn't load this section">
        <p>{live.error}</p>
        <Button size="sm" variant="secondary" onClick={live.reload}>Try again</Button>
      </Empty>
    );
  }
  return children(live.data);
}

export const FACILITY_LABEL = { hospital: 'Hospital', lab: 'Lab', pharmacy: 'Pharmacy', kiosk: 'Kiosk', warehouse: 'Warehouse' };
