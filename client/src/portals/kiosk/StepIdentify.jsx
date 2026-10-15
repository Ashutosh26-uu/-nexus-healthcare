import { useEffect, useRef, useState } from 'react';
import { QrCode, Smartphone, Fingerprint, Delete, Search, ArrowRight, UserPlus, Check, RotateCcw, AlertTriangle, Droplet, CreditCard } from 'lucide-react';
import { api } from '../../api';
import { Avatar, cx } from '../../components/ui';
import { useKiosk } from './context';
import { langOf, LANGS } from './i18n';
import { KButton, KError, StepFrame } from './KUi';

const BLOOD = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-', 'Unknown'];

function Keypad({ value, onChange, max = 10 }) {
  const press = (k) => {
    if (k === 'del') onChange(value.slice(0, -1));
    else if (k === 'clr') onChange('');
    else if (value.length < max) onChange(value + k);
  };
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clr', '0', 'del'];
  return (
    <div className="k-keypad" dir="ltr">
      {keys.map((k) => (
        <button key={k} type="button" className={cx('k-key', (k === 'clr' || k === 'del') && 'fn')} onClick={() => press(k)} aria-label={k === 'del' ? 'Delete' : k === 'clr' ? 'Clear' : k}>
          {k === 'del' ? <Delete /> : k === 'clr' ? 'Clear' : k}
        </button>
      ))}
    </div>
  );
}

const fmtPhone = (v) => (v.length > 5 ? `${v.slice(0, 5)} ${v.slice(5)}` : v);

function PatientConfirm({ p, onYes, onNo, t, fresh }) {
  return (
    <div className="k-confirm fade-in">
      {fresh && <div className="k-fresh"><Check />{t('reg_done')}</div>}
      <div className="k-pcard">
        <div className="k-pcard-top">
          <Avatar name={p.name} size="lg" />
          <div>
            <div className="k-pcard-name" translate="no">{p.name}</div>
            <div className="k-pcard-meta">{p.age} years · {p.gender} · speaks {p.language}</div>
          </div>
        </div>
        <div className="k-pcard-id"><CreditCard /><span>Health Passport</span><strong dir="ltr" translate="no">{p.id}</strong></div>
        <div className="k-pcard-grid">
          <div><small>Blood group</small><strong><Droplet size={16} /> {p.bloodGroup || 'Unknown'}</strong></div>
          <div><small>Allergies</small>{p.allergies?.length ? <strong className="k-allergy"><AlertTriangle size={16} /> <span translate="no">{p.allergies.join(', ')}</span></strong> : <strong>None known</strong>}</div>
          <div><small>Conditions</small><strong>{p.conditions?.length ? <span translate="no">{p.conditions.join(', ')}</span> : 'None recorded'}</strong></div>
        </div>
      </div>
      <div className="k-confirm-actions">
        <KButton variant="ghost" icon={RotateCcw} onClick={onNo}>{t('not_me')}</KButton>
        <KButton icon={Check} className="xl" onClick={onYes}>{t('yes_me')}</KButton>
      </div>
    </div>
  );
}

