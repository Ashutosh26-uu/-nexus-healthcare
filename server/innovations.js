// Flagship USP engines (spec §11). These are the "hard to copy" features — the maths here is
// simple and transparent; the moat is the longitudinal, cross-facility network data they run on.
// None of this is medical advice; outputs are clearly framed as estimates for discussion.
const crypto = require('crypto');

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
// Unknown date of birth → null (never an assumed "40").
const ageOf = (dob) => { const t = dob ? Date.parse(dob) : NaN; return Number.isFinite(t) ? Math.floor((Date.now() - t) / (365.25 * 86400000)) : null; };

/* ─────────────────────────────────────────────────────────────
   1 ★  Swasthya Twin — a living health model per patient.
   Returns the latest known inputs, a transparent linear risk model (so the client can run
   "what-if" sliders live), 5-year projections, and plain-language drivers + tips.
   ───────────────────────────────────────────────────────────── */
function latestVitals(db, patientId) {
  const v = {};
  const consults = db.consults.filter((c) => c.patientId === patientId && c.vitals).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  for (const c of consults) {
    const cv = c.vitals || {};
    if (v.sys === undefined && cv.bp) { const [s, d] = String(cv.bp).split('/').map(Number); v.sys = s; v.dia = d; }
    for (const k of ['pulse', 'spo2', 'temp', 'weight', 'sugar']) if (v[k] === undefined && cv[k] != null) v[k] = Number(cv[k]);
  }
  // Home readings (Health tracker) fill whatever no clinic visit has measured yet, newest first.
  const home = (db.vitalsLog || []).filter((e) => e.patientId === patientId).sort((a, b) => (a.at < b.at ? 1 : -1));
  for (const e of home) {
    if (e.kind === 'bp' && v.sys === undefined) { v.sys = e.sys; v.dia = e.dia; if (v.pulse === undefined && e.pulse) v.pulse = e.pulse; }
    else if (e.kind === 'sugar' && v.sugar === undefined && e.context === 'fasting') v.sugar = e.value;
    else if (['spo2', 'temp', 'weight'].includes(e.kind) && v[e.kind] === undefined) v[e.kind] = e.value;
  }
  // Pull HbA1c / LDL from lab reports if present.
  for (const o of db.labOrders.filter((x) => x.patientId === patientId && x.results?.length)) {
    for (const r of o.results) {
      const name = String(r?.name || '').toLowerCase(); // lab techs type results — a row without a name must not 500 the twin
      if (v.hba1c === undefined && name.includes('hba1c')) v.hba1c = parseFloat(r.value);
      if (v.ldl === undefined && name.includes('ldl')) v.ldl = parseFloat(r.value);
    }
  }
  return v;
}

