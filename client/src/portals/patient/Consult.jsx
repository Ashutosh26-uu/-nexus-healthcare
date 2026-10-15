import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Video, Phone, MessageCircle, ChevronRight, Repeat } from 'lucide-react';
import NearbyDoctors from './NearbyDoctors';
import { Button, StatusBadge, cx, fmtDateTime } from '../../components/ui';
import { PageHeader } from '../../components/PortalLayout';
import { usePatient } from './shared';
import { getLocale } from '../../i18n';

export const MODES = [
  { value: 'video', label: 'Video', icon: Video, hint: 'Face to face' },
  { value: 'audio', label: 'Audio', icon: Phone, hint: 'Works on slow internet' },
  { value: 'chat', label: 'Chat', icon: MessageCircle, hint: 'Type at your own pace' },
];

export function ModePicker({ value, onChange }) {
  return (
    <div className="pt-modes" role="radiogroup" aria-label="How would you like to talk?">
      {MODES.map((m) => (
        <button key={m.value} type="button" role="radio" aria-checked={value === m.value} className={cx('pt-mode', value === m.value && 'on')} onClick={() => onChange(m.value)}>
          <m.icon size={18} />
          <span className="strong small">{m.label}</span>
          <span className="tiny muted">{m.hint}</span>
        </button>
      ))}
    </div>
  );
}

/* ---------- date + time slot picker ---------- */
function buildDays() {
  const out = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out.push({
      key: d.toISOString(),
      date: d,
      top: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString(getLocale(), { weekday: 'short' }),
      bottom: d.toLocaleDateString(getLocale(), { day: 'numeric', month: 'short' }),
    });
  }
  return out;
}
const SLOT_TIMES = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '14:00', '14:30', '15:00', '15:30', '16:00', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30'];

export function SlotPicker({ value, onChange }) {
  const days = useMemo(buildDays, []);
  const [dayIdx, setDayIdx] = useState(() => {
    if (!value) return 0;
    const i = days.findIndex((d) => new Date(value).toDateString() === d.date.toDateString());
    return i < 0 ? 0 : i;
  });
  const day = days[dayIdx].date;
  const now = Date.now();
  const slots = SLOT_TIMES.map((t) => {
    const [h, m] = t.split(':').map(Number);
    const d = new Date(day);
    d.setHours(h, m, 0, 0);
    return { t, iso: d.toISOString(), past: d.getTime() < now + 20 * 60000, label: d.toLocaleTimeString(getLocale(), { hour: 'numeric', minute: '2-digit' }) };
  });
  const open = slots.filter((s) => !s.past);
  return (
    <div className="stack">
      <div className="pt-days" role="radiogroup" aria-label="Choose a day">
        {days.map((d, i) => (
          <button key={d.key} type="button" role="radio" aria-checked={i === dayIdx} className={cx('pt-day', i === dayIdx && 'on')} onClick={() => { setDayIdx(i); onChange(null); }}>
            <span className="tiny">{d.top}</span>
            <span className="strong">{d.bottom}</span>
          </button>
        ))}
      </div>
      {open.length === 0 ? (
        <p className="small muted mb-0">All of today&apos;s slots have passed. Tomorrow has plenty open.</p>
      ) : (
        <div className="chip-select" role="radiogroup" aria-label="Choose a time">
          {open.map((s) => (
            <button key={s.t} type="button" role="radio" aria-checked={value === s.iso} className={cx('chip', value === s.iso && 'on')} onClick={() => onChange(s.iso)}>{s.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- find a doctor ---------- */
// Doctors within 20 km for the patient's symptoms or chosen department — hospital doctors, doctors with
// their own clinic and Nexus virtual-clinic doctors — with "All of India" to look further.
export default function Consult() {
  const { patient, home } = usePatient();
  const navigate = useNavigate();
  const location = useLocation();
  const upcoming = home?.upcoming || [];
  const start = location.state || {};

  return (
    <div className="stack lg">
      <PageHeader eyebrow="Find a doctor" title="Talk to a doctor" subtitle="Tell us the problem — we show the best doctors, hospitals and clinics within 20 km, with reviews, experience, timings and fees.">
        <Button variant="secondary" icon={Repeat} onClick={() => navigate('/patient/change-doctor')}>Change my doctor</Button>
      </PageHeader>

      {patient?.bookingMissing?.length > 0 && (
        <div className="pt-cp-banner fade-in">
          <div className="grow">
            <strong>Complete your profile to book</strong>
            <div className="small muted">You can browse doctors now. To book, we need your age, permanent address and an ID.</div>
          </div>
          <Button variant="clay" onClick={() => navigate('/patient/complete-profile', { state: { returnTo: '/patient/consult' } })}>Complete now</Button>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="pt-upcoming-strip">
          {upcoming.map((c) => (
            <button key={c.id} className="pt-upcoming-pill" onClick={() => navigate(`/patient/consult/${c.id}`)}>
              <StatusBadge status={c.status} />
              <span className="small strong" translate="no">{c.doctorName}</span>
              <span className="tiny muted">{c.status === 'scheduled' ? fmtDateTime(c.scheduledAt) : c.status === 'queued' ? 'in queue' : 'live now'}</span>
              <ChevronRight size={15} className="muted" />
            </button>
          ))}
        </div>
      )}

      <NearbyDoctors full symptoms={start.symptoms || patient?.currentSymptoms?.text || ''} department={start.department || patient?.currentSymptoms?.department || ''} />
    </div>
  );
}
