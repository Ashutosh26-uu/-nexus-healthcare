import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserRound, Mail, Phone, Fingerprint, GraduationCap, Stethoscope, Camera, Upload, CheckCircle2, ShieldCheck, Lock, FileText, X, Hourglass, AlertTriangle } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { Button, Card, Field, Loading, Progress, useAction, cx } from '../../components/ui';
import { ProtectedImg } from '../../components/Availability';
import AadhaarVerify from '../../components/AadhaarVerify';
import { useDoctorHome } from './context';
import { INDIAN_LANGUAGES } from './shared';
import { COUNTRIES } from '../../i18n/countries';

const LIFETIME = [
  { label: 'Under 1,000', value: 800 },
  { label: '1,000 – 5,000', value: 3000 },
  { label: '5,000 – 20,000', value: 12000 },
  { label: '20,000 – 50,000', value: 35000 },
  { label: '50,000+', value: 60000 },
];

const fmtAadhaar = (v) => v.replace(/\D/g, '').slice(0, 12).replace(/(\d{4})(?=\d)/g, '$1 ');

function UploadBox({ label, hint, accept, fileId, onUploaded, image, icon }) {
  const Icon = icon || Upload;
  const input = useRef(null);
  const [preview, setPreview] = useState(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const pick = async (file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError('Please choose a file under 10 MB.'); return; }
    setError(''); setBusy(true);
    try {
      const r = await api.upload(file);
      setName(file.name);
      setPreview(file.type.startsWith('image/') ? URL.createObjectURL(file) : null); // a PDF replacing a photo must not keep the old thumbnail
      onUploaded(r.id);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <div>
      <div className="small strong mb-1">{label}</div>
      <button type="button" className={cx('dr-upload', image && 'photo', fileId && 'done')} onClick={() => input.current?.click()} disabled={busy}>
        {preview ? <img src={preview} alt="" /> : fileId && image ? <ProtectedImg fileId={fileId} alt="" /> : <span className="dr-upload-ic">{busy ? <span className="spinner sm" /> : <Icon />}</span>}
        <span className="dr-upload-text">
          <strong>{fileId ? (name || 'Uploaded') : busy ? 'Uploading…' : 'Tap to upload'}</strong>
          <span className="tiny muted">{fileId ? 'Tap to replace' : hint}</span>
        </span>
        {fileId && <CheckCircle2 className="dr-upload-ok" />}
      </button>
      <input ref={input} type="file" accept={accept} hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
      {error && <div className="form-error mt-1 small">{error}</div>}
    </div>
  );
}

export default function Profile() {
  const { user } = useAuth();
  const home = useDoctorHome();
  const navigate = useNavigate();
  const doctor = home.data?.doctor;
  const [specialties, setSpecialties] = useState([]);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [run, busy] = useAction();

  useEffect(() => { api.get('/public/join/options').then((o) => setSpecialties(o.specialties || [])).catch(() => {}); }, []);
  useEffect(() => {
    if (doctor && !form) {
      const k = doctor.kyc || {};
      let draft = {};
      try { draft = JSON.parse(localStorage.getItem(`oc_dr_draft_${doctor.id}`) || '{}'); } catch { /* ignore */ }
      setForm({
        age: k.age || '', specialty: doctor.specialty || 'General Medicine', qualification: doctor.qualification || '',
        latestDegree: k.latestDegree || '', degreeNumber: k.degreeNumber || '', degreeFileId: k.degreeFileId || null,
        regNo: doctor.regNo || '', experience: doctor.experience || '', patientsLifetime: doctor.patientsLifetime || '', fee: doctor.fee ?? '',
        languages: doctor.languages || ['Hindi', 'English'], district: doctor.district || '', state: doctor.state || '', photoFileId: k.photoFileId || doctor.photoFileId || null,
        address: doctor.address || '', country: doctor.country || 'IN',
        ...(doctor.profileComplete ? {} : draft), aadhaar: '',
      });
    }
  }, [doctor, form]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  // Keep an unsent draft on this device (never the Aadhaar number) so "Finish later" loses nothing.
  useEffect(() => {
    if (!form || !doctor) return;
    if (doctor.verified || doctor.profileComplete) { try { localStorage.removeItem(`oc_dr_draft_${doctor.id}`); } catch { /* ignore */ } return; }
    try { localStorage.setItem(`oc_dr_draft_${doctor.id}`, JSON.stringify({ ...form, aadhaar: undefined })); } catch { /* ignore */ }
  }, [form, doctor]);
  const checks = useMemo(() => (form ? [
    !!form.age, form.address.trim().length >= 5 && !!form.district.trim(), !!form.specialty, form.qualification.trim().length > 1,
    form.latestDegree.trim().length > 1, !!(form.degreeNumber.trim() || form.degreeFileId), !!form.regNo.trim(), form.experience !== '', !!form.patientsLifetime, !!form.fee, !!form.photoFileId,
  ] : []), [form]);
  const pct = checks.length ? Math.round((checks.filter(Boolean).length / checks.length) * 100) : 0;

  if (!doctor || !form) return <Loading />;
  const locked = doctor.verified;
  const submitted = doctor.profileComplete && !doctor.verified && !doctor.verificationNote;

  const submit = () => {
    setError('');
    run('save', async () => {
      try {
        const doc = await api.put('/doctor/profile', { ...form, aadhaar: form.aadhaar.replace(/\D/g, '') });
        home.setData((d) => (d ? { ...d, doctor: doc } : d));
        // Submitted: the server has it now, so don't leave address/age/reg. no. on a possibly shared clinic computer.
        try { localStorage.removeItem(`oc_dr_draft_${doctor.id}`); } catch { /* ignore */ }
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (e) { setError(e.message); throw e; }
    }, 'Profile submitted — our team will verify it shortly');
  };

  return (
    <div className="stack lg">
      <PageHeader eyebrow="Doctor onboarding" title={locked ? 'Your profile' : 'Complete your profile'}
        subtitle={locked ? 'Verified by the Nexus Healthcare clinical team. Contact us to change credentials.' : 'A few details so patients can trust you and our team can verify your registration. Takes about 3 minutes.'} />

      {locked && <div className="callout green"><ShieldCheck /><div><strong>Verified doctor.</strong> {doctor.verificationNote || 'Your registration has been checked.'}</div></div>}
      {submitted && <div className="callout"><Hourglass /><div><strong>Submitted — under review.</strong> We usually verify within 48 hours. You&apos;ll get a notification the moment you&apos;re approved.</div></div>}
      {!doctor.verified && doctor.verificationNote && <div className="callout rose"><AlertTriangle /><div><strong>Needs changes:</strong> {doctor.verificationNote}. Update the details below and resubmit.</div></div>}

      {!locked && (
        <Card className="dr-ob-progress">
          <div className="row between"><strong>Profile {pct}% complete</strong><span className="tiny muted">{checks.filter((c) => !c).length ? `${checks.filter((c) => !c).length} things left` : 'Ready to submit'}</span></div>
          <Progress value={pct} tone="ok" />
        </Card>
      )}

      <fieldset className="dr-ob" disabled={locked}>
        <Card title={<h4 className="row mb-0" style={{ gap: 8 }}><UserRound size={17} />Account details</h4>} action={<span className="tiny muted row" style={{ gap: 4 }}><Lock size={12} /> from your sign-up</span>}>
          <div className="grid three">
            <Field label="Name"><div className="input readonly" translate="no"><UserRound size={15} />{user?.name}</div></Field>
            <Field label="Email"><div className="input readonly" dir="ltr" translate="no"><Mail size={15} />{user?.email}</div></Field>
            <Field label="Mobile number"><div className="input readonly" dir="ltr" translate="no"><Phone size={15} />{user?.phone || '—'}</div></Field>
          </div>
        </Card>

        <Card title={<h4 className="row mb-0" style={{ gap: 8 }}><Fingerprint size={17} />About you</h4>}>
          <div className="grid three">
            <Field label="Age *"><input className="input" inputMode="numeric" value={form.age} onChange={(e) => set('age', e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="e.g. 34" /></Field>
            <Field label="Country">
              <select className="select" value={form.country} onChange={(e) => set('country', e.target.value)}>
                {COUNTRIES.map((c) => <option key={c.iso} value={c.iso}>{c.flag} {c.name}</option>)}
              </select>
            </Field>
            <Field label="State / region"><input className="input" value={form.state} onChange={(e) => set('state', e.target.value)} placeholder="e.g. Uttar Pradesh" /></Field>
          </div>
          <div className="grid two">
            <Field label="Address * (clinic or residence)"><input className="input" value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Building, street, area" /></Field>
            <Field label="City / district *"><input className="input" value={form.district} onChange={(e) => set('district', e.target.value)} placeholder="e.g. Lucknow" /></Field>
          </div>
          <div className="grid two">
            <Field label={<span>Aadhaar number <span className="badge">Optional</span></span>} hint={doctor.kyc?.aadhaarLast4 ? `On file: XXXX XXXX ${doctor.kyc.aadhaarLast4}. We only keep the last 4 digits.` : 'Indian doctors: we check it and keep only the last 4 digits.'}>
              <input className="input mono" inputMode="numeric" dir="ltr" autoComplete="off" value={locked ? `XXXX XXXX ${doctor.kyc?.aadhaarLast4 || '····'}` : form.aadhaar} onChange={(e) => set('aadhaar', fmtAadhaar(e.target.value))} placeholder="1234 5678 9012" />
            </Field>
            <Field label={<span>Aadhaar QR check <span className="badge">Optional</span></span>} hint="Scan the QR on your Aadhaar — it proves the card is genuine and speeds up our review.">
              <AadhaarVerify verification={doctor.kyc?.aadhaarVerification}
                onVerified={(r) => home.setData((d) => (d?.doctor ? { ...d, doctor: { ...d.doctor, kyc: { ...(d.doctor.kyc || {}), aadhaarLast4: d.doctor.kyc?.aadhaarLast4 || r.last4, aadhaarVerification: { ...r, verified: true } } } } : d))} />
            </Field>
          </div>
        </Card>

        <Card title={<h4 className="row mb-0" style={{ gap: 8 }}><GraduationCap size={17} />Education & registration</h4>}>
          <div className="grid two">
            <Field label="Educational qualification"><input className="input" value={form.qualification} onChange={(e) => set('qualification', e.target.value)} placeholder="e.g. MBBS, MD (Pediatrics)" /></Field>
            <Field label="Specialty">
              <select className="select" value={form.specialty} onChange={(e) => set('specialty', e.target.value)}>
                {(specialties.length ? specialties : [form.specialty]).map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid two">
            <Field label="Latest degree *"><input className="input" value={form.latestDegree} onChange={(e) => set('latestDegree', e.target.value)} placeholder="e.g. MD Pediatrics, KGMU (2017)" /></Field>
            <Field label="Medical council registration no." hint="Checked against the council registry."><input className="input mono" dir="ltr" value={form.regNo} onChange={(e) => set('regNo', e.target.value.toUpperCase().slice(0, 20))} placeholder="UPMC-48211" /></Field>
          </div>
          <div className="grid two">
            <UploadBox label="Latest degree certificate (photo)" hint="JPG, PNG or PDF · up to 10 MB" accept="image/*,application/pdf" icon={FileText} fileId={form.degreeFileId} onUploaded={(id) => set('degreeFileId', id)} />
            <Field label="…or the certificate number" hint="Either the photo or the number is enough."><input className="input" dir="ltr" value={form.degreeNumber} onChange={(e) => set('degreeNumber', e.target.value)} placeholder="e.g. KGMU/MD/2017/442" /></Field>
          </div>
        </Card>

        <Card title={<h4 className="row mb-0" style={{ gap: 8 }}><Stethoscope size={17} />Your practice</h4>}>
          <div className="grid two">
            <Field label="Years of experience *"><input className="input" inputMode="numeric" value={form.experience} onChange={(e) => set('experience', e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="e.g. 8" /></Field>
            <Field label="Your consultation fee (₹)" hint={doctor.verified ? 'Set by the admin after verification.' : 'You can propose it now.'}><input className="input" inputMode="numeric" value={form.fee} onChange={(e) => set('fee', e.target.value.replace(/\D/g, '').slice(0, 4))} /></Field>
          </div>
          <Field label="Approximately how many patients have you seen in your career?">
            <div className="chip-select">
              {LIFETIME.map((o) => <button type="button" key={o.value} className={cx('chip', Number(form.patientsLifetime) === o.value && 'on')} onClick={() => set('patientsLifetime', o.value)}>{o.label}</button>)}
            </div>
          </Field>
          <Field label="Languages you consult in">
            <div className="chip-select">
              {INDIAN_LANGUAGES.map((l) => <button type="button" key={l} className={cx('chip', form.languages.includes(l) && 'on')} onClick={() => set('languages', form.languages.includes(l) ? form.languages.filter((x) => x !== l) : [...form.languages, l])}>{l}</button>)}
            </div>
          </Field>
        </Card>

        <Card title={<h4 className="row mb-0" style={{ gap: 8 }}><Camera size={17} />Professional photo</h4>}>
          <div className="dr-photo-row">
            <UploadBox label="Your photo with a stethoscope" hint="Clear face, plain background, stethoscope visible" accept="image/*" image icon={Camera} fileId={form.photoFileId} onUploaded={(id) => set('photoFileId', id)} />
            <ul className="dr-photo-tips small muted">
              <li>Face the camera in good light — no sunglasses or caps</li>
              <li>Wear your white coat or formal clothes with your stethoscope</li>
              <li>Patients see this photo before they join your consult</li>
            </ul>
          </div>
        </Card>
      </fieldset>

      {!locked && (
        <div className="dr-ob-submit">
          {error && <div className="form-error"><X size={14} /> {error}</div>}
          <div className="row wrap" style={{ gap: 10, justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => navigate('/doctor')}>Finish later</Button>
            <Button size="lg" icon={CheckCircle2} loading={busy === 'save'} onClick={submit}>{doctor.profileComplete ? 'Resubmit for verification' : 'Submit for verification'}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
