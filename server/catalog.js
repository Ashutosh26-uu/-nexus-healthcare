// Price & logistics catalogue for medicines and lab tests.
// MRPs are indicative Indian retail prices (₹ per unit) for the POC; each pharmacy / lab applies its
// own price factor (e.g. Jan Aushadhi generics are far cheaper). Replace with live partner price
// feeds in production.

const DRUG_PRICES = {
  'Paracetamol 500mg': { unit: 'tablet', mrp: 1.2 },
  'Paracetamol 650mg': { unit: 'tablet', mrp: 2.0 },
  'Metformin 500mg': { unit: 'tablet', mrp: 1.8 },
  'Amlodipine 5mg': { unit: 'tablet', mrp: 2.5 },
  'Telmisartan 40mg': { unit: 'tablet', mrp: 6.5 },
  'Azithromycin 500mg': { unit: 'tablet', mrp: 24 },
  'Amoxicillin 500mg': { unit: 'capsule', mrp: 7 },
  'Amoxicillin-Clavulanate 625mg': { unit: 'tablet', mrp: 19 },
  'Cetirizine 10mg': { unit: 'tablet', mrp: 1.9 },
  'Pantoprazole 40mg': { unit: 'tablet', mrp: 8 },
  'ORS sachet': { unit: 'sachet', mrp: 21 },
  'Zinc 20mg': { unit: 'tablet', mrp: 3 },
  'Salbutamol inhaler 100mcg': { unit: 'inhaler', mrp: 160, pack: true },
  'Budesonide inhaler 200mcg': { unit: 'inhaler', mrp: 410, pack: true },
  'Ibuprofen 400mg': { unit: 'tablet', mrp: 1.6 },
  'Insulin Glargine 100IU/ml': { unit: 'pen', mrp: 690, pack: true },
  'Atorvastatin 10mg': { unit: 'tablet', mrp: 5.5 },
  'Glimepiride 1mg': { unit: 'tablet', mrp: 4 },
  'Doxycycline 100mg': { unit: 'capsule', mrp: 6 },
  'Vitamin B12 1500mcg': { unit: 'tablet', mrp: 9 },
  'Artemether-Lumefantrine': { unit: 'course', mrp: 120, pack: true },
  'Clopidogrel 75mg': { unit: 'tablet', mrp: 7.5 },
  'Dengue NS1 rapid kit': { unit: 'kit', mrp: 450, pack: true },
  'Platelet count kit': { unit: 'kit', mrp: 300, pack: true },
};

// LOINC-coded tests: sample, preparation, report turnaround and base price.
const TESTS = {
  '58410-2': { name: 'Complete Blood Count (CBC)', sample: 'Blood (2 ml, EDTA)', prep: 'No fasting needed', tatHours: 6, base: 300 },
  '7905-3': { name: 'Dengue NS1 Antigen', sample: 'Blood (serum)', prep: 'No fasting needed', tatHours: 4, base: 600 },
  '4548-4': { name: 'HbA1c', sample: 'Blood (2 ml, EDTA)', prep: 'No fasting needed', tatHours: 12, base: 450 },
  '2093-3': { name: 'Lipid profile', sample: 'Blood (serum)', prep: '10–12 hours fasting', tatHours: 12, base: 550 },
  '1558-6': { name: 'Fasting Blood Sugar', sample: 'Blood (fluoride)', prep: '8–10 hours fasting', tatHours: 3, base: 80 },
  '70569-9': { name: 'Malaria antigen', sample: 'Blood (finger-prick)', prep: 'No fasting needed', tatHours: 2, base: 350 },
  '5762-1': { name: 'Widal (typhoid)', sample: 'Blood (serum)', prep: 'No fasting needed', tatHours: 8, base: 250 },
  // Imaging & cardiac diagnostics (done at diagnostic centres)
  '36643-5': { name: 'Chest X-ray (PA view)', sample: 'Imaging — no sample', prep: 'Remove metal jewellery', tatHours: 2, base: 350, imaging: true },
  '24558-9': { name: 'Ultrasound — whole abdomen', sample: 'Imaging — no sample', prep: '6 hours fasting, full bladder', tatHours: 3, base: 900, imaging: true },
  '11524-6': { name: 'ECG (12-lead)', sample: 'Recording — no sample', prep: 'No preparation', tatHours: 1, base: 200, imaging: true },
};

