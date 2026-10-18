import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video, Building2, MonitorSmartphone, Clock, CalendarClock, Check, ArrowLeft, ArrowRight, Ambulance, Phone, CheckCircle2, QrCode, UserRoundPen, ShieldCheck, Copy, MessageCircle } from 'lucide-react';
import { api, subscribe } from '../../api';
import { Avatar, Button, Field, Modal, fmtDateTime, fmtMoney, cx } from '../../components/ui';
import { AvailBadge } from '../../components/Availability';
import VoiceInput from '../../components/VoiceInput';
import { usePatient } from './shared';
import { SlotPicker } from './VisitChange';
import PaymentStep from './Payment';
import VisitPass from './VisitPass';
import QR from '../../components/QR';
import ShareButton from '../../components/ShareButton';

const STEPS = ['Where', 'When', 'Symptoms', 'Pay'];
const DURATIONS = [{ label: 'Today', days: 0 }, { label: '1–3 days', days: 2 }, { label: '4–7 days', days: 5 }, { label: '1–2 weeks', days: 10 }, { label: 'Over 2 weeks', days: 21 }];
// How a remote consult happens — the doctor sees this on their queue before the visit.
const TALK_MODES = [
  { key: 'video', icon: Video, label: 'Video', sub: 'See each other' },
  { key: 'audio', icon: Phone, label: 'Audio call', sub: 'Voice only, like a phone call' },
  { key: 'chat', icon: MessageCircle, label: 'Chat', sub: 'Type messages' },
];
const MODE_LABEL = { video: 'Video consult', audio: 'Audio call consult', chat: 'Chat consult' };
const MISSING_LABEL ={ age: 'your age', address: 'your permanent address', aadhaar: 'Aadhaar or a government ID', id: 'a passport / national ID', profile: 'your profile' };

