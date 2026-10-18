import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Plus, Trash2, Pill, AlertTriangle, ShieldAlert, FlaskConical, Hospital, BedDouble, CalendarClock, PenLine, CheckCircle2, ArrowLeft, Package, Printer, ShieldCheck, Sparkles } from 'lucide-react';
import { api } from '../../api';
import { Button, Card, Field, Modal, Pills, useAction, useToast, fmtDate, cx } from '../../components/ui';
import { TimingPicker, freqText, parseFreq } from './medTiming';
import { MedicineForm, blankMed } from './Medicines';
import DosDonts from './DosDonts';
import RxTemplateTools from './RxTemplates';
import { rowsFrom, mergeList, mergeText } from './rxTemplateUtils';
import { useDebounced, LAB_TESTS } from './shared';

const TEMPLATES = [
  { label: '1-0-1 after food × 5 days', dose: '1 tablet', freq: '1-0-1 after food', days: 5 },
  { label: '1-1-1 × 3 days', dose: '1 tablet', freq: '1-1-1 after food', days: 3 },
  { label: '1-0-0 morning × 30 days', dose: '1 tablet', freq: '1-0-0 before breakfast', days: 30 },
  { label: '0-0-1 at night × 10 days', dose: '1 tablet', freq: '0-0-1 at bedtime', days: 10 },
  { label: 'SOS for fever (max 3/day)', dose: '1 tablet', freq: 'When needed, gap of 6 hrs', days: 3 },
  { label: '2 puffs SOS', dose: '2 puffs', freq: 'When breathless (max 4×/day)', days: 30 },
  { label: '1 sachet in 1 L water', dose: '1 sachet', freq: 'Sip through the day', days: 3 },
];

const BED_TYPES = [
  { value: 'general', label: 'General' },
  { value: 'oxygen', label: 'Oxygen' },
  { value: 'icu', label: 'ICU' },
  { value: 'pediatric', label: 'Pediatric' },
];

const emptyRow = () => ({ key: Math.random().toString(36).slice(2), drug: '', dose: '', freq: '', days: '', stock: null, tier: null, timing: null, food: 'after food' });
const foodOf = (freq = '') => ['before food', 'after food', 'with food', 'empty stomach'].find((f) => freq.toLowerCase().includes(f)) || (/bedtime|any time/i.test(freq) ? 'any time' : 'after food');

function StockBadge({ qty, tier }) {
  if (qty === null || qty === undefined) return null;
  if (qty > 0) return <span className="badge green" title="Units in pharmacies within the district"><Package />{qty} nearby</span>;
  if (tier && tier !== 'unavailable') return <span className="badge sun" title="Will be transferred from another region"><Package />{tier}</span>;
  return <span className="badge rose"><Package />Out of stock</span>;
}