const round = (n) => Math.round(n);
const nameOfTest = (code, fallback) => TESTS[code]?.name || fallback || code;

// How many units does this prescription line need? "1-0-1 × 5 days" → 10 tablets.
function unitsFor(item) {
  const p = priceOf(item.drug);
  if (p?.pack) return 1;
  const days = Math.max(1, Number(item.days) || 1);
  const m = String(item.freq || '').match(/(\d)-(\d)-(\d)(?:-(\d))?/);
  if (m) return Math.max(1, m.slice(1).filter(Boolean).reduce((s, x) => s + Number(x), 0) * days);
  if (/sos|when needed/i.test(item.freq || '')) return Math.min(10, days * 2);
  const f = String(item.freq || '').toLowerCase();
  if (/thrice|three times|1-1-1/.test(f)) return days * 3;
  if (/twice|two times|bd\b/.test(f)) return days * 2;
  if (/sachet|sip/i.test(`${item.drug} ${item.freq}`)) return days * 2;
  return days;
}

// Loose match so "Cetirizine 10 mg" (doctor's own list) still finds "Cetirizine 10mg".
// Normalised keys are computed once and lookups memoised: this runs several times per line item on every
// order/quote request, and used to re-normalise all 24 names on each call.
const PRICE_INDEX = Object.keys(DRUG_PRICES).map((k) => { const n = k.toLowerCase().replace(/\s+/g, ''); return { k, n, letters: n.replace(/\d.*$/, ''), strength: n.replace(/^\D+/, '') }; });
const priceCache = new Map();
function basePriceOf(drug = '') {
  const key = String(drug).toLowerCase().replace(/\s+/g, '');
  const e = PRICE_INDEX.find((x) => x.n === key) || PRICE_INDEX.find((x) => key.startsWith(x.letters) && x.strength === key.replace(/^\D+/, ''));
  return e ? { name: e.k, ...DRUG_PRICES[e.k] } : null;
}
// A brand or Jan Aushadhi name resolves to its generic (for stock matching) at its own indicative price.
function priceOf(drug = '') {
  const key = String(drug).toLowerCase().replace(/\s+/g, '');
  if (priceCache.has(key)) return priceCache.get(key);
  const a = ALIASES.get(key);
  const base = a ? { name: a.key, ...DRUG_PRICES[a.key], mrp: a.mrp } : basePriceOf(drug);
  const hit = base ? Object.freeze(base) : null; // shared between callers — read-only
  if (priceCache.size > 2000) priceCache.clear(); // bounded: keys come from user-typed drug names
  priceCache.set(key, hit);
  return hit;
}

