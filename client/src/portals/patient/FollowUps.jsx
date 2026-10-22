import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, Video, Building2, MonitorSmartphone, CalendarPlus, QrCode, ArrowRight, Stethoscope, FlaskConical, FileText, Repeat, CircleDot } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { api } from '../../api';
import { Avatar, Button, Card, Empty, StatusBadge, fmtDate, fmtDateTime, fmtTime, cx } from '../../components/ui';
import { usePatient, usePatientLive, firstName, PageSkeleton } from './shared';
import { getLocale } from '../../i18n';
import BookingFlow from './BookingFlow';
import { LateNotice, VisitChangeActions } from './VisitChange';

const PLACE = {
  video: { icon: Video, label: (c) => `${c.mode === 'audio' ? 'Audio' : c.mode === 'chat' ? 'Chat' : 'Video'} consult` },
  clinic: { icon: Building2, label: (c) => c.location?.name || 'Doctor’s clinic' },
  eclinic: { icon: MonitorSmartphone, label: (c) => c.location?.name || 'Sehatra E-Clinic' },
};
const placeOf = (c) => PLACE[c.visitType] || (c.mode === 'in_person' ? PLACE.clinic : PLACE.video);

// "in 3 days", "tomorrow at 10:00 am", "today at 3:00 pm"
function relWhen(iso) {
  if (!iso) return 'As soon as possible';
  const t = new Date(iso); const now = new Date();
  const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(t) - day(now)) / 86400000);
  const time = fmtTime(iso);
  if (diff === 0) return `Today at ${time}`;
  if (diff === 1) return `Tomorrow at ${time}`;
  if (diff > 1 && diff < 7) return `In ${diff} days · ${t.toLocaleDateString(getLocale(), { weekday: 'long' })} ${time}`;
  return fmtDateTime(iso);
}