function twin(db, patient) {
  const age = ageOf(patient.dob);
  const v = latestVitals(db, patient.id);
  const conds = (patient.conditions || []).map((c) => c.toLowerCase());
  const has = (re) => conds.some((c) => re.test(c));
  const diabetic = has(/diabet|sugar/);
  const hyper = has(/hypertens|bp|pressure/);
  const copd = has(/copd|asthma|respir/);
  const kidney = has(/kidney|renal/);
  const heart = has(/heart|cardi|coronary/);

  // Modifiable inputs for the what-if simulator (value, healthy target, unit). Only real readings are used:
  // a number the patient has never had measured starts at the healthy target with `measured: false`, so it
  // adds nothing to the risk and the screen can say "not measured yet" instead of showing an invented reading.
  const inp = (key, label, ideal, min, max, unit, step) => {
    const real = Number.isFinite(v[key]) ? v[key] : null;
    return { label, value: real ?? ideal, measured: real !== null, ideal, min, max, unit, step };
  };
  const inputs = {
    sys: inp('sys', 'Systolic BP', 120, 90, 200, 'mmHg', 1),
    hba1c: inp('hba1c', 'HbA1c', 5.6, 4, 14, '%', 0.1),
    weight: inp('weight', 'Weight', 65, 35, 150, 'kg', 0.5),
    ldl: inp('ldl', 'LDL cholesterol', 100, 50, 250, 'mg/dL', 1),
    spo2: inp('spo2', 'Oxygen (SpO₂)', 98, 80, 100, '%', 1),
  };
  const measuredCount = Object.values(inputs).filter((x) => x.measured).length;

  // Transparent linear risk model. score = clamp(base + Σ coef·(value − ideal)·dir). The client
  // recomputes the same formula as sliders move, so the simulation is instant and honest.
  const ageF = age === null ? 0 : clamp((age - 30) * 0.9, 0, 45);
  const risks = [
    { key: 'cardio', label: 'Heart attack or stroke', horizon: 10, icon: 'heart',
      base: 6 + ageF + (heart ? 18 : 0) + (diabetic ? 8 : 0) + (hyper ? 6 : 0),
      coef: { sys: 0.35, ldl: 0.12, hba1c: 2.2, weight: 0.25 } },
    { key: 'diabetes', label: 'Diabetes complications', horizon: 5, icon: 'droplet',
      base: 4 + ageF * 0.5 + (diabetic ? 22 : 0),
      coef: { hba1c: 9, weight: 0.4, sys: 0.15 } },
    { key: 'kidney', label: 'Kidney disease', horizon: 10, icon: 'activity',
      base: 3 + ageF * 0.5 + (kidney ? 25 : 0) + (diabetic ? 7 : 0) + (hyper ? 7 : 0),
      coef: { sys: 0.3, hba1c: 3 } },
    { key: 'respiratory', label: 'Severe breathing episode', horizon: 2, icon: 'wind',
      base: 5 + (copd ? 26 : 0) + ageF * 0.3,
      coef: { spo2: -3.0, weight: 0.1 } },
  ].map((r) => {
    const score = clamp(r.base + Object.entries(r.coef).reduce((s, [k, c]) => s + c * (inputs[k].value - inputs[k].ideal), 0));
    const drivers = Object.entries(r.coef)
      .map(([k, c]) => ({ key: k, label: inputs[k].label, contribution: +(c * (inputs[k].value - inputs[k].ideal)).toFixed(1) }))
      .filter((d) => Math.abs(d.contribution) >= 1)
      .sort((a, b) => b.contribution - a.contribution);
    return { key: r.key, label: r.label, horizon: r.horizon, icon: r.icon, base: +r.base.toFixed(1), coef: r.coef, score: Math.round(score), band: score >= 60 ? 'high' : score >= 30 ? 'moderate' : 'low', drivers };
  });

  const overall = Math.round(risks.reduce((s, r) => s + r.score, 0) / risks.length);
  // Biological "health age" relative to chronological age — only when the date of birth is known.
  const healthAge = age === null ? null : Math.round(age + (overall - 25) * 0.35);

  const tips = [];
  if (!measuredCount) tips.push({ icon: 'activity', text: 'No BP, sugar, weight, cholesterol or oxygen readings on record yet. Add one in the Health tracker (or at your next visit) so this model can use your real numbers.' });
  if (inputs.hba1c.value > inputs.hba1c.ideal + 0.5) tips.push({ icon: 'droplet', text: `Bringing HbA1c from ${inputs.hba1c.value}% toward 6.5% could cut your diabetes-complication risk sharply — try the diet plan and daily walk.` });
  if (inputs.sys.value > 135) tips.push({ icon: 'heart', text: `Your blood pressure (${inputs.sys.value} mmHg) is a top driver of heart risk. Taking BP medicine regularly and cutting salt helps most.` });
  if (inputs.weight.value > inputs.weight.ideal + 5) tips.push({ icon: 'activity', text: `Losing ${Math.round(inputs.weight.value - inputs.weight.ideal)} kg would lower several risks at once.` });
  if (inputs.spo2.value < 95) tips.push({ icon: 'wind', text: `Low oxygen readings suggest your lungs need attention — keep your inhaler handy and avoid smoke and dust.` });
  if (!tips.length) tips.push({ icon: 'heart', text: 'Your recorded numbers look well managed. Keep up the regular check-ups to stay ahead.' });

  const dataPoints = db.consults.filter((c) => c.patientId === patient.id).length + db.labOrders.filter((o) => o.patientId === patient.id).length + db.prescriptions.filter((r) => r.patientId === patient.id).length;

  return {
    patient: { id: patient.id, name: patient.name, age },
    healthAge, overall, overallBand: overall >= 60 ? 'high' : overall >= 30 ? 'moderate' : 'low',
    inputs, risks, tips,
    dataPoints, measuredCount,
    note: 'These are estimates to discuss with your doctor — not a diagnosis. They get sharper the longer you use Sehatra.',
  };
}

/* ─────────────────────────────────────────────────────────────
   12 ★  Health Weather Forecast — pin-code disease forecast 2–3 weeks ahead by fusing
   lab positives + pharmacy sell-through + kiosk symptom reports + a seasonal/weather signal.
   ───────────────────────────────────────────────────────────── */
const DISEASES = [
  { key: 'dengue', label: 'Dengue', labRe: /dengue/i, drugs: ['ORS', 'Paracetamol', 'Platelet', 'Dengue NS1'], symptomRe: /fever|body ache|rash|platelet/i, weather: 0.8 },
  { key: 'ili', label: 'Influenza-like illness', labRe: /influenza|flu/i, drugs: ['Paracetamol', 'Cetirizine', 'Azithromycin'], symptomRe: /fever|cough|cold|throat|breath/i, weather: 0.5 },
  { key: 'gastro', label: 'Gastroenteritis', labRe: /widal|typhoid|stool/i, drugs: ['ORS', 'Zinc', 'Ondansetron', 'Cotrimoxazole'], symptomRe: /diarr|vomit|loose|stomach/i, weather: 0.6 },
];