function RegisterForm({ initialPhone, onDone, onCancel, t, lang }) {
  const [f, setF] = useState({ name: '', dob: '', age: '', gender: '', phone: initialPhone || '', language: langOf(lang).name, bloodGroup: 'Unknown', allergies: '', conditions: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target ? e.target.value : e });

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    let dob = f.dob;
    if (!dob && f.age) dob = `${new Date().getFullYear() - Number(f.age)}-07-01`; // approximate when only age is known
    if (!f.name.trim() || !dob) { setErr('Please enter the name and either date of birth or age.'); return; }
    if (!f.gender) { setErr('Please choose Female, Male or Other.'); return; }
    setBusy(true);
    try {
      const p = await api.post('/kiosk/register', { ...f, dob });
      onDone(p);
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };

  return (
    <form className="k-reg fade-in" onSubmit={submit}>
      <div className="k-reg-head">
        <h2>{t('reg_title')}</h2>
        <p className="k-sub">{t('reg_sub')}</p>
      </div>
      <KError>{err}</KError>
      <div className="k-reg-grid">
        <label className="k-field span2"><span>Full name</span><input className="k-input notranslate" value={f.name} onChange={set('name')} placeholder="e.g. Rajkumari Devi" autoFocus /></label>
        <label className="k-field"><span>Date of birth</span><input className="k-input" type="date" value={f.dob} max={new Date().toISOString().slice(0, 10)} onChange={set('dob')} /></label>
        <label className="k-field"><span>…or age in years</span><input className="k-input" inputMode="numeric" value={f.age} onChange={(e) => setF({ ...f, age: e.target.value.replace(/\D/g, '').slice(0, 3) })} placeholder="e.g. 42" /></label>
        <div className="k-field span2">
          <span>Gender</span>
          <div className="k-seg">
            {['Female', 'Male', 'Other'].map((g) => <button key={g} type="button" className={cx(f.gender === g && 'on')} onClick={() => setF({ ...f, gender: g })}>{g}</button>)}
          </div>
        </div>
        <label className="k-field"><span>Mobile number</span><input className="k-input" dir="ltr" inputMode="numeric" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} placeholder="10 digits" /></label>
        <label className="k-field"><span>Language</span>
          <select className="k-input" value={f.language} onChange={set('language')}>
            {LANGS.map((l) => <option key={l.code} value={l.name}>{l.name} · {l.native}</option>)}
            <option value="Awadhi">Awadhi</option>
          </select>
        </label>
        <div className="k-field span2">
          <span>Blood group</span>
          <div className="k-seg wrap">
            {BLOOD.map((b) => <button key={b} type="button" className={cx(f.bloodGroup === b && 'on')} onClick={() => setF({ ...f, bloodGroup: b })}>{b === 'Unknown' ? 'Don\'t know' : b}</button>)}
          </div>
        </div>
        <label className="k-field"><span>Allergies (if any)</span><input className="k-input" value={f.allergies} onChange={set('allergies')} placeholder="e.g. Penicillin, Sulfa" /></label>
        <label className="k-field"><span>Long-term illness</span><input className="k-input" value={f.conditions} onChange={set('conditions')} placeholder="e.g. Sugar, BP, Asthma" /></label>
      </div>
      <div className="k-confirm-actions">
        <KButton type="button" variant="ghost" onClick={onCancel}>Cancel</KButton>
        <KButton type="submit" icon={UserPlus} loading={busy} className="xl">Create Health Passport</KButton>
      </div>
      <p className="k-fine">By registering, the patient agrees to store their health record on Nexus Healthcare under the DPDP Act, 2023. Only doctors they consult — or emergency staff, with a logged reason — can see it.</p>
    </form>
  );
}

