import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Mic, MicOff, Phone, Ambulance, IdCard, Video, CalendarClock, HeartPulse, RefreshCw, Info, Check, Search } from 'lucide-react';
import { api } from '../../api';
import NearbyDoctors from './NearbyDoctors';
import { Avatar, Button, Field, TriageBadge, cx } from '../../components/ui';
import { PageHeader } from '../../components/PortalLayout';
import { usePatient, firstName, relationOf, SPEECH_LANG } from './shared';
import { useDictation } from '../../components/speech';

const QUICK_SYMPTOMS = ['Fever', 'Cough', 'Headache', 'Body ache', 'Sore throat', 'Cold / runny nose', 'Vomiting', 'Loose motions', 'Stomach pain', 'Dizziness', 'Rash or itching', 'Burning urine', 'Tiredness', 'Acidity'];
const DANGER_SIGNS = [
  { key: 'chest pain', label: 'Chest pain or pressure' },
  { key: 'breathless', label: 'Struggling to breathe' },
  { key: 'unconscious', label: 'Fainted or hard to wake' },
  { key: 'seizure', label: 'Fits / seizure' },
  { key: 'heavy bleeding', label: 'Heavy bleeding' },
  { key: 'slurred speech', label: 'Face drooping or slurred speech' },
];
const DURATIONS = [
  { value: 'today', label: 'Started today' },
  { value: '1-2 days', label: '1–2 days' },
  { value: '3-6 days', label: '3–6 days' },
  { value: '1 week', label: 'About a week' },
  { value: '2+ weeks', label: 'More than a week' },
  { value: '1 month or more', label: 'A month or more' },
];
const SEVERITY_WORDS = ['', 'Barely there', 'Mild', 'Mild', 'Uncomfortable', 'Uncomfortable', 'Hard to ignore', 'Hard to ignore', 'Very bad', 'Very bad', 'Worst ever'];
const STEP_NAMES = ['Who', 'Symptoms', 'A few questions', 'Result'];


