import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, UserPlus, ShieldCheck, KeyRound, Pill, FlaskConical, Trash2, Store, Building2, Send, CheckCircle2, Download, FileUp, AlertTriangle, ShieldAlert, PenLine, RotateCcw, Smartphone, X, Mail } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { api } from '../../api';
import { Avatar, Button, Card, Empty, Field, Modal, fmtDate, useAction, useToast, cx } from '../../components/ui';
import { OtpInput } from '../../components/OtpFlow';
import { useDoctorHome } from './context';
import { useDebounced, LAB_TESTS } from './shared';
import { DrugSearch } from './RxComposer';
import { TimingPicker, freqText, parseFreq } from './medTiming';
import { MedicineForm, blankMed } from './Medicines';
import DosDonts from './DosDonts';
import RxTemplateTools from './RxTemplates';
import { rowsFrom, mergeList, mergeText } from './rxTemplateUtils';

const blankRow = (drug = '') => ({ key: Math.random().toString(36).slice(2), drug, dose: '1 tablet', freq: '1-0-1 after food', days: 5, timing: { morning: 1, afternoon: 0, evening: 0, night: 1 }, food: 'after food' });

/* ---------- step 1: who is the patient? ---------- */
function PatientStep({ onReady }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 300);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState(null);
  const [sent, setSent] = useState(null);
  const [code, setCode] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [np, setNp] = useState({ name: '', age: '', gender: 'Female', phone: '', allergies: '' });
  const [error, setError] = useState('');
  const [run, busy] = useAction();

  useEffect(() => {
    if (dq.length < 4) { setResults([]); setSearching(false); return undefined; }
    let alive = true; // a slower, older search must not overwrite the newer one's results
    setSearching(true);
    api.get(`/doctor/lookup?q=${encodeURIComponent(dq)}`).then((r) => alive && setResults(r)).catch(() => alive && setResults([])).finally(() => alive && setSearching(false));
    return () => { alive = false; };
  }, [dq]);

  const sendCode = (p, channel) => run('send', async () => {
    setError('');
    const r = await api.post('/doctor/patient-access', { patientId: p.id, channel });
    setPicked(p); setSent(r); setCode('');
  });
  const verify = () => run('verify', async () => {
    setError('');
    try { const r = await api.post('/doctor/patient-access/verify', { patientId: picked.id, code, channel: sent.channel }); onReady(r.patient); } catch (e) { setError(e.message); setCode(''); throw e; }
  }, 'Patient approved — you can write the prescription');
  const register = () => run('reg', async () => {
    const r = await api.post('/doctor/walkin-patient', np);
    setNewOpen(false); onReady(r);
  }, 'Health Passport created for the patient');

  if (picked && sent) {
    return (
      <Card className="dr-pr-step">
        <div className="row" style={{ gap: 12 }}><Avatar name={picked.name} /><div><strong translate="no">{picked.name}</strong><div className="small muted">{picked.id} · {picked.age} y · {picked.gender}</div></div></div>
        <div className="callout mt-2">{sent.channel === 'email' ? <Mail /> : <Smartphone />}<span>We sent a 6-digit code to the patient&apos;s {sent.channel === 'email' ? 'email' : 'mobile'} <strong>{sent.masked}</strong>. Ask them to read it out — this confirms they&apos;re with you and agree.</span></div>
        {sent.alternatives?.length > 0 && (
          <p className="tiny muted mt-1 mb-0">Didn&apos;t get it? {sent.alternatives.map((ch) => <button key={ch} type="button" className="link-btn" onClick={() => sendCode(picked, ch)}>Send by {ch === 'email' ? 'email' : 'SMS'} instead</button>)}</p>
        )}
        {sent.devCode && <div className="dev-otp mt-1">Demo mode — the patient&apos;s code is <strong className="mono">{sent.devCode}</strong></div>}
        <div className="mt-2" style={{ maxWidth: 380 }}><OtpInput value={code} onChange={setCode} autoFocus /></div>
        {error && <div className="form-error mt-1">{error}</div>}
        <div className="row mt-2" style={{ gap: 8 }}>
          <Button icon={KeyRound} disabled={code.length !== 6} loading={busy === 'verify'} onClick={verify}>Verify & continue</Button>
          <Button variant="ghost" onClick={() => { setPicked(null); setSent(null); }}>Change patient</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="dr-pr-step">
      <h3 className="mb-1">Who is the patient?</h3>
      <p className="small muted">Search by Health Passport ID or mobile number. Not on the network yet? Register them in 20 seconds.</p>
      <div className="row wrap" style={{ gap: 8 }}>
        <div className="input-wrap grow" style={{ minWidth: 240 }}><Search /><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. OC-2041-7783 or 98765 00001" autoFocus /></div>
        <Button variant="secondary" icon={UserPlus} onClick={() => setNewOpen(true)}>New patient</Button>
      </div>
      {dq.length >= 4 && !searching && results.length === 0 && <p className="small muted mt-1 mb-0">No passport found. Check the number, or register them as a new patient.</p>}
      <div className="dr-pr-results">
        {results.map((p) => (
          <div key={p.id} className="dr-pr-result">
            <Avatar name={p.name} size="sm" />
            <div className="grow"><strong className="small" translate="no">{p.name}</strong><div className="tiny muted">{p.id} · {p.age ?? '—'} y · {p.gender} · {p.district || '—'}</div></div>
            <Button size="sm" icon={ShieldCheck} loading={busy === 'send'} onClick={() => sendCode(p)}>Send approval code</Button>
          </div>
        ))}
      </div>
      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="Register a new patient" subtitle="Creates a Health Passport. They can claim it later with their mobile number."
        footer={<><Button variant="ghost" onClick={() => setNewOpen(false)}>Cancel</Button><Button icon={UserPlus} loading={busy === 'reg'} disabled={np.name.trim().length < 2 || np.age === ''} onClick={register}>Create passport</Button></>}>
        <div className="stack">
          <Field label="Full name"><input className="input" value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} autoFocus /></Field>
          <div className="grid three">
            <Field label="Age"><input className="input" inputMode="numeric" value={np.age} onChange={(e) => setNp({ ...np, age: e.target.value.replace(/\D/g, '').slice(0, 3) })} /></Field>
            <Field label="Gender"><select className="select" value={np.gender} onChange={(e) => setNp({ ...np, gender: e.target.value })}>{['Female', 'Male', 'Other'].map((g) => <option key={g}>{g}</option>)}</select></Field>
            <Field label="Mobile (optional)"><input className="input" type="tel" dir="ltr" value={np.phone} onChange={(e) => setNp({ ...np, phone: e.target.value.replace(/[^\d+\s-]/g, '') })} placeholder="98765 43210" /></Field>
          </div>
          <Field label="Known allergies (optional)" hint="Separate with commas"><input className="input" value={np.allergies} onChange={(e) => setNp({ ...np, allergies: e.target.value })} placeholder="e.g. Penicillin" /></Field>
        </div>
      </Modal>
    </Card>
  );
}