// ---- generic substitutes ----
// Same salt AND same strength only (a brand is listed here only when its composition and strength match the
// generic exactly — combination products such as "Crocin Pain Relief" (+ caffeine) are deliberately left out).
// Prices are INDICATIVE ₹ per unit for the POC, not live MRPs. `ja` = Jan Aushadhi (PMBJP) indicative price.
// `gst` = GST % where it isn't the 12% default for medicines. `noSwap` blocks switching outright.
const SALTS = {
  'Paracetamol 500mg': { salt: 'Paracetamol', strength: '500 mg', brands: [['Crocin 500', 2.0], ['Calpol 500', 1.5]], ja: 0.6 },
  'Paracetamol 650mg': { salt: 'Paracetamol', strength: '650 mg', brands: [['Dolo 650', 2.1], ['Calpol 650', 2.0]], ja: 0.8 },
  'Metformin 500mg': { salt: 'Metformin hydrochloride', strength: '500 mg', brands: [['Glycomet 500', 2.2]], ja: 0.5 },
  'Amlodipine 5mg': { salt: 'Amlodipine', strength: '5 mg', brands: [['Amlong 5', 3.4], ['Amlokind 5', 2.2]], ja: 0.4 },
  'Telmisartan 40mg': { salt: 'Telmisartan', strength: '40 mg', brands: [['Telma 40', 8], ['Telmikind 40', 5.5]], ja: 1.2 },
  'Azithromycin 500mg': { salt: 'Azithromycin', strength: '500 mg', brands: [['Azithral 500', 23.8], ['Azee 500', 24]], ja: 7 },
  'Amoxicillin 500mg': { salt: 'Amoxicillin', strength: '500 mg', brands: [['Novamox 500', 7.5], ['Mox 500', 8]], ja: 2.5 },
  'Amoxicillin-Clavulanate 625mg': { salt: 'Amoxicillin 500 mg + Clavulanic acid 125 mg', strength: '625 mg', brands: [['Augmentin 625 Duo', 22.5], ['Clavam 625', 20]], ja: 8 },
  'Cetirizine 10mg': { salt: 'Cetirizine', strength: '10 mg', brands: [['Okacet 10', 1.8], ['Cetzine 10', 2.0]], ja: 0.3 },
  'Pantoprazole 40mg': { salt: 'Pantoprazole', strength: '40 mg', brands: [['Pan 40', 10.3], ['Pantocid 40', 13]], ja: 1.0 },
  'Ibuprofen 400mg': { salt: 'Ibuprofen', strength: '400 mg', brands: [['Brufen 400', 1.3]], ja: 0.6 },
  'Atorvastatin 10mg': { salt: 'Atorvastatin', strength: '10 mg', brands: [['Atorva 10', 9], ['Lipitor 10', 14]], ja: 1.0 },
  'Glimepiride 1mg': { salt: 'Glimepiride', strength: '1 mg', brands: [['Amaryl 1', 8]], ja: 1.0 },
  'Clopidogrel 75mg': { salt: 'Clopidogrel', strength: '75 mg', brands: [['Clopilet 75', 6.5], ['Plavix 75', 17]], ja: 1.5 },
  'Salbutamol inhaler 100mcg': { salt: 'Salbutamol', strength: '100 mcg/puff', brands: [['Asthalin inhaler 100mcg', 150]], ja: 75 },
  'Budesonide inhaler 200mcg': { salt: 'Budesonide', strength: '200 mcg/puff', brands: [['Budecort 200 inhaler', 420]], ja: null },
  // Biologics are not interchangeable at the counter — the doctor decides.
  'Insulin Glargine 100IU/ml': { salt: 'Insulin glargine', strength: '100 IU/ml', brands: [['Lantus', 690], ['Basalog', 520]], ja: null, gst: 5, noSwap: 'Insulin brands are not switched at the counter — ask your doctor.' },
};
const JA_SUFFIX = ' (Jan Aushadhi)';
const nk = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');
// Every brand / Jan Aushadhi name → its generic key and its own indicative price.
const ALIASES = new Map();
for (const [key, s] of Object.entries(SALTS)) {
  for (const [brand, mrp] of s.brands) ALIASES.set(nk(brand), { key, mrp, type: 'brand', drug: brand });
  if (s.ja) ALIASES.set(nk(key + JA_SUFFIX), { key, mrp: s.ja, type: 'jan_aushadhi', drug: key + JA_SUFFIX });
}
// Generic key for any name we know (generic, brand or Jan Aushadhi), else null.
function genericKeyOf(drug) {
  const a = ALIASES.get(nk(drug));
  if (a) return a.key;
  const p = basePriceOf(drug);
  return p && SALTS[p.name] ? p.name : null;
}
// { salt, strength, current, options[], noSwap } — options are every other same-salt-same-strength product,
// cheapest first, with the per-unit saving against what was asked for (negative = dearer).
function substitutesFor(drug) {
  const key = genericKeyOf(drug);
  if (!key) return { salt: null, strength: null, current: null, options: [] };
  const s = SALTS[key];
  const all = [{ drug: key, type: 'generic', price: DRUG_PRICES[key].mrp }, ...s.brands.map(([b, mrp]) => ({ drug: b, type: 'brand', price: mrp })), ...(s.ja ? [{ drug: key + JA_SUFFIX, type: 'jan_aushadhi', price: s.ja }] : [])];
  const cur = all.find((o) => nk(o.drug) === nk(drug)) || all[0];
  const r2 = (n) => Math.round(n * 100) / 100;
  return {
    salt: s.salt, strength: s.strength, unit: DRUG_PRICES[key].unit, indicative: true, noSwap: s.noSwap || null,
    current: { drug: cur.drug, type: cur.type, price: cur.price },
    options: all.filter((o) => o !== cur).map((o) => ({ ...o, saving: r2(cur.price - o.price) })).sort((a, b) => a.price - b.price),
  };
}
const sameSalt = (a, b) => { const k = genericKeyOf(a); return !!k && k === genericKeyOf(b); };
const gstOf = (drug) => { const k = genericKeyOf(drug); return k && SALTS[k].gst ? { rate: SALTS[k].gst, indicative: false } : { rate: 12, indicative: true }; };

