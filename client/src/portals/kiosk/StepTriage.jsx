import { useEffect, useRef, useState } from 'react';
import { Thermometer, Wind, Speech, HeartPulse, Soup, Brain, Bandage, Hand, Baby, CircleHelp, Mic, Sparkles, Siren, Ambulance, Video, CalendarCheck, Printer, ArrowRight, Hospital, Phone, Check, Home } from 'lucide-react';
import { api } from '../../api';
import { cx } from '../../components/ui';
import { useKiosk } from './context';
import { KButton, KError, StepFrame } from './KUi';
import Slip from './Slip';
import { langOf } from './i18n';
import { getLocale } from '../../i18n';
import { joinResults } from '../../components/speech';

const SYMPTOMS = [
  { id: 'fever', icon: Thermometer, text: 'fever' },
  { id: 'cough', icon: Speech, text: 'cough' },
  { id: 'breath', icon: Wind, text: 'breathless, trouble breathing' },
  { id: 'chest', icon: HeartPulse, text: 'chest pain' },
  { id: 'stomach', icon: Soup, text: 'stomach pain' },
  { id: 'head', icon: Brain, text: 'headache' },
  { id: 'injury', icon: Bandage, text: 'injury with pain and swelling' },
  { id: 'skin', icon: Hand, text: 'skin rash, itching' },
  { id: 'child', icon: Baby, text: 'child unwell' },
  { id: 'other', icon: CircleHelp, text: '' },
];
const DURATIONS = [
  { id: 'today', key: 'd_today', value: 'since today' },
  { id: 'few', key: 'd_few', value: '3 days' },
  { id: 'week', key: 'd_week', value: '1 week' },
  { id: 'long', key: 'd_long', value: 'more than 2 weeks' },
];
const SEVERITY = [
  { id: 3, key: 'sev_mild', tone: 'g' },
  { id: 6, key: 'sev_moderate', tone: 's' },
  { id: 9, key: 'sev_severe', tone: 'r' },
];

// Bookable slots for routine visits: later today (if there's time) and tomorrow.
function nextSlots() {
  const out = [];
  const now = new Date();
  [16, 18].forEach((h) => { const d = new Date(now); d.setHours(h, 0, 0, 0); if (d - now > 45 * 60000) out.push(d); });
  [10, 12, 16].forEach((h) => { const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(h, 0, 0, 0); out.push(d); });
  return out.slice(0, 4);
}
const slotLabel = (d) => `${d.toDateString() === new Date().toDateString() ? 'Today' : 'Tomorrow'} · ${d.toLocaleTimeString(getLocale(), { hour: 'numeric', minute: '2-digit' })}`;

function useSpeechInput(lang, onText) {
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);
  const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
  const start = () => {
    if (!SR || listening) return; // a second tap while listening would spawn a parallel recogniser
    try {
      const rec = new SR();
      rec.lang = lang;
      rec.interimResults = false;
      rec.onresult = (e) => onText(joinResults(e.results)); // Android repeats the growing sentence — keep it once
      rec.onend = () => setListening(false);
      rec.onerror = () => setListening(false);
      recRef.current = rec;
      rec.start();
      setListening(true);
    } catch { setListening(false); }
  };
  useEffect(() => () => { try { recRef.current?.abort(); } catch { /* ignore */ } }, []);
  return { supported: Boolean(SR), listening, start };
}