/* ---------- step 2 + 3: write and share ---------- */
function WriteStep({ patient, onDone, onCancel }) {
  const home = useDoctorHome();
  const doctor = home.data?.doctor;
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [diagnosis, setDiagnosis] = useState('');
  const [advice, setAdvice] = useState('');
  const [complaint, setComplaint] = useState('');
  const [dos, setDos] = useState([]);
  const [donts, setDonts] = useState([]);
  const [tests, setTests] = useState([]);
  const [followUp, setFollowUp] = useState(0);
  const [paper, setPaper] = useState(null);
  const [targets, setTargets] = useState(null);
  const [pharmacyId, setPharmacyId] = useState('');
  const [labId, setLabId] = useState('');
  const [shareRxWithLab, setShareRxWithLab] = useState(true);
  const [warnings, setWarnings] = useState([]);
  const [signed, setSigned] = useState(false);
  const [newMed, setNewMed] = useState(null);
  const [labDropped, setLabDropped] = useState(false); // we un-picked the chosen centre because it can't do every ticked test
  const [uploading, setUploading] = useState(false);
  const [run, busy] = useAction();
  const fileRef = useRef(null);

  const drugKey = useMemo(() => rows.map((r) => r.drug).join('|'), [rows]);
  const dKey = useDebounced(drugKey, 400);
  useEffect(() => {
    let alive = true;
    const qs = new URLSearchParams({ patientId: patient.id, drugs: dKey, tests: tests.join(',') });
    api.get(`/doctor/share-targets?${qs}`).then((t) => alive && setTargets(t)).catch(() => {});
    if (dKey) api.post('/prescriptions/check', { patientId: patient.id, items: dKey.split('|').map((drug) => ({ drug })) }).then((w) => alive && setWarnings(w)).catch(() => {});
    else setWarnings([]);
    return () => { alive = false; };
  }, [dKey, tests, patient.id]);

  // `targets` is refetched for the current tests, so once it arrives a chosen centre that no longer does all of
  // them (or dropped off the list) is cleared — otherwise the server rejects the whole prescription on submit.
  useEffect(() => {
    if (!labId || !targets) return;
    const lab = targets.labs.find((l) => l.id === labId);
    if (lab && lab.offers >= lab.of) return;
    setLabDropped(true);
    setLabId('');
  }, [targets, labId]);
  const pickLab = (id) => { setLabId(id); setLabDropped(false); };

  const update = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addDrug = (d) => {
    const m = d.defaults;
    setRows((rs) => [...rs, m ? { ...blankRow(d.name), dose: m.dose, freq: freqText(m) + (m.note ? ` · ${m.note}` : ''), days: m.days, timing: m.sos ? null : m.timing, food: m.food } : blankRow(d.name)]);
  };
  // Templates and favourite chips add lines; medicines already on the prescription are not repeated.
  const addItems = (items) => setRows((rs) => [...rs, ...rowsFrom(items, rs.map((r) => r.drug)).map((x) => ({ ...blankRow(), ...x }))]);
  const applyRxTemplate = (t) => {
    addItems(t.items);
    if (!diagnosis.trim() && t.diagnosis) setDiagnosis(t.diagnosis);
    setAdvice((a) => mergeText(a, t.advice));
    setDos((x) => mergeList(x, t.dos)); setDonts((x) => mergeList(x, t.donts));
    setTests((ts) => [...ts, ...(t.labTests || []).map((l) => l.code).filter((c) => !ts.includes(c) && LAB_TESTS.some((x) => x.code === c))]);
  };
  const tplForm = { diagnosis, advice, dos, donts, labTests: tests.map((code) => ({ code, name: LAB_TESTS.find((x) => x.code === code)?.name || code })), items: rows.map(({ drug, dose, freq, days, food }) => ({ drug, dose, freq, days, food })) };
  const uploadPaper = async (file) => {
    if (!file) return;
    setUploading(true);
    try { const f = await api.upload(file); setPaper({ id: f.id, name: file.name }); } catch (e) { toast(e.message, 'error'); } finally { setUploading(false); }
  };
  const allergyHits = warnings.filter((w) => w.type === 'allergy');
  const canSign = signed && (rows.length || tests.length || paper);

  const submit = () => run('send', async () => {
    const r = await api.post('/doctor/prescriptions', {
      patientId: patient.id, diagnosis, complaint, advice, dos, donts, followUpDays: followUp || undefined, paperFileId: paper?.id,
      items: rows.map(({ drug, dose, freq, days, food, note }) => ({ drug, dose, freq, days, ...(food ? { food } : {}), ...(note ? { note } : {}) })), labTests: tests.map((code) => ({ code })),
      pharmacyId: pharmacyId || undefined, labId: labId || undefined, shareRxWithLab,
    });
    onDone(r);
  }, 'Prescription signed and shared');

  return (
    <div className="stack lg">
      <Card className="dr-pr-patient">
        <Avatar name={patient.name} />
        <div className="grow">
          <strong translate="no">{patient.name}</strong> <span className="small muted">· {patient.id} · {patient.age ?? '—'} y · {patient.gender}</span>
          <div className="row wrap tiny" style={{ gap: 6, marginTop: 4 }}>
            {(patient.allergies || []).length ? patient.allergies.map((a) => <span key={a} className="badge rose">Allergy: {a}</span>) : <span className="badge green">No known allergies</span>}
            {(patient.conditions || []).map((c) => <span key={c} className="badge">{c}</span>)}
            {(patient.currentMeds || []).length > 0 && <span className="badge sun">On: {patient.currentMeds.join(', ')}</span>}
          </div>
        </div>
        <span className="badge green"><ShieldCheck size={12} /> Patient approved · 24 h</span>
        <Button variant="ghost" size="sm" icon={X} onClick={onCancel}>Change</Button>
      </Card>

      <Card title={<h4 className="row mb-0" style={{ gap: 8 }}><Pill size={17} />Prescription</h4>} action={doctor?.affiliation && <span className="tiny muted">Issued from {doctor.affiliation}</span>}>
        <Field label="Diagnosis / impression"><input className="input" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="e.g. Acute viral fever" /></Field>
        <DrugSearch onPick={addDrug} onAddNew={(name) => setNewMed(blankMed(name))} />
        <RxTemplateTools form={tplForm} onApply={applyRxTemplate} onAddItems={addItems} />
        {allergyHits.map((w) => <div key={w.msg} className="callout rose mt-1"><ShieldAlert /><div><strong>Allergy alert.</strong> {w.msg}</div></div>)}
        {warnings.filter((w) => w.type !== 'allergy').map((w) => <div key={w.msg} className="callout mt-1"><AlertTriangle /><div><strong>Interaction.</strong> {w.msg}</div></div>)}
        {rows.length > 0 && (
          <div className="dr-rx-rows">
            <div className="dr-rx-row head"><span>Medicine</span><span>Dose</span><span>How often</span><span>Days</span><span /></div>
            {rows.map((r) => (
              <div key={r.key} className="dr-rx-row">
                <strong className="small" translate="no">{r.drug}</strong>
                <input className="input sm" value={r.dose} onChange={(e) => update(r.key, { dose: e.target.value })} aria-label="Dose" />
                <input className="input sm" value={r.freq} onChange={(e) => update(r.key, { freq: e.target.value, timing: parseFreq(e.target.value) || r.timing })} aria-label="Frequency" />
                <input className="input sm" type="number" min="0" value={r.days} onChange={(e) => update(r.key, { days: e.target.value })} aria-label="Days" />
                <button type="button" className="icon-btn" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label={`Remove ${r.drug}`}><Trash2 /></button>
                <div className="dr-rx-timing"><span className="tiny muted">Timing</span><TimingPicker size="sm" value={r.timing} onChange={(t) => update(r.key, { timing: t, freq: freqText({ timing: t, food: r.food }) })} /></div>
              </div>
            ))}
          </div>
        )}
        <Field label="Patient's problem (complaint)" className="mt-2"><input className="input" value={complaint} onChange={(e) => setComplaint(e.target.value)} placeholder="e.g. fever with body ache for 3 days" /></Field>
        <Field label="Advice for the patient"><textarea className="textarea" rows={2} value={advice} onChange={(e) => setAdvice(e.target.value)} placeholder="Plenty of fluids, rest, come back if fever goes above 102°F…" /></Field>
        <Field label="What to do — and what not to do"><DosDonts dos={dos} donts={donts} onDos={setDos} onDonts={setDonts} /></Field>
        <div className="grid two">
          <Field label="Follow-up">
            <div className="chip-select">{[0, 3, 7, 14, 30].map((n) => <button key={n} type="button" className={cx('chip', followUp === n && 'on')} onClick={() => setFollowUp(n)}>{n ? `${n} days` : 'Not needed'}</button>)}</div>
          </Field>
          <Field label="Wrote it on paper too? (optional)" hint="Attach a photo — the patient sees the original next to the digital copy.">
            <div className="row" style={{ gap: 8 }}>
              <Button variant="secondary" size="sm" icon={FileUp} loading={uploading} onClick={() => fileRef.current?.click()}>{paper ? 'Replace photo' : 'Upload photo / PDF'}</Button>
              {paper && <span className="badge green tiny"><CheckCircle2 size={12} /> {paper.name}</span>}
              <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={(e) => { uploadPaper(e.target.files?.[0]); e.target.value = ''; }} />
            </div>
          </Field>
        </div>
      </Card>

      <Card title={<h4 className="row mb-0" style={{ gap: 8 }}><FlaskConical size={17} />Tests & investigations</h4>}>
        <div className="dr-labs">
          {LAB_TESTS.map((t) => (
            <label key={t.code} className={cx('dr-lab-opt', tests.includes(t.code) && 'on')}>
              <input type="checkbox" checked={tests.includes(t.code)} onChange={() => setTests((ts) => (ts.includes(t.code) ? ts.filter((x) => x !== t.code) : [...ts, t.code]))} />
              <span className="grow small">{t.name}</span>
              <span className="tiny muted">{t.imaging ? 'Diagnostic' : 'Pathology'}</span>
            </label>
          ))}
        </div>
      </Card>

      <Card title={<h4 className="row mb-0" style={{ gap: 8 }}><Send size={17} />Share digitally</h4>}>
        <p className="small muted">Always goes to the patient&apos;s app. Optionally send it straight to a chemist and a lab / diagnostic centre.</p>
        <div className="grid two">
          <Field label={<span className="row" style={{ gap: 6 }}><Store size={14} />Chemist (pharmacy)</span>}>
            <div className="dr-share-list">
              <button type="button" className={cx('dr-share', !pharmacyId && 'on')} onClick={() => setPharmacyId('')}><span className="grow"><strong className="small">Let the patient choose</strong><span className="tiny muted block">They compare stock & prices in their app</span></span></button>
              {targets?.pharmacies.map((p) => (
                <button key={p.id} type="button" className={cx('dr-share', pharmacyId === p.id && 'on')} onClick={() => setPharmacyId(p.id)}>
                  <span className="grow"><strong className="small" translate="no">{p.name}</strong><span className="tiny muted block">{p.distanceKm != null ? `${p.distanceKm} km · ` : ''}{p.hours || ''}</span></span>
                  {p.of > 0 && <span className={cx('badge', p.inStock === p.of ? 'green' : p.inStock ? 'sun' : '')}>{p.inStock}/{p.of} in stock</span>}
                </button>
              ))}
            </div>
          </Field>
          <Field label={<span className="row" style={{ gap: 6 }}><Building2 size={14} />Lab / diagnostic centre</span>}>
            <div className="dr-share-list">
              <button type="button" className={cx('dr-share', !labId && 'on')} onClick={() => pickLab('')}><span className="grow"><strong className="small">Nearest that does each test</strong><span className="tiny muted block">Split automatically; the patient can switch labs</span></span></button>
              {targets?.labs.map((l) => (
                <button key={l.id} type="button" disabled={tests.length > 0 && l.offers < l.of} className={cx('dr-share', labId === l.id && 'on')} onClick={() => pickLab(l.id)}>
                  <span className="grow"><strong className="small" translate="no">{l.name}</strong><span className="tiny muted block">{l.kind}{l.distanceKm != null ? ` · ${l.distanceKm} km` : ''}{l.homeCollection ? ' · home collection' : ''}</span></span>
                  {l.of > 0 && <span className={cx('badge', l.offers === l.of ? 'green' : 'sun')}>{l.offers}/{l.of} tests</span>}
                </button>
              ))}
            </div>
            {labDropped && tests.length > 0 && <span className="hint">The centre you picked doesn&apos;t do all of these tests, so each test will go to the nearest centre that does it.</span>}
          </Field>
        </div>
        {tests.length > 0 && <label className="check small mt-1"><input type="checkbox" checked={shareRxWithLab} onChange={(e) => setShareRxWithLab(e.target.checked)} />Share the prescription with the lab / diagnostic centre too</label>}
      </Card>

      <div className="dr-sign">
        <label className="check">
          <input type="checkbox" checked={signed} onChange={(e) => setSigned(e.target.checked)} />
          <PenLine size={17} />
          <span>I have examined this patient and this prescription is clinically appropriate. Sign digitally as <strong translate="no">{doctor?.name}</strong> ({doctor?.regNo}).</span>
        </label>
        <Button size="lg" icon={Send} disabled={!canSign} loading={busy === 'send'} onClick={submit}>Sign & share</Button>
      </div>

      <Modal open={!!newMed} onClose={() => setNewMed(null)} wide title="Add a medicine" subtitle="Set the dose and timing"
        footer={<><Button variant="ghost" onClick={() => setNewMed(null)}>Cancel</Button><Button disabled={!newMed || newMed.name.trim().length < 2} onClick={() => { const m = newMed; addDrug({ name: [m.name, m.strength].filter(Boolean).join(' '), defaults: m }); api.post('/doctor/medicines', m).catch(() => {}); setNewMed(null); }}>Add</Button></>}>
        {newMed && <MedicineForm value={newMed} onChange={setNewMed} />}
      </Modal>
    </div>
  );
}