function forecast(db, { scopeDistrict, scopeState } = {}) {
  const pins = [...new Set(db.facilities.filter((f) => f.pincode && (!scopeDistrict || f.district === scopeDistrict) && (!scopeState || f.state === scopeState)).map((f) => f.pincode))];
  const now = Date.now();
  const recent = (iso, days) => iso && now - new Date(iso) < days * 86400000;
  const pinOfPatient = new Map(db.patients.map((p) => [p.id, p.pincode])); // once, not a patient scan per consult per pin per disease
  const out = [];
  for (const pin of pins) {
    const fac = db.facilities.find((f) => f.pincode === pin) || {};
    for (const dis of DISEASES) {
      // Signal 1: lab positives in this pin over the last 14 days.
      const labPos = db.labOrders.filter((o) => o.pincode === pin && recent(o.reportedAt, 14) && o.results?.some((r) => dis.labRe.test(r.name) && (r.flag === 'positive' || /^\s*(positive|reactive|detected)\b/i.test(String(r.value))))).length;
      // Signal 2: kiosk/teleconsult symptom reports matching the disease.
      const sympt = db.consults.filter((c) => recent(c.createdAt, 14) && pinOfPatient.get(c.patientId) === pin && dis.symptomRe.test(`${c.triage?.symptoms || ''} ${c.triage?.note || ''}`)).length;
      // Signal 3: pharmacy sell-through — low stock of related drugs in this pin's pharmacies.
      const pharmas = db.facilities.filter((f) => f.type === 'pharmacy' && f.pincode === pin).map((f) => f.id);
      const lowStock = db.inventory.filter((i) => pharmas.includes(i.facilityId) && dis.drugs.some((d) => String(i.drug || '').toLowerCase().includes(d.toLowerCase())) && i.qty <= (i.safetyStock || 0) * 1.5).length;
      // Signal 4: existing confirmed/open outbreak alerts.
      const alertBoost = db.alerts.filter((a) => a.type === 'outbreak' && a.pincode === pin && dis.labRe.test(a.disease || '') && ['open', 'confirmed'].includes(a.status)).reduce((s, a) => s + (a.status === 'confirmed' ? 2 : 1) * (a.multiplier || 1), 0);
      // Season factor from the calendar month (monsoon months push dengue/gastro). There is no weather feed:
      // this only ever scales real signals — on its own it never creates a forecast.
      const month = new Date().getMonth();
      const monsoon = month >= 5 && month <= 9 ? 1 : 0.4;
      const weatherSig = dis.weather * monsoon;

      // Project 3 weeks with a growth factor driven by the signal strength; confidence from how many signals agree.
      const signalsPresent = [labPos > 0, sympt > 0, lowStock > 0, alertBoost > 0].filter(Boolean).length;
      if (!signalsPresent) continue; // no lab, kiosk, pharmacy or alert data for this pin → nothing to forecast
      const signal = labPos * 3 + sympt * 1.2 + lowStock * 2 + alertBoost * 4 + weatherSig * 3;
      if (signal < 1.5) continue;
      const current = labPos + Math.round(sympt / 2);
      const growth = 1 + Math.min(0.9, signal / 25);
      const base = Math.max(current, Math.round(signal));
      const weeks = [0, 1, 2, 3].map((w) => Math.round(base * growth ** w));
      const confidence = clamp(35 + signalsPresent * 15 + Math.min(20, signal), 0, 95) / 100;
      out.push({
        pincode: pin, district: fac.district, state: fac.state, disease: dis.label, diseaseKey: dis.key,
        current, forecast: weeks, peakWeek: weeks.indexOf(Math.max(...weeks)),
        confidence: +confidence.toFixed(2),
        level: signal >= 14 ? 'high' : signal >= 6 ? 'watch' : 'low',
        drivers: [
          { key: 'labs', label: 'Lab positives', value: labPos, strength: clamp(labPos * 25) },
          { key: 'symptoms', label: 'Kiosk symptoms', value: sympt, strength: clamp(sympt * 12) },
          { key: 'pharmacy', label: 'Pharmacy sell-through', value: lowStock, strength: clamp(lowStock * 30) },
          { key: 'weather', label: 'Season (calendar month — no weather feed)', value: monsoon > 0.8 ? 'Monsoon' : 'Off-season', strength: clamp(weatherSig * 30) },
        ],
        recommendation: dis.key === 'dengue'
          ? `Pre-position ORS, paracetamol and NS1 kits in ${fac.district}; brief doctors to test febrile patients; issue a mosquito-control advisory.`
          : dis.key === 'gastro'
            ? `Stock ORS and zinc; check local water safety; advisory on hygiene and boiled water.`
            : `Stock antipyretics and antihistamines; prepare teleconsult capacity for a fever surge.`,
      });
    }
  }
  return out.sort((a, b) => (b.level === 'high') - (a.level === 'high') || b.confidence - a.confidence || Math.max(...b.forecast) - Math.max(...a.forecast));
}

