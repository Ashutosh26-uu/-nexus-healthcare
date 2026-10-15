import { useEffect, useRef, useState } from 'react';
import { Gauge, HeartPulse, Activity, Thermometer, Scale, Droplet, Pencil, Check, Play, RotateCcw, ArrowRight, AlertTriangle } from 'lucide-react';
import { api } from '../../api';
import { cx } from '../../components/ui';
import { useKiosk } from './context';
import { KButton, KError, StepFrame } from './KUi';

const DEVICES = [
  { key: 'bp', label: 'Blood pressure', unit: 'mmHg', icon: Gauge, prompt: 'v_bp', device: 'BP cuff', ms: 2600, flag: (v) => { const [s, d] = String(v).split('/').map(Number); return s >= 160 || d >= 100 ? 'bad' : s >= 140 || d >= 90 ? 'warn' : ''; } },
  { key: 'pulse', label: 'Pulse', unit: 'per min', icon: HeartPulse, prompt: 'v_pulse', device: 'BP cuff', ms: 1400, flag: (v) => (v > 120 || v < 50 ? 'bad' : v > 100 ? 'warn' : '') },
  { key: 'spo2', label: 'Oxygen (SpO₂)', unit: '%', icon: Activity, prompt: 'v_spo2', device: 'Pulse oximeter', ms: 2000, flag: (v) => (v < 90 ? 'bad' : v < 95 ? 'warn' : '') },
  { key: 'temp', label: 'Temperature', unit: '°F', icon: Thermometer, prompt: 'v_temp', device: 'IR thermometer', ms: 1600, flag: (v) => (v >= 102.5 ? 'bad' : v >= 100.4 ? 'warn' : '') },
  { key: 'weight', label: 'Weight', unit: 'kg', icon: Scale, prompt: 'v_weight', device: 'Weighing scale', ms: 1800, flag: () => '' },
  { key: 'sugar', label: 'Blood sugar', unit: 'mg/dL', icon: Droplet, prompt: 'v_sugar', device: 'Glucometer', ms: 2400, flag: (v) => (v >= 300 ? 'bad' : v >= 180 ? 'warn' : '') },
];

const FLAG_WORD = { warn: 'A little high', bad: 'Needs attention' };
const flagWord = (key, f) => (key === 'spo2' && f ? (f === 'bad' ? 'Low — needs attention' : 'A little low') : FLAG_WORD[f]);