function Done({ result, onNew }) {
  const rx = result.prescription;
  return (
    <Card className="dr-success fade-in">
      <div className="dr-success-icon"><CheckCircle2 /></div>
      <h2 className="mb-0">Prescription sent</h2>
      <p className="muted">Signed digitally and shared — no paper needed.</p>
      <div className="dr-pr-shared">
        <div className="on"><Smartphone /><span><strong>Patient&apos;s app</strong><span className="tiny muted block">Can view, download and order</span></span></div>
        <div className={cx(result.sharedWith.pharmacy && 'on')}><Store /><span><strong>{result.sharedWith.pharmacy || 'No chemist chosen'}</strong><span className="tiny muted block">{result.sharedWith.pharmacy ? 'Ready to pack' : 'Patient picks in the app'}</span></span></div>
        <div className={cx(result.labOrders.length && 'on')}><FlaskConical /><span><strong>{result.labOrders.length ? result.labOrders.map((o) => o.labName).join(', ') : 'No tests'}</strong><span className="tiny muted block">{result.labOrders.length ? `${result.labOrders.map((o) => o.tests.join(', ')).join(' · ')}${result.labOrders.some((o) => o.sharedRx) ? ' · prescription shared' : ''}` : '—'}</span></span></div>
      </div>
      {result.followUp && <p className="small mt-2 mb-0"><strong>Follow-up booked:</strong> {new Date(result.followUp.scheduledAt).toLocaleString()} · {result.followUp.where} — the patient sees it in their Follow-ups.</p>}
      <div className="row mt-3" style={{ justifyContent: 'center', gap: 8 }}>
        {rx && <Button variant="secondary" icon={Download} onClick={() => window.open(`/rx/${rx.id}`, '_blank', 'noopener')}>Print / download</Button>}
        <Button icon={RotateCcw} onClick={onNew}>Next patient</Button>
      </div>
    </Card>
  );
}