// Plain-language suggestions for a report, so the patient understands it before the doctor calls.
// Rule-based and conservative: it explains and advises next steps, it never diagnoses.
const ADVICE = [
  { re: /hba1c/i, high: 'Your average blood sugar over the last 3 months is above target. Cut down on sugar, sweets and refined flour (maida), walk 30 minutes a day — your doctor may adjust your diabetes medicines.' },
  { re: /glucose|sugar|fbs|ppbs/i, high: 'Blood sugar is higher than normal. Avoid sweets and sugary drinks, take medicines on time, and recheck as your doctor advises.', low: 'Blood sugar is low. Eat something with sugar now (juice, glucose, a sweet) and tell your doctor — your medicine dose may need changing.' },
  { re: /ldl|cholesterol|triglycer/i, high: 'Cholesterol is above the healthy range. Less fried food, ghee and red meat; more fibre, fruit and daily walking. Usually rechecked in about 3 months.' },
  { re: /h(a)?emoglobin|\bhb\b/i, low: 'Haemoglobin is low (possible anaemia). Eat iron-rich food — green leafy vegetables, jaggery, pulses, dates — your doctor may prescribe iron tablets.' },
  { re: /platelet/i, low: 'Platelets are low. Drink plenty of fluids, avoid painkillers like ibuprofen/aspirin, and watch for bleeding gums, nose bleeds or rashes — follow up within 24–48 hours.' },
  { re: /wbc|white blood|leucocyte|tlc/i, high: 'White blood cells are raised, which often points to an infection. Your doctor will decide whether you need treatment.', low: 'White blood cells are low — avoid crowded places and tell your doctor if you get a fever.' },
  { re: /dengue|ns1/i, positive: 'The dengue test is positive. Rest, drink lots of fluids (ORS, coconut water), take only paracetamol for fever, and go to hospital at once if you have severe stomach pain, vomiting, bleeding or feel very weak.' },
  { re: /malaria/i, positive: 'The malaria test is positive. Start the treatment your doctor prescribes today and complete the full course.' },
  { re: /widal|typhoid/i, positive: 'The typhoid test is positive. Take the antibiotics exactly as prescribed, drink boiled water and eat light, freshly cooked food.' },
  { re: /creatinine|urea/i, high: 'Kidney markers are raised. Drink water as advised and avoid painkillers without asking your doctor — they will review this.' },
  { re: /tsh|thyroid/i, high: 'TSH is high (thyroid may be underactive). Your doctor may start or adjust thyroid medicine.', low: 'TSH is low (thyroid may be overactive). Your doctor will review this with you.' },
];

