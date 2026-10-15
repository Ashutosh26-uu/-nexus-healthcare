import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { UserRound, Mail, Phone, Lock, MapPin, Fingerprint, IdCard, HeartPulse, FileUp, CheckCircle2, X, FileText, ShieldCheck, Sparkles, Droplet, Pill, Plus, CalendarDays } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { Button, Card, Field, Progress, useToast, cx } from '../../components/ui';
import VoiceInput from '../../components/VoiceInput';
import { COUNTRIES } from '../../i18n/countries';
import { usePatient, PageSkeleton } from './shared';
import NearbyDoctors, { useDeviceLocation, LocationButton } from './NearbyDoctors';

const GOV_IDS_IN = ['Ayushman Bharat (PM-JAY) card', 'ABHA health ID', 'State health scheme card', 'ESIC card', 'CGHS card', 'Voter ID', 'Ration card', 'Driving licence', 'PAN card', 'Passport'];
const GOV_IDS_WORLD = ['Passport', 'National ID card', 'Residence permit', 'Driving licence'];
const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const QUICK_SYMPTOMS = ['Fever', 'Cough', 'Headache', 'Body ache', 'Stomach pain', 'Breathlessness', 'Skin rash', 'Joint pain', 'Chest pain', 'Dizziness'];
const DURATIONS = [{ label: 'Since today', days: 0 }, { label: '1–3 days', days: 2 }, { label: '4–7 days', days: 5 }, { label: '1–2 weeks', days: 10 }, { label: '2–4 weeks', days: 21 }, { label: 'Over a month', days: 45 }];
const fmtAadhaar = (v) => v.replace(/\D/g, '').slice(0, 12).replace(/(\d{4})(?=\d)/g, '$1 ');

function ReportUploader({ reports, setReports }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const add = async (files) => {
    setError('');
    setBusy(true);
    try {
      for (const file of [...files].slice(0, 8)) {
        if (file.size > 10 * 1024 * 1024) { setError(`${file.name} is over 10 MB.`); continue; }
        const f = await api.upload(file);
        const rec = await api.post('/patient/records/upload', { title: file.name.replace(/\.[^.]+$/, ''), fileName: file.name, fileId: f.id, text: file.name });
        setReports((r) => [...r, { id: rec.id, name: file.name }]);
      }
    } catch (e) { setError(e.message); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  };
  return (
    <div className="stack" style={{ gap: 8 }}>
      <button type="button" className="pt-dropzone" onClick={() => input.current?.click()} disabled={busy}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); add(e.dataTransfer.files); }}>
        {busy ? <span className="spinner sm" /> : <FileUp />}
        <span><strong>{busy ? 'Uploading…' : 'Add old prescriptions or reports'}</strong><span className="tiny muted">Photo or PDF of a past prescription, lab report or X-ray — up to 10 MB each</span></span>
      </button>
      <input ref={input} type="file" accept="application/pdf,image/*" multiple hidden onChange={(e) => add(e.target.files)} />
      {reports.length > 0 && (
        <div className="pt-report-chips">
          {reports.map((r) => <span key={r.id} className="badge green"><FileText size={12} /> {r.name}</span>)}
        </div>
      )}
      {error && <div className="form-error small">{error}</div>}
    </div>
  );
}

// Type a medicine and press Enter (or +) to add it to the list.
function MedList({ value, onChange }) {
  const [draft, setDraft] = useState('');
  const add = () => { const v = draft.trim(); if (v && !value.some((m) => m.toLowerCase() === v.toLowerCase())) onChange([...value, v].slice(0, 20)); setDraft(''); };
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row" style={{ gap: 8 }}>
        <input className="input grow" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder="e.g. Metformin 500mg, Paracetamol" />
        <Button variant="secondary" icon={Plus} onClick={add} disabled={!draft.trim()}>Add</Button>
        <VoiceInput label="Say it" onText={(t) => onChange([...value, ...t.split(/,| and | aur /i).map((s) => s.trim()).filter(Boolean)].slice(0, 20))} />
      </div>
      {value.length > 0 && (
        <div className="pt-report-chips">
          {value.map((m) => <span key={m} className="badge"><Pill size={12} /> {m} <button type="button" className="pt-chip-x" onClick={() => onChange(value.filter((x) => x !== m))} aria-label={`Remove ${m}`}><X size={11} /></button></span>)}
        </div>
      )}
    </div>
  );
}