export default function Triage() {
  const { patient, profiles, switchProfile } = usePatient();
  const [step, setStep] = useState(0);
  const location = useLocation();
  const [text, setText] = useState(() => location.state?.symptoms || '');
  const [chips, setChips] = useState([]);
  const [danger, setDanger] = useState([]);
  const [duration, setDuration] = useState('');
  const [severity, setSeverity] = useState(5);
  const [age, setAge] = useState('');
  const [result, setResult] = useState(null);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState('');
  const topRef = useRef(null);

  useEffect(() => { if (patient?.age != null) setAge(String(patient.age)); }, [patient?.id, patient?.age]);
  // scrollIntoView ignores the CSS reduced-motion override, so honour it here.
  useEffect(() => { topRef.current?.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); }, [step]);

  const who = patient ? firstName(patient.name) : '';
  const isSelf = profiles.find((p) => p.id === patient?.id)?.self;
  const you = isSelf ? 'you' : who;
  const your = isSelf ? 'your' : `${who}’s`;

  const symptomText = [text.trim().replace(/[.\s]+$/, ''), chips.join(', '), danger.join(', ')].filter(Boolean).join('. ');

  const submit = async () => {
    setThinking(true);
    setError('');
    const started = Date.now();
    try {
      const r = await api.post('/triage', { symptoms: symptomText, age: age === '' ? undefined : Number(age), duration, severity });
      // Give the moment a little room so it doesn't feel like a coin toss.
      await new Promise((res) => setTimeout(res, Math.max(0, 1100 - (Date.now() - started))));
      setResult(r);
      setStep(3);
    } catch (e) {
      setError(e.message);
    } finally {
      setThinking(false);
    }
  };

  const restart = () => { setStep(0); setText(''); setChips([]); setDanger([]); setDuration(''); setSeverity(5); setResult(null); };

  return (
    <div className="pt-triage" ref={topRef}>
      <PageHeader eyebrow="Symptom check" title={step === 3 ? 'Here’s what we suggest' : 'Let’s understand what’s going on'}
        subtitle={step === 3 ? null : 'Take your time — you can skip anything you’re unsure about.'} />

      <div className="pt-steps-wrap" aria-label={`Step ${step + 1} of 4: ${STEP_NAMES[step]}`}>
        <div className="steps">{STEP_NAMES.map((n, i) => <span key={n} className={i <= step ? 'done' : ''} />)}</div>
        <div className="pt-step-labels tiny muted mt-1">{STEP_NAMES.map((n, i) => <span key={n} className={cx(i === step && 'pt-step-now')}>{n}</span>)}</div>
      </div>

      {step === 0 && (
        <section className="card pt-wizard fade-in" key="s0">
          <h2 className="pt-q">Who are we checking on today?</h2>
          <div className="pt-who">
            {profiles.map((p) => (
              <button key={p.id} className={cx('pt-who-card', patient?.id === p.id && 'on')} aria-pressed={patient?.id === p.id}
                onClick={() => { if (patient?.id !== p.id) switchProfile(p.id, { stay: true, quiet: true }); }}>
                <Avatar name={p.name} size="lg" />
                <span className="strong">{p.self ? 'Me' : firstName(p.name)}</span>
                <span className="tiny muted">{relationOf(p)}{p.age != null ? ` · ${p.age} yrs` : ''}</span>
                {patient?.id === p.id && <span className="pt-who-check"><Check size={14} strokeWidth={3} /></span>}
              </button>
            ))}
          </div>
          <div className="pt-wizard-foot">
            <span className="small muted">Checking for someone else? <Link to="/patient/family?add=1">Add them to your family</Link>.</span>
            <Button onClick={() => setStep(1)} disabled={!patient}>Continue <ArrowRight size={17} /></Button>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="card pt-wizard fade-in" key="s1">
          <h2 className="pt-q">What&apos;s bothering {you}?</h2>
          <p className="muted">Describe it in your own words — Hindi, English, or a mix is perfectly fine.</p>
          <SymptomInput value={text} onChange={setText} language={patient?.language} />
          <div className="mt-2">
            <div className="small strong mb-1">Or tap what fits</div>
            <div className="chip-select">
              {QUICK_SYMPTOMS.map((s) => (
                <button key={s} className={cx('chip', chips.includes(s) && 'on')} aria-pressed={chips.includes(s)} onClick={() => setChips((c) => (c.includes(s) ? c.filter((x) => x !== s) : [...c, s]))}>{s}</button>
              ))}
            </div>
          </div>
          <div className="pt-danger mt-3">
            <div className="small strong">Is {you === 'you' ? 'any of this happening to you' : `${who} having any of these`} right now?</div>
            <div className="chip-select mt-1">
              {DANGER_SIGNS.map((d) => (
                <button key={d.key} className={cx('chip danger', danger.includes(d.key) && 'on')} aria-pressed={danger.includes(d.key)} onClick={() => setDanger((c) => (c.includes(d.key) ? c.filter((x) => x !== d.key) : [...c, d.key]))}>{d.label}</button>
              ))}
            </div>
          </div>
          <div className="pt-wizard-foot">
            <Button variant="ghost" onClick={() => setStep(0)}><ArrowLeft size={17} /> Back</Button>
            <Button onClick={() => setStep(2)} disabled={!symptomText}>Continue <ArrowRight size={17} /></Button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="card pt-wizard fade-in" key="s2">
          <h2 className="pt-q">Just a few quick questions</h2>
          <p className="muted">These help the doctor understand {your} situation faster.</p>
          <div className="stack lg">
            <Field label="How long has this been going on?">
              <div className="chip-select">
                {DURATIONS.map((d) => <button key={d.value} className={cx('chip', duration === d.value && 'on')} aria-pressed={duration === d.value} onClick={() => setDuration(d.value === duration ? '' : d.value)}>{d.label}</button>)}
              </div>
            </Field>
            <Field label={`How bad is it right now? ${severity}/10 — ${SEVERITY_WORDS[severity]}`}>
              <input type="range" min="1" max="10" value={severity} onChange={(e) => setSeverity(Number(e.target.value))} className="pt-range" aria-label="Severity from 1 to 10" style={{ '--pct': `${((severity - 1) / 9) * 100}%` }} />
              <div className="row between tiny muted"><span>1 · barely there</span><span>10 · worst ever</span></div>
            </Field>
            <Field label="Age" hint={patient?.age != null ? `From ${your} passport — change it if it’s wrong.` : 'Helps us be more careful with children and elders.'}>
              <input className="input" type="number" min="0" max="120" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} style={{ maxWidth: 140 }} />
            </Field>
          </div>
          {error && <div className="form-error mt-2">{error}</div>}
          <div className="pt-wizard-foot">
            <Button variant="ghost" onClick={() => setStep(1)} disabled={thinking}><ArrowLeft size={17} /> Back</Button>
            <Button onClick={submit} loading={thinking}>{thinking ? 'Looking at the details…' : 'See what to do'}</Button>
          </div>
          {thinking && <div className="pt-thinking" aria-live="polite"><span /><span /><span /> Matching against clinical guidelines</div>}
        </section>
      )}

      {step === 3 && result && (
        <>
          <TriageResult result={result} symptoms={symptomText} who={who} isSelf={isSelf} onRestart={restart} />
          {result.level !== 'emergency' && <NearbyDoctors symptoms={symptomText} title={`Best ${result.specialty === 'General Medicine' ? 'doctors' : result.specialty.toLowerCase() + ' doctors'} near ${isSelf ? 'you' : who}`} />}
        </>
      )}

      <p className="pt-disclaimer"><Info size={15} /> This is guidance, not a diagnosis. A doctor reviews every result.</p>
    </div>
  );
}

