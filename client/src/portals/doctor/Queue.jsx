import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckInModal } from './BookingAlerts';
import { Clock, Users, Route, Star, Video, MessageSquare, MapPin, Play, CalendarClock, Coffee, ArrowRight, Monitor, UserRound, CheckCircle2, Circle, Hourglass, ShieldCheck, Pill, AlertTriangle, ScanLine, FlaskConical, FileText, Repeat } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { api } from '../../api';
import { Avatar, Button, Card, Empty, Loading, Stat, TriageBadge, StatusBadge, timeAgo, fmtDateTime, useAction, cx } from '../../components/ui';
import { useDoctorHome } from './context';
import { VitalsChips, routeInfo, greeting, shortName, useNow } from './shared';
import { getLocale } from '../../i18n';

export default function Queue() {
  const home = useDoctorHome();
  const navigate = useNavigate();
  const [run, busy] = useAction();
  useNow(30000); // keep "waiting for" labels fresh
  const [checkIn, setCheckIn] = useState(false);

  if (home.loading && !home.data) return <Loading />;
  if (home.error && !home.data) return <Empty title="Couldn't load your queue">{home.error}</Empty>;
  const { doctor, queue, scheduled, stats } = home.data;
  if (!doctor.verified) return <OnboardingHome doctor={doctor} />;

  const start = (c) => {
    if (c.status === 'in_progress') { navigate(`/doctor/consult/${c.id}`); return; }
    run(`start-${c.id}`, async () => {
      await api.post(`/consults/${c.id}/start`);
      navigate(`/doctor/consult/${c.id}`);
    });
  };

  const waitingList = queue.filter((c) => c.status === 'queued');
  const inProgress = queue.find((c) => c.status === 'in_progress');

  return (
    <div className="stack lg">
      <PageHeader
        eyebrow={new Date().toLocaleDateString(getLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}
        title={`${greeting()}, Dr. ${shortName(doctor.name)}`}
        subtitle={waitingList.length
          ? `${waitingList.length} ${waitingList.length === 1 ? 'person is' : 'people are'} waiting. Most urgent first — kiosk patients have their vitals ready.`
          : 'Your queue is clear. New patients appear here the moment they are routed to you.'}
      >
        <Button variant="secondary" icon={ScanLine} onClick={() => setCheckIn(true)}>Check in patient</Button>
      </PageHeader>
      <CheckInModal open={checkIn} onClose={() => setCheckIn(false)} onCheckedIn={() => home.reload?.()} />
      <ReportsToReview home={home} />
      <TransfersIn home={home} />
      <ClinicVisits home={home} />

      {!doctor.online && (
        <div className="callout">
          <Coffee />
          {doctor.eClinicPartner
            ? <div><strong>You're checked out.</strong> When you arrive at the E-Clinic (or are free for video), switch on <em>I'm at the E-Clinic</em> at the top — patients will see you as available. Patients already in your queue stay with you.</div>
            : <div><strong>Your hours are over for now.</strong> Patients see you as not available until your next slot{doctor.availability?.next ? ` (${doctor.availability.next})` : ''}. Change your hours in Schedule & availability.</div>}
        </div>
      )}

      <div className="grid four">
        <Stat label="Waiting now" value={stats.waiting} icon={Users} sub={inProgress ? '1 consult in progress' : 'in your live queue'} />
        <Stat label="Seen today" value={stats.today} icon={Clock} sub={`max ${doctor.maxPerHour} per hour`} />
        <Stat label="Overflow cases" value={stats.overflow} icon={Route} sub="routed from other regions" />
        <Stat label="Your rating" value={stats.rating?.toFixed ? stats.rating.toFixed(1) : stats.rating} icon={Star} sub={`${doctor.consultsDone?.toLocaleString(getLocale())} consults so far`} />
      </div>

      <div className="grid side">
        <div className="stack">
          <div className="row between">
            <h3 className="mb-0">Live queue</h3>
            <span className="tiny muted row" style={{ gap: 6 }}><span className="dot green pulse" /> Updates in real time</span>
          </div>
          {queue.length === 0 && (
            <Card><Empty icon={Coffee} title="No one waiting">Good time for a chai. We'll ping you when someone joins.</Empty></Card>
          )}
          {queue.map((c, i) => {
            const r = routeInfo(c);
            const live = c.status === 'in_progress';
            return (
              <article key={c.id} className={cx('card dr-qcard fade-in', live && 'live', `lvl-${c.triage.level}`)} style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}>
                <div className="dr-qcard-strip" />
                <div className="dr-qcard-body">
                  <div className="row top between wrap">
                    <div className="row">
                      <Avatar name={c.patientName} />
                      <div>
                        <div className="row wrap" style={{ gap: 8 }}>
                          <strong className="dr-qname" translate="no">{c.patientName}</strong>
                          <span className="small muted">{c.patientAge} y · {c.patientGender}</span>
                        </div>
                        <div className="row wrap tiny muted" style={{ gap: 10, marginTop: 2 }}>
                          <span className="row" style={{ gap: 4 }}><Clock size={13} />{live ? `In consult since ${timeAgo(c.startedAt)}` : `Waiting ${timeAgo(c.createdAt).replace(' ago', '')}`}</span>
                          <span className="row" style={{ gap: 4 }}>{c.mode === 'chat' ? <MessageSquare size={13} /> : <Video size={13} />}{c.mode === 'chat' ? 'Chat' : 'Video'}</span>
                          {c.patientLanguage && <span>Speaks {c.patientLanguage}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="row wrap" style={{ gap: 6 }}>
                      {live && <StatusBadge status="in_progress">In consult</StatusBadge>}
                      <TriageBadge level={c.triage.level} />
                    </div>
                  </div>

                  <p className="dr-qsym">"{c.triage.symptoms}"</p>
                  {c.triage.note && <p className="small muted mb-1">{c.triage.note}</p>}

                  <VitalsChips vitals={c.vitals} compact />

                  <div className="row between wrap dr-qfoot">
                    <div className="row wrap" style={{ gap: 8 }}>
                      <span className={cx('badge', r.tone)}><Route />{r.label}</span>
                      {r.detail && <span className="tiny muted">{r.detail}</span>}
                      {c.kioskName && <span className="tiny muted row" style={{ gap: 4 }}><Monitor size={13} />{c.kioskName}</span>}
                    </div>
                    <Button size="sm" variant={live ? 'clay' : i === 0 ? undefined : 'secondary'} icon={live ? ArrowRight : Play} loading={busy === `start-${c.id}`} onClick={() => start(c)}>
                      {live ? 'Rejoin consult' : 'Start consult'}
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <div className="stack">
          <Card title="Scheduled" action={<span className="tiny muted">{scheduled.length} upcoming</span>}>
            {scheduled.length === 0 ? (
              <Empty icon={CalendarClock} title="Nothing booked">Open more slots in Schedule & availability.</Empty>
            ) : (
              <div className="list">
                {scheduled.slice(0, 8).map((c) => {
                  // Compare local calendar days — slicing the UTC ISO string mislabels early-morning IST slots.
                  const isToday = c.scheduledAt && new Date(c.scheduledAt).toDateString() === new Date().toDateString();
                  return (
                    <div key={c.id} className="list-item">
                      <div className="dr-when">
                        <span className="tiny">{isToday ? 'Today' : new Date(c.scheduledAt).toLocaleDateString(getLocale(), { weekday: 'short' })}</span>
                        <strong>{new Date(c.scheduledAt).toLocaleTimeString(getLocale(), { hour: 'numeric', minute: '2-digit' })}</strong>
                      </div>
                      <div className="grow">
                        <div className="small" style={{ fontWeight: 600 }} translate="no">{c.patientName}</div>
                        <div className="tiny muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.triage?.symptoms}</div>
                      </div>
                      <Button size="sm" variant="ghost" title={`Starts ${fmtDateTime(c.scheduledAt)}`} loading={busy === `start-${c.id}`} onClick={() => start(c)}>Start</Button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="tint flat">
            <h4 className="mb-1">How your queue is sorted</h4>
            <p className="small muted mb-1">Emergencies first, then "see doctor now", routine and self-care — and within each, whoever has waited longest.</p>
            <p className="small muted mb-0"><MapPin size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> Overflow cases come through approved corridors when another district is overloaded. Treat them like your own.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ---------- new doctor: greeting + onboarding ---------- */
function OnboardingHome({ doctor }) {
  const navigate = useNavigate();
  const submitted = doctor.profileComplete && !doctor.verificationNote;
  const steps = [
    { label: 'Account created', done: true, sub: 'Name, email and mobile number' },
    { label: 'Complete your profile', done: !!doctor.profileComplete, sub: 'Age, Aadhaar, qualification, degree, experience, fee and photo' },
    { label: 'Verification by our team', done: false, now: submitted, sub: 'Registration checked with the medical council — usually within 48 hours' },
    { label: 'Start seeing patients', done: false, sub: 'Check in at an E-Clinic or consult by video, on your own hours' },
  ];
  return (
    <div className="stack lg">
      <PageHeader eyebrow={new Date().toLocaleDateString(getLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}
        title={`${greeting()}, Dr. ${shortName(doctor.name)}`}
        subtitle="Welcome to Nexus Healthcare. You're a few minutes away from seeing patients at our E-Clinics." />
      {doctor.verificationNote && <div className="callout rose"><AlertTriangle /><div><strong>Your profile needs a change:</strong> {doctor.verificationNote}</div></div>}
      <Card className={cx('dr-ob-hero', submitted && 'review')}>
        <div className="dr-ob-hero-ic">{submitted ? <Hourglass /> : <UserRound />}</div>
        <div className="grow">
          <h3 className="mb-1">{submitted ? 'Your profile is under review' : 'Continue the onboarding to complete your profile'}</h3>
          <p className="small muted mb-0">{submitted
            ? "Thanks! Our clinical team is checking your registration and documents. We'll notify you as soon as you're verified."
            : 'Your name, email and mobile number are already filled in. Add your qualification, experience, fee and a professional photo so we can verify you.'}</p>
        </div>
        <Button size="lg" icon={submitted ? ShieldCheck : ArrowRight} variant={submitted ? 'secondary' : 'primary'} onClick={() => navigate('/doctor/profile')}>{submitted ? 'View my profile' : 'Continue onboarding'}</Button>
      </Card>
      <div className="grid side">
        <Card title="Your path to the first patient">
          <ol className="dr-ob-steps">
            {steps.map((st) => (
              <li key={st.label} className={cx(st.done && 'done', st.now && 'now')}>
                {st.done ? <CheckCircle2 /> : st.now ? <Hourglass /> : <Circle />}
                <div><strong>{st.label}</strong><div className="tiny muted">{st.sub}</div></div>
              </li>
            ))}
          </ol>
        </Card>
        <Card title="While you wait">
          <p className="small muted">Add the medicines you prescribe most, with their usual dose and timing. They'll fill in automatically when you write prescriptions.</p>
          <Button variant="secondary" icon={Pill} onClick={() => navigate('/doctor/medicines')}>Set up my medicines</Button>
        </Card>
      </div>
    </div>
  );
}

/* ---------- lab reports waiting for the doctor's advice ---------- */
function ReportsToReview({ home }) {
  const list = home.data?.reportsToReview || [];
  const [open, setOpen] = useState(null);
  const [text, setText] = useState('');
  const [fu, setFu] = useState(0);
  const [run, busy] = useAction();
  if (!list.length) return null;
  const send = (o) => run(`note-${o.id}`, async () => {
    await api.post(`/lab-orders/${o.id}/doctor-note`, { text, followUpDays: fu || undefined });
    home.setData((d) => (d ? { ...d, reportsToReview: (d.reportsToReview || []).filter((x) => x.id !== o.id) } : d));
    setOpen(null); setText(''); setFu(0);
  }, 'Advice sent — the patient sees it with their report');
  return (
    <Card className="dr-reports" title={<h4 className="row mb-0" style={{ gap: 8 }}><FlaskConical size={17} />Reports to review ({list.length})</h4>}>
      <div className="dr-reports-list">
        {list.map((o) => {
          const flagged = (o.results || []).filter((r) => r.flag && !['normal', 'negative'].includes(r.flag));
          return (
            <div key={o.id} className={cx('dr-report', flagged.length && 'flagged')}>
              <div className="row between wrap" style={{ gap: 8 }}>
                <div><strong className="small" translate="no">{o.patientName}</strong> <span className="tiny muted">· {o.tests.map((t) => t.name).join(', ')} · {o.labName}</span></div>
                <div className="row" style={{ gap: 6 }}>
                  <button type="button" className="icon-btn" title="Open report" onClick={() => window.open(`/lab-report/${o.id}`, '_blank', 'noopener')}><FileText size={15} /></button>
                  <Button size="sm" variant={open === o.id ? 'ghost' : 'secondary'} onClick={() => { setOpen(open === o.id ? null : o.id); setText(''); setFu(0); }}>{open === o.id ? 'Close' : 'Add advice'}</Button>
                </div>
              </div>
              <div className="row wrap tiny" style={{ gap: 6, marginTop: 4 }}>
                {(o.results || []).map((r) => <span key={r.name} className={cx('badge', r.flag && !['normal', 'negative'].includes(r.flag) ? 'rose' : 'green')}>{r.name}: {r.value} {r.unit}</span>)}
              </div>
              {open === o.id && (
                <div className="stack mt-1" style={{ gap: 8 }}>
                  <textarea className="textarea" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. HbA1c is higher — increase Metformin to 1-0-1, walk daily, repeat in 3 months." autoFocus />
                  <div className="row wrap" style={{ gap: 6 }}>
                    <span className="tiny muted">Book a follow-up:</span>
                    {[0, 7, 14, 30, 90].map((n) => <button key={n} type="button" className={cx('chip', fu === n && 'on')} onClick={() => setFu(n)}>{n ? `${n} days` : 'Not needed'}</button>)}
                    <Button size="sm" className="grow-0" loading={busy === `note-${o.id}`} disabled={text.trim().length < 3} onClick={() => send(o)} style={{ marginLeft: 'auto' }}>Send to patient</Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ---------- patients who moved their care to this doctor ---------- */
function TransfersIn({ home }) {
  const list = home.data?.transfersIn || [];
  const navigate = useNavigate();
  if (!list.length) return null;
  const seen = (t, open) => api.post(`/doctor/transfers/${t.id}/seen`).then(() => {
    home.setData((d) => (d ? { ...d, transfersIn: (d.transfersIn || []).filter((x) => x.id !== t.id) } : d));
    if (open) navigate(`/doctor/patients/${t.patientId}`);
  }).catch(() => {});
  return (
    <Card title={<h4 className="row mb-0" style={{ gap: 8 }}><Repeat size={17} />Patients who moved to you ({list.length})</h4>}>
      <div className="dr-reports-list">
        {list.map((t) => (
          <div key={t.id} className="dr-report">
            <div className="row between wrap" style={{ gap: 8 }}>
              <div><strong className="small" translate="no">{t.patientName}</strong> <span className="tiny muted">· from {t.fromName || 'no previous doctor'} · {t.copied.visits} visits, {t.copied.prescriptions} prescriptions, {t.copied.reports} reports copied{t.reason ? ` · “${t.reason}”` : ''}</span></div>
              <div className="row" style={{ gap: 6 }}>
                <Button size="sm" variant="ghost" onClick={() => seen(t, false)}>Dismiss</Button>
                <Button size="sm" onClick={() => seen(t, true)}>Open records</Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ---------- upcoming visits for doctors listed at my clinic (no login of their own yet) ---------- */
function ClinicVisits({ home }) {
  const list = home.data?.clinicVisits || [];
  if (!list.length) return null;
  return (
    <Card title={<h4 className="row mb-0" style={{ gap: 8 }}><CalendarClock size={17} />Clinic bookings for your doctors ({list.length})</h4>}>
      <p className="tiny muted mt-0">Doctors you listed who don&apos;t have their own login yet — check patients in for them with <strong>Check in patient</strong>.</p>
      <div className="dr-reports-list">
        {list.map((c) => (
          <div key={c.id} className="dr-report">
            <div className="row between wrap" style={{ gap: 8 }}>
              <div><strong className="small" translate="no">{c.patientName}</strong> <span className="tiny muted">· for {c.doctorName} · {c.scheduledAt ? fmtDateTime(c.scheduledAt) : 'today'} · {c.bookingNo || ''}</span><div className="tiny muted">“{c.triage?.symptoms}”</div></div>
              <StatusBadge status={c.checkedInAt ? 'queued' : c.status}>{c.checkedInAt ? 'Checked in' : 'Booked'}</StatusBadge>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