// Download an .ics file so the visit lands in the phone's calendar with a reminder.
function addToCalendar(c) {
  const start = new Date(c.scheduledAt);
  const end = new Date(start.getTime() + 30 * 60000);
  const f = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  // Calendar text values: no line breaks (they would start new calendar properties) and RFC 5545 escaping.
  const t = (v) => String(v || '').replace(/[\r\n]+/g, ' ').replace(/([\\;,])/g, '\\$1');
  const where = t(c.mode === 'in_person' ? (c.location?.name || '') : 'Sehatra app (video)');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sehatra//EN', 'BEGIN:VEVENT', `UID:${c.id}@nexushealthcare`, `DTSTAMP:${f(new Date())}`, `DTSTART:${f(start)}`, `DTEND:${f(end)}`,
    `SUMMARY:${c.followUp ? 'Follow-up' : 'Appointment'} with ${t(c.doctorName)}`, `LOCATION:${where}`, `DESCRIPTION:${t(c.triage?.symptoms)}`,
    'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:Doctor visit in 2 hours', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  const a = document.createElement('a'); a.href = url; a.download = `nexus-visit-${fmtDate(c.scheduledAt).replace(/\s/g, '-')}.ics`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function Countdown({ iso }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 60000); return () => clearInterval(t); }, []);
  const ms = new Date(iso) - Date.now();
  if (ms <= 0) return <span className="pt-fu-count now">Now</span>;
  const d = Math.floor(ms / 86400000); const h = Math.floor((ms % 86400000) / 3600000); const m = Math.floor((ms % 3600000) / 60000);
  return <span className="pt-fu-count">{d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m} min`}</span>;
}

export default function FollowUps() {
  const { patient, profiles, reloadHome } = usePatient();
  const navigate = useNavigate();
  // Live: a follow-up the doctor books, or a consult that starts, shows up without a refresh.
  const { data, error, reload } = usePatientLive('/patient/follow-ups', ['consults', 'queue', 'lab', 'payments']);
  const changed = () => { reload(); reloadHome(); };
  const [rebook, setRebook] = useState(null);
  const isSelf = profiles.find((p) => p.id === patient?.id)?.self;
  if (error && !data) return <Empty title="We couldn't load your visits">{error}</Empty>;
  if (!data) return <PageSkeleton />;
  const [next, ...later] = data.upcoming || [];

  return (
    <div className="stack lg">
      <PageHeader eyebrow="My appointments" title={isSelf ? 'Your next visits' : `${firstName(patient?.name)}’s next visits`}
        subtitle="Every follow-up your doctor booked and every appointment you made — with the date, time and where to go." />

      {!next ? (
        <Card><Empty icon={CalendarClock} title="No upcoming visits">When a doctor books a follow-up, or you book a consult, it shows up here with the date and time.
          <div className="mt-2"><Button size="sm" onClick={() => navigate('/patient/consult')}>Find a doctor</Button></div></Empty></Card>
      ) : (
        <Card className="pt-fu-next">
          <div className="pt-fu-next-when">
            <span className="eyebrow">{next.followUp ? 'Next follow-up' : 'Next appointment'}</span>
            <h2 className="mb-0">{relWhen(next.scheduledAt)}</h2>
            {next.scheduledAt && <span className="small muted">{new Date(next.scheduledAt).toLocaleDateString(getLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>}
            {next.scheduledAt && <Countdown iso={next.scheduledAt} />}
          </div>
          <div className="pt-fu-next-body">
            <div className="row" style={{ gap: 10 }}><Avatar name={next.doctorName} /><div><strong translate="no">{next.doctorName}</strong><div className="tiny muted">{next.doctorSpecialty}</div></div><StatusBadge status={next.status} /></div>
            <div className="pt-fu-where">{(() => { const P = placeOf(next); return <><P.icon size={16} /><span translate="no">{P.label(next)}</span></>; })()}</div>
            <p className="small muted mb-0">{next.triage?.symptoms}</p>
            <LateNotice c={next} className="mt-0" />
            <div className="row wrap" style={{ gap: 8 }}>
              <Button icon={next.mode === 'in_person' ? QrCode : ArrowRight} onClick={() => navigate(`/patient/consult/${next.id}`)}>{next.status === 'awaiting_payment' ? 'Complete payment' : next.mode === 'in_person' ? 'Show visit pass' : 'Open consult'}</Button>
              {next.scheduledAt && <Button variant="secondary" icon={CalendarPlus} onClick={() => addToCalendar(next)}>Add to calendar</Button>}
            </div>
            <VisitChangeActions c={next} onChanged={changed} />
          </div>
        </Card>
      )}

      {later.length > 0 && (
        <Card title="Also coming up">
          <div className="pt-fu-list">
            {later.map((c) => {
              const P = placeOf(c);
              return (
                <div key={c.id} className="pt-fu-row">
                  <div className="pt-fu-date"><strong>{c.scheduledAt ? new Date(c.scheduledAt).getDate() : '—'}</strong><span>{c.scheduledAt ? new Date(c.scheduledAt).toLocaleDateString(getLocale(), { month: 'short' }) : ''}</span></div>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <strong className="small" translate="no">{c.doctorName}</strong> {c.followUp && <span className="badge tiny">Follow-up</span>}
                    <div className="tiny muted"><P.icon size={12} style={{ verticalAlign: '-2px' }} /> {P.label(c)} · {relWhen(c.scheduledAt)}</div>
                    <LateNotice c={c} />
                    <VisitChangeActions c={c} onChanged={changed} />
                  </div>
                  {c.scheduledAt && <button type="button" className="icon-btn" title="Add to calendar" onClick={() => addToCalendar(c)}><CalendarPlus size={16} /></button>}
                  <Button size="sm" variant="ghost" onClick={() => navigate(`/patient/consult/${c.id}`)}>Open</Button>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {data.reportsReady?.length > 0 && (
        <Card title={<h4 className="row mb-0" style={{ gap: 8 }}><FlaskConical size={17} />Reports to discuss</h4>}>
          <div className="pt-fu-list">
            {data.reportsReady.map((r) => (
              <div key={r.id} className="pt-fu-row">
                <FileText size={18} className={r.flagged ? 'pt-flag-ic' : 'muted'} />
                <div className="grow"><strong className="small">{r.tests.join(', ')}</strong> {r.flagged && <span className="badge rose tiny">needs attention</span>}
                  <div className="tiny muted">{r.doctorNote ? `Doctor’s advice: “${r.doctorNote.text.slice(0, 90)}${r.doctorNote.text.length > 90 ? '…' : ''}”` : `Report ready ${fmtDate(r.reportedAt)} — your doctor will add advice`}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => navigate('/patient/tests')}>View</Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {data.past?.length > 0 && (
        <Card title={<h4 className="row mb-0" style={{ gap: 8 }}><Stethoscope size={17} />Recent visits</h4>}>
          <div className="pt-fu-list">
            {data.past.map((c) => (
              <div key={c.id} className="pt-fu-row">
                <CircleDot size={16} className="muted" />
                <div className="grow" style={{ minWidth: 0 }}>
                  <strong className="small" translate="no">{c.doctorName}</strong> <span className="tiny muted">· {fmtDate(c.completedAt)}</span>
                  <div className="tiny muted">{c.diagnosis || c.triage?.symptoms}{c.nextFollowUp ? ` · follow-up ${fmtDateTime(c.nextFollowUp)}` : ''}</div>
                </div>
                <RateVisit c={c} />
                {c.prescriptionId && <Button size="sm" variant="ghost" onClick={() => window.open(`/rx/${c.prescriptionId}`, '_blank', 'noopener')}>Prescription</Button>}
                <Button size="sm" variant="secondary" icon={Repeat} onClick={() => setRebook({ id: c.doctorId, name: c.doctorName, specialty: c.doctorSpecialty, fee: c.fee || 0 })}>Book again</Button>
              </div>
            ))}
          </div>
        </Card>
      )}
      <BookingFlow doctor={rebook} onClose={() => setRebook(null)} />
    </div>
  );
}

// Rate a finished visit (once) — feeds the doctor's rating and satisfaction score other patients see.
function RateVisit({ c }) {
  const [stars, setStars] = useState(c.review?.stars || 0);
  const [hover, setHover] = useState(0);
  const [saved, setSaved] = useState(!!c.review);
  const [busy, setBusy] = useState(false);
  const rate = async (n) => {
    if (saved || busy) return;
    setBusy(true);
    try { await api.post(`/consults/${c.id}/review`, { stars: n }); setStars(n); setSaved(true); } catch { /* already rated */ } finally { setBusy(false); }
  };
  return (
    <span className={cx('pt-rate', saved && 'saved')} title={saved ? 'Thanks for rating' : 'Rate this visit'} onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button type="button" key={n} disabled={saved || busy} className={cx((hover || stars) >= n && 'on')} onMouseEnter={() => !saved && setHover(n)} onClick={() => rate(n)} aria-label={`${n} star${n > 1 ? 's' : ''}`}>★</button>
      ))}
    </span>
  );
}
