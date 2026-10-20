import { createContext, useContext } from 'react';
import { Check } from 'lucide-react';
import { useLive } from '../../live';
import { cx, fmtDateTime } from '../../components/ui';
import QR from '../../components/QR';

/* ---------- patient context (active family profile + home payload) ---------- */
export const PatientContext = createContext(null);
export const usePatient = () => useContext(PatientContext);

// useLive that refetches when the active family profile changes.
export function usePatientLive(url, topics) {
  const { profileKey } = usePatient();
  return useLive(url, topics, [profileKey]);
}

export const HOME_TOPICS = ['consults', 'queue', 'prescriptions', 'pharmacy', 'medorders', 'payments', 'consents', 'records', 'lab', 'dispatch', 'advisories', 'alerts', 'notifications', 'family', 'patients'];

export const LANGUAGES = ['Hindi', 'English', 'Bengali', 'Marathi', 'Telugu', 'Tamil', 'Gujarati', 'Urdu', 'Kannada', 'Odia', 'Malayalam', 'Punjabi', 'Assamese', 'Awadhi', 'Bhojpuri', 'Maithili'];
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'];
export const SPEECH_LANG = { Hindi: 'hi-IN', English: 'en-IN', Bengali: 'bn-IN', Marathi: 'mr-IN', Telugu: 'te-IN', Tamil: 'ta-IN', Gujarati: 'gu-IN', Urdu: 'ur-IN', Kannada: 'kn-IN', Malayalam: 'ml-IN', Punjabi: 'pa-IN', Odia: 'or-IN', Awadhi: 'hi-IN', Bhojpuri: 'hi-IN', Maithili: 'hi-IN', Assamese: 'as-IN' };

// A lab result needs attention only when its flag is something other than normal / negative (a negative test is good news).
export const isAbnormal = (r) => Boolean(r?.flag) && !['normal', 'negative'].includes(String(r.flag).toLowerCase());

export const firstName = (name = '') => name.split(/\s+/)[0] || '';
export const splitList = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
// ISO string in the device's local time — for <input type="date|datetime-local"> values/limits, where
// toISOString() (UTC) is yesterday until 05:30 IST.
export const localISO = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();

export function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 5) return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/* ---------- prescription status tracker ---------- */
export function rxSteps(rx) {
  const pickup = rx.fulfilment === 'pickup';
  return pickup
    ? [
      { key: 'issued', label: 'Issued' },
      { key: 'sent', label: 'Sent to pharmacy' },
      { key: 'dispensed', label: 'Packed' },
      { key: 'collected', label: 'Collected' },
    ]
    : [
      { key: 'issued', label: 'Issued' },
      { key: 'sent', label: 'Sent to pharmacy' },
      { key: 'dispensed', label: 'Packed' },
      { key: 'out_for_delivery', label: 'On the way' },
      { key: 'delivered', label: 'Delivered' },
    ];
}

export function RxTracker({ rx, compact }) {
  const steps = rxSteps(rx);
  let idx = steps.findIndex((s) => s.key === rx.status);
  if (idx < 0 && (rx.status === 'delivered' || rx.status === 'collected')) idx = steps.length - 1;
  if (idx < 0) idx = 0;
  return (
    <ol className={cx('pt-track', compact && 'compact')} aria-label="Prescription progress">
      {steps.map((s, i) => {
        const state = i < idx ? 'done' : i === idx ? 'current' : '';
        const at = rx[`${s.key}At`] || (s.key === 'issued' ? rx.createdAt : s.key === 'sent' ? rx.orderedAt : null);
        return (
          <li key={s.key} className={cx('pt-track-step', state)}>
            <span className="pt-track-dot">{i <= idx ? <Check size={12} strokeWidth={3} /> : null}</span>
            <span className="pt-track-label">{s.label}</span>
            {!compact && at && i <= idx && <span className="pt-track-time">{fmtDateTime(at)}</span>}
          </li>
        );
      })}
    </ol>
  );
}

// Real, scannable QR (was a decorative pattern). Kept the same API for every caller.
export function PassportQR({ value = '', size = 168, label }) {
  return <QR value={value} size={size} label={label || `QR code for health passport ${value}`} className="pt-qr" />;
}

/* ---------- skeleton block ---------- */
export function Skeleton({ h = 18, w = '100%', r, style }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: r, ...style }} aria-hidden="true" />;
}

export function PageSkeleton() {
  return (
    <div className="stack lg" aria-busy="true" aria-label="Loading">
      <Skeleton h={34} w="40%" />
      <div className="grid two">
        <Skeleton h={160} r={14} />
        <Skeleton h={160} r={14} />
      </div>
      <Skeleton h={220} r={14} />
    </div>
  );
}

export const relationOf = (p) => (p.self ? 'You' : p.relation || (p.age < 18 ? 'Child' : 'Family'));

// Medicine pack check: a verdict only counts when the server matched a batch actually stocked by a chemist on
// Sehatra (those come back with an expiry date). Anything else is "not found" — never a guessed genuine/fake/recall.
export function scanVerdict(r) {
  if (!r) return null;
  if (r.status === 'invalid' || r.status === 'recall' || (['genuine', 'expired'].includes(r.status) && r.expiry)) return r; // a recall must never be softened to "unknown"
  return { ...r, status: 'unknown', drug: null, batch: null };
}