export default function StepVitals() {
  const { t, say, goto, flow, setFlow } = useKiosk();
  const [values, setValues] = useState(flow.vitals || {});
  const [warnings, setWarnings] = useState(flow.vitals?.deviceWarnings || []);
  const [current, setCurrent] = useState(-1); // index being read
  const [phase, setPhase] = useState(flow.vitals ? 'done' : 'idle'); // idle | reading | done
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState('');
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    if (!flow.vitals) say('vitals_sub');
    return () => { cancelled.current = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const startReading = async () => {
    setErr('');
    setPhase('reading');
    setValues({});
    let reading;
    try {
      reading = await api.post('/kiosk/vitals/read');
    } catch (e) {
      setErr(`${e.message} You can type the readings in by hand.`);
      setPhase('done');
      return;
    }
    setWarnings(reading.deviceWarnings || []);
    for (let i = 0; i < DEVICES.length; i++) {
      if (cancelled.current) return;
      const d = DEVICES[i];
      setCurrent(i);
      say(d.prompt);
      await wait(d.ms);
      if (cancelled.current) return;
      setValues((v) => ({ ...v, [d.key]: reading[d.key] }));
    }
    setCurrent(-1);
    setPhase('done');
    say('v_done');
  };

  const promptKey = current >= 0 ? DEVICES[current].prompt : phase === 'done' ? 'v_done' : 'vitals_sub';

  const proceed = () => {
    const clean = {};
    DEVICES.forEach((d) => {
      const v = values[d.key];
      if (v === null || v === undefined || v === '') return;
      clean[d.key] = d.key === 'bp' ? String(v) : Number(v);
    });
    setFlow({ vitals: { ...clean, deviceWarnings: warnings }, step: 3 });
  };

  return (
    <StepFrame
      title={t('vitals_title')}
      sub={t('vitals_sub')}
      onBack={() => goto(1)}
      wide
      actions={(
        <>
          {phase === 'idle' && <KButton icon={Play} className="xl" onClick={startReading}>{t('start_reading')}</KButton>}
          {phase === 'done' && <KButton variant="ghost" icon={RotateCcw} onClick={startReading}>{t('reading_again')}</KButton>}
          {phase === 'done' && <KButton icon={ArrowRight} className="xl" onClick={proceed}>{t('next')}</KButton>}
          {phase === 'reading' && <KButton variant="ghost" loading>{DEVICES[current]?.device || '…'}</KButton>}
        </>
      )}
    >
      <div className={cx('k-guide', phase)}>
        <span className="k-guide-icon">{current >= 0 ? (() => { const I = DEVICES[current].icon; return <I />; })() : phase === 'done' ? <Check /> : <HeartPulse />}</span>
        <span className="k-guide-text" key={promptKey}>{t(promptKey)}</span>
      </div>

      <KError>{err}</KError>
      {warnings.length > 0 && (
        <div className="k-devwarn"><AlertTriangle /><div><strong>Device check:</strong> {warnings.join(' · ')}. Enter that reading by hand or skip it.</div></div>
      )}

      <div className="k-vitals">
        {DEVICES.map((d, i) => {
          const v = values[d.key];
          const has = v !== undefined && v !== null && v !== '';
          const reading = current === i;
          const f = has ? d.flag(v) : '';
          const unavailable = phase === 'done' && v === null;
          return (
            <div key={d.key} className={cx('k-vital', reading && 'reading', has && 'has', f, unavailable && 'na')}>
              <div className="k-vital-top">
                <span className="k-vital-icon"><d.icon /></span>
                <span className="k-vital-label">{t(`vl_${d.key}`)}</span>
                {phase === 'done' && editing !== d.key && (
                  <button type="button" className="k-vital-edit" onClick={() => setEditing(d.key)} aria-label={`Edit ${d.label}`}><Pencil /></button>
                )}
              </div>
              {editing === d.key ? (
                <div className="k-vital-editrow">
                  <input className="k-input" dir="ltr" autoFocus inputMode={d.key === 'bp' ? 'text' : 'decimal'} value={v ?? ''} placeholder={d.key === 'bp' ? '120/80' : ''} onChange={(e) => setValues({ ...values, [d.key]: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && setEditing(null)} />
                  <button type="button" className="k-vital-ok" onClick={() => setEditing(null)} aria-label="Done"><Check /></button>
                </div>
              ) : (
                <div className="k-vital-value" dir="ltr">
                  {reading ? <span className="k-reading"><i /><i /><i /></span> : has ? <>{v}<small>{d.unit}</small></> : unavailable ? <span className="k-na">Not available</span> : <span className="k-dash">—</span>}
                </div>
              )}
              <div className="k-vital-foot">{reading ? `Reading from ${d.device}…` : f ? flagWord(d.key, f) : has ? 'Normal range' : d.device}</div>
            </div>
          );
        })}
      </div>
      {phase === 'done' && <Screenings patientId={flow.patient?.id} onResults={(scr) => setFlow({ screenings: scr })} saved={flow.screenings} />}
      {phase === 'done' && <p className="k-fine">Operator: tap the pencil to correct any reading. Values are shared live with the doctor.</p>}
    </StepFrame>
  );
}

const SCREEN_ICON = { anaemia: Droplet, retinopathy: Activity, tb: HeartPulse, ecg: Activity, oximetry: Activity };
function Screenings({ patientId, onResults, saved }) {
  const [tests, setTests] = useState([]);
  const [results, setResults] = useState(saved || {});
  const [running, setRunning] = useState(null);
  useEffect(() => { api.get('/kiosk/screenings').then(setTests).catch(() => {}); }, []);
  useEffect(() => { onResults(results); /* eslint-disable-next-line */ }, [results]);
  if (!tests.length) return null;
  const run = async (key) => {
    setRunning(key);
    try { const r = await api.post('/kiosk/screening', { key, patientId }); setResults((x) => ({ ...x, [key]: r })); } catch { /* ignore */ } finally { setRunning(null); }
  };
  return (
    <div className="k-screen">
      <div className="k-screen-head"><strong>Optional AI screenings</strong><span className="k-fine">Extra checks this kiosk can run. Results go to the doctor.</span></div>
      <div className="k-screen-grid">
        {tests.map((s) => {
          const r = results[s.key]; const Icon = SCREEN_ICON[s.key] || Activity;
          return (
            <div key={s.key} className={cx('k-screen-card', r && (r.flag === 'attention' ? 'attn' : 'ok'))}>
              <span className="k-screen-ic"><Icon /></span>
              <div className="grow">
                <div className="k-screen-label">{s.label}</div>
                {r ? <div className="k-screen-result">{r.finding}</div> : <div className="k-fine">{s.how}</div>}
              </div>
              {r ? <span className={cx('k-screen-badge', r.flag)}>{r.flag === 'attention' ? 'See doctor' : 'OK'}</span>
                : <KButton variant="ghost" className="k-screen-run" loading={running === s.key} onClick={() => run(s.key)}>Run</KButton>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
