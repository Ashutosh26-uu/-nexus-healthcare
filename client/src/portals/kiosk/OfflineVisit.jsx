import { useState } from 'react';
import { Phone, Save, X, WifiOff, CheckCircle2 } from 'lucide-react';
import { cx } from '../../components/ui';
import { KButton, KError } from './KUi';
import { addToOutbox, dangerFrom } from './offline';
import { useAuth } from '../../auth';

const SIGNS = ['Chest pain', 'Trouble breathing', 'Unconscious or fainting', 'Fits / seizure', 'Heavy bleeding', 'Weakness on one side of the body', 'Poisoning or snake bite'];
const VITALS = [
  { k: 'bp', label: 'BP', ph: '120/80', mode: 'text' },
  { k: 'pulse', label: 'Pulse /min', ph: '72' },
  { k: 'spo2', label: 'SpO₂ %', ph: '98' },
  { k: 'temp', label: 'Temp °F', ph: '98.6' },
  { k: 'weight', label: 'Weight kg', ph: '60' },
  { k: 'sugar', label: 'Sugar mg/dL', ph: '110' },
];

// Record a visit with no internet. It waits on this kiosk and is sent the moment the connection is back;
// the operator then finishes the visit with everything pre-filled. Danger signs are checked right here.
export default function OfflineVisit({ onClose }) {
  const { user } = useAuth();
  const [f, setF] = useState({ name: '', age: '', gender: '', phone: '', symptoms: '' });
  const [vitals, setVitals] = useState({});
  const [signs, setSigns] = useState([]);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(null);
  const danger = dangerFrom({ vitals, signs });

  const save = (e) => {
    e.preventDefault();
    if (f.name.trim().length < 2) { setErr('Please enter the patient’s name.'); return; }
    if (!f.age && !f.phone) { setErr('Please enter the age, or a mobile number.'); return; }
    const clean = Object.fromEntries(Object.entries(vitals).filter(([, v]) => String(v).trim()));
    setSaved(addToOutbox({ patient: { ...f, name: f.name.trim() }, vitals: clean, symptoms: f.symptoms.trim(), danger }, user?.facilityId));
  };

  return (
    <div className="k-ov-scrim" role="dialog" aria-modal="true" aria-label="Record a visit offline">
      <div className="k-ov">
        <div className="k-ov-head">
          <span className="k-ov-pill"><WifiOff size={16} /> No internet</span>
          <h2>Record this visit offline</h2>
          <button type="button" className="k-topbtn icon" onClick={onClose} aria-label="Close"><X /></button>
        </div>

        {danger.length > 0 && (
          <div className="k-ov-danger" role="alert">
            <strong>Call 108 now — this may be an emergency.</strong>
            <span>{danger.join(' · ')}</span>
            <a className="k-btn danger" href="tel:108"><Phone size={18} /> Call 108</a>
          </div>
        )}

        {saved ? (
          <div className="k-ov-saved">
            <CheckCircle2 size={40} />
            <h3>Saved on this kiosk</h3>
            <p>It will be sent to Sehatra automatically when the internet is back. Then finish the visit from <strong>Operator → Offline visits</strong> — everything you entered will be filled in.</p>
            <div className="k-confirm-actions">
              <KButton variant="ghost" onClick={() => { setSaved(null); setF({ name: '', age: '', gender: '', phone: '', symptoms: '' }); setVitals({}); setSigns([]); }}>Record another</KButton>
              <KButton onClick={onClose}>Done</KButton>
            </div>
          </div>
        ) : (
          <form onSubmit={save} className="k-ov-form">
            <KError>{err}</KError>
            <div className="k-reg-grid">
              <label className="k-field span2"><span>Full name</span><input className="k-input notranslate" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></label>
              <label className="k-field"><span>Age</span><input className="k-input" inputMode="numeric" value={f.age} onChange={(e) => setF({ ...f, age: e.target.value.replace(/\D/g, '').slice(0, 3) })} /></label>
              <label className="k-field"><span>Mobile number</span><input className="k-input" dir="ltr" inputMode="numeric" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} placeholder="10 digits" /></label>
              <div className="k-field span2">
                <span>Gender</span>
                <div className="k-seg">{['Female', 'Male', 'Other'].map((g) => <button key={g} type="button" className={cx(f.gender === g && 'on')} onClick={() => setF({ ...f, gender: g })}>{g}</button>)}</div>
              </div>
              <label className="k-field span2"><span>What’s the problem?</span><textarea className="k-input k-ov-text" rows={3} value={f.symptoms} onChange={(e) => setF({ ...f, symptoms: e.target.value })} placeholder="e.g. Bukhar 3 din se, sir dard" /></label>
            </div>

            <span className="k-field-l">Vitals (whatever you could measure)</span>
            <div className="k-ov-vitals">
              {VITALS.map((v) => (
                <label key={v.k} className="k-field"><span>{v.label}</span>
                  <input className="k-input" inputMode={v.mode === 'text' ? 'text' : 'decimal'} placeholder={v.ph} value={vitals[v.k] || ''} onChange={(e) => setVitals({ ...vitals, [v.k]: e.target.value.slice(0, 9) })} />
                </label>
              ))}
            </div>

            <span className="k-field-l">Any of these right now?</span>
            <div className="k-ov-signs">
              {SIGNS.map((s) => <button key={s} type="button" className={cx(signs.includes(s) && 'on')} aria-pressed={signs.includes(s)} onClick={() => setSigns((v) => (v.includes(s) ? v.filter((x) => x !== s) : [...v, s]))}>{s}</button>)}
            </div>

            <div className="k-confirm-actions">
              <KButton type="button" variant="ghost" onClick={onClose}>Cancel</KButton>
              <KButton type="submit" icon={Save} className="xl">Save visit</KButton>
            </div>
            <p className="k-fine">Saved only on this kiosk until it reaches Sehatra, then deleted from here. Unsent visits are removed after 72 hours.</p>
          </form>
        )}
      </div>
    </div>
  );
}
