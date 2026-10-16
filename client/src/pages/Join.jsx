import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import {
  ArrowLeft, ArrowRight, Building2, Stethoscope, Check, ShieldCheck, Search, MonitorSmartphone, Store, Truck,
  CalendarClock, Users, BedDouble, FileCheck2, Sparkles, Copy, CircleCheck, XCircle, Hourglass,
} from 'lucide-react';
import Logo from '../components/Logo';
import LanguagePicker from '../components/LanguagePicker';
import { api } from '../api';
import { COUNTRIES, guessCountry } from '../i18n/countries';
import { Button, Field, cx } from '../components/ui';
import './auth.css';
import './join.css';

const DEPARTMENTS = ['General Medicine', 'Pediatrics', 'Obstetrics', 'Orthopedics', 'Emergency', 'Cardiology', 'Surgery', 'ENT', 'Ophthalmology', 'Dental'];
const SERVICES = {
  hospital: ['24×7 emergency', 'Ambulance', 'ICU', 'Operation theatre', 'X-Ray', 'CT scan', 'Dialysis', 'Blood bank', 'Cashless insurance'],
  clinic: ['OPD consults', 'Minor procedures', 'Day care', 'Vaccination', 'Maternity', 'Physiotherapy', 'Cashless insurance'],
  lab: ['Home sample collection', 'Blood tests', 'X-Ray', 'Ultrasound', 'ECG', 'NABL accredited', 'Reports in 24 h'],
  pharmacy: ['Home delivery', 'Generic medicines', 'Jan Aushadhi', 'Open 24 hours', 'Cold chain (insulin, vaccines)'],
};
const toggleIn = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

function Chips({ options, value, onChange }) {
  return (
    <div className="chip-select">
      {options.map((o) => <button type="button" key={o} className={cx('chip', value.includes(o) && 'on')} onClick={() => onChange(toggleIn(value, o))}>{o}</button>)}
    </div>
  );
}

function Steps({ steps, step }) {
  return (
    <>
      <div className="steps mb-2">{steps.map((s, i) => <span key={s} className={cx(i <= step && 'done')} />)}</div>
      <span className="eyebrow">Step {step + 1} of {steps.length} · {steps[step]}</span>
    </>
  );
}

function AccountFields({ form, set, nameLabel = 'Your full name', namePlaceholder }) {
  return (
    <>
      <Field label={nameLabel}><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder={namePlaceholder} /></Field>
      <div className="grid two">
        <Field label="Email" hint="You'll sign in with this."><input className="input" type="email" dir="ltr" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="you@example.com" /></Field>
        <Field label="Mobile number"><input className="input" type="tel" dir="ltr" value={form.phone} onChange={(e) => set('phone', e.target.value.replace(/[^\d+\s-]/g, '').slice(0, 18))} placeholder="+91 98765 43210" /></Field>
      </div>
      <Field label="Create a password" hint="At least 8 characters. Your account unlocks once we verify you."><input className="input" type="password" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="••••••••" autoComplete="new-password" /></Field>
    </>
  );
}

function Nav({ step, last, onBack, onNext, onSubmit, busy, submitLabel }) {
  return (
    <div className="row between mt-3">
      {step > 0 ? <Button variant="ghost" onClick={onBack}><ArrowLeft /> Back</Button> : <Link to="/join" className="btn ghost"><ArrowLeft /> Change</Link>}
      {step < last ? <Button onClick={onNext}>Continue <ArrowRight /></Button> : <Button size="lg" variant="clay" loading={busy} onClick={onSubmit}><Sparkles /> {submitLabel}</Button>}
    </div>
  );
}

/* ---------------- track 1: list your clinic / hospital ---------------- */
const FAC_STEPS = ['Your facility', 'Location & services', 'Your account', 'Review'];