/* ─────────────────────────────────────────────────────────────
   4 ★  Consent Wallet + Data Dividend — donate anonymised data to approved research, earn
   health credits, spend them on tests/discounts. Ledger is a tamper-evident hash chain.
   STUDIES / REWARDS below are ILLUSTRATIONS (no real study, ethics approval or partner organisation):
   index.js serves them on the demo network only; a live network shows none (preview state).
   ───────────────────────────────────────────────────────────── */
const STUDIES = [
  { id: 'study_dm', title: 'Diabetes care in Tier-3 towns', org: 'AIIMS Research (ethics-approved)', data: ['anonymised vitals', 'HbA1c trends'], credits: 120, blurb: 'Help improve diabetes care for rural India. Only anonymised numbers are shared — never your name.' },
  { id: 'study_dengue', title: 'Monsoon fever early-warning', org: 'ICMR Outbreak Lab', data: ['pin-code symptoms', 'anonymised lab results'], credits: 90, blurb: 'Your anonymised fever reports help forecast dengue earlier for everyone in your area.' },
  { id: 'study_maternal', title: 'Maternal & child health', org: 'State Health University', data: ['anonymised visit history'], credits: 150, blurb: 'Support research that lowers risks for mothers and babies in your district.' },
];
const REWARDS = [
  { id: 'rw_test', title: 'Free blood sugar test', cost: 100, icon: 'droplet' },
  { id: 'rw_delivery', title: 'Free medicine delivery', cost: 60, icon: 'truck' },
  { id: 'rw_consult', title: '₹100 off a specialist consult', cost: 200, icon: 'stethoscope' },
  { id: 'rw_bp', title: 'Free BP check at any kiosk', cost: 80, icon: 'heart' },
];

function walletFor(db, patient) {
  db.wallets = db.wallets || {};
  if (!db.wallets[patient.id]) {
    // Demo network only (index.js never creates a wallet on a live network): an illustrative starting ledger.
    const w = { patientId: patient.id, credits: 0, donations: [], ledger: [] };
    addLedger(w, 'welcome', 40, 'Welcome bonus for creating your Health Passport');
    db.wallets[patient.id] = w;
  }
  return db.wallets[patient.id];
}

function addLedger(wallet, type, delta, note) {
  const prev = wallet.ledger[wallet.ledger.length - 1];
  const prevHash = prev ? prev.hash : 'GENESIS';
  const at = new Date().toISOString();
  const body = `${prevHash}|${type}|${delta}|${note}|${at}`;
  const hash = crypto.createHash('sha256').update(body).digest('hex').slice(0, 16);
  wallet.credits += delta;
  wallet.ledger.push({ type, delta, note, at, prevHash, hash });
  return wallet;
}

// Verify the hash chain hasn't been tampered with.
function verifyLedger(wallet) {
  let prevHash = 'GENESIS';
  for (const e of wallet.ledger) {
    const body = `${prevHash}|${e.type}|${e.delta}|${e.note}|${e.at}`;
    if (crypto.createHash('sha256').update(body).digest('hex').slice(0, 16) !== e.hash || e.prevHash !== prevHash) return false;
    prevHash = e.hash;
  }
  return true;
}

/* ─────────────────────────────────────────────────────────────
   2 ★  Offline Emergency Capsule — critical data encrypted into a capsule a verified doctor
   can open with a time-limited key (works offline); every open is logged on sync.
   ───────────────────────────────────────────────────────────── */
const CAPSULE_SECRET = process.env.CAPSULE_SECRET || process.env.JWT_SECRET || 'omnicare-capsule-dev';

const CAPSULE_EPOCH_MS = 1000 * 60 * 60 * 24 * 30; // keys rotate monthly
function capsuleKey(patientId, epoch = Math.floor(Date.now() / CAPSULE_EPOCH_MS)) {
  // A short, time-rotating key derived from a server secret — printed inside the QR.
  return crypto.createHmac('sha256', CAPSULE_SECRET).update(`${patientId}|${epoch}`).digest('hex').slice(0, 10).toUpperCase();
}

