import { Sunrise, Sun, Sunset, Moon } from 'lucide-react';
import { cx } from '../../components/ui';

export const TIMES = [
  { key: 'morning', label: 'Morning', icon: Sunrise },
  { key: 'afternoon', label: 'Afternoon', icon: Sun },
  { key: 'evening', label: 'Evening', icon: Sunset },
  { key: 'night', label: 'Night', icon: Moon },
];
export const FOOD = ['after food', 'before food', 'with food', 'empty stomach', 'any time'];
export const FORMS = ['Tablet', 'Capsule', 'Syrup', 'Drops', 'Injection', 'Inhaler', 'Ointment', 'Sachet'];
export const emptyTiming = () => ({ morning: 0, afternoon: 0, evening: 0, night: 0 });

// "1-0-1 after food" — the familiar Indian prescription notation (morning-afternoon-night;
// evening doses are shown in a 4-slot pattern only when used).
export function freqText({ timing = emptyTiming(), food = 'after food', sos = false }) {
  if (sos) return `When needed (SOS)${food && food !== 'any time' ? `, ${food}` : ''}`;
  const t = timing;
  const pattern = t.evening ? [t.morning, t.afternoon, t.evening, t.night] : [t.morning, t.afternoon, t.night];
  return `${pattern.join('-')}${food && food !== 'any time' ? ` ${food}` : ''}`;
}

// Best-effort reverse: "1-0-1 after food" → timing object, so the chips reflect a typed/templated frequency.
export function parseFreq(freq = '') {
  const m = String(freq).match(/^\s*(\d)-(\d)-(\d)(?:-(\d))?/);
  if (!m) return null;
  const n = m.slice(1).filter((x) => x !== undefined).map(Number);
  return n.length === 4 ? { morning: n[0], afternoon: n[1], evening: n[2], night: n[3] } : { morning: n[0], afternoon: n[1], evening: 0, night: n[2] };
}

export function TimingPicker({ value, onChange, size }) {
  const v = value || emptyTiming();
  return (
    <div className={cx('dr-timing', size)}>
      {TIMES.map((t) => (
        <button
          key={t.key}
          type="button"
          className={cx('dr-time', v[t.key] > 0 && 'on')}
          onClick={() => onChange({ ...v, [t.key]: v[t.key] > 0 ? 0 : 1 })}
          aria-pressed={v[t.key] > 0}
          title={t.label}
        >
          <t.icon /><span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}