function FacilityForm({ options, onDone }) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    kind: 'clinic', facilityName: '', licenceNo: '', beds: '', hours: '', departments: [], services: [],
    address: '', pincode: '', district: '', state: '', name: '', email: '', phone: '', password: '',
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const kinds = options?.facilityKinds || [];
  const hasBeds = form.kind === 'hospital' || form.kind === 'clinic';

  const validate = () => {
    if (step === 0) {
      if (form.facilityName.trim().length < 3) return 'Please enter the facility name.';
      if (form.licenceNo.trim().length < 4) return 'Please enter the registration / licence number.';
    }
    if (step === 1 && (!form.district.trim() || !form.state.trim())) return 'Please add the district and state.';
    if (step === 2) {
      if (form.name.trim().length < 3) return 'Please enter the owner / administrator name.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) return 'Please enter a valid email address.';
      if (!/^\+?[\d\s-]{7,18}$/.test(form.phone)) return 'Please enter a valid mobile number.';
      if (form.password.length < 8) return 'Choose a password of at least 8 characters.';
    }
    return '';
  };
  const next = () => { const v = validate(); setError(v); if (!v) setStep((s) => s + 1); };
  const submit = async () => {
    setBusy(true); setError('');
    try { onDone(await api.post('/public/join/facility', { ...form, ownerName: form.name })); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="auth-card wide fade-in" key={step}>
      <Steps steps={FAC_STEPS} step={step} />
      {step === 0 && (
        <div className="stack">
          <h1 className="auth-title">Tell us about your facility</h1>
          <p className="muted mb-0">Independent hospitals, clinics, nursing homes, labs and pharmacies can all join. You stay independent — we send you patients, referrals and prescriptions.</p>
          <Field label="What do you run?">
            <div className="j-kinds">
              {kinds.map((k) => (
                <button type="button" key={k.value} className={cx('j-kind', form.kind === k.value && 'on')} onClick={() => set('kind', k.value)}>
                  {k.value === 'pharmacy' ? '💊' : k.value === 'lab' ? '🔬' : k.value === 'hospital' ? '🏥' : '🩺'} <span>{k.label}</span>
                </button>
              ))}
            </div>
          </Field>
          <Field label="Facility name"><input className="input" value={form.facilityName} onChange={(e) => set('facilityName', e.target.value)} placeholder={form.kind === 'pharmacy' ? 'e.g. Shree Ram Medicos' : 'e.g. Sai Care Clinic'} autoFocus /></Field>
          <div className="grid two">
            <Field label={form.kind === 'pharmacy' ? 'Drug licence number' : form.kind === 'lab' ? 'Lab registration / NABL no.' : 'Clinical establishment reg. no.'}><input className="input" dir="ltr" value={form.licenceNo} onChange={(e) => set('licenceNo', e.target.value)} placeholder="e.g. UP/CE/2024/1182" /></Field>
            {hasBeds
              ? <Field label="Number of beds" hint="0 if OPD only"><input className="input" inputMode="numeric" value={form.beds} onChange={(e) => set('beds', e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="e.g. 20" /></Field>
              : <Field label="Opening hours"><input className="input" value={form.hours} onChange={(e) => set('hours', e.target.value)} placeholder="e.g. 9:00 – 21:00" /></Field>}
          </div>
          {hasBeds && <Field label="Departments"><Chips options={DEPARTMENTS} value={form.departments} onChange={(v) => set('departments', v)} /></Field>}
        </div>
      )}
      {step === 1 && (
        <div className="stack">
          <h1 className="auth-title">Where are you, and what do you offer?</h1>
          <p className="muted mb-0">Patients and doctors nearby will find you by this. Services help our AI route the right patients to you.</p>
          <Field label="Address"><input className="input" value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Building, street, area" /></Field>
          <div className="grid three">
            <Field label="Pin code"><input className="input" value={form.pincode} onChange={(e) => set('pincode', e.target.value.slice(0, 12))} placeholder="225001" /></Field>
            <Field label="District / city"><input className="input" value={form.district} onChange={(e) => set('district', e.target.value)} /></Field>
            <Field label="State"><input className="input" value={form.state} onChange={(e) => set('state', e.target.value)} /></Field>
          </div>
          <Field label="Services you offer"><Chips options={SERVICES[form.kind] || []} value={form.services} onChange={(v) => set('services', v)} /></Field>
        </div>
      )}
      {step === 2 && (
        <div className="stack">
          <h1 className="auth-title">Who manages it?</h1>
          <p className="muted mb-0">This person gets the {form.kind === 'pharmacy' ? 'pharmacy' : form.kind === 'lab' ? 'lab' : 'hospital'} dashboard once the facility is verified.</p>
          <AccountFields form={form} set={set} nameLabel="Owner / administrator name" namePlaceholder="e.g. Dr. Rakesh Verma" />
        </div>
      )}
      {step === 3 && (
        <div className="stack">
          <h1 className="auth-title">Does this look right?</h1>
          <dl className="kv review">
            <dt>Facility</dt><dd>{form.facilityName} · {kinds.find((k) => k.value === form.kind)?.label}</dd>
            <dt>Licence</dt><dd>{form.licenceNo}</dd>
            {hasBeds && <><dt>Beds</dt><dd>{form.beds || 'OPD only'}</dd></>}
            {form.departments.length > 0 && <><dt>Departments</dt><dd>{form.departments.join(', ')}</dd></>}
            <dt>Location</dt><dd>{[form.address, form.pincode, form.district, form.state].filter(Boolean).join(', ')}</dd>
            <dt>Services</dt><dd>{form.services.join(', ') || '—'}</dd>
            <dt>Manager</dt><dd>{form.name} · <span dir="ltr">{form.email}</span> · <span dir="ltr">{form.phone}</span></dd>
          </dl>
          <div className="callout green"><ShieldCheck /><span>Our team checks your licence before you go live — usually within 48 hours. No fees to list.</span></div>
        </div>
      )}
      {error && <div className="form-error mt-2">{error}</div>}
      <Nav step={step} last={FAC_STEPS.length - 1} busy={busy} submitLabel="Submit application" onBack={() => { setStep((s) => s - 1); setError(''); }} onNext={next} onSubmit={submit} />
    </div>
  );
}

/* ---------------- track 2: doctors — quick account, finish the profile in the portal ---------------- */
function CountrySelect({ value, onChange }) {
  return (
    <Field label="Country">
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        {COUNTRIES.map((c) => <option key={c.iso} value={c.iso}>{c.flag} {c.name}</option>)}
      </select>
    </Field>
  );
}

function DoctorSignup() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', country: guessCountry().iso, ownClinic: false, clinicName: '' });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    if (form.name.trim().length < 3) return setError('Please enter your full name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) return setError('Please enter a valid email address.');
    if (!/^\+?[\d\s-]{7,18}$/.test(form.phone)) return setError('Please enter a valid mobile number.');
    if (form.password.length < 8) return setError('Choose a password of at least 8 characters.');
    if (form.ownClinic && form.clinicName.trim().length < 3) return setError('Please enter the name of your clinic.');
    setBusy(true); setError('');
    try {
      const r = await api.post('/public/join/doctor', { ...form, clinicName: form.ownClinic ? form.clinicName : '' });
      await signIn(r.token);
      navigate('/doctor', { replace: true });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <form className="auth-card fade-in" onSubmit={submit}>
      <span className="eyebrow">For doctors</span>
      <h1 className="auth-title">Create your doctor account</h1>
      <p className="muted">Just your name, email and mobile to start. You&apos;ll complete your profile inside the portal — it takes about 3 minutes.</p>
      <div className="stack">
        <AccountFields form={form} set={set} namePlaceholder="e.g. Dr. Priya Sharma" />
        <CountrySelect value={form.country} onChange={(v) => set('country', v)} />
        <label className="check small"><input type="checkbox" checked={form.ownClinic} onChange={(e) => set('ownClinic', e.target.checked)} /> I run my own clinic and want to add it to Nexus</label>
        {form.ownClinic && <Field label="Clinic name" hint="You'll add its address and list every doctor who practises there from your portal."><input className="input" value={form.clinicName} onChange={(e) => set('clinicName', e.target.value)} placeholder="e.g. Sharma Child Care Clinic" /></Field>}
      </div>
      {error && <div className="form-error mt-2">{error}</div>}
      <Button type="submit" size="lg" variant="clay" block loading={busy} className="mt-3"><Sparkles /> Create my account</Button>
      <p className="tiny muted center mt-2 mb-0">By continuing you agree to be verified against the medical council registry before seeing patients.</p>
      <div className="center mt-2"><Link to="/join" className="small muted"><ArrowLeft size={14} style={{ verticalAlign: '-2px' }} /> Back</Link></div>
    </form>
  );
}

