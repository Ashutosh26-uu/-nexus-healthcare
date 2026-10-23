import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Smile, Meh, Frown, Phone, Siren, Check, HeartPulse } from 'lucide-react';
import { api } from '../../api';
import { Button, cx, useToast } from '../../components/ui';
import { usePatientLive } from './shared';
import './recovery.css';

const FEEL = [
  { id: 'better', label: 'Better', icon: Smile },
  { id: 'same', label: 'Same', icon: Meh },
  { id: 'worse', label: 'Worse', icon: Frown },
];
const TOOK = [
  { id: 'all', label: 'Yes, all' },
  { id: 'some', label: 'Some' },
  { id: 'none', label: 'Missed' },
];

// Care Companion on the home screen: while a short course of medicines runs, two taps a day tell the doctor
// how it's going. Worse or a danger sign reaches the doctor at once, and the patient is told what to do now.
export default function RecoveryCheckIn() {
  const { data, reload } = usePatientLive('/patient/recovery', ['recovery', 'prescriptions']);
  const courses = data?.courses || [];
  if (!courses.length) return null;
  return (
    <div className="rc-stack">
      {courses.map((c) => <Course key={c.rxId} c={c} danger={data.dangerSigns || {}} onDone={reload} />)}
    </div>
  );
}

function Dots({ entries, days }) {
  return (
    <span className="rc-dots" aria-label={`${entries.length} of ${days} days checked in`}>
      {Array.from({ length: days }, (_, i) => <i key={i} className={entries[i]?.feel || ''} title={entries[i] ? `Day ${i + 1}: ${entries[i].feel}` : `Day ${i + 1}`} />)}
    </span>
  );
}

function Course({ c, danger, onDone }) {
  const [feel, setFeel] = useState(null);
  const [took, setTook] = useState(null);
  const [flags, setFlags] = useState([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const toast = useToast();
  const what = c.diagnosis ? c.diagnosis : 'your medicines';

  const send = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/patient/recovery/${c.rxId}`, { feel, took, flags, note });
      setResult(r);
      onDone();
    } catch (e) { toast(e.message || 'Could not send — please try again.', 'error'); } finally { setBusy(false); }
  };
  const recovered = async () => {
    try { await api.post(`/patient/recovery/${c.rxId}/recovered`); toast('Glad you’re better! We’ve stopped the daily check-in.'); onDone(); } catch (e) { toast(e.message, 'error'); }
  };

  // What to do now, after sending.
  if (result) {
    const doc = result.doctorName || 'Your doctor';
    if (result.next === 'urgent') {
      return (
        <div className="rc-card rc-urgent" role="alert">
          <strong><Siren size={18} /> Please get help now</strong>
          <p className="small">These signs need a doctor today. {result.alertedDoctor ? `${doc} has been told. ` : ''}If it feels serious, call 108 or go to the nearest hospital.</p>
          <div className="row wrap" style={{ gap: 8 }}>
            <a className="btn" href="tel:108"><Phone size={16} /> Call 108</a>
            <Link className="btn secondary" to="/patient/sos">SOS & nearest hospitals</Link>
          </div>
        </div>
      );
    }
    const msg = {
      'see-doctor': <>{result.alertedDoctor ? <>{doc} has been told you’re not getting better. </> : null}Please see a doctor soon — don’t wait for the course to finish.</>,
      'take-medicines': <>Thanks. Try not to miss doses — the medicine works only if taken on time. We’ll check in again tomorrow.</>,
      'keep-going': <>Good to hear. Keep taking the medicines until the course ends. See you tomorrow.</>,
    }[result.next];
    return (
      <div className={cx('rc-card rc-done', result.next === 'see-doctor' && 'warn')} role="status">
        <p className="small mb-0">{msg}</p>
        {result.next === 'see-doctor' && <Link className="btn sm" to="/patient/consult">Book a doctor</Link>}
      </div>
    );
  }

  if (c.today) {
    return (
      <div className="rc-card rc-done">
        <span className="rc-head small"><Check size={16} className="pt-green" /> Checked in today · day {c.day} of {c.days} · {what}</span>
        <Dots entries={c.entries} days={c.days} />
        <button type="button" className="link-btn tiny" onClick={recovered}>I’ve fully recovered — stop asking</button>
      </div>
    );
  }

  return (
    <section className="rc-card" aria-label="Daily recovery check-in">
      <div className="rc-head">
        <span className="pt-ic-tile green"><HeartPulse size={18} /></span>
        <span className="grow">
          <strong className="block">How are you feeling today?</strong>
          <span className="tiny muted">Day {c.day} of {c.days} · {what} · from <span translate="no">{c.doctorName}</span></span>
        </span>
        <Dots entries={c.entries} days={c.days} />
      </div>

      <div className="rc-feel" role="radiogroup" aria-label="How are you feeling">
        {FEEL.map((f) => (
          <button key={f.id} type="button" role="radio" aria-checked={feel === f.id} className={cx('rc-feel-btn', f.id, feel === f.id && 'on')} onClick={() => setFeel(f.id)}>
            <f.icon size={26} /><span>{f.label}</span>
          </button>
        ))}
      </div>

      {feel && (
        <div className="rc-q fade-in">
          <span className="small strong">Did you take today’s medicines?</span>
          <div className="rc-pills" role="radiogroup" aria-label="Medicines taken today">
            {TOOK.map((t) => <button key={t.id} type="button" role="radio" aria-checked={took === t.id} className={cx(took === t.id && 'on')} onClick={() => setTook(t.id)}>{t.label}</button>)}
          </div>
        </div>
      )}

      {feel === 'worse' && (
        <div className="rc-q fade-in">
          <span className="small strong">Any of these? Tap all that apply.</span>
          <div className="rc-pills danger">
            {Object.entries(danger).map(([id, label]) => (
              <button key={id} type="button" aria-pressed={flags.includes(id)} className={cx(flags.includes(id) && 'on')} onClick={() => setFlags((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]))}>{label}</button>
            ))}
          </div>
          <input className="input" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything else for the doctor? (optional)" />
        </div>
      )}

      {feel && (
        <Button block loading={busy} onClick={send}>{feel === 'worse' ? 'Tell the doctor' : 'Send'}</Button>
      )}
    </section>
  );
}