function interpret(results = []) {
  const out = [];
  for (const r of results) {
    const flag = String(r.flag || '').toLowerCase();
    if (!flag || flag === 'normal' || flag === 'negative') continue;
    if (flag === 'critical') { out.push({ level: 'urgent', test: r.name, text: `${r.name} (${r.value} ${r.unit || ''}) needs urgent attention. Your doctor has been alerted — if you feel unwell, go to the nearest emergency or call 108.` }); continue; }
    const rule = ADVICE.find((a) => a.re.test(r.name));
    // Lab techs type the flag themselves ("abnormal", "borderline"…) — only high/low take the "-er" form.
    const how = flag === 'positive' ? 'positive' : flag === 'high' || flag === 'low' ? `${flag}er than the normal range` : 'outside the normal range';
    const text = rule?.[flag] || `${r.name} is ${how} (${r.value} ${r.unit || ''}). Your doctor will review it and tell you if anything needs to change.`;
    out.push({ level: flag === 'positive' ? 'attention' : 'watch', test: r.name, text });
  }
  if (!out.length && results.length) out.push({ level: 'ok', test: null, text: 'All your results are within the normal range. Keep up your current routine and follow your doctor’s advice.' });
  return out;
}

// "What to do next" after a report — concrete steps, most urgent first. Specialist by the test that's off.
const SPECIALIST_FOR = [
  { re: /hba1c|glucose|sugar|tsh|thyroid|t3|t4/i, dept: 'Endocrinology', why: 'sugar / thyroid levels' },
  { re: /cholesterol|ldl|hdl|triglycer|lipid|troponin|ecg/i, dept: 'Cardiology', why: 'heart health' },
  { re: /creatinine|urea|egfr|kidney|urine/i, dept: 'Nephrology', why: 'kidney function' },
  { re: /sgot|sgpt|alt|ast|bilirubin|liver/i, dept: 'Gastroenterology', why: 'liver function' },
  { re: /x-?ray|chest|sputum/i, dept: 'Pulmonology', why: 'lungs and chest' },
];
function nextSteps(results = [], { doctorName } = {}) {
  const off = results.filter((r) => r.flag && !['normal', 'negative'].includes(String(r.flag).toLowerCase()));
  const steps = [];
  if (off.some((r) => String(r.flag).toLowerCase() === 'critical' || /dengue|malaria/i.test(r.name) && String(r.flag).toLowerCase() === 'positive')) {
    steps.push({ kind: 'urgent', text: 'Some results need care today. If you feel unwell — high fever, bleeding, breathlessness, chest pain — go to the nearest emergency or call 108 now.', action: 'call108' });
  }
  if (off.length) {
    steps.push({ kind: 'followup', text: `Book a follow-up${doctorName ? ` with ${doctorName}` : ''} within a week to go over these results and adjust treatment.`, action: 'book_doctor' });
    const seen = new Set();
    for (const r of off) {
      const sp = SPECIALIST_FOR.find((x) => x.re.test(r.name));
      if (sp && !seen.has(sp.dept)) { seen.add(sp.dept); steps.push({ kind: 'specialist', text: `If it stays out of range, see ${/^[AEIOU]/i.test(sp.dept) ? 'an' : 'a'} ${sp.dept} specialist about your ${sp.why}.`, action: 'find_specialist', department: sp.dept }); }
    }
    steps.push({ kind: 'repeat', text: 'Repeat the test when your doctor advises, to see if things are improving.' });
  } else if (results.length) {
    steps.push({ kind: 'ok', text: 'All results are normal — no action needed now. Keep your routine and repeat tests only if your doctor advises.' });
  }
  return steps;
}

module.exports = { DRUG_PRICES, TESTS, unitsFor, priceOf, nameOfTest, round, interpret, nextSteps, substitutesFor, sameSalt, genericKeyOf, gstOf };