/* ---------------- track 3: medical stores — quick account, finish the store profile in the portal ---------------- */
function PharmacySignup() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ storeName: '', name: '', email: '', phone: '', password: '', country: guessCountry().iso });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    if (form.storeName.trim().length < 3) return setError('Please enter the name of your medical store.');
    if (form.name.trim().length < 3) return setError('Please enter your full name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) return setError('Please enter a valid email address.');
    if (!/^\+?[\d\s-]{7,18}$/.test(form.phone)) return setError('Please enter a valid mobile number.');
    if (form.password.length < 8) return setError('Choose a password of at least 8 characters.');
    setBusy(true); setError('');
    try {
      const r = await api.post('/public/join/pharmacy', form);
      await signIn(r.token);
      navigate('/pharmacy', { replace: true });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <form className="auth-card fade-in" onSubmit={submit}>
      <span className="eyebrow">For medical stores &amp; pharmacists</span>
      <h1 className="auth-title">Put your medical store on Nexus</h1>
      <p className="muted">Patients within 50 km send you medicine orders. Start with the basics — add your location, store photo and licence inside the portal.</p>
      <div className="stack">
        <Field label="Medical store name"><input className="input" value={form.storeName} onChange={(e) => set('storeName', e.target.value)} placeholder="e.g. Shree Ram Medicos" autoFocus /></Field>
        <AccountFields form={form} set={set} nameLabel="Your name (pharmacist / owner)" namePlaceholder="e.g. Ravi Kumar" />
        <CountrySelect value={form.country} onChange={(v) => set('country', v)} />
      </div>
      {error && <div className="form-error mt-2">{error}</div>}
      <Button type="submit" size="lg" variant="clay" block loading={busy} className="mt-3"><Sparkles /> Create my store account</Button>
      <p className="tiny muted center mt-2 mb-0">Orders unlock once we verify your drug licence — usually within 48 hours.</p>
      <div className="center mt-2"><Link to="/join" className="small muted"><ArrowLeft size={14} style={{ verticalAlign: '-2px' }} /> Back</Link></div>
    </form>
  );
}