/* ---------- voice + text input ---------- */
function SymptomInput({ value, onChange, language }) {
  // The shared mic engine: keeps listening until tapped, each finished phrase is added once, and the words
  // being spoken show in the box as you talk (Android used to write every version of the sentence).
  const valueRef = useRef(value);
  valueRef.current = value;
  const mic = useDictation({
    lang: SPEECH_LANG[language] || 'hi-IN',
    onPhrase: (t) => onChange([valueRef.current.trim(), t].filter(Boolean).join(' ')),
  });
  const shown = mic.listening && mic.interim ? [value.trim(), mic.interim].filter(Boolean).join(' ') : value;

  return (
    <div className="pt-voice-wrap">
      <label htmlFor="symptom-text" className="sr-only">Describe the symptoms</label>
      <textarea id="symptom-text" className="textarea pt-symptom-text" rows={4} value={shown} readOnly={mic.listening} onChange={(e) => onChange(e.target.value)}
        placeholder={mic.listening ? 'Listening… speak now' : 'e.g. Bukhar hai 2 din se, sar mein dard aur thakaan. Fever since 2 days with headache.'} />
      {mic.supported && (
        <button type="button" className={cx('pt-mic', mic.listening && 'on')} onClick={mic.toggle} aria-label={mic.listening ? 'Stop listening' : 'Speak your symptoms'} aria-pressed={mic.listening}>
          {mic.listening ? <MicOff size={18} /> : <Mic size={18} />}
          <span className="small">{mic.listening ? 'Listening… tap to stop' : 'Speak'}</span>
        </button>
      )}
      {mic.error && <p className="tiny voice-err mt-1">{mic.error}</p>}
      {!mic.error && mic.note && !mic.listening && <p className="tiny muted mt-1">{mic.note}</p>}
    </div>
  );
}