export default function StepIdentify() {
  const { t, say, goto, setFlow, lang, flow } = useKiosk();
  const [tab, setTab] = useState('qr');
  const [qr, setQr] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [found, setFound] = useState(flow.patient);
  const [notFound, setNotFound] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [fresh, setFresh] = useState(false);
  const [scanState, setScanState] = useState('idle'); // finger: idle | scanning | done
  const timer = useRef(null);

  useEffect(() => { say('identify_sub'); return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { setErr(''); setNotFound(false); }, [tab]);

  const identify = async (query, dialCode) => {
    if (!query) return;
    setBusy(true); setErr(''); setNotFound(false);
    try {
      const p = await api.post('/kiosk/identify', dialCode ? { query, dialCode } : { query });
      setFound(p);
      say('is_this_you');
    } catch (e) {
      if (e.status === 404) { setNotFound(true); say('not_found'); } else setErr(e.message);
    } finally { setBusy(false); setScanState('idle'); }
  };

  // Simulated camera: "reads" the card a moment after the operator holds it up.
  const simulateScan = (id) => {
    setQr('');
    setBusy(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setQr(id); identify(id); }, 1500);
  };

  // Simulated biometric reader. The POC has no biometric store, so a match resolves to the demo patient's enrolled mobile.
  const scanThumb = () => {
    setScanState('scanning');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => identify('9876500002', '+91'), 2200);
  };

  const accept = () => { setFlow({ patient: found, step: 2 }); };
  const again = () => { setFound(null); setFresh(false); setQr(''); setPhone(''); setFlow({ patient: null }); };

  if (registering) {
    return (
      <StepFrame title={t('identify_title')} onBack={() => setRegistering(false)} wide>
        <RegisterForm
          t={t}
          lang={lang}
          initialPhone={tab === 'mobile' ? phone : ''}
          onCancel={() => setRegistering(false)}
          onDone={(p) => { setRegistering(false); setFound(p); setFresh(true); setNotFound(false); say('reg_done'); }}
        />
      </StepFrame>
    );
  }

  if (found) {
    return (
      <StepFrame title={t('is_this_you')} onBack={() => goto(0)}>
        <PatientConfirm p={found} t={t} fresh={fresh} onYes={accept} onNo={again} />
      </StepFrame>
    );
  }

  const tabs = [
    { v: 'qr', icon: QrCode, label: t('tab_qr') },
    { v: 'mobile', icon: Smartphone, label: t('tab_mobile') },
    { v: 'finger', icon: Fingerprint, label: t('tab_finger') },
  ];

  return (
    <StepFrame title={t('identify_title')} sub={t('identify_sub')} onBack={() => goto(0)}>
      <div className="k-tabs" role="tablist">
        {tabs.map((x) => (
          <button key={x.v} role="tab" aria-selected={tab === x.v} className={cx('k-tab', tab === x.v && 'on')} onClick={() => setTab(x.v)}>
            <x.icon /><span>{x.label}</span>
          </button>
        ))}
      </div>

      <div className="k-idbody">
        {tab === 'qr' && (
          <div className="k-qr fade-in">
            <div className={cx('k-cam', busy && 'busy')}>
              <span className="k-cam-c tl" /><span className="k-cam-c tr" /><span className="k-cam-c bl" /><span className="k-cam-c br" />
              <span className="k-scanline" />
              <QrCode className="k-cam-ghost" />
              <span className="k-cam-label">{busy ? t('searching') : t('qr_hint')}</span>
            </div>
            <div className="k-qr-side">
              <label className="k-field"><span>{t('qr_type')}</span>
                <input className="k-input big mono" dir="ltr" value={qr} onChange={(e) => setQr(e.target.value.toUpperCase())} placeholder="OC-2041-5521" onKeyDown={(e) => e.key === 'Enter' && identify(qr.trim())} />
              </label>
              <KButton icon={Search} loading={busy} disabled={!qr.trim()} onClick={() => identify(qr.trim())}>{t('find')}</KButton>
              <div className="k-demo">
                <span>Demo cards</span>
                <button type="button" translate="no" onClick={() => simulateScan('OC-2041-5521')}>Ramesh Yadav</button>
                <button type="button" translate="no" onClick={() => simulateScan('OC-2041-7783')}>Sunita Devi</button>
              </div>
            </div>
          </div>
        )}

        {tab === 'mobile' && (
          <div className="k-mobile fade-in">
            <div className="k-mobile-left">
              <span className="k-field-l">{t('mobile_hint')}</span>
              <div className={cx('k-phone', phone.length === 10 && 'full')} dir="ltr">
                <span className="k-phone-cc">+91</span>
                <span className="k-phone-num">{fmtPhone(phone) || <em>98765 00002</em>}</span>
              </div>
              <KButton icon={Search} className="xl" loading={busy} disabled={phone.length !== 10} onClick={() => identify(phone, '+91')}>{t('find')}</KButton>
              <p className="k-fine">We'll only use this number to find the passport. No OTP is needed when the ASHA operator is present.</p>
            </div>
            <Keypad value={phone} onChange={setPhone} />
          </div>
        )}

        {tab === 'finger' && (
          <div className="k-finger fade-in">
            <button type="button" className={cx('k-thumb', scanState)} onClick={scanThumb} disabled={scanState === 'scanning'} aria-label="Scan thumb">
              <Fingerprint />
              <span className="k-thumb-ring" />
            </button>
            <p className="k-sub center">{scanState === 'scanning' ? t('searching') : t('finger_hint')}</p>
            <KButton icon={Fingerprint} loading={scanState === 'scanning'} onClick={scanThumb}>Scan thumb</KButton>
            <p className="k-fine center">Demo reader — matches the thumb enrolled for Ramesh Yadav.</p>
          </div>
        )}

        <KError>{err}</KError>
        {notFound && (
          <div className="k-notfound fade-in">
            <div>
              <strong>{t('not_found')}</strong>
            </div>
            <KButton icon={UserPlus} variant="clay" onClick={() => setRegistering(true)}>{t('register')}</KButton>
          </div>
        )}
      </div>

      {!notFound && (
        <div className="k-alt">
          {t('new_here')} <button type="button" onClick={() => setRegistering(true)}>{t('register')} <ArrowRight size={16} /></button>
        </div>
      )}
    </StepFrame>
  );
}