/* ---------------- status + success ---------------- */
const STATUS = {
  in_review: { icon: Hourglass, label: 'In review', c: 'var(--sun)', text: 'Our team is checking your details. You\'ll get an email as soon as it\'s done.' },
  approved: { icon: CircleCheck, label: 'Approved', c: 'var(--green-2)', text: 'You\'re verified. Sign in with the email and password you chose.' },
  rejected: { icon: XCircle, label: 'Needs changes', c: 'var(--rose)', text: 'We couldn\'t verify the application.' },
};

function StatusCheck({ initialRef = '' }) {
  const [ref, setRef] = useState(initialRef);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const check = async (e) => {
    e?.preventDefault();
    if (!ref.trim()) return;
    setBusy(true); setError(''); setRes(null);
    try { setRes(await api.get(`/public/join/status/${encodeURIComponent(ref.trim())}`)); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  // Look up a reference arriving in the URL once, on mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (initialRef) check(); }, []);
  const s = res && STATUS[res.status];
  return (
    <div className="j-status">
      <form className="row" style={{ gap: 8 }} onSubmit={check}>
        <input className="input grow mono" dir="ltr" value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} placeholder="OC-XXXXXXXXXX" aria-label="Application reference" />
        <Button type="submit" variant="secondary" icon={Search} loading={busy}>Check</Button>
      </form>
      {error && <div className="form-error mt-1">{error}</div>}
      {s && (
        <div className="j-status-res" style={{ borderColor: s.c }}>
          <s.icon style={{ color: s.c }} />
          <div>
            <strong translate="no">{res.name}</strong> — <span style={{ color: s.c, fontWeight: 700 }}>{s.label}</span>
            <div className="small muted">{s.text}{res.note ? ` Reason: ${res.note}` : ''}</div>
            {res.status === 'approved' && <Link to="/login" className="small">Sign in →</Link>}
          </div>
        </div>
      )}
    </div>
  );
}

function Success({ result }) {
  const [copied, setCopied] = useState(false);
  const isDoc = result.kind === 'doctor';
  const steps = isDoc
    ? ['Application received', 'Registration checked with the medical council', 'Short video call with our clinical team', 'Account activated — go online and start earning']
    : ['Application received', 'Licence and details verified', 'Your dashboard is unlocked', 'You\'re live — patients and referrals start flowing'];
  return (
    <div className="auth single">
      <div className="auth-card wide fade-in center">
        <div className="success-burst"><Check /></div>
        <h1 className="auth-title">Application received{isDoc ? `, ${result.name.replace(/^Dr\.?\s*/i, 'Dr. ').split(' ').slice(0, 2).join(' ')}` : ''}!</h1>
        <p className="muted">{isDoc ? 'Thank you for wanting to serve patients at our E-Clinics.' : `Thank you for listing ${result.name} on Nexus Healthcare.`} We usually finish verification within 48 hours.</p>
        <div className="j-ref">
          <span className="tiny muted">Your application reference</span>
          <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
            <span className="mono j-ref-code" translate="no">{result.ref}</span>
            <button type="button" className="icon-btn" aria-label="Copy reference" onClick={() => { navigator.clipboard?.writeText(result.ref).then(() => setCopied(true)).catch(() => {}); }}>{copied ? <Check /> : <Copy />}</button>
          </div>
          <span className="tiny muted">Save it — you can track your application with it anytime.</span>
        </div>
        <ol className="j-timeline">
          {steps.map((s, i) => <li key={s} className={cx(i === 0 && 'done')}><span>{i === 0 ? <Check size={14} /> : i + 1}</span>{s}</li>)}
        </ol>
        <div className="row wrap" style={{ gap: 10, justifyContent: 'center' }}>
          <Link to={`/join?ref=${result.ref}`} className="btn secondary">Track my application</Link>
          <Link to="/" className="btn ghost">Back to home</Link>
        </div>
      </div>
    </div>
  );
}

function Side({ track }) {
  if (track === 'doctor') {
    return (
      <aside className="auth-side">
        <div className="auth-side-inner">
          <Stethoscope size={34} color="#f3b89f" />
          <h2 style={{ marginTop: 18 }}>Patients within 20 km find you — with your reviews, experience and timings.</h2>
          <p>Whether you run your own clinic, work at one, or consult by video in your free hours — one portal for bookings, records and e-prescriptions.</p>
          <ul className="side-points">
            <li><Check size={16} /> Booking pop-up with the patient&apos;s symptoms, history and reports</li>
            <li><Check size={16} /> Your own medicine list — prescribe in a few taps</li>
            <li><Check size={16} /> Prescription lands in the patient&apos;s app as a PDF, instantly</li>
            <li><Check size={16} /> Own a clinic? List every doctor who works there</li>
            <li><MonitorSmartphone size={16} /> Nexus E-Clinics — coming soon</li>
          </ul>
        </div>
      </aside>
    );
  }
  if (track === 'pharmacy') {
    return (
      <aside className="auth-side">
        <div className="auth-side-inner">
          <Store size={34} color="#f3b89f" />
          <h2 style={{ marginTop: 18 }}>Medicine demand from patients near you — straight to your counter.</h2>
          <ul className="side-points">
            <li><Check size={16} /> Pop-up the moment a patient orders a medicine you stock</li>
            <li><Check size={16} /> Pickup orders, or home delivery with 35% paid in advance</li>
            <li><Truck size={16} /> Deliver yourself, or a Nexus rider collects from your counter</li>
            <li><ShieldCheck size={16} /> Free to join — verified badge once we check your licence</li>
          </ul>
        </div>
      </aside>
    );
  }
  return (
    <aside className="auth-side">
      <div className="auth-side-inner">
        <Building2 size={34} color="#f3b89f" />
        <h2 style={{ marginTop: 18 }}>Your facility, visible to an entire district.</h2>
        <p>Stay independent and keep your own brand. Nexus Healthcare connects you to patients, doctors and E-Clinics across the network.</p>
        <ul className="side-points">
          <li><BedDouble size={16} /> Live beds → referrals arrive with ETA and a summary</li>
          <li><FileCheck2 size={16} /> E-prescriptions and lab orders straight to your counter</li>
          <li><Users size={16} /> Patients nearby find you by service and language</li>
          <li><ShieldCheck size={16} /> Free to list. Verified badge once we check your licence</li>
        </ul>
      </div>
    </aside>
  );
}

export default function Join() {
  const [params, setParams] = useSearchParams();
  const track = params.get('track');
  const ref = params.get('ref') || '';
  const [options, setOptions] = useState(null);
  const [done, setDone] = useState(null);
  useEffect(() => { api.get('/public/join/options').then(setOptions).catch(() => setOptions({})); }, []);
  useEffect(() => { setDone(null); window.scrollTo({ top: 0 }); }, [track]);

  const top = (
    <div className="auth-top">
      <Logo />
      <div className="row"><LanguagePicker /><Link to="/login" className="small muted">Already a partner? <strong>Sign in</strong></Link></div>
    </div>
  );

  if (done) return <Success result={done} />;

  if (track === 'facility' || track === 'doctor' || track === 'pharmacy') {
    return (
      <div className="auth">
        <div className="auth-form-side">
          {top}
          {!options ? <div className="auth-card"><p className="muted">Loading…</p></div>
            : track === 'facility' ? <FacilityForm options={options} onDone={setDone} /> : track === 'pharmacy' ? <PharmacySignup /> : <DoctorSignup />}
        </div>
        <Side track={track} options={options} />
      </div>
    );
  }

  return (
    <div className="j-page">
      <div className="j-wrap">
        {top}
        <div className="center j-hero">
          <span className="eyebrow">Join the Nexus Healthcare network</span>
          <h1 className="auth-title">Grow with us — on your terms</h1>
          <p className="muted">Whether you run a hospital or clinic, or you&apos;re a doctor with a few free hours a week, there&apos;s a place for you.</p>
        </div>
        <div className="j-tracks">
          <button type="button" className="j-track" onClick={() => setParams({ track: 'facility' })}>
            <span className="j-track-icon"><Building2 /></span>
            <span className="eyebrow">For hospitals, clinics &amp; labs</span>
            <h3>List your clinic or hospital</h3>
            <p className="muted small">Already running a facility? Add it to the network. Receive referrals, e-prescriptions and lab orders, and show live beds to every doctor nearby.</p>
            <ul>
              <li><Check size={15} /> Free to list — you stay independent</li>
              <li><Check size={15} /> Verified within 48 hours</li>
              <li><Check size={15} /> Your own dashboard for beds, OPD and staff</li>
            </ul>
            <span className="j-track-cta">List my facility <ArrowRight size={16} /></span>
          </button>
          <button type="button" className="j-track clay" onClick={() => setParams({ track: 'doctor' })}>
            <span className="j-track-icon"><Stethoscope /></span>
            <span className="eyebrow">For doctors</span>
            <h3>Join as a doctor</h3>
            <p className="muted small">Run your own clinic, work at a hospital or clinic, or consult by video in your free hours. Sign up with your name, email and mobile.</p>
            <ul>
              <li><CalendarClock size={15} /> You choose the days and hours</li>
              <li><Building2 size={15} /> Own a clinic? Add it and list its doctors</li>
              <li><MonitorSmartphone size={15} /> Nexus E-Clinics <span className="soon-badge">Coming soon</span></li>
            </ul>
            <span className="j-track-cta">Create my doctor account <ArrowRight size={16} /></span>
          </button>
          <button type="button" className="j-track" onClick={() => setParams({ track: 'pharmacy' })}>
            <span className="j-track-icon"><Store /></span>
            <span className="eyebrow">For medical stores</span>
            <h3>Add your medical store</h3>
            <p className="muted small">Get medicine orders from patients within 50 km — pickup or home delivery. Sign up with your name, email, mobile and store name.</p>
            <ul>
              <li><Check size={15} /> Demand pop-ups for medicines you stock</li>
              <li><Truck size={15} /> Deliver yourself or use a Nexus rider</li>
            </ul>
            <span className="j-track-cta">Create my store account <ArrowRight size={16} /></span>
          </button>
        </div>
        <div className="card flat j-track-status">
          <div>
            <h4 className="mb-1">Already applied?</h4>
            <p className="small muted mb-0">Enter your application reference to see where it stands.</p>
          </div>
          <StatusCheck initialRef={ref} key={ref} />
        </div>
      </div>
    </div>
  );
}