// Book a doctor: video, or in person at the doctor's own hospital / clinic → pay → booking ID + QR.
// Nexus E-Clinics show as "coming soon". In person: a ₹100 booking amount now, doctor's fee at the clinic.
export default function BookingFlow({ doctor, symptoms: initialSymptoms = '', onClose }) {
  const navigate = useNavigate();
  const { reloadHome, patient } = usePatient();
  const [opts, setOpts] = useState(null);
  const [step, setStep] = useState(0);
  const [visitType, setVisitType] = useState('clinic');
  const [when, setWhen] = useState('later');
  const [talk, setTalk] = useState('video'); // video | audio | chat — remote visits only
  const [slot, setSlot] = useState(null);
  const [symptoms, setSymptoms] = useState('');
  const [days, setDays] = useState('');
  const [booking, setBooking] = useState(null);
  const [paid, setPaid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [missing, setMissing] = useState([]);
  const [copied, setCopied] = useState(false);
  const [expired, setExpired] = useState(false); // payment refused with 409: this booking can't be paid any more

  useEffect(() => {
    if (!doctor) return undefined;
    let alive = true; // close-and-reopen quickly: the old doctor's options must not land on the new one
    setStep(0); setBooking(null); setPaid(false); setError(''); setOpts(null); setSlot(null); setCopied(false); setExpired(false); setTalk('video');
    setSymptoms(initialSymptoms || patient?.currentSymptoms?.text || '');
    setDays(patient?.currentSymptoms?.days ?? '');
    setMissing(patient?.bookingMissing || []);
    api.get(`/doctors/${doctor.id}/booking-options`).then((o) => {
      if (!alive) return;
      setOpts(o);
      setVisitType(o.options.clinic ? 'clinic' : 'video');
      setWhen(o.doctor.online && !o.options.clinic ? 'now' : 'later');
    }).catch((e) => alive && setError(e.message));
    // Live while the patient decides: if the doctor goes offline or changes fees, the options update on screen.
    const unsub = subscribe((topics) => {
      if (!topics.some((t) => t === 'all' || t === 'doctors')) return;
      api.get(`/doctors/${doctor.id}/booking-options`).then((o) => alive && setOpts(o)).catch(() => {});
    });
    return () => { alive = false; unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctor]);

  if (!doctor) return null;
  const d = opts?.doctor || doctor;
  const o = opts?.options;
  const fees = o?.fees || {}; // only ever shown once the server's real fees have loaded
  const amount = visitType === 'video' ? fees.video : fees.inPerson;
  const canNow = visitType === 'video' && d.online;
  const later = when === 'later' || !canNow; // "Right now" only counts when the doctor is actually available
  const place = visitType === 'clinic' ? o?.clinic : null;
  const completeProfile = () => { onClose(); navigate('/patient/complete-profile', { state: { returnTo: '/patient/consult' } }); };

  const next = () => {
    setError('');
    if (step === 1 && later && !slot) { setError('Pick a time that suits you.'); return; }
    setStep((s) => s + 1);
  };
  const createBooking = async () => {
    if (symptoms.trim().length < 3) { setError('Please tell the doctor what is bothering you — type it or tap the mic.'); return; }
    setBusy(true); setError('');
    try {
      const r = await api.post('/bookings', { doctorId: d.id, visitType, mode: visitType === 'video' ? talk : undefined, when: later ? 'later' : 'now', scheduledAt: later ? slot : undefined, symptoms, symptomDays: days });
      setBooking(r); setStep(3);
    } catch (e) {
      if (e.code === 'PROFILE_INCOMPLETE') setMissing(e.data?.missing || ['profile']);
      else setError(e.message);
    } finally { setBusy(false); }
  };
  const done = () => { reloadHome(); onClose(); navigate(`/patient/consult/${booking.consult.id}`); };
  // Back to "When" with the slot cleared; continuing creates a fresh booking and payment.
  const rebook = () => { setExpired(false); setBooking(null); setSlot(null); setError(''); setStep(1); };

  // Profile not complete: keep reminding — booking needs age and a permanent address (the server decides
  // what's missing; an ID is optional, the aadhaar/id labels only cover older responses).
  if (missing.length) {
    return (
      <Modal open onClose={onClose} title="One step before you book" subtitle={`To book ${d.name}, please complete your profile.`}
        footer={<><Button variant="ghost" onClick={onClose}>Not now</Button><Button variant="clay" icon={UserRoundPen} onClick={completeProfile}>Complete my profile</Button></>}>
        <div className="stack">
          <p className="mb-0">Hospitals and clinics need to know who&apos;s coming. Please add:</p>
          <ul className="pt-missing">{missing.map((m) => <li key={m}><Check size={14} /> {MISSING_LABEL[m] || m}</li>)}</ul>
          <p className="tiny muted mb-0"><ShieldCheck size={12} style={{ verticalAlign: '-2px' }} /> Your name, email and mobile are already filled in. If you add Aadhaar, we keep only the last 4 digits.</p>
        </div>
      </Modal>
    );
  }

  const footer = paid ? (
    <Button icon={ArrowRight} onClick={done}>{visitType === 'video' ? 'Go to my consult' : 'Open my visit'}</Button>
  ) : step < 3 ? (
    <>
      {step > 0 ? <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep((s) => s - 1)}>Back</Button> : <Button variant="ghost" onClick={onClose}>Cancel</Button>}
      {step < 2 ? <Button onClick={next} icon={ArrowRight} disabled={!opts}>Continue</Button> : <Button variant="clay" loading={busy} onClick={createBooking}>Continue to pay {fmtMoney(amount)}</Button>}
    </>
  ) : (
    <>
      <Button variant="ghost" onClick={onClose}>Pay later</Button>
      {expired && <Button icon={CalendarClock} onClick={rebook}>Choose another time</Button>}
    </>
  );

  return (
    <Modal open={!!doctor} onClose={onClose} wide title={paid ? 'Booking confirmed' : `Book ${d.name}`} subtitle={[d.specialty, d.fee ? `doctor's fee ${fmtMoney(d.fee)}` : null].filter(Boolean).join(' · ')} footer={footer}>
      {!opts && !error && <div className="skeleton" style={{ height: 160, borderRadius: 12 }} />}
      {!opts && error && <div className="form-error">{error}</div>}
      {opts && !paid && (
        <div className="stack">
          <div className="steps">{STEPS.map((s, i) => <span key={s} className={cx(i <= step && 'done')} />)}</div>
          <div className="pt-bk-doc"><Avatar name={d.name} /><div className="grow"><strong translate="no">{d.name}</strong><div className="tiny muted">{d.qualification}{d.experience > 0 ? ` · ${d.experience} yrs` : ''}</div></div><AvailBadge a={d.availability} /></div>

          {step === 0 && (
            <Field label="Where would you like to see the doctor?">
              <div className="pt-bk-types">
                <button type="button" disabled={!o.clinic} className={cx('pt-bk-type', visitType === 'clinic' && 'on')} onClick={() => setVisitType('clinic')}>
                  <Building2 /><span><strong>At the doctor&apos;s {o.clinic?.subtype === 'clinic' ? 'clinic' : 'hospital'}</strong><span className="tiny muted block">{o.clinic ? <><span translate="no">{o.clinic.name}, {o.clinic.district}</span> · pay {fmtMoney(fees.inPerson)} now</> : 'This doctor doesn’t see patients at a clinic'}</span></span>
                </button>
                <button type="button" className={cx('pt-bk-type', visitType === 'video' && 'on')} onClick={() => setVisitType('video')}>
                  <Video /><span><strong>Online consult</strong><span className="tiny muted block">From home — video, audio call or chat · {fmtMoney(fees.video)}</span></span>
                </button>
                <button type="button" disabled className="pt-bk-type soon">
                  <MonitorSmartphone /><span><strong>At a Nexus E-Clinic <span className="soon-badge">Coming soon</span></strong><span className="tiny muted block">Our own clinics with vitals checked on arrival</span></span>
                </button>
              </div>
              {place?.hours && <p className="tiny muted mt-1 mb-0"><Clock size={12} style={{ verticalAlign: '-2px' }} /> {place.hours}</p>}
            </Field>
          )}

          {step === 1 && (
            <Field label="When?">
              <div className="pt-bk-types two">
                <button type="button" disabled={!canNow} className={cx('pt-bk-type', when === 'now' && canNow && 'on')} onClick={() => setWhen('now')}>
                  <Clock /><span><strong>Right now</strong><span className="tiny muted block">{canNow ? 'Join the doctor’s live queue' : visitType === 'video' ? 'Doctor isn’t available right now' : 'Pick a time for in-person visits'}</span></span>
                </button>
                <button type="button" className={cx('pt-bk-type', later && 'on')} onClick={() => setWhen('later')}>
                  <CalendarClock /><span><strong>Pick a time</strong><span className="tiny muted block">Today or later this week</span></span>
                </button>
              </div>
              {later && <div className="mt-2"><SlotPicker value={slot} onChange={setSlot} /></div>}
              {visitType === 'video' && (
                <div className="pt-mode-pick">
                  <div className="small strong mb-1">How would you like to talk?</div>
                  <div className="chip-select" role="radiogroup" aria-label="How would you like to talk?">
                    {TALK_MODES.map((m) => (
                      <button type="button" key={m.key} role="radio" aria-checked={talk === m.key} title={m.sub} className={cx('chip', talk === m.key && 'on')} onClick={() => setTalk(m.key)}>
                        <m.icon size={14} style={{ verticalAlign: '-2px' }} /> {m.label}
                      </button>
                    ))}
                  </div>
                  <p className="tiny muted mt-1 mb-0">{TALK_MODES.find((m) => m.key === talk)?.sub}. You can still share photos and reports in any mode.</p>
                </div>
              )}
            </Field>
          )}

          {step === 2 && (
            <>
              <Field label="What's bothering you?" hint="The doctor sees this — and your past reports — before you meet. Type it, or tap the mic and speak.">
                <textarea className="textarea" rows={3} value={symptoms} onChange={(e) => setSymptoms(e.target.value)} placeholder="e.g. Fever and cough" />
              </Field>
              <VoiceInput label="Speak your symptoms" onText={(t) => setSymptoms((v) => [v.trim(), t].filter(Boolean).join(v.trim() ? ', ' : ''))} />
              <Field label="Since how many days?">
                <div className="chip-select">
                  {DURATIONS.map((x) => <button type="button" key={x.days} className={cx('chip', days !== '' && Number(days) === x.days && 'on')} onClick={() => setDays(x.days)}>{x.label}</button>)}
                </div>
              </Field>
              <dl className="kv review">
                <dt>Doctor</dt><dd translate="no">{d.name}</dd>
                <dt>Where</dt><dd>{visitType === 'video' ? MODE_LABEL[talk] : <span translate="no">{place?.name}</span>}</dd>
                <dt>When</dt><dd>{!later ? 'Now' : slot ? fmtDateTime(slot) : '—'}</dd>
                <dt>Pay now</dt><dd><strong>{fmtMoney(amount)}</strong>{visitType !== 'video' ? ' booking amount' : ''}</dd>
                {visitType !== 'video' && fees.payAtClinic > 0 && <><dt>At the clinic</dt><dd>Doctor&apos;s fee {fmtMoney(fees.payAtClinic)}</dd></>}
              </dl>
              {visitType !== 'video' && <p className="tiny muted mb-0"><ShieldCheck size={12} style={{ verticalAlign: '-2px' }} /> The {fmtMoney(fees.inPerson)} booking amount confirms your slot and keeps fake bookings away.</p>}
            </>
          )}

          {step === 3 && booking && (
            <>
              {booking.emergency && <div className="callout rose"><Ambulance /><div><strong>Your symptoms may be serious.</strong> {booking.emergency} <a href="tel:108" className="strong"><Phone size={13} /> Call 108</a></div></div>}
              <PaymentStep payment={booking.payment} onPaid={() => setPaid(true)} onError={(e) => setExpired(e.status === 409)} />
            </>
          )}
          {error && <div className="form-error">{error}</div>}
        </div>
      )}
      {paid && booking && (
        <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
          <div className="success-burst"><Check /></div>
          <h3 className="mb-0">You&apos;re booked with <span translate="no">{d.name}</span></h3>
          <div className="pt-bk-id">
            <span className="tiny muted">Your booking ID</span>
            <span className="row" style={{ gap: 8, justifyContent: 'center' }}>
              <strong className="mono" translate="no">{booking.consult.bookingNo}</strong>
              <button type="button" className="icon-btn" aria-label="Copy booking ID" onClick={() => navigator.clipboard?.writeText(booking.consult.bookingNo).then(() => setCopied(true)).catch(() => {})}>{copied ? <Check size={15} /> : <Copy size={15} />}</button>
            </span>
          </div>
          <p className="small muted mb-0">
            <CheckCircle2 size={14} style={{ verticalAlign: '-2px', color: 'var(--green-2)' }} /> Paid {fmtMoney(booking.payment.amount)} · the doctor has been told about your symptoms and reports.
          </p>
          {visitType !== 'video' ? (
            <>
              <p className="small mb-0"><QrCode size={14} style={{ verticalAlign: '-2px' }} /> At <strong translate="no">{place?.name}</strong>, show this QR (or tell them your booking ID). {fees.payAtClinic > 0 && <>Pay the doctor&apos;s fee of {fmtMoney(fees.payAtClinic)} there.</>}</p>
              <VisitPass consultId={booking.consult.id} compact />
            </>
          ) : (
            <>
              <QR value={`NEXUS-BOOKING:${booking.consult.bookingNo}`} size={140} label="Booking QR" />
              <p className="small mb-0">{MODE_LABEL[booking.consult.mode] || MODE_LABEL.video}.{!later ? 'Stay on the consult screen — you’ll be called in shortly.' : `We'll remind you before ${fmtDateTime(slot)}.`}</p>
            </>
          )}
          {/* For family: who, when, where — never the symptoms. */}
          <ShareButton label="Tell family on WhatsApp"
            text={`I've booked a doctor on Nexus Healthcare: ${d.name}, ${later && slot ? fmtDateTime(slot) : 'today, right now'} — ${visitType === 'video' ? (MODE_LABEL[booking.consult.mode] || MODE_LABEL.video).toLowerCase() : `at ${place?.name || 'the clinic'}`}.`} />
        </div>
      )}
    </Modal>
  );
}