/* ---------- result ---------- */
function TriageResult({ result, symptoms, who, isSelf, onRestart }) {
  const navigate = useNavigate();
  // Every consult is booked (mode, time and payment) in the doctor finder's BookingFlow — open it with
  // these symptoms, and the suggested department when triage points at a specialist.
  const specialist = !['General Medicine', 'Emergency'].includes(result.specialty);
  const findDoctors = () => navigate('/patient/consult', { state: { symptoms, ...(specialist ? { department: result.specialty } : {}) } });

  if (result.level === 'emergency') {
    return (
      <section className="pt-result emergency fade-in" aria-live="assertive">
        <div className="pt-result-icon"><Ambulance size={34} /></div>
        <h2>This needs urgent care — please don&apos;t wait.</h2>
        <p>{result.advice}</p>
        {result.redFlags?.length > 0 && <p className="small" style={{ opacity: 0.9 }}>Because: {result.redFlags.join(', ')}</p>}
        <a className="btn lg pt-call108" href="tel:108"><Phone size={20} /> Call 108 ambulance</a>
        <div className="row wrap mt-2" style={{ justifyContent: 'center' }}>
          <Button variant="secondary" icon={IdCard} onClick={() => navigate('/patient/emergency')}>Show {isSelf ? 'my' : `${who}’s`} emergency card</Button>
        </div>
        <div className="pt-while-wait">
          <strong>While help is on the way</strong>
          <ul>
            <li>Stay with {isSelf ? 'someone' : who}; keep them sitting up or lying on their side.</li>
            <li>Don&apos;t give food or water if they&apos;re drowsy.</li>
            <li>Keep the passport card handy — paramedics can scan it for allergies.</li>
          </ul>
        </div>
      </section>
    );
  }

  return (
    <section className={cx('card pt-result fade-in', result.level)}>
      <div className="row top wrap">
        <div className="pt-result-icon">{result.level === 'doctor_now' ? <Video size={26} /> : result.level === 'routine' ? <CalendarClock size={26} /> : <HeartPulse size={26} />}</div>
        <div className="grow">
          <TriageBadge level={result.level} />
          <h2 className="mt-1">
            {result.level === 'doctor_now' && `${isSelf ? 'You' : who} should talk to a doctor now.`}
            {result.level === 'routine' && 'A doctor should take a look — but no rush.'}
            {result.level === 'self_care' && 'This looks manageable at home.'}
          </h2>
          <p className="muted mb-0">{result.advice}</p>
        </div>
      </div>

      <div className="pt-result-note small">
        <strong>What we&apos;ll tell the doctor:</strong> {result.note} Suggested specialty: {result.specialty}.
      </div>

      {result.level === 'doctor_now' && (
        <div className="row wrap mt-2">
          <Button size="lg" variant="clay" icon={Search} onClick={findDoctors}>Find doctors</Button>
          <span className="small muted">Doctors who are free right now are marked “Available” — book one for a video call straight away.</span>
        </div>
      )}

      {result.level === 'routine' && (
        <div className="row wrap mt-2">
          <Button size="lg" icon={Search} onClick={findDoctors}>Find doctors</Button>
          <span className="small muted">Pick a doctor, then a time that suits you.</span>
        </div>
      )}

      {result.level === 'self_care' && (
        <div className="stack mt-2">
          <div className="pt-care-tips">
            <div><strong>Rest</strong><span className="small muted">Sleep well and take it easy for a day or two.</span></div>
            <div><strong>Fluids</strong><span className="small muted">Water, ORS, nimbu-paani, soups — sip often.</span></div>
            <div><strong>Watch for</strong><span className="small muted">Fever above 102°F, breathing trouble, or feeling worse after 2–3 days.</span></div>
          </div>
          <div className="row wrap">
            <Button variant="secondary" onClick={findDoctors}>Talk to a doctor anyway</Button>
          </div>
        </div>
      )}

      <div className="pt-wizard-foot">
        <Button variant="ghost" icon={RefreshCw} onClick={onRestart}>Start over</Button>
      </div>
    </section>
  );
}
