import { useEffect, useRef, useState } from 'react';
import { HeartPulse, Activity, Thermometer, Droplet, Scale, Gauge } from 'lucide-react';
import { cx } from '../../components/ui';

export const VITAL_META = [
  { key: 'bp', label: 'BP', unit: 'mmHg', icon: Gauge, flag: (v) => { const [s, d] = String(v).split('/').map(Number); return s >= 160 || d >= 100 ? 'bad' : s >= 140 || d >= 90 ? 'warn' : ''; } },
  { key: 'pulse', label: 'Pulse', unit: 'bpm', icon: HeartPulse, flag: (v) => (v > 120 || v < 50 ? 'bad' : v > 100 ? 'warn' : '') },
  { key: 'spo2', label: 'SpO₂', unit: '%', icon: Activity, flag: (v) => (v < 90 ? 'bad' : v < 95 ? 'warn' : '') },
  { key: 'temp', label: 'Temp', unit: '°F', icon: Thermometer, flag: (v) => (v >= 102.5 ? 'bad' : v >= 100.4 ? 'warn' : '') },
  { key: 'weight', label: 'Weight', unit: 'kg', icon: Scale, flag: () => '' },
  { key: 'sugar', label: 'Sugar', unit: 'mg/dL', icon: Droplet, flag: (v) => (v >= 300 ? 'bad' : v >= 180 ? 'warn' : '') },
];

export function VitalsChips({ vitals, compact }) {
  if (!vitals) return <span className="tiny muted">No vitals captured</span>;
  const shown = VITAL_META.filter((m) => vitals[m.key] !== undefined && vitals[m.key] !== null && vitals[m.key] !== '');
  if (!shown.length) return <span className="tiny muted">No vitals captured</span>;
  return (
    <div className={cx('dr-vchips', compact && 'compact')}>
      {shown.map((m) => (
        <span key={m.key} className={cx('dr-vchip', m.flag(vitals[m.key]))} title={m.label}>
          <m.icon />
          <span className="dr-vchip-l">{m.label}</span>
          <strong dir="ltr" translate="no">{vitals[m.key]}</strong>
          {!compact && <span className="dr-vchip-u">{m.unit}</span>}
        </span>
      ))}
    </div>
  );
}

export function routeInfo(c) {
  const r = (c?.routedFrom || '').toLowerCase();
  if (r.includes('overflow')) return { tone: 'plum', label: 'Overflow corridor', detail: c.routedFrom.replace(/^overflow\s*·\s*/i, '') };
  if (r.includes('(local)')) return { tone: 'green', label: 'Local', detail: c.routedFrom.replace(/\s*\(local\)/i, '') };
  if (r.includes('(state)')) return { tone: 'sky', label: 'State routing', detail: c.routedFrom.replace(/\s*\(state\)/i, '') };
  if (r.includes('(national)')) return { tone: 'clay', label: 'National routing', detail: c.routedFrom.replace(/\s*\(national\)/i, '') };
  return { tone: '', label: c?.routedFrom || 'Direct booking', detail: '' };
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export const shortName = (name = '') => name.replace(/^Dr\.\s*/, '').split(' ')[0];

/* Simulated live device feed: drifts gently around the last kiosk reading. */
export function useLiveVitals(base, active = true) {
  const [now, setNow] = useState(base);
  const [history, setHistory] = useState({ pulse: [], spo2: [] });
  const baseRef = useRef(base);
  baseRef.current = base;
  useEffect(() => {
    setNow(base);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(base)]);
  useEffect(() => {
    if (!active || !base) return undefined;
    const tick = () => {
      const b = baseRef.current;
      if (!b) return;
      const j = (v, amp, dec = 0) => (v === undefined || v === null || v === '' ? v : +(Number(v) + (Math.random() - 0.5) * 2 * amp).toFixed(dec));
      const next = { ...b, pulse: j(b.pulse, 3), spo2: b.spo2 ? Math.min(100, j(b.spo2, 1)) : b.spo2, temp: j(b.temp, 0.1, 1) };
      setNow(next);
      setHistory((h) => ({ pulse: [...h.pulse, next.pulse].filter((x) => x !== undefined).slice(-24), spo2: [...h.spo2, next.spo2].filter((x) => x !== undefined).slice(-24) }));
    };
    tick();
    const t = setInterval(tick, 2500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, !!base]);
  return { vitals: now, history };
}

// Lives in ui.jsx now; re-exported so existing './shared' imports keep working.
export { useDebounced } from '../../components/ui';

export function useNow(interval = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(t);
  }, [interval]);
  return now;
}

export const LAB_TESTS = [
  { code: '58410-2', name: 'Complete Blood Count (CBC)' },
  { code: '7905-3', name: 'Dengue NS1 Antigen' },
  { code: '4548-4', name: 'HbA1c' },
  { code: '2093-3', name: 'Lipid profile' },
  { code: '1558-6', name: 'Fasting Blood Sugar' },
  { code: '70569-9', name: 'Malaria antigen' },
  { code: '5762-1', name: 'Widal (typhoid)' },
  { code: '36643-5', name: 'Chest X-ray (PA view)', imaging: true },
  { code: '24558-9', name: 'Ultrasound — whole abdomen', imaging: true },
  { code: '11524-6', name: 'ECG (12-lead)', imaging: true },
];

export const INDIAN_LANGUAGES = ['Hindi', 'English', 'Bengali', 'Tamil', 'Telugu', 'Marathi', 'Gujarati', 'Kannada', 'Malayalam', 'Punjabi', 'Odia', 'Assamese', 'Urdu', 'Bhojpuri', 'Awadhi'];