export function DrugSearch({ onPick, onAddNew }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [active, setActive] = useState(0);
  const dq = useDebounced(q, 180);
  const wrap = useRef(null);

  useEffect(() => {
    let alive = true;
    if (!dq.trim()) { setResults([]); return undefined; }
    api.get(`/drugs?q=${encodeURIComponent(dq.trim())}`).then((r) => { if (alive) { setResults(r); setActive(0); } }).catch(() => {});
    return () => { alive = false; };
  }, [dq]);

  useEffect(() => {
    const close = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const pick = (d) => { onPick(d); setQ(''); setResults([]); setOpen(false); };
  const onKey = (e) => {
    if (!results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    if (e.key === 'Enter') { e.preventDefault(); pick(results[active]); }
  };

  return (
    <div className="dr-drug-search" ref={wrap}>
      <div className="input-wrap">
        <Search />
        <input className="input" value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKey} placeholder="Search medicine — try Paracetamol, Azithro, Amox…" aria-label="Search medicine" />
      </div>
      {open && results.length > 0 && (
        <div className="dr-drug-pop" role="listbox">
          {results.map((d, i) => (
            <button key={d.name} type="button" role="option" aria-selected={i === active} className={cx('dr-drug-opt', i === active && 'active')} onMouseEnter={() => setActive(i)} onClick={() => pick(d)}>
              <Pill size={15} className="muted" />
              <span className="grow" translate="no">{d.name}</span>
              {d.custom && <span className="badge clay" title={`${d.defaults.dose} · ${freqText(d.defaults)} · ${d.defaults.days} days`}>My list · {freqText(d.defaults)}</span>}
              <StockBadge qty={d.nearbyStock} tier={d.nearestTier} />
            </button>
          ))}
          <button type="button" className="dr-drug-opt add" onClick={() => { onAddNew(q.trim()); setOpen(false); setQ(''); }}><Plus size={15} /><span className="grow">Add “{q.trim()}” as a new medicine with dose & timing</span></button>
        </div>
      )}
      {open && dq.trim() && results.length === 0 && (
        <div className="dr-drug-pop">
          <div className="small muted" style={{ padding: '10px 12px 4px' }}>Not in the national formulary or your list.</div>
          <button type="button" className="dr-drug-opt add" onClick={() => { onAddNew(q.trim()); setOpen(false); setQ(''); }}><Plus size={15} /><span className="grow">Add “{q.trim()}” with its dose & timing</span></button>
        </div>
      )}
    </div>
  );
}

function Success({ done, consult, onBack }) {
  const { prescription: rx, summary } = done;
  const sentName = done.pharmacyName || rx?.pharmacyName || null;
  const [pharmacy, setPharmacy] = useState(null);
  useEffect(() => {
    if (!rx?.pharmacyId || sentName || !rx.items?.length) return undefined;
    // Fallback for servers that return only the id: resolve the name from the stock grid.
    let alive = true;
    api.get(`/stock?drug=${encodeURIComponent(rx.items[0].drug)}`)
      .then((rows) => alive && setPharmacy(rows.find((r) => r.facilityId === rx.pharmacyId)?.facilityName || null))
      .catch(() => {});
    return () => { alive = false; };
  }, [rx, sentName]);
  return (
    <Card className="dr-success fade-in">
      <div className="dr-success-icon"><CheckCircle2 /></div>
      <h2 className="mb-0">Consult complete</h2>
      <p className="muted">{consult.patientName}'s visit is saved to their Health Passport{consult.kioskName ? ` and the slip is printing at ${consult.kioskName}` : ''}.</p>
      <div className="dr-success-grid">
        <div><span className="tiny muted">Diagnosis</span><strong>{summary.diagnosis || '—'}</strong></div>
        <div><span className="tiny muted">E-prescription</span><strong>{rx ? `${rx.items.length} medicine${rx.items.length > 1 ? 's' : ''} · ${rx.id}` : 'No medicines'}</strong></div>
        <div><span className="tiny muted">Sent to</span><strong>{rx?.pharmacyId ? (sentName || pharmacy || 'Nearest stocked pharmacy') : rx ? 'Patient\'s phone & app' : '—'}</strong></div>
        <div><span className="tiny muted">Lab tests</span><strong>{summary.labs.length ? summary.labs.map((l) => l.name).join(', ') : 'None'}</strong></div>
        <div><span className="tiny muted">Referral</span><strong>{summary.referral ? `${summary.referral.name} · ${summary.referral.bedType} bed` : 'None'}</strong></div>
        <div><span className="tiny muted">Follow-up</span><strong>{summary.followUpDays ? `${fmtDate(new Date(Date.now() + summary.followUpDays * 86400000).toISOString())}` : 'Not needed'}</strong></div>
      </div>
      {rx?.warnings?.length > 0 && <div className="callout small mt-2"><AlertTriangle />Signed with {rx.warnings.length} acknowledged warning{rx.warnings.length > 1 ? 's' : ''}.</div>}
      {rx?.signature && <p className="tiny muted mt-2 mb-0"><ShieldCheck size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> Digitally signed · {rx.signature}</p>}
      <div className="row mt-3" style={{ justifyContent: 'center' }}>
        <Button icon={ArrowLeft} onClick={onBack}>Back to queue</Button>
        <Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print summary</Button>
      </div>
    </Card>
  );
}

export default function RxComposer({ consult, record, override, done, onDone, onBack }) {
  const [rows, setRows] = useState([]);
  const [activeKey, setActiveKey] = useState(null);
  const [diagnosis, setDiagnosis] = useState('');
  const [notes, setNotes] = useState('');
  const [advice, setAdvice] = useState('');
  const [dos, setDos] = useState([]);
  const [donts, setDonts] = useState([]);
  const [labs, setLabs] = useState([]);
  const [referOn, setReferOn] = useState(false);
  const [bedType, setBedType] = useState('general');
  const [hospitals, setHospitals] = useState(null);
  const [hospitalId, setHospitalId] = useState('');
  const [referReason, setReferReason] = useState('');
  const [followUp, setFollowUp] = useState(0);
  const [labId, setLabId] = useState('');
  const [shareRxWithLab, setShareRxWithLab] = useState(true);
  const [labTargets, setLabTargets] = useState(null);
  const [signed, setSigned] = useState(false);
  const [warnings, setWarnings] = useState([]);
  const [checking, setChecking] = useState(false);
  const [run, busy] = useAction();
  const toast = useToast();
  const [newMed, setNewMed] = useState(null);
  const [saveToList, setSaveToList] = useState(true);

  const checkKey = useMemo(() => JSON.stringify(rows.filter((r) => r.drug).map((r) => r.drug)), [rows]);
  const debouncedKey = useDebounced(checkKey, 450);

  useEffect(() => {
    const drugs = JSON.parse(debouncedKey);
    if (!drugs.length) { setWarnings([]); return undefined; }
    let alive = true;
    setChecking(true);
    api.post('/prescriptions/check', { patientId: consult.patientId, items: drugs.map((drug) => ({ drug })) })
      .then((w) => alive && setWarnings(w))
      .catch(() => {})
      .finally(() => alive && setChecking(false));
    return () => { alive = false; };
  }, [debouncedKey, consult.patientId]);

  // Centres that can do the selected tests, nearest first.
  const labKey = labs.map((l) => l.code).join(',');
  useEffect(() => {
    if (!labKey) { setLabTargets(null); setLabId(''); return undefined; }
    let alive = true;
    api.get(`/doctor/share-targets?${new URLSearchParams({ patientId: consult.patientId, tests: labKey })}`).then((t) => alive && setLabTargets(t.labs)).catch(() => {});
    return () => { alive = false; };
  }, [labKey, consult.patientId]);

  useEffect(() => {
    if (!referOn) return undefined;
    let alive = true;
    setHospitals(null);
    api.get(`/referral-options?bedType=${bedType}`).then((h) => { if (alive) { setHospitals(h); setHospitalId((cur) => (h.some((x) => x.id === cur) ? cur : h[0]?.id || '')); } }).catch(() => alive && setHospitals([]));
    return () => { alive = false; };
  }, [referOn, bedType]);

  if (done) return <Success done={done} consult={consult} onBack={onBack} />;

  if (consult.status === 'completed') {
    return (
      <Card title="This consult is closed">
        <p className="small muted mb-1">Completed {fmtDate(consult.completedAt)}. Diagnosis: <strong>{consult.diagnosis || '—'}</strong></p>
        {consult.prescription && <p className="small mb-0">{consult.prescription.items.map((i) => `${i.drug} (${i.freq}, ${i.days} d)`).join(' · ')}</p>}
        <Button className="mt-2" variant="secondary" icon={ArrowLeft} onClick={onBack}>Back to queue</Button>
      </Card>
    );
  }

  const update = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addDrug = (d) => {
    const row = { ...emptyRow(), drug: d.name, stock: d.nearbyStock, tier: d.nearestTier };
    if (d.defaults) {
      // The doctor's own medicine: dose, timing and duration fill in automatically.
      const m = d.defaults;
      Object.assign(row, { dose: m.dose, freq: freqText(m) + (m.note ? ` · ${m.note}` : ''), days: m.days, timing: m.sos ? null : m.timing, food: m.food });
      setRows((rs) => [...rs, row]);
      setActiveKey(row.key);
      return;
    }
    const isInhaler = /inhaler/i.test(d.name);
    const isSachet = /sachet/i.test(d.name);
    const t = isInhaler ? TEMPLATES[5] : isSachet ? TEMPLATES[6] : TEMPLATES[0];
    Object.assign(row, { dose: t.dose, freq: t.freq, days: t.days, timing: parseFreq(t.freq), food: foodOf(t.freq) });
    setRows((rs) => [...rs, row]);
    setActiveKey(row.key);
  };
  const applyTemplate = (t) => {
    const key = activeKey && rows.some((r) => r.key === activeKey) ? activeKey : rows[rows.length - 1]?.key;
    if (!key) return;
    update(key, { dose: t.dose, freq: t.freq, days: t.days, timing: parseFreq(t.freq), food: foodOf(t.freq) });
  };
  // Template / favourite lines are added after what's already there (drugs on the list are not repeated).
  const addItems = (items) => setRows((rs) => [...rs, ...rowsFrom(items, rs.map((r) => r.drug)).map((x) => ({ ...emptyRow(), ...x }))]);
  const applyRxTemplate = (t) => {
    addItems(t.items);
    if (!diagnosis.trim() && t.diagnosis) setDiagnosis(t.diagnosis);
    setAdvice((a) => mergeText(a, t.advice));
    setDos((x) => mergeList(x, t.dos)); setDonts((x) => mergeList(x, t.donts));
    setLabs((ls) => [...ls, ...(t.labTests || []).filter((x) => !ls.some((l) => l.code === x.code))]);
  };
  const tplForm = { diagnosis, advice, dos, donts, labTests: labs.map(({ code, name }) => ({ code, name })), items: rows.filter((r) => r.drug).map(({ drug, dose, freq, days, food }) => ({ drug, dose, freq, days, food })) };
  const setTiming = (r, timing) => update(r.key, { timing, freq: freqText({ timing, food: r.food }) });
  const addNewMedicine = async () => {
    const m = newMed;
    if (saveToList) {
      try { await api.post('/doctor/medicines', m); } catch (e) { toast(e.message, 'error'); return; }
    }
    addDrug({ name: [m.name, m.strength].filter(Boolean).join(' '), defaults: m, nearbyStock: null, nearestTier: null });
    toast(saveToList ? `${m.name} added — and saved to your medicines` : `${m.name} added`);
    setNewMed(null);
  };
  const toggleLab = (t) => setLabs((ls) => (ls.some((l) => l.code === t.code) ? ls.filter((l) => l.code !== t.code) : [...ls, t]));

  const allergyHits = warnings.filter((w) => w.type === 'allergy');
  const otherWarn = warnings.filter((w) => w.type !== 'allergy');
  const canSubmit = signed && diagnosis.trim() && consult.status === 'in_progress';
  const hospital = hospitals?.find((h) => h.id === hospitalId);

  const complete = () => run('complete', async () => {
    const items = rows.filter((r) => r.drug).map(({ drug, dose, freq, days, food, note, noSub }) => ({ drug, dose, freq, days: Number(days) || 0, ...(food ? { food } : {}), ...(note ? { note } : {}), ...(noSub ? { noSub: true } : {}) }));
    const res = await api.post(`/consults/${consult.id}/complete`, {
      notes, diagnosis, items, advice, dos, donts,
      labTests: labs.map((l) => ({ code: l.code, name: l.name })),
      labId: labId || undefined, shareRxWithLab,
      referral: referOn && hospitalId ? { facilityId: hospitalId, bedType, reason: referReason || diagnosis } : undefined,
      followUpDays: followUp || undefined,
      triageOverride: override || undefined,
    });
    onDone({ ...res, summary: { diagnosis, labs, followUpDays: followUp, referral: referOn && hospital ? { name: hospital.name, bedType } : null } });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, 'Prescription signed and sent');

  return (
    <Card className="dr-rx">
      <div className="dr-rx-head">
        <div>
          <div className="eyebrow">E-prescription</div>
          <h3 className="mb-0">Write the plan</h3>
        </div>
        <span className="tiny muted">{record?.patient?.allergies?.length ? `Allergies on file: ${record.patient.allergies.join(', ')}` : record?.restricted ? 'History locked — allergy check still runs on the server' : 'No known allergies on file'}</span>
      </div>

      <div className="grid two">
        <Field label="Diagnosis / impression">
          <input className="input" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="e.g. Infective exacerbation of COPD" />
        </Field>
        <Field label="Clinical notes" hint="Private to the care team">
          <textarea className="textarea" rows={notes.includes('\n') ? 5 : 2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Findings, reasoning, what you asked the patient" />
        </Field>
      </div>
      <AmbientScribe consultId={consult.id} onDraft={(draft) => setNotes((n) => (n ? `${n}\n${draft}` : draft))} />
      <div style={{ marginBottom: 14 }} />

      <div className="dr-rx-section">
        <div className="row between wrap mb-1">
          <h4 className="mb-0 row" style={{ gap: 8 }}><Pill size={17} />Medicines</h4>
          {checking && <span className="tiny muted row" style={{ gap: 6 }}><span className="spinner sm" />Checking allergies & interactions…</span>}
          {!checking && rows.some((r) => r.drug) && !warnings.length && <span className="badge green"><ShieldCheck />No allergy or interaction found</span>}
        </div>
        <DrugSearch onPick={addDrug} onAddNew={(name) => setNewMed(blankMed(name))} />
        <RxTemplateTools form={tplForm} onApply={applyRxTemplate} onAddItems={addItems} />

        {allergyHits.map((w) => (
          <div key={w.msg} className="callout rose mt-1 dr-warn"><ShieldAlert /><div><strong>Allergy alert.</strong> {w.msg}{/penicillin/i.test(w.msg) ? ' Consider a non-penicillin alternative such as Azithromycin.' : ''}</div></div>
        ))}
        {otherWarn.map((w) => (
          <div key={w.msg} className="callout mt-1 dr-warn"><AlertTriangle /><div><strong>Interaction.</strong> {w.msg}</div></div>
        ))}

        {rows.length === 0 ? (
          <p className="small muted mt-2 mb-0">Search above to add a medicine. Stock in pharmacies near the patient shows next to each one.</p>
        ) : (
          <div className="dr-rx-rows">
            <div className="dr-rx-row head"><span>Medicine</span><span>Dose</span><span>How often</span><span>Days</span><span /></div>
            {rows.map((r) => {
              const flagged = allergyHits.some((w) => w.msg.includes(`"${r.drug}"`));
              return (
                <div key={r.key} className={cx('dr-rx-row', activeKey === r.key && 'active', flagged && 'flagged')} onFocus={() => setActiveKey(r.key)} onClick={() => setActiveKey(r.key)}>
                  <div className="dr-rx-drug">
                    <strong className="small" translate="no">{r.drug}</strong>
                    <StockBadge qty={r.stock} tier={r.tier} />
                  </div>
                  <input className="input sm" value={r.dose} onChange={(e) => update(r.key, { dose: e.target.value })} aria-label="Dose" />
                  <input className="input sm" value={r.freq} onChange={(e) => update(r.key, { freq: e.target.value })} aria-label="Frequency" />
                  <input className="input sm" type="number" min="0" value={r.days} onChange={(e) => update(r.key, { days: e.target.value })} aria-label="Days" />
                  <button type="button" className="icon-btn" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label={`Remove ${r.drug}`}><Trash2 /></button>
                  <div className="dr-rx-timing"><span className="tiny muted">Timing</span><TimingPicker size="sm" value={r.timing} onChange={(t) => setTiming(r, t)} /><label className="check tiny" title="The patient won't be offered a cheaper same-salt option for this medicine"><input type="checkbox" checked={!!r.noSub} onChange={(e) => update(r.key, { noSub: e.target.checked })} />No substitution</label></div>
                </div>
              );
            })}
            <div className="dr-templates">
              <span className="tiny muted">Dose templates{activeKey ? ` for ${rows.find((r) => r.key === activeKey)?.drug || 'selected row'}` : ''}:</span>
              {TEMPLATES.map((t) => <button key={t.label} type="button" className="chip" onClick={() => applyTemplate(t)}>{t.label}</button>)}
            </div>
          </div>
        )}
      </div>

      <Field label="Advice for the patient" hint="Printed on the slip in the patient's language" className="mt-2">
        <textarea className="textarea" rows={2} value={advice} onChange={(e) => setAdvice(e.target.value)} placeholder="Plenty of fluids, steam inhalation twice a day, come back at once if breathing gets worse…" />
      </Field>
      <Field label="What to do — and what not to do" hint="Shown to the patient with the medicines and printed on the prescription.">
        <DosDonts dos={dos} donts={donts} onDos={setDos} onDonts={setDonts} />
      </Field>

      <div className="grid two dr-rx-section">
        <div>
          <h4 className="row mb-1" style={{ gap: 8 }}><FlaskConical size={17} />Order lab tests</h4>
          <div className="dr-labs">
            {LAB_TESTS.map((t) => (
              <label key={t.code} className={cx('dr-lab-opt', labs.some((l) => l.code === t.code) && 'on')}>
                <input type="checkbox" checked={labs.some((l) => l.code === t.code)} onChange={() => toggleLab(t)} />
                <span className="grow small">{t.name}</span>
                <span className="tiny muted mono">{t.code}</span>
              </label>
            ))}
          </div>
          {labs.length > 0 && (
            <div className="dr-refer-lab mt-1">
              <span className="tiny muted strong">Send these tests to</span>
              <select className="select sm" value={labId} onChange={(e) => setLabId(e.target.value)}>
                <option value="">Let the patient choose (nearest centre suggested)</option>
                {(labTargets || []).map((l) => (
                  <option key={l.id} value={l.id} disabled={l.offers < l.of}>{l.name} · {l.kind}{l.distanceKm != null ? ` · ${l.distanceKm} km` : ''}{l.offers < l.of ? ` (does ${l.offers}/${l.of})` : ''}</option>
                ))}
              </select>
              {labId && <label className="check small"><input type="checkbox" checked={shareRxWithLab} onChange={(e) => setShareRxWithLab(e.target.checked)} />Share this prescription with the centre</label>}
              <span className="tiny muted">{labId ? 'Referred by you — the centre gets the order instantly. Results come back to you and the patient.' : 'The patient sees nearby centres with prices and books the one that suits them.'}</span>
            </div>
          )}
        </div>

        <div className="stack">
          <div>
            <label className="check"><input type="checkbox" checked={referOn} onChange={(e) => setReferOn(e.target.checked)} /><Hospital size={17} /><strong>Refer to a hospital</strong></label>
            {referOn && (
              <div className="dr-refer fade-in">
                <Pills options={BED_TYPES} value={bedType} onChange={setBedType} />
                {!hospitals && <div className="row small muted mt-1"><span className="spinner sm" />Finding free beds…</div>}
                {hospitals && hospitals.length === 0 && <div className="callout small mt-1"><AlertTriangle />No {bedType} beds free right now. Try another bed type or call the district control room.</div>}
                {hospitals && hospitals.length > 0 && (
                  <div className="dr-hosp-list">
                    {hospitals.map((h) => (
                      <label key={h.id} className={cx('dr-hosp', hospitalId === h.id && 'on')}>
                        <input type="radio" name="hosp" checked={hospitalId === h.id} onChange={() => setHospitalId(h.id)} />
                        <span className="grow">
                          <span className="small" style={{ fontWeight: 600 }} translate="no">{h.name}</span>
                          <span className="tiny muted" style={{ display: 'block' }}>{h.district}, {h.state}</span>
                        </span>
                        <span className="badge green"><BedDouble />{h.free} free</span>
                      </label>
                    ))}
                  </div>
                )}
                <input className="input sm mt-1" value={referReason} onChange={(e) => setReferReason(e.target.value)} placeholder="Reason for referral (shared with the hospital)" />
              </div>
            )}
          </div>
          <div>
            <h4 className="row mb-1" style={{ gap: 8 }}><CalendarClock size={17} />Follow-up</h4>
            <div className="chip-select">
              {[0, 3, 7, 14, 30].map((n) => <button key={n} type="button" className={cx('chip', followUp === n && 'on')} onClick={() => setFollowUp(n)}>{n ? `${n} days` : 'Not needed'}</button>)}
            </div>
          </div>
        </div>
      </div>

      <div className="dr-sign">
        <label className="check">
          <input type="checkbox" checked={signed} onChange={(e) => setSigned(e.target.checked)} />
          <PenLine size={17} />
          <span>I confirm I have examined this patient by teleconsultation and this prescription is clinically appropriate. Sign as <strong translate="no">{consult.doctorName}</strong>.</span>
        </label>
        <div className="row wrap" style={{ gap: 10 }}>
          {consult.status !== 'in_progress' && <span className="tiny muted">Start the consult to sign.</span>}
          {allergyHits.length > 0 && signed && <span className="tiny" style={{ color: 'var(--rose)' }}>Signing with an allergy alert — please be sure.</span>}
          <Button size="lg" icon={CheckCircle2} disabled={!canSubmit} loading={busy === 'complete'} onClick={complete}>Sign & complete consult</Button>
        </div>
      </div>
      <Modal open={!!newMed} onClose={() => setNewMed(null)} title="Add a new medicine" subtitle="Set its dose and timing once — it fills in automatically next time." wide
        footer={<><label className="check small grow"><input type="checkbox" checked={saveToList} onChange={(e) => setSaveToList(e.target.checked)} />Also save to my medicines</label><Button variant="ghost" onClick={() => setNewMed(null)}>Cancel</Button><Button icon={Plus} disabled={!newMed || newMed.name.trim().length < 2 || (!newMed.sos && !Object.values(newMed.timing).some(Boolean))} onClick={addNewMedicine}>Add to prescription</Button></>}>
        {newMed && <MedicineForm value={newMed} onChange={setNewMed} />}
      </Modal>
    </Card>
  );
}

function AmbientScribe({ consultId, onDraft }) {
  const [run, busy] = useAction();
  const draftIt = () => run('scribe', async () => {
    const r = await api.post(`/consults/${consultId}/scribe`, {});
    onDraft(r.draft);
  }, 'Draft note added — edit and sign before saving');
  return (
    <div className="dr-scribe">
      <div className="row" style={{ gap: 8 }}>
        <Sparkles size={16} className="dr-scribe-ic" />
        <span className="small"><strong>Note starter</strong> — fill a SOAP outline from the triage and vitals, then complete it yourself.</span>
      </div>
      <Button size="sm" variant="secondary" loading={busy === 'scribe'} onClick={draftIt}>Draft note</Button>
    </div>
  );
}
