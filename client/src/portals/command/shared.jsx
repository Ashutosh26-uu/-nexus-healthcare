import { createContext, useContext } from 'react';
import { Lock, Globe2 } from 'lucide-react';

/* One live copy of /gov/overview shared by every Command Center screen. */
export const GovContext = createContext(null);
export const useGov = () => useContext(GovContext);

/* All region names an official can route between, as "District, State" — only regions the network really
   has (states reporting, hospitals, alerts). `doctors` is the state's real online count when known, else null. */
export function regionOptions(data) {
  const set = new Map();
  (data?.regions || []).forEach((r) => (r.districts || []).forEach((d) => set.set(`${d}, ${r.state}`, { district: d, state: r.state, doctors: null })));
  (data?.capacity || []).forEach((c) => { const k = `${c.district}, ${c.state}`; if (c.district && !set.has(k)) set.set(k, { district: c.district, state: c.state, doctors: null }); });
  (data?.alerts || []).forEach((a) => { const k = `${a.district}, ${a.state}`; if (a.district && a.state && !set.has(k)) set.set(k, { district: a.district, state: a.state, doctors: null }); });
  if (data?.scope?.level === 'district') { const k = `${data.scope.district}, ${data.scope.state}`; if (!set.has(k)) set.set(k, { district: data.scope.district, state: data.scope.state, doctors: null }); }
  return [...set.entries()].map(([label, v]) => ({ label, ...v })).sort((x, y) => x.label.localeCompare(y.label));
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
    let s = v === null || v === undefined ? '' : String(v);
    if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`; // no formula injection in Excel/Sheets
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
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