function Outcome({ result, onConnect, connecting, onBook, booking, booked, onFinish, kiosk, patient, vitals, t }) {
  const level = result.level;
  // Nearest verified hospital to this kiosk, from the server (GET /kiosk/home → nearestHospital); none → just "Call 108".
  const { home } = useKiosk();
  const hospital = home?.data?.nearestHospital || null;
  const docsOnline = (home?.data?.doctors || []).filter((d) => d.online).length;
  const [slot, setSlot] = useState(null);
  const slots = useState(nextSlots)[0];
  const localAdvice = t(`adv_${level}`);
  const card = {
    emergency: { icon: Siren, cls: 'rose', title: t('out_emergency') },
    doctor_now: { icon: Video, cls: 'clay', title: t('out_doctor_now') },
    routine: { icon: CalendarCheck, cls: 'sky', title: t('out_routine') },
    self_care: { icon: Home, cls: 'green', title: t('out_self_care') },
  }[level];

  return (
    <div className="k-outcome fade-in">
      <div className={cx('k-ocard', card.cls)}>
        <span className="k-ocard-icon"><card.icon /></span>
        <div className="grow">
          <h2>{card.title}</h2>
          <p>{localAdvice.startsWith('adv_') ? result.advice : localAdvice}</p>
          <p className="k-ocard-note"><Sparkles size={16} /> {result.note}</p>
        </div>
      </div>

      {level === 'emergency' && (
        <div className="k-emerg">
          {/* The app doesn't call an ambulance or alert a hospital by itself — the card tells the operator to call. */}
          <div className="k-amb" style={{ flexWrap: 'wrap' }}>
            <span className="k-amb-pulse"><Ambulance /></span>
            <div className="grow" style={{ minWidth: 170 }}>
              <strong>Call 108 for an ambulance now</strong>
              <span>Give them this clinic's address. Stay with the patient; keep them sitting up.</span>
            </div>
            <a className="k-btn ghost" href="tel:108"><Phone /><span>108</span></a>
          </div>
          {hospital && (
            <div className="k-hosp">
              <Hospital />
              <div className="grow">
                <small>{hospital.emergency ? 'Nearest hospital with an emergency department' : 'Nearest hospital'}</small>
                <strong translate="no">{hospital.name}</strong>
                <span>{[hospital.address || hospital.district, hospital.distanceKm != null ? `~${hospital.distanceKm} km` : null, hospital.hours].filter(Boolean).join(' · ')}</span>
              </div>
              {hospital.phone && <a className="k-btn ghost" href={`tel:${hospital.phone.replace(/[^\d+]/g, '')}`}><Phone /><span dir="ltr">{hospital.phone}</span></a>}
            </div>
          )}
          {result.redFlags?.length > 0 && <p className="k-fine">Escalated by protocol because of: {result.redFlags.join(', ')}. No AI judgement is applied to red-flag symptoms.</p>}
          <div className="k-confirm-actions">
            <KButton variant="ghost" icon={Check} onClick={onFinish}>Patient handed to ambulance</KButton>
            <KButton variant="danger" icon={Video} loading={connecting} onClick={onConnect}>Connect a doctor while we wait</KButton>
          </div>
        </div>
      )}

      {level === 'doctor_now' && (
        <div className="k-confirm-actions">
          <span className="k-fine">{docsOnline ? `${docsOnline} E-Clinic doctor${docsOnline === 1 ? ' is' : 's are'} online now.` : "You'll join the queue for the next free doctor."} A doctor who speaks {patient?.language || 'your language'} is preferred.</span>
          <KButton icon={Video} className="xl" loading={connecting} onClick={onConnect}>{t('connect')}</KButton>
        </div>
      )}

      {level === 'routine' && !booked && (
        <div className="k-book">
          <span className="k-field-l">Pick a time that suits you</span>
          <div className="k-slots">
            {slots.map((d) => <button key={d.toISOString()} type="button" className={cx('k-slot', slot?.getTime() === d.getTime() && 'on')} onClick={() => setSlot(d)}>{slotLabel(d)}</button>)}
          </div>
          <div className="k-confirm-actions">
            <KButton variant="ghost" icon={Video} loading={connecting} onClick={onConnect}>Talk to a doctor now instead</KButton>
            <KButton icon={CalendarCheck} className="xl" disabled={!slot} loading={booking} onClick={() => onBook(slot)}>Book this slot</KButton>
          </div>
        </div>
      )}

      {level === 'routine' && booked && (
        <div className="k-booked fade-in">
          <div className="k-booked-row"><Check /><div><strong>Booked with {booked.doctorName}</strong><span>{slotLabel(new Date(booked.scheduledAt))} · keep the printed slip as a reminder</span></div></div>
          <Slip kind="advice" kiosk={kiosk} patient={patient} triage={result} vitals={vitals} booking={booked} />
          <div className="k-confirm-actions">
            <KButton variant="ghost" icon={Printer} onClick={() => window.print()}>Print slip</KButton>
            <KButton icon={ArrowRight} className="xl" onClick={onFinish}>{t('finish')}</KButton>
          </div>
        </div>
      )}

      {level === 'self_care' && (
        <div className="k-booked">
          <Slip kind="advice" kiosk={kiosk} patient={patient} triage={result} vitals={vitals} />
          <p className="k-fine">If things get worse, come back any time.</p>
          <div className="k-confirm-actions">
            <KButton variant="ghost" icon={Video} loading={connecting} onClick={onConnect}>Talk to a doctor anyway</KButton>
            <KButton variant="secondary" icon={Printer} onClick={() => window.print()}>Print advice</KButton>
            <KButton icon={ArrowRight} className="xl" onClick={onFinish}>{t('finish')}</KButton>
          </div>
        </div>
      )}

      <p className="k-disclaimer">{t('disclaimer')}</p>
    </div>
  );
}

