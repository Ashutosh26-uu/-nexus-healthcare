import { useEffect, useState } from 'react';
import { Building2, UserPlus, Trash2, MapPin, Clock, IndianRupee, ShieldCheck, Hourglass, Mail, Phone, CheckCircle2, LocateFixed, Stethoscope } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { api, subscribe } from '../../api';
import { Avatar, Button, Card, Empty, Field, Loading, fmtMoney, useAction, cx } from '../../components/ui';

const DEPARTMENTS = ['General Medicine', 'Pediatrics', 'Obstetrics', 'Orthopedics', 'Dermatology', 'ENT', 'Ophthalmology', 'Cardiology', 'Dental', 'Physiotherapy'];
const blankDoc = { name: '', specialty: 'General Medicine', email: '', phone: '', qualification: '', experience: '', fee: '' };

// The list of doctors at a clinic or hospital — used by clinic-owning doctors (here) and hospital admins.
export function ClinicDoctors({ doctors, specialties, onAdd, onRemove, busy, who = 'clinic' }) {
  const [form, setForm] = useState(blankDoc);
  const [error, setError] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const add = async () => {
    setError('');
    try { const ok = await onAdd({ ...form, experience: Number(form.experience) || 0, fee: Number(form.fee) || undefined }); if (ok) setForm(blankDoc); } catch (e) { setError(e.message); }
  };
  return (
    <div className="stack">
      {doctors.length === 0 ? <Empty icon={Stethoscope} title="No doctors listed yet">Add every doctor who sees patients at your {who} — patients can then find and book them.</Empty> : (
        <div className="dr-cl-list">
          {doctors.map((x) => (
            <div key={x.id} className="dr-cl-doc">
              <Avatar name={x.name} size="sm" />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row wrap" style={{ gap: 6 }}><strong className="small" translate="no">{x.name}</strong>
                  {x.verified ? <span className="badge green tiny"><CheckCircle2 size={11} /> Live</span> : <span className="badge sun tiny"><Hourglass size={11} /> Goes live after verification</span>}
                  {x.hasAccount ? <span className="badge tiny">Has own login</span> : <span className="badge tiny">Invite pending</span>}
                </div>
                <div className="tiny muted">{x.specialty}{x.qualification ? ` · ${x.qualification}` : ''}{x.experience ? ` · ${x.experience} yrs` : ''}{x.fee ? ` · ${fmtMoney(x.fee)}` : ''}</div>
                {!x.hasAccount && x.invite && <div className="tiny muted">They can claim this profile by signing up with {x.invite.email || x.invite.phone}</div>}
              </div>
              <button type="button" className="icon-btn" title="Remove" disabled={busy === `rm-${x.id}`} onClick={() => onRemove(x)}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}
      <div className="dr-cl-add">
        <strong className="small row" style={{ gap: 6 }}><UserPlus size={15} /> Add a doctor</strong>
        <div className="grid three">
          <Field label="Name"><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Dr. Pooja Saxena" /></Field>
          <Field label="Specialty">
            <select className="select" value={form.specialty} onChange={(e) => set('specialty', e.target.value)}>{specialties.map((s) => <option key={s}>{s}</option>)}</select>
          </Field>
          <Field label="Qualification"><input className="input" value={form.qualification} onChange={(e) => set('qualification', e.target.value)} placeholder="MBBS, MD" /></Field>
        </div>
        <div className="grid four">
          <Field label={<span className="row" style={{ gap: 4 }}><Mail size={13} />Email</span>}><input className="input" type="email" dir="ltr" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="doctor@email.com" /></Field>
          <Field label={<span className="row" style={{ gap: 4 }}><Phone size={13} />Mobile</span>}><input className="input" type="tel" dir="ltr" value={form.phone} onChange={(e) => set('phone', e.target.value.replace(/[^\d+\s-]/g, ''))} placeholder="+91 98765 43210" /></Field>
          <Field label="Experience (yrs)"><input className="input" inputMode="numeric" value={form.experience} onChange={(e) => set('experience', e.target.value.replace(/\D/g, '').slice(0, 2))} /></Field>
          <Field label="Fee (₹)"><input className="input" inputMode="numeric" value={form.fee} onChange={(e) => set('fee', e.target.value.replace(/\D/g, '').slice(0, 4))} /></Field>
        </div>
        {error && <div className="form-error small">{error}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}><Button icon={UserPlus} loading={busy === 'add'} disabled={form.name.trim().length < 2 || (!form.email && !form.phone)} onClick={add}>Add doctor</Button></div>
        <p className="tiny muted mb-0">We use the email or mobile so the doctor can claim their profile and get their own login later.</p>
      </div>
    </div>
  );
}

export default function Clinic() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [newName, setNewName] = useState('');
  const [run, busy] = useAction();
  const [error, setError] = useState('');
  const load = () => api.get('/doctor/clinic').then((r) => { setData(r); if (r.clinic) setForm({ name: r.clinic.name, address: r.clinic.address || '', district: r.clinic.district || '', state: r.clinic.state || '', pincode: r.clinic.pincode || '', hours: r.clinic.hours || '', opdFee: r.clinic.opdFee ?? '', phone: r.clinic.phone || '', licenceNo: r.clinic.licenceNo || '', departments: r.clinic.departments || [] }); }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  // Live: verification and listed doctors claiming their profiles refresh the page — without wiping unsaved form edits.
  useEffect(() => subscribe((topics) => {
    if (topics.includes('all') || topics.includes('doctors') || topics.includes('admin')) api.get('/doctor/clinic').then((r) => setData((d) => (d?.clinic && r.clinic ? r : d))).catch(() => {});
  }), []);
  if (!data) return error ? <Empty title="Couldn't load your clinic">{error}</Empty> : <Loading />;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  if (!data.clinic) {
    return (
      <div className="stack lg">
        <PageHeader eyebrow="Your clinic" title="Add your clinic" subtitle="Run your own clinic? Put it on Nexus Healthcare — patients within 20 km find it, and you list every doctor who practises there." />
        <Card>
          <Field label="Clinic name"><input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Sai Care Clinic" /></Field>
          <Button icon={Building2} disabled={newName.trim().length < 3} loading={busy === 'create'} onClick={() => run('create', async () => { await api.post('/doctor/clinic', { name: newName }); await load(); }, 'Clinic added — now fill in its details')}>Add my clinic</Button>
        </Card>
      </div>
    );
  }
  const c = data.clinic;
  // After verification the server locks name, registration and address (only hours/phone/fee/departments change).
  const lock = c.verified ? { readOnly: true, 'aria-readonly': true } : {};
  const save = () => run('save', async () => {
    let coords = {};
    if (form._loc) coords = form._loc;
    const r = await api.put('/doctor/clinic', { ...form, ...coords });
    setData((d) => ({ ...d, clinic: r.clinic }));
  }, 'Clinic details saved');
  const locate = () => run('locate', () => new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Location isn\'t available on this device. Please type the address instead.')); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { set('_loc', { lat: Math.round(p.coords.latitude * 1000) / 1000, lng: Math.round(p.coords.longitude * 1000) / 1000 }); resolve(); },
      () => reject(new Error('Couldn\'t get your location. Allow location access in the browser and try again.')),
      { timeout: 15000 },
    );
  }), 'Location captured — remember to save');

  return (
    <div className="stack lg">
      <PageHeader eyebrow="Your clinic" title={c.name} subtitle="Clinic details and every doctor who practises here. Patients book them from the doctor list." />
      {c.verified ? <div className="callout green"><ShieldCheck /><span><strong>Verified.</strong> Your clinic and its listed doctors are visible to patients.</span></div>
        : <div className="callout"><Hourglass /><span><strong>Under review.</strong> Fill in the address and registration number — our team verifies the clinic, and then it goes live with all its doctors.</span></div>}

      <Card title={<h4 className="row mb-0" style={{ gap: 8 }}><Building2 size={17} />Clinic details</h4>}>
        <div className="grid two">
          <Field label="Clinic name"><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} {...lock} /></Field>
          <Field label="Clinical establishment reg. no." hint={c.verified ? 'Verified — contact us to change the name, registration or address.' : undefined}><input className="input" dir="ltr" value={form.licenceNo} onChange={(e) => set('licenceNo', e.target.value)} placeholder="e.g. UP/CE/2024/1182" {...lock} /></Field>
        </div>
        <Field label={<span className="row" style={{ gap: 4 }}><MapPin size={13} />Address</span>}><input className="input" value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Building, street, area" {...lock} /></Field>
        <div className="grid three">
          <Field label="City / district"><input className="input" value={form.district} onChange={(e) => set('district', e.target.value)} {...lock} /></Field>
          <Field label="State"><input className="input" value={form.state} onChange={(e) => set('state', e.target.value)} {...lock} /></Field>
          <Field label="Pin code"><input className="input" value={form.pincode} onChange={(e) => set('pincode', e.target.value.slice(0, 12))} {...lock} /></Field>
        </div>
        <div className="grid three">
          <Field label={<span className="row" style={{ gap: 4 }}><Clock size={13} />Opening hours</span>}><input className="input" value={form.hours} onChange={(e) => set('hours', e.target.value)} placeholder="Mon–Sat 10:00 – 14:00 · 17:00 – 20:00" /></Field>
          <Field label={<span className="row" style={{ gap: 4 }}><IndianRupee size={13} />OPD fee</span>}><input className="input" inputMode="numeric" value={form.opdFee} onChange={(e) => set('opdFee', e.target.value.replace(/\D/g, '').slice(0, 4))} /></Field>
          <Field label="Clinic phone"><input className="input" dir="ltr" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        </div>
        <Field label="Departments">
          <div className="chip-select">{DEPARTMENTS.map((x) => <button type="button" key={x} className={cx('chip', form.departments.includes(x) && 'on')} onClick={() => set('departments', form.departments.includes(x) ? form.departments.filter((y) => y !== x) : [...form.departments, x])}>{x}</button>)}</div>
        </Field>
        <div className="row between wrap" style={{ gap: 8 }}>
          <Button variant="secondary" size="sm" icon={LocateFixed} loading={busy === 'locate'} onClick={locate}>{form._loc || (c.lat && c.lng) ? 'Clinic location saved ✓ — update' : 'I’m at the clinic — use this location'}</Button>
          <Button loading={busy === 'save'} onClick={save}>Save details</Button>
        </div>
      </Card>

      <Card title={<h4 className="row mb-0" style={{ gap: 8 }}><Stethoscope size={17} />Doctors at {c.name} ({(data.doctors || []).length + 1})</h4>}>
        <p className="tiny muted mt-0">You&apos;re listed as the owner. Add everyone else who sees patients here.</p>
        <ClinicDoctors doctors={data.doctors || []} specialties={data.specialties} busy={busy}
          onAdd={(body) => run('add', async () => { const r = await api.post('/doctor/clinic/doctors', body); setData((d) => ({ ...d, doctors: r.doctors })); return true; }, 'Doctor added')}
          onRemove={(x) => run(`rm-${x.id}`, async () => { const r = await api.del(`/doctor/clinic/doctors/${x.id}`); setData((d) => ({ ...d, doctors: r.doctors })); }, 'Removed')} />
      </Card>
    </div>
  );
}