export default function Prescribe() {
  const [patient, setPatient] = useState(null);
  const [result, setResult] = useState(null);
  const [recent, setRecent] = useState(null);
  const load = () => api.get('/doctor/prescriptions').then(setRecent).catch(() => setRecent([]));
  useEffect(() => { load(); }, []);

  return (
    <div className="stack lg">
      <PageHeader eyebrow="In-clinic & walk-in" title="Write a prescription"
        subtitle="For patients you see in person at your hospital or clinic. It's signed digitally, saved to their Health Passport, and shared with a chemist and lab in one tap." />
      {result ? <Done result={result} onNew={() => { setResult(null); setPatient(null); load(); }} />
        : patient ? <WriteStep patient={patient} onCancel={() => setPatient(null)} onDone={(r) => { setResult(r); load(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
          : <PatientStep onReady={setPatient} />}
      <Card title="Recently issued">
        {!recent ? <p className="small muted mb-0">Loading…</p> : recent.length === 0 ? <Empty icon={Pill} title="No prescriptions yet">Prescriptions you issue — online or in clinic — appear here.</Empty> : (
          <div className="dr-pr-recent">
            {recent.slice(0, 12).map((r) => (
              <div key={r.id} className="dr-pr-recent-row">
                <div className="grow" style={{ minWidth: 0 }}>
                  <strong className="small" translate="no">{r.patientName}</strong> <span className="tiny muted">· {fmtDate(r.createdAt)} · {r.source === 'clinic' ? 'In clinic' : r.consultId ? 'Teleconsult' : 'E-Clinic'}</span>
                  <div className="tiny muted">{r.items.map((i) => i.drug).join(', ') || 'Tests only'}{r.labs?.length ? ` · ${r.labs.map((l) => l.tests.join(', ')).join(', ')}` : ''}</div>
                </div>
                {r.pharmacyName && <span className="badge tiny"><Store size={11} /> {r.pharmacyName}</span>}
                <button type="button" className="icon-btn" title="Print / download" onClick={() => window.open(`/rx/${r.id}`, '_blank', 'noopener')}><Download size={15} /></button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

