// Small pieces shared by the family hub, Home, the vaccine schedule and the health tracker. Kept apart from
// those pages so Home (in the first bundle) doesn't pull in the tracker or schedule code.
import { AlertTriangle, Phone } from 'lucide-react';
import { cx } from '../../components/ui';
import { getLocale } from '../../i18n';
import './health.css';

export const READING_KINDS = {
  bp: { label: 'Blood pressure', short: 'BP', unit: 'mmHg' },
  sugar: { label: 'Blood sugar', short: 'Sugar', unit: 'mg/dL' },
  weight: { label: 'Weight', short: 'Weight', unit: 'kg' },
  spo2: { label: 'Oxygen (SpO₂)', short: 'SpO₂', unit: '%' },
  temp: { label: 'Temperature', short: 'Temp', unit: '°F' },
};
export const SUGAR_WHEN = { fasting: 'Fasting', post_meal: 'After a meal', random: 'Random' };

// "120/80" style value for a reading as the server returns it.
export function readingValue(r) {
  if (!r) return '—';
  if (r.kind === 'bp') return `${r.sys}/${r.dia}`;
  return `${r.value}`;
}

// Calendar date (YYYY-MM-DD from the server) → "21 Oct" without a time-zone shift.
export const dayLabel = (day, opts = { day: 'numeric', month: 'short' }) => (day ? new Date(`${day}T12:00:00`).toLocaleDateString(getLocale(), opts) : '—');

const TONE = { ok: 'green', watch: 'sun', urgent: 'solid-rose' };
export function FlagBadge({ flag }) {
  if (!flag) return null;
  return <span className={cx('badge', TONE[flag.level])}>{flag.level === 'urgent' ? 'Get help now' : flag.level === 'watch' ? 'Talk to your doctor' : 'OK'}</span>;
}

// Guidance under a reading. Urgent ones carry a tap-to-call 108 button.
export function FlagNote({ flag }) {
  if (!flag?.text) return null;
  if (flag.level === 'urgent') {
    return (
      <div className="callout rose hl-urgent" role="alert">
        <AlertTriangle />
        <div className="grow">
          <strong className="block">Get medical help now</strong>
          <span className="small">{flag.text}</span>
        </div>
        <a className="btn sm" href="tel:108"><Phone size={14} /> Call 108</a>
      </div>
    );
  }
  return <div className={cx('callout small', flag.level === 'watch' ? 'sun' : 'green')}><span>{flag.text}</span></div>;
}