export default function CompleteProfile() {
  const { user } = useAuth();
  const { patient, reloadHome } = usePatient();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const device = useDeviceLocation();
  const [form, setForm] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [reports, setReports] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [locNote, setLocNote] = useState('');
  const [via, setVia] = useState('text');
  const returnTo = location.state?.returnTo;

  useEffect(() => {
    if (patient && !form) {
      const gid = patient.govIds?.[0];
      setForm({
        age: patient.age ?? '', gender: patient.gender || 'Prefer not to say', bloodGroup: BLOOD.includes(patient.bloodGroup) ? patient.bloodGroup : '',
        country: patient.country || 'IN', address: patient.address || '', pincode: patient.pincode || '', district: patient.district || '', state: patient.state || '',
        aadhaar: '', govIdType: gid?.type || '', govIdNumber: gid?.number || '',
        symptoms: patient.currentSymptoms?.text || '', symptomDays: patient.currentSymptoms?.days ?? '', department: patient.currentSymptoms?.department || '',
        currentMeds: patient.currentMeds || [],
      });
    }
  }, [patient, form]);
  useEffect(() => { api.get('/public/join/options').then((o) => setDepartments(o.specialties || [])).catch(() => {}); }, []);

  // When the device location arrives, fill district / state / pin from our server (no third-party lookup).
  // A remembered location can arrive before the form loads, so this also waits for `form` — once per location.
  const geoFor = useRef(null);
  const formReady = !!form;
  useEffect(() => {
    if (!device.loc || !form || form.country !== 'IN' || geoFor.current === device.loc) return;
    geoFor.current = device.loc;
    api.get(`/geo/reverse?lat=${device.loc.lat}&lng=${device.loc.lng}`).then((r) => {
      setForm((f) => ({ ...f, district: f.district || r.district, state: f.state || r.state, pincode: f.pincode || r.pincode }));
      setLocNote(r.approximate ? `Nearest district we know: ${r.district} (~${r.distanceKm} km). Please check it.` : `Located near ${r.district}, ${r.state}.`);
    }).catch(() => {});
  }, [device.loc, formReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const india = form?.country === 'IN';
  const hasId = !!form && (form.aadhaar.replace(/\D/g, '').length === 12 || !!patient?.aadhaarLast4 || !!(form.govIdType && form.govIdNumber.trim().length >= 4));
  const checks = useMemo(() => (form ? [form.age !== '', form.address.trim().length >= 5, !!(form.district && form.state), hasId, !!form.symptoms.trim(), !!form.bloodGroup, reports.length > 0 || form.currentMeds.length > 0] : []), [form, hasId, reports.length]);
  if (!patient || !form) return <PageSkeleton />;
  const pct = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  const required = [form.age !== '', form.address.trim().length >= 5, !!(form.district && form.state), hasId];
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleSymptom = (s) => {
    const parts = form.symptoms.split(',').map((x) => x.trim()).filter(Boolean);
    const has = parts.some((x) => x.toLowerCase() === s.toLowerCase());
    set('symptoms', (has ? parts.filter((x) => x.toLowerCase() !== s.toLowerCase()) : [...parts, s]).join(', '));
  };
  const ids = india ? GOV_IDS_IN : GOV_IDS_WORLD;

  const save = async () => {
    setBusy(true); setError('');
    try {
      await api.put('/patient/profile/complete', {
        ...form, aadhaar: india ? form.aadhaar.replace(/\D/g, '') : '', symptomsVia: via,
        ...(device.loc ? { lat: device.loc.lat, lng: device.loc.lng } : {}),
      });
      reloadHome();
      toast('Profile complete — you can book doctors now 💚');
      if (returnTo) navigate(returnTo, { replace: true });
      else navigate(form.symptoms.trim() ? '/patient/consult' : '/patient', { state: form.symptoms.trim() ? { symptoms: form.symptoms, department: form.department } : undefined });
    } catch (e) { setError(e.message); window.scrollTo({ top: 0, behavior: 'smooth' }); } finally { setBusy(false); }
  };

  return (
    <div className="stack lg">
      <PageHeader eyebrow="Your Health Passport" title="Complete your profile"
        subtitle="You can look around with just your name, email and mobile. To book a hospital, clinic or doctor we need a few more details — it takes about 2 minutes." />
      {error && <div className="form-error">{error}</div>}
      <Card className="pt-cp-progress">
        <div className="row between wrap" style={{ gap: 8 }}><strong>Profile {pct}% complete</strong><span className="tiny muted">{required.every(Boolean) ? 'Ready to book ✓' : `${required.filter((x) => !x).length} required detail${required.filter((x) => !x).length > 1 ? 's' : ''} left to book`}</span></div>
        <Progress value={pct} tone="ok" />
      </Card>

      <Card title={<h4 className="row mb-0" style={{ gap: 8 }}><UserRound size={17} />About you</h4>} action={<span className="tiny muted row" style={{ gap: 4 }}><Lock size={12} /> from your sign-up</span>}>
        <div className="grid three">
          <Field label="Name"><div className="input pt-readonly" translate="no"><UserRound size={15} />{patient.name}</div></Field>
          <Field label="Email"><div className="input pt-readonly" dir="ltr" translate="no"><Mail size={15} />{user?.email}</div></Field>
          <Field label="Mobile number"><div className="input pt-readonly" dir="ltr" translate="no"><Phone size={15} />{user?.phone || '—'}</div></Field>
        </div>
        <div className="grid three mt-1">
          <Field label="Age *"><input className="input" inputMode="numeric" value={form.age} onChange={(e) => set('age', e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="e.g. 42" /></Field>
          <Field label="Gender">
            <select className="select" value={form.gender} onChange={(e) => set('gender', e.target.value)}>
              {['Female', 'Male', 'Other', 'Prefer not to say'].map((g) => <option key={g}>{g}</option>)}
            </select>
          </Field>
          <Field label={<span className="row" style={{ gap: 6 }}><Droplet size={14} />Blood group <span className="badge">Optional</span></span>}>
            <select className="select" value={form.bloodGroup} onChange={(e) => set('bloodGroup', e.target.value)}>
              <option value="">Don&apos;t know</option>
              {BLOOD.map((b) => <option key={b}>{b}</option>)}
            </select>
          </Field>
        </div>
      </Card>

      <Card title={<h4 className="row mb-0" style={{ gap: 8 }}><MapPin size={17} />Permanent address *</h4>} action={<LocationButton device={device} />}>
        {locNote && <p className="tiny mb-1" style={{ color: 'var(--green-2)' }}>{locNote}</p>}
        <div className="grid two">
          <Field label="Country">
            <select className="select" value={form.country} onChange={(e) => set('country', e.target.value)}>
              {COUNTRIES.map((c) => <option key={c.iso} value={c.iso}>{c.flag} {c.name}</option>)}
            </select>
          </Field>
          <Field label={india ? 'Pin code' : 'Postal code'}><input className="input" value={form.pincode} onChange={(e) => set('pincode', e.target.value.slice(0, 12))} placeholder={india ? '225001' : ''} /></Field>
        </div>
        <Field label="House, street, village / area"><input className="input" value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="House no., street, landmark, village / area" /></Field>
        <div className="grid two">
          <Field label={india ? 'District / city' : 'City'}><input className="input" value={form.district} onChange={(e) => set('district', e.target.value)} /></Field>
          <Field label={india ? 'State' : 'State / region'}><input className="input" value={form.state} onChange={(e) => set('state', e.target.value)} /></Field>
        </div>
        <p className="tiny muted mb-0"><ShieldCheck size={12} style={{ verticalAlign: '-2px' }} /> Your location is used only to find doctors within 20 km and chemists within 50 km. It stays on Nexus Healthcare&apos;s servers, rounded to about 100 m.</p>
      </Card>

      <Card title={<h4 className="row mb-0" style={{ gap: 8 }}><Fingerprint size={17} />Identity *</h4>} action={<span className="tiny muted">{india ? 'Aadhaar — or any one government ID' : 'Passport or national ID'}</span>}>
        {india && (
          <div className="grid two">
            <Field label="Aadhaar number" hint={patient.aadhaarLast4 ? `On file: XXXX XXXX ${patient.aadhaarLast4}. We keep only the last 4 digits.` : 'We check it and keep only the last 4 digits.'}>
              <input className="input mono" inputMode="numeric" dir="ltr" autoComplete="off" value={form.aadhaar} onChange={(e) => set('aadhaar', fmtAadhaar(e.target.value))} placeholder="1234 5678 9012" />
            </Field>
            <div className="pt-or-id tiny muted">No Aadhaar with you? Add any one ID below instead.</div>
          </div>
        )}
        <div className="grid two">
          <Field label={<span className="row" style={{ gap: 6 }}><IdCard size={14} />{india ? 'Government ID / health scheme card' : 'ID document'}</span>} hint={india ? 'An Ayushman card helps hospitals process cashless treatment.' : 'Used by the clinic to confirm who you are.'}>
            <select className="select" value={form.govIdType} onChange={(e) => set('govIdType', e.target.value)}>
              <option value="">Choose{india ? ' (optional if Aadhaar given)' : ''}</option>
              {ids.map((g) => <option key={g}>{g}</option>)}
            </select>
          </Field>
          <Field label="ID number"><input className="input mono" dir="ltr" value={form.govIdNumber} onChange={(e) => set('govIdNumber', e.target.value.toUpperCase().slice(0, 30))} placeholder={form.govIdType.startsWith('Ayushman') ? 'e.g. PMJAY-UP-1234567' : 'ID number'} disabled={!form.govIdType} /></Field>
        </div>
      </Card>

      <Card title={<h4 className="row mb-0" style={{ gap: 8 }}><HeartPulse size={17} />What&apos;s the problem?</h4>} action={<span className="tiny muted">Type it, or tap the mic and speak</span>}>
        <Field label="Your symptoms, in your own words">
          <textarea className="textarea" rows={3} value={form.symptoms} onChange={(e) => { set('symptoms', e.target.value); setVia('text'); }} placeholder="e.g. fever and cough, body pain at night" />
        </Field>
        <div className="row wrap between" style={{ gap: 8 }}>
          <VoiceInput label="Speak your symptoms" onStart={() => setVia('voice')} onText={(t) => set('symptoms', [form.symptoms.trim(), t].filter(Boolean).join(form.symptoms.trim() ? ', ' : ''))} />
          <div className="chip-select">
            {QUICK_SYMPTOMS.map((s) => <button type="button" key={s} className={cx('chip', form.symptoms.toLowerCase().includes(s.toLowerCase()) && 'on')} onClick={() => toggleSymptom(s)}>{s}</button>)}
          </div>
        </div>
        <Field label={<span className="row" style={{ gap: 6 }}><CalendarDays size={14} />Since how many days?</span>}>
          <div className="chip-select">
            {DURATIONS.map((d) => <button type="button" key={d.days} className={cx('chip', Number(form.symptomDays) === d.days && form.symptomDays !== '' && 'on')} onClick={() => set('symptomDays', d.days)}>{d.label}</button>)}
            <input className="input sm" style={{ width: 110 }} inputMode="numeric" value={form.symptomDays} onChange={(e) => set('symptomDays', e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="or days" aria-label="Number of days" />
          </div>
        </Field>
        <Field label="Know the department? (optional)" hint="If you're not sure, leave it — we'll work it out from your symptoms.">
          <select className="select" value={form.department} onChange={(e) => set('department', e.target.value)}>
            <option value="">Not sure — suggest from my symptoms</option>
            {departments.map((d) => <option key={d}>{d}</option>)}
          </select>
        </Field>
      </Card>

      {(form.symptoms.trim() || form.department) && <NearbyDoctors symptoms={form.symptoms} department={form.department} device={device} title="Doctors within 20 km for this" compact />}

      <Card title={<h4 className="row mb-0" style={{ gap: 8 }}><Pill size={17} />Medicines you&apos;re taking <span className="badge">Optional</span></h4>}>
        <MedList value={form.currentMeds} onChange={(v) => set('currentMeds', v)} />
        <p className="tiny muted mb-0 mt-1">Doctors check this before prescribing, so nothing clashes.</p>
      </Card>

      <Card title={<h4 className="row mb-0" style={{ gap: 8 }}><FileUp size={17} />Past prescriptions &amp; reports <span className="badge">Optional</span></h4>}>
        <ReportUploader reports={reports} setReports={setReports} />
      </Card>

      <div className="pt-cp-submit">
        <div className="row wrap" style={{ gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="ghost" icon={X} onClick={() => navigate('/patient')}>Do it later</Button>
          <Button size="lg" variant="clay" icon={patient.profileComplete ? CheckCircle2 : Sparkles} loading={busy} onClick={save}>{patient.bookingMissing?.length ? 'Save & continue' : 'Save changes'}</Button>
        </div>
      </div>
    </div>
  );
}