export default function StepTriage() {
  const { t, say, goto, flow, setFlow, reset, kiosk, lang } = useKiosk();
  const saved = flow.symptoms || {};
  const [picked, setPicked] = useState(saved.picked || []);
  const [text, setText] = useState(saved.text || '');
  const [duration, setDuration] = useState(saved.duration || '');
  const [severity, setSeverity] = useState(saved.severity || 0);
  const [result, setResult] = useState(flow.triage);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState('');
  const [booked, setBooked] = useState(flow.booking);
  const speech = useSpeechInput(langOf(lang).speech, (s) => setText((x) => (x ? `${x} ${s}` : s)));

  useEffect(() => { if (!flow.triage) say('triage_title');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (id) => {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
    const s = SYMPTOMS.find((x) => x.id === id);
    if (!picked.includes(id)) say(`s_${s.id}`);
  };

  const symptomsText = () => {
    const parts = picked.map((id) => SYMPTOMS.find((s) => s.id === id)?.text).filter(Boolean);
    if (text.trim()) parts.push(text.trim());
    return parts.join(', ');
  };

  const canCheck = (picked.length > 0 && !(picked.length === 1 && picked[0] === 'other' && !text.trim())) || text.trim().length > 3;

  const check = async () => {
    if (busy) return;
    setErr('');
    setBusy('triage');
    const symptoms = symptomsText();
    const dur = DURATIONS.find((d) => d.id === duration)?.value || '';
    try {
      const vitals = { ...(flow.vitals || {}) };
      delete vitals.deviceWarnings;
      const r = await api.post('/triage', { symptoms, age: flow.patient?.age, duration: dur, severity, vitals });
      const human = `${symptoms}${dur ? ` — ${dur}` : ''}${severity ? `, ${severity >= 8 ? 'severe' : severity >= 5 ? 'moderate' : 'mild'}` : ''}`;
      const triage = { ...r, symptoms: human.charAt(0).toUpperCase() + human.slice(1) };
      setResult(triage);
      setFlow({ triage, symptoms: { picked, text, duration, severity } });
      say(`out_${r.level}`);
    } catch (e) { setErr(e.message); } finally { setBusy(null); }
  };

  const vitalsClean = () => { const v = { ...(flow.vitals || {}) }; delete v.deviceWarnings; return Object.keys(v).length ? v : null; };

  // One request at a time: "Talk to a doctor now" and "Book this slot" sit side by side, and tapping both
  // used to create two consults for the same patient.
  const connect = async () => {
    if (busy) return;
    setBusy('connect');
    setErr('');
    try {
      const c = await api.post('/consults', { patientId: flow.patient.id, triage: result, vitals: vitalsClean(), mode: 'video' });
      setFlow({ consultId: c.id, step: 4 });
    } catch (e) { setErr(e.message); } finally { setBusy(null); }
  };

  const book = async (slot) => {
    if (busy) return;
    setBusy('book');
    setErr('');
    try {
      const c = await api.post('/consults', { patientId: flow.patient.id, triage: result, vitals: vitalsClean(), mode: 'video', type: 'scheduled', scheduledAt: slot.toISOString() });
      setBooked(c);
      setFlow({ booking: c });
    } catch (e) { setErr(e.message); } finally { setBusy(null); }
  };

  if (result) {
    return (
      <StepFrame title={t('triage_title')} onBack={booked ? null : () => { setResult(null); setFlow({ triage: null }); }} wide>
        <KError>{err}</KError>
        <Outcome
          t={t}
          result={result}
          kiosk={kiosk}
          patient={flow.patient}
          vitals={vitalsClean()}
          onConnect={connect}
          connecting={busy === 'connect'}
          onBook={book}
          booking={busy === 'book'}
          booked={booked}
          onFinish={reset}
        />
      </StepFrame>
    );
  }

  return (
    <StepFrame
      title={t('triage_title')}
      sub={t('triage_sub')}
      onBack={() => goto(2)}
      wide
      actions={<KButton icon={Sparkles} className="xl" disabled={!canCheck} loading={busy === 'triage'} onClick={check}>{busy === 'triage' ? t('checking') : t('check')}</KButton>}
    >
      <div className="k-symptoms">
        {SYMPTOMS.map((s) => (
          <button key={s.id} type="button" className={cx('k-sym', picked.includes(s.id) && 'on', (s.id === 'chest' || s.id === 'breath') && 'flag')} onClick={() => toggle(s.id)} aria-pressed={picked.includes(s.id)}>
            <span className="k-sym-icon"><s.icon /></span>
            <span className="k-sym-l">{t(`s_${s.id}`)}</span>
            {picked.includes(s.id) && <span className="k-sym-check"><Check /></span>}
          </button>
        ))}
      </div>

      <div className="k-words">
        <input className="k-input big" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('own_words')} />
        {speech.supported && (
          <button type="button" className={cx('k-mic', speech.listening && 'on')} onClick={speech.start} aria-label="Speak your symptoms"><Mic /></button>
        )}
      </div>

      <div className="k-qrow">
        <div>
          <span className="k-field-l">{t('since')}</span>
          <div className="k-seg big">
            {DURATIONS.map((d) => <button key={d.id} type="button" className={cx(duration === d.id && 'on')} onClick={() => setDuration(d.id)}>{t(d.key)}</button>)}
          </div>
        </div>
        <div>
          <span className="k-field-l">{t('how_bad')}</span>
          <div className="k-seg big sev">
            {SEVERITY.map((s) => <button key={s.id} type="button" className={cx(s.tone, severity === s.id && 'on')} onClick={() => setSeverity(s.id)}><span className="k-sev-bar" />{t(s.key)}</button>)}
          </div>
        </div>
      </div>
      <KError>{err}</KError>
    </StepFrame>
  );
}
