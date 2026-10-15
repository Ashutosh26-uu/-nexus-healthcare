import { createContext, useContext } from 'react';
import { Lock, Globe2 } from 'lucide-react';

/* One live copy of /gov/overview shared by every Command Center screen. */
export const GovContext = createContext(null);
export const useGov = () => useContext(GovContext);

/* Small, deterministic pseudo-random helper so synthesized trend lines don't jump on every render. */
export function seeded(str) {
  let h = 2166136261;
  for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/* A gentle 12-point series that ends exactly at `value`. Used for KPI sparklines. */
export function trendTo(key, value, n = 12, wobble = 0.08) {
  const rnd = seeded(key);
  const out = [];
  let v = value * (1 - wobble * 1.5 + rnd() * wobble);
  for (let i = 0; i < n - 1; i += 1) {
    out.push(Math.max(0, Math.round(v * 10) / 10));
    v += (value - v) / (n - i) + (rnd() - 0.5) * value * wobble * 0.6;
  }
  out.push(value);
  return out;
}

/* Static gazetteer for the pilot geography — pin code → locality. Facility pins come from seed data. */
export const PINS = {
  Barabanki: [
    { pin: '225001', area: 'Barabanki city · Civil Lines', x: 46, y: 48 },
    { pin: '225003', area: 'Nawabganj', x: 68, y: 44 },
    { pin: '225124', area: 'Haidergarh', x: 34, y: 78 },
    { pin: '225204', area: 'Ramnagar', x: 70, y: 22 },
    { pin: '225301', area: 'Dewa', x: 38, y: 26 },
    { pin: '225305', area: 'Fatehpur', x: 62, y: 66 },
  ],
  Lucknow: [
    { pin: '226001', area: 'Hazratganj' },
    { pin: '226003', area: 'Chowk · KGMU' },
    { pin: '226010', area: 'Gomti Nagar' },
    { pin: '226012', area: 'Alambagh' },
  ],
  'Kanpur Nagar': [{ pin: '208001', area: 'Kanpur GPO' }],
  Patna: [{ pin: '800001', area: 'Patna GPO · Gandhi Maidan' }],
  'Bengaluru Urban': [{ pin: '560099', area: 'Bommasandra' }],
};
export const HOSPITAL_PIN = { fac_h1: '225001', fac_h2: '226003', fac_h3: '800001', fac_h4: '560099', fac_h5: '225305' };

/* All region names an official can route between, as "District, State". */
export function regionOptions(data) {
  const set = new Map();
  (data?.regions || []).forEach((r) => r.districts.forEach((d) => set.set(`${d}, ${r.state}`, { district: d, state: r.state, doctors: Math.round(r.doctorsOnline / r.districts.length) })));
  (data?.capacity || []).forEach((c) => { const k = `${c.district}, ${c.state}`; if (!set.has(k)) set.set(k, { district: c.district, state: c.state, doctors: 30 }); });
  if (set.size < 4) {
    [['Barabanki', 'Uttar Pradesh', 40], ['Lucknow', 'Uttar Pradesh', 64], ['Kanpur Nagar', 'Uttar Pradesh', 38], ['Patna', 'Bihar', 30], ['Bengaluru Urban', 'Karnataka', 120], ['Mumbai', 'Maharashtra', 140], ['New Delhi', 'Delhi', 300], ['Chennai', 'Tamil Nadu', 100]]
      .forEach(([d, s, n]) => { const k = `${d}, ${s}`; if (!set.has(k)) set.set(k, { district: d, state: s, doctors: n }); });
  }
  return [...set.entries()].map(([label, v]) => ({ label, ...v }));
}

export const ALERT_KIND = {
  outbreak: { label: 'Outbreak signal', tone: 'rose' },
  shortage: { label: 'Medicine shortage', tone: 'sun' },
  overload: { label: 'Capacity overload', tone: 'clay' },
};
export const alertTitle = (a) => (a.type === 'outbreak' ? `${a.disease} · pin ${a.pincode}` : a.type === 'shortage' ? a.drug : `${a.district} overload`);
export const isOpen = (a) => a.status === 'open' || a.status === 'acknowledged';

export function ScopeChip({ scope, compact }) {
  if (!scope) return null;
  if (scope.level === 'national') {
    return <span className="cc-scope national"><Globe2 /> {compact ? 'National view' : 'National view · all states'}</span>;
  }
  return <span className="cc-scope"><Lock /> Scoped to {scope.district}{compact ? '' : ' · district officer'}</span>;
}

/* CSV helpers — built in the browser from the live overview. */
export function toCsv(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}
export function downloadCsv(filename, rows) {
  const blob = new Blob([String.fromCharCode(0xfeff) + toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