function buildCapsule(patient) {
  const critical = {
    id: patient.id, name: patient.name, bloodGroup: patient.bloodGroup,
    allergies: patient.allergies || [], conditions: patient.conditions || [], currentMeds: patient.currentMeds || [],
    emergencyContacts: patient.emergencyContacts || [], generatedAt: new Date().toISOString(),
  };
  const key = capsuleKey(patient.id);
  const iv = crypto.randomBytes(12);
  const dk = crypto.createHash('sha256').update(key + patient.id).digest();
  const cipher = crypto.createCipheriv('aes-256-gcm', dk, iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(critical), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const blob = Buffer.concat([iv, tag, enc]).toString('base64');
  return { capsuleId: patient.id, key, blob, qrPayload: `NEXUS-CAPSULE:${patient.id}:${key}` };
}

function openCapsule(patient, blobB64, key) {
  // The current or the previous monthly key: a capsule printed late in a month keeps opening for at least 30 days
  // (checking only the current key made one printed on day 29 fail the next day, when it was needed).
  const got = Buffer.from(String(key || ''));
  const now = Math.floor(Date.now() / CAPSULE_EPOCH_MS);
  const ok = [now, now - 1].some((e) => { const want = Buffer.from(capsuleKey(patient.id, e)); return got.length === want.length && crypto.timingSafeEqual(got, want); });
  if (!ok) return null;
  try {
    const raw = Buffer.from(blobB64, 'base64');
    const iv = raw.subarray(0, 12); const tag = raw.subarray(12, 28); const enc = raw.subarray(28);
    const dk = crypto.createHash('sha256').update(key + patient.id).digest();
    const dec = crypto.createDecipheriv('aes-256-gcm', dk, iv);
    dec.setAuthTag(tag);
    return JSON.parse(Buffer.concat([dec.update(enc), dec.final()]).toString('utf8'));
  } catch { return null; }
}

/* ─────────────────────────────────────────────────────────────
   8 ★  Kiosk Diagnostic Suite — AI screenings a kiosk can run. SIMULATED (random findings): served on the
   demo network only — index.js refuses them on a live network until real sensors + validated models exist.
   ───────────────────────────────────────────────────────────── */
const SCREENINGS = [
  { key: 'anaemia', label: 'Anaemia screen', how: 'Photo of lower eyelid & nail bed', icon: 'eye', unit: 'g/dL', org: 'Hb estimate' },
  { key: 'retinopathy', label: 'Diabetic eye screen', how: 'Retinal camera image', icon: 'scan-eye', org: 'Retinopathy grade' },
  { key: 'tb', label: 'TB cough risk', how: '10-second cough recording', icon: 'audio-lines', org: 'Cough-sound model' },
  { key: 'ecg', label: 'Heart rhythm (ECG)', how: '6-lead ECG strip', icon: 'activity', org: 'Rhythm analysis' },
  { key: 'oximetry', label: 'Blood oxygen trend', how: '30-second pulse oximetry', icon: 'heart-pulse', org: 'SpO₂ stability' },
];

function runScreening(key, patient) {
  const rnd = (a, b, d = 0) => +(a + Math.random() * (b - a)).toFixed(d);
  const diabetic = (patient?.conditions || []).some((c) => /diabet|sugar/i.test(c));
  switch (key) {
    case 'anaemia': { const hb = rnd(8.5, 14.5, 1); return band(hb, hb < 11, `Estimated haemoglobin ${hb} g/dL`, hb < 11 ? 'Likely anaemia — confirm with a blood test.' : 'No anaemia signs.', { value: hb, unit: 'g/dL' }); }
    case 'retinopathy': { const grade = diabetic ? ['None', 'Mild', 'Moderate'][Math.floor(Math.random() * 3)] : 'None'; return band(grade, grade !== 'None', `Retinopathy: ${grade}`, grade === 'None' ? 'No diabetic eye changes seen.' : 'Refer to an eye specialist.', { value: grade }); }
    case 'tb': { const risk = rnd(2, 38); return band(risk, risk > 20, `Cough-sound TB risk ${risk}%`, risk > 20 ? 'Elevated — recommend sputum test and doctor review.' : 'Low TB risk from cough.', { value: risk, unit: '%' }); }
    case 'ecg': { const ok = Math.random() > 0.25; const r = ok ? 'Normal sinus rhythm' : ['Atrial fibrillation (possible)', 'Frequent ectopics', 'Sinus tachycardia'][Math.floor(Math.random() * 3)]; return band(r, !ok, r, ok ? 'Rhythm looks normal.' : 'Abnormal rhythm — doctor should review the strip.', { value: r }); }
    case 'oximetry': { const s = rnd(90, 99); return band(s, s < 94, `SpO₂ ${s}% (steady)`, s < 94 ? 'Low oxygen — needs a doctor now.' : 'Oxygen stable.', { value: s, unit: '%' }); }
    default: return null;
  }
}
function band(value, flag, finding, advice, extra = {}) {
  return { finding, advice, flag: flag ? 'attention' : 'normal', ...extra, at: new Date().toISOString() };
}

/* ─────────────────────────────────────────────────────────────
   14 ★  Claims-ready records — auto-structure a completed visit into an NHCX-style insurance
   claim, with duplicate/fraud checks. Makes hospitals get paid faster.
   ───────────────────────────────────────────────────────────── */
// Amounts are only what Sehatra actually recorded for this visit (paid online, paid at the desk, medicine orders
// and lab bookings tied to its prescription) — never an assumed fee or a per-item guess. Nothing is sent to
// NHCX: this is a draft the hospital submits itself (`submitted: false`).
function buildClaim(db, consult) {
  const p = db.patients.find((x) => x.id === consult.patientId) || {};
  const doc = db.doctors.find((x) => x.id === consult.doctorId) || {};
  const rx = db.prescriptions.find((r) => r.consultId === consult.id);
  const money = (n) => Math.round(Number(n) * 100) / 100;
  const paidConsult = (db.payments || []).filter((x) => x.purpose === 'consult' && x.refId === consult.id && x.status === 'paid')
    .reduce((s, x) => s + Number(x.gross ?? x.amount ?? 0), 0) + (Number(consult.deskFee) || 0);
  const medOrders = rx ? (db.medOrders || []).filter((o) => o.rxId === rx.id && ['delivered', 'collected'].includes(o.status) && Number.isFinite(Number(o.total))) : [];
  const labs = rx ? db.labOrders.filter((o) => o.rxId === rx.id && o.booking?.paidAt && Number.isFinite(Number(o.booking.price))) : [];
  const mode = consult.mode === 'in_person' ? 'In-person consultation' : consult.kioskId ? 'E-Clinic teleconsultation' : 'Teleconsultation';
  const items = [
    { code: 'CONSULT', desc: `${mode} — ${doc.specialty || 'General Medicine'}`, amount: paidConsult > 0 ? money(paidConsult) : null },
    ...(medOrders.length ? [{ code: 'PHARMA', desc: `Medicines (${medOrders.length} order${medOrders.length === 1 ? '' : 's'})`, amount: money(medOrders.reduce((s, o) => s + Number(o.total), 0)) }] : []),
    ...(labs.length ? [{ code: 'LAB', desc: `Lab tests (${labs.reduce((s, o) => s + o.tests.length, 0)})`, amount: money(labs.reduce((s, o) => s + Number(o.booking.price), 0)) }] : []),
  ];
  const total = money(items.reduce((s, i) => s + (i.amount || 0), 0));
  // Fraud / quality checks.
  const checks = [];
  checks.push({ key: 'amount', label: 'Billed amount on record', pass: items.every((i) => i.amount !== null), note: items.some((i) => i.amount === null) ? 'No payment recorded on Sehatra for the consultation — add the bill before submitting' : 'Every line comes from a recorded payment' });
  const dupe = db.consults.filter((c) => c.patientId === consult.patientId && c.doctorId === consult.doctorId && c.status === 'completed' && Math.abs(new Date(c.completedAt || c.createdAt) - new Date(consult.completedAt || consult.createdAt)) < 2 * 3600000 && c.id !== consult.id).length;
  checks.push({ key: 'duplicate', label: 'Duplicate-visit check', pass: dupe === 0, note: dupe ? `${dupe} near-identical visit(s) found` : 'No duplicate billing' });
  checks.push({ key: 'diagnosis', label: 'Diagnosis coded', pass: Boolean(consult.diagnosis), note: consult.diagnosis ? `ICD-ready: ${consult.diagnosis}` : 'Missing diagnosis' });
  checks.push({ key: 'rx', label: 'Prescription linked', pass: Boolean(rx) || consult.triage?.level === 'self_care', note: rx ? 'Signed e-prescription attached' : 'No medicines (consult only)' });
  checks.push({ key: 'identity', label: 'Verified patient ID', pass: Boolean(p.abha || p.userId), note: p.abha ? 'ABHA-linked' : 'Local ID' });
  const fraudScore = Math.round((checks.filter((c) => !c.pass).length / checks.length) * 100);
  return {
    claimId: `CLM-${consult.id.slice(-6).toUpperCase()}`,
    patient: { id: p.id, name: p.name, abha: p.abha || null },
    provider: doc.name, date: consult.completedAt || consult.createdAt,
    diagnosis: consult.diagnosis || '—', items, total,
    checks, fraudScore, status: fraudScore === 0 ? 'ready' : 'review',
    draft: true, submitted: false, nhcxConnected: false,
  };
}

/* ─────────────────────────────────────────────────────────────
   5  Family Health Graph — inherited-risk view across linked family profiles.
   ───────────────────────────────────────────────────────────── */
const HEREDITARY = [
  { re: /diabet|sugar/i, name: 'Type 2 Diabetes', advice: 'First-degree relatives should check fasting sugar yearly from age 30.', screen: 'Fasting blood sugar / HbA1c' },
  { re: /hypertens|bp|pressure/i, name: 'High blood pressure', advice: 'Check BP every 6 months; cut salt early.', screen: 'Blood pressure' },
  { re: /heart|cardi|coronary/i, name: 'Heart disease', advice: 'Lipid profile and ECG screening for adult relatives.', screen: 'Lipid profile + ECG' },
  { re: /thalass|anaem|sickle/i, name: 'Thalassaemia / anaemia trait', advice: 'Carrier testing advised before marriage/pregnancy.', screen: 'Hb electrophoresis' },
  { re: /asthma|copd|respir/i, name: 'Respiratory conditions', advice: 'Avoid smoke exposure; watch children for wheeze.', screen: 'Spirometry if symptoms' },
  { re: /cancer|tumou?r/i, name: 'Cancer history', advice: 'Discuss family screening schedule with a doctor.', screen: 'Per-type screening' },
];
function familyGraph(db, guardianUserId, members) {
  const profiles = members.map((m) => {
    const full = db.patients.find((p) => p.id === m.id) || m;
    return { id: full.id, name: full.name, age: full.age ?? null, relation: m.relation || (m.self ? 'You' : 'Family'), self: m.self, conditions: full.conditions || [] };
  });
  const risks = HEREDITARY.map((h) => {
    const affected = profiles.filter((p) => (p.conditions || []).some((c) => h.re.test(c)));
    if (!affected.length) return null;
    const atRisk = profiles.filter((p) => !affected.includes(p));
    return { name: h.name, advice: h.advice, screen: h.screen, affected: affected.map((p) => ({ name: p.name, relation: p.relation })), atRisk: atRisk.map((p) => ({ name: p.name, relation: p.relation })) };
  }).filter(Boolean);
  return { profiles, risks };
}

/* ─────────────────────────────────────────────────────────────
   11  Outcome-verified doctor score — a private quality score from follow-up outcomes.
   ───────────────────────────────────────────────────────────── */
// Every metric is counted from this doctor's own records; a metric with too little data is null (the screen
// shows "not enough data yet"), and there is no score until at least MIN_SCORED visits can be judged.
// Hospital readmissions aren't recorded on Sehatra, so that metric is always null for now.
const MIN_SCORED = 5;
function doctorScore(db, doc) {
  const DAY = 86400000;
  const now = Date.now();
  const done = db.consults.filter((c) => c.doctorId === doc.id && c.status === 'completed');
  const followUps = done.filter((c) => c.followUp).length;
  // "Didn't need to come back": a first visit completed 14+ days ago with no unplanned visit (to anyone) in the 14 days after.
  const byPatient = new Map();
  for (const c of db.consults) if (c.status !== 'cancelled' && c.status !== 'expired') { if (!byPatient.has(c.patientId)) byPatient.set(c.patientId, []); byPatient.get(c.patientId).push(c); }
  const judged = done.filter((c) => !c.followUp && Date.parse(c.completedAt) <= now - 14 * DAY);
  const returned = judged.filter((c) => {
    const t = Date.parse(c.completedAt);
    return (byPatient.get(c.patientId) || []).some((x) => x.id !== c.id && !x.followUp && Date.parse(x.createdAt) > t && Date.parse(x.createdAt) <= t + 14 * DAY);
  }).length;
  const recovery = judged.length >= MIN_SCORED ? Math.round(((judged.length - returned) / judged.length) * 100) : null;
  // Medicines actually bought: prescriptions (3+ days old) dispensed/collected/delivered, or with a medicine order.
  const rxs = db.prescriptions.filter((r) => r.doctorId === doc.id && (r.items || []).length && Date.parse(r.createdAt) <= now - 3 * DAY);
  const filled = rxs.filter((r) => r.dispensedAt || r.collectedAt || r.deliveredAt || ['dispensed', 'collected', 'delivered', 'out_for_delivery'].includes(r.status)
    || (db.medOrders || []).some((o) => o.rxId === r.id && !['cancelled', 'declined', 'awaiting_payment'].includes(o.status))).length;
  const adherence = rxs.length >= MIN_SCORED ? Math.round((filled / rxs.length) * 100) : null;
  const parts = [[recovery, 0.6], [adherence, 0.4]].filter(([v]) => v !== null);
  const weight = parts.reduce((s, [, w]) => s + w, 0);
  const score = parts.length ? Math.round(parts.reduce((s, [v, w]) => s + v * w, 0) / weight) : null;
  return {
    score, band: score === null ? null : score >= 85 ? 'excellent' : score >= 70 ? 'good' : 'fair',
    metrics: [
      { key: 'recovery', label: 'Didn\'t need an unplanned visit within 14 days', value: recovery, unit: '%', good: recovery === null ? null : recovery >= 80, basedOn: judged.length },
      { key: 'readmit', label: '30-day readmission', value: null, unit: '%', good: null, invert: true, basedOn: 0, note: 'Hospital admissions aren\'t recorded on Sehatra yet.' },
      { key: 'adherence', label: 'Prescriptions filled', value: adherence, unit: '%', good: adherence === null ? null : adherence >= 80, basedOn: rxs.length },
      { key: 'followup', label: 'Follow-ups completed', value: followUps, unit: '', good: true, basedOn: done.length },
    ],
    basedOn: done.length,
    minimum: MIN_SCORED,
    note: score === null
      ? `Your score appears once at least ${MIN_SCORED} visits or prescriptions are old enough to judge. Everything here is counted from your own Sehatra records.`
      : 'A private score counted from your own Sehatra records: unplanned return visits within 14 days and whether prescriptions were filled. Hospital readmissions aren\'t tracked yet.',
  };
}

/* ─────────────────────────────────────────────────────────────
   6  Medicine Authenticity Scan — check a pack QR/batch against the supply grid + track-and-trace.
   ───────────────────────────────────────────────────────────── */
function authenticityScan(db, code) {
  const clean = String(code || '').trim().toUpperCase();
  if (!clean) return { status: 'invalid', message: 'Please scan or type the code printed on the pack.' };
  // Only Sehatra's own records are checked: batches that verified chemists / warehouses have entered into stock,
  // and batches a chemist set aside as recalled. There is no national track-and-trace connection, so an
  // unknown code is "not in our records" — never declared genuine or fake.
  const verifiedFac = new Set((db.facilities || []).filter((f) => f.verified).map((f) => f.id));
  const recalled = (db.pharmacyReturns || []).find((r) => r.reason === 'recalled' && String(r.batch || '').toUpperCase() === clean);
  if (recalled) return { status: 'recall', drug: recalled.drug, batch: recalled.batch, message: `A Sehatra chemist has set this ${recalled.drug} batch (${recalled.batch}) aside as recalled. Don't use it — return it to your pharmacy and ask for a replacement.` };
  const batch = db.inventory.find((i) => i.batch && verifiedFac.has(i.facilityId) && String(i.batch).toUpperCase() === clean);
  if (batch) {
    const expired = batch.expiry && new Date(batch.expiry) < new Date();
    return { status: expired ? 'expired' : 'genuine', drug: batch.drug, batch: batch.batch, expiry: batch.expiry || null,
      message: expired ? `This ${batch.drug} (batch ${batch.batch}) expired on ${batch.expiry}. Do not use it.` : `${batch.drug}, batch ${batch.batch}, matches stock recorded by a verified Sehatra chemist or warehouse${batch.expiry ? `. Expires ${batch.expiry}` : ''}. This checks Sehatra records only, not the national track-and-trace system.` };
  }
  return { status: 'unknown', batch: clean, message: 'This code isn\'t in Sehatra stock records. That doesn\'t mean the medicine is fake — Sehatra can\'t check national track-and-trace yet. If the pack looks damaged or different from usual, ask your pharmacist.' };
}

/* ─────────────────────────────────────────────────────────────
   13  Federated Learning network — training status across member hospitals (no data leaves site).
   ───────────────────────────────────────────────────────────── */
// Not running yet: no model is trained and no hospital sends updates, so there are no accuracies, rounds or
// sync times to show — only the real hospitals that could take part. `preview: true` = label it "Coming soon".
function federatedStatus(db) {
  const nodes = db.facilities.filter((f) => f.type === 'hospital' && f.verified)
    .map((h) => ({ id: h.id, name: h.name, district: h.district || null, status: 'not_started', rounds: 0, lastUpdate: null }));
  return {
    preview: true, running: false, models: [], nodes, totalRounds: 0,
    privacyNote: 'Planned: models would train inside each hospital and only encrypted model updates would leave — never a patient record. Federated training is not switched on yet.',
  };
}

/* 9  AI ambient scribe — draft a structured consult note from triage + vitals (doctor edits & signs). */
function scribeDraft(db, consult) {
  const p = db.patients.find((x) => x.id === consult.patientId) || {};
  const t = consult.triage || {}; const v = consult.vitals || {};
  const vit = Object.entries({ BP: v.bp, Pulse: v.pulse, 'SpO₂': v.spo2 != null ? `${v.spo2}%` : null, Temp: v.temp != null ? `${v.temp}°F` : null, Sugar: v.sugar }).filter(([, x]) => x != null).map(([k, x]) => `${k} ${x}`).join(', ');
  return {
    draft: [
      `S (subjective): ${p.name || 'Patient'}${ageOf(p.dob) !== null ? `, ${ageOf(p.dob)}y` : ''} ${p.gender || ''}. ${t.symptoms || 'Symptoms not recorded.'}${(p.conditions || []).length ? ` Known: ${p.conditions.join(', ')}.` : ''}${(p.allergies || []).length ? ` Allergies: ${p.allergies.join(', ')}.` : ''}`,
      `O (objective): ${vit || 'Vitals not captured.'} AI triage: ${(t.level || '').replace('_', ' ')}${t.score != null ? ` (score ${t.score})` : ''}.`,
      `A (assessment): [doctor to confirm] — differential based on above.`,
      `P (plan): [medicines, tests, follow-up].`,
    ].join('\n'),
    note: 'A template filled from the recorded triage and vitals (no AI model, nothing inferred). Edit and sign before saving.',
  };
}

module.exports = {
  twin, forecast, walletFor, addLedger, verifyLedger, STUDIES, REWARDS, buildCapsule, openCapsule, capsuleKey,
  SCREENINGS, runScreening, buildClaim, familyGraph, doctorScore, authenticityScan, federatedStatus, scribeDraft,
};
