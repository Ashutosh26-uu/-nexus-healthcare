const crypto = require('crypto');
const { availabilityOf } = require('./availability');
// Core AI engines — MVP versions are transparent rules (spec §6).
// None of these make a final medical decision; a doctor always reviews.

const LEVELS = {
  emergency: { label: 'Emergency', order: 0 },
  doctor_now: { label: 'See a doctor now', order: 1 },
  routine: { label: 'Routine visit', order: 2 },
  self_care: { label: 'Self-care', order: 3 },
};

const SPECIALTY_HINTS = [
  { words: ['child', 'baby', 'infant', 'my son', 'my daughter', 'kid'], specialty: 'Pediatrics' },
  { words: ['heart', 'palpitation', 'chest tightness'], specialty: 'Cardiology' },
  { words: ['rash', 'itch', 'skin', 'acne', 'pimple', 'eczema'], specialty: 'Dermatology' },
];

const MODERATE = ['fever', 'vomiting', 'diarrhoea', 'diarrhea', 'cough', 'wheez', 'dizz', 'pain', 'infection', 'swelling', 'burning urine', 'yellow', 'jaundice', 'rash', 'headache', 'sputum', 'bleeding gums'];
const MILD = ['cold', 'sneez', 'runny nose', 'sore throat', 'throat pain', 'mild', 'acidity', 'gas', 'tired', 'itch', 'dry skin'];

// Common symptom words in other languages, mapped to the English terms the rules use.
// Red flags must be caught no matter which language the patient types in.
const SYNONYMS = [
  [['सीने में दर्द', 'छाती में दर्द', 'সিনে ব্যথা', 'বুকে ব্যথা', 'நெஞ்சு வலி', 'ఛాతీ నొప్పి', 'छातीत दुखणे', 'ಎದೆ ನೋವು', 'നെഞ്ചുവേദന', 'ਛਾਤੀ ਵਿੱਚ ਦਰਦ', 'سینے میں درد', 'ألم في الصدر', 'dolor de pecho', 'douleur thoracique', 'dor no peito', 'seene me dard', 'chhati me dard'], 'chest pain'],
  [['सांस नहीं', 'साँस नहीं', 'सांस फूल', 'साँस फूल', 'শ্বাসকষ্ট', 'மூச்சுத் திணறல்', 'ఊపిరి ఆడటం లేదు', 'سانس نہیں', 'ضيق في التنفس', 'no puedo respirar', 'falta de aire', 'essoufflé', 'saans nahi', 'saans phool'], 'breathless'],
  [['बेहोश', 'অজ্ঞান', 'மயக்கம்', 'స్పృహ తప్పి', 'بے ہوش', 'فاقد الوعي', 'inconsciente', 'inconscient', 'behosh'], 'unconscious'],
  [['दौरा पड़', 'मिर्गी', 'ঝাঁকুনি', 'வலிப்பு', 'మూర్ఛ', 'convulsión', 'convulsion', 'mirgi'], 'seizure'],
  [['लकवा', 'मुंह टेढ़ा', 'लकवे', 'স্ট্রোক', 'பக்கவாதம்', 'పక్షవాతం', 'فالج', 'derrame cerebral', 'lakwa'], 'stroke'],
  [['बहुत खून', 'खून बह', 'খুব রক্ত', 'அதிக இரத்தப்போக்கு', 'نزيف', 'sangrado abundante', 'saignement abondant'], 'heavy bleeding'],
  [['खून की उल्टी', 'রক্ত বমি', 'vomitando sangre', 'khoon ki ulti'], 'vomiting blood'],
  [['आत्महत्या', 'मरना चाहता', 'मरना चाहती', 'আত্মহত্যা', 'தற்கொலை', 'ఆత్మహత్య', 'خودکشی', 'انتحار', 'suicidio', 'suicide', 'atmahatya'], 'suicidal'],
  [['सांप ने काट', 'साँप ने काट', 'সাপে কামড়', 'பாம்பு கடி', 'పాము కాటు', 'mordedura de serpiente', 'saanp'], 'snake bite'],
  [['ज़हर', 'जहर', 'বিষ', 'விஷம்', 'విషం', 'زہر', 'veneno', 'poison', 'zehar'], 'poison'],
  [['बुखार', 'জ্বর', 'காய்ச்சல்', 'జ్వరం', 'ताप', 'ಜ್ವರ', 'പനി', 'ਬੁਖਾਰ', 'بخار', 'حمى', 'fiebre', 'fièvre', 'febre', 'bukhar', 'bukhaar'], 'fever'],
  [['खांसी', 'खाँसी', 'কাশি', 'இருமல்', 'దగ్గు', 'खोकला', 'ಕೆಮ್ಮು', 'ചുമ', 'ਖੰਘ', 'کھانسی', 'سعال', 'tos', 'toux', 'khansi'], 'cough'],
  [['उल्टी', 'বমি', 'வாந்தி', 'వాంతి', 'الٹی', 'قيء', 'vómito', 'vomissement', 'ulti'], 'vomiting'],
  [['दस्त', 'पतले दस्त', 'ডায়রিয়া', 'வயிற்றுப்போக்கு', 'విరేచనాలు', 'اسہال', 'إسهال', 'diarrea', 'diarrhée', 'dast', 'loose motion'], 'diarrhoea'],
  [['सिर दर्द', 'सिरदर्द', 'মাথাব্যথা', 'தலைவலி', 'తలనొప్పి', 'سر درد', 'صداع', 'dolor de cabeza', 'mal de tête', 'sir dard'], 'headache'],
  [['पेट दर्द', 'পেট ব্যথা', 'வயிற்று வலி', 'కడుపు నొప్పి', 'پیٹ درد', 'ألم في البطن', 'dolor de estómago', 'mal au ventre', 'pet dard'], 'pain'],
  [['चक्कर', 'মাথা ঘোরা', 'தலைசுற்றல்', 'కళ్ళు తిరగడం', 'چکر', 'دوخة', 'mareo', 'vertige', 'chakkar'], 'dizz'],
  [['जुकाम', 'सर्दी', 'সর্দি', 'சளி', 'జలుబు', 'زکام', 'resfriado', 'rhume', 'zukam'], 'cold'],
  [['गले में खराश', 'गला दर्द', 'গলা ব্যথা', 'தொண்டை வலி', 'గొంతు నొప్పి', 'گلے میں درد', 'dolor de garganta', 'mal de gorge', 'gale me dard'], 'sore throat'],
  [['बच्चा', 'बच्ची', 'शिशु', 'শিশু', 'குழந்தை', 'పిల్లవాడు', 'بچہ', 'طفل', 'niño', 'enfant', 'bachcha'], 'child'],
];
function normaliseSymptoms(raw) {
  let text = String(raw || '').toLowerCase();
  const extra = [];
  for (const [words, en] of SYNONYMS) if (words.some((w) => text.includes(w.toLowerCase()))) extra.push(en);
  if (extra.length) text = `${text} ${extra.join(' ')}`;
  return text;
}

function triage({ symptoms = '', age, duration, severity, vitals = {} }, config) {
  const text = normaliseSymptoms(symptoms);
  const flags = (config?.triage?.redFlags || []).filter((f) => text.includes(f));
  const reasons = [];
  let score = 10;

  // Red flags always jump straight to Emergency — no AI judgement (spec §6.1).
  const spo2 = Number(vitals.spo2);
  const temp = Number(vitals.temp);
  const [sys, dia] = String(vitals.bp || '').split('/').map(Number);
  const pulse = Number(vitals.pulse);

  if (spo2 && spo2 < (config?.triage?.spo2Emergency || 90)) flags.push(`SpO₂ ${spo2}%`);
  if (sys >= 180 || dia >= 120) flags.push(`BP ${vitals.bp}`);
  if (pulse && (pulse > 140 || pulse < 40)) flags.push(`pulse ${pulse}`);

  let specialty = 'General Medicine';
  for (const h of SPECIALTY_HINTS) if (h.words.some((w) => text.includes(w))) specialty = h.specialty;
  // Age is optional: null/'' must mean "unknown", not 0 (Number(null) is 0, which read as a child).
  const a = age === undefined || age === null || age === '' ? NaN : Number(age);
  if (a < 14) specialty = 'Pediatrics';

  if (flags.length) {
    return {
      level: 'emergency',
      label: LEVELS.emergency.label,
      score: 95,
      specialty: specialty === 'General Medicine' ? 'Emergency' : specialty,
      redFlags: flags,
      note: `Red flag: ${flags.join(', ')}. Escalated to emergency by protocol.`,
      advice: 'Please call 108 for an ambulance now, or go to the nearest emergency department.',
    };
  }

  const moderateHits = MODERATE.filter((w) => text.includes(w));
  const mildHits = MILD.filter((w) => text.includes(w));
  score += moderateHits.length * 14 + mildHits.length * 4;
  if (moderateHits.length) reasons.push(`reported ${moderateHits.slice(0, 3).join(', ')}`);

  const sev = Number(severity) || 0;
  if (sev >= 8) { score += 25; reasons.push(`severity ${sev}/10`); }
  else if (sev >= 5) score += 12;

  const d = String(duration || '');
  if (/week|month/.test(d)) { score += 10; reasons.push(`ongoing ${d}`); }

  if (temp >= (config?.triage?.tempHigh || 102.5)) { score += 25; reasons.push(`temperature ${temp}°F`); }
  else if (temp >= 100.4) { score += 12; reasons.push(`fever ${temp}°F`); }
  if (spo2 && spo2 < 94) { score += 20; reasons.push(`SpO₂ ${spo2}%`); }
  if (sys >= 160 || dia >= 100) { score += 15; reasons.push(`BP ${vitals.bp}`); }
  if (Number(vitals.sugar) >= 300) { score += 18; reasons.push(`blood sugar ${vitals.sugar}`); }

  if (Number.isFinite(a) && (a >= 65 || a < 5)) { score += 10; reasons.push(a >= 65 ? 'older adult' : 'young child'); } // includes infants (age 0)

  score = Math.min(score, 89);
  let level = 'self_care';
  if (score >= 55) level = 'doctor_now';
  else if (score >= 28) level = 'routine';

  const adviceMap = {
    doctor_now: 'We recommend speaking to a doctor now. You can join the live queue — the average wait right now is under 10 minutes.',
    routine: 'This does not look urgent, but a doctor should take a look. Book a slot later today or tomorrow at a time that suits you.',
    self_care: 'This looks manageable at home: rest, fluids and simple care. If it gets worse or doesn\'t improve in 2–3 days, book a consult.',
  };

  return {
    level,
    label: LEVELS[level].label,
    score,
    specialty,
    redFlags: [],
    note: reasons.length ? `Triage factors: ${reasons.join('; ')}.` : 'No concerning factors reported.',
    advice: adviceMap[level],
  };
}

// 6.2 Routing — score = urgency + specialty + language − wait − distance tier.
function routeDoctor(db, { specialty, language, district, state, urgency }) {
  const w = db.aiConfig.routing;
  // Available = E-Clinic doctor switched on, or a hospital/clinic doctor inside their set hours.
  const candidates = db.doctors.filter((d) => d.verified && availabilityOf(d, { facilities: db.facilities }).available);
  const scored = candidates.map((d) => {
    const queue = db.consults.filter((c) => c.doctorId === d.id && c.status === 'queued').length;
    const tier = d.district === district ? 0 : d.state === state ? 1 : 2;
    let score = 0;
    if (urgency === 'emergency' || urgency === 'doctor_now') score += w.urgency * (queue < 3 ? 1 : 0.5);
    if (d.specialty === specialty || (specialty === 'Emergency' && d.specialty === 'General Medicine')) score += w.specialty;
    // Narrow specialists shouldn't pick up cases outside their field (e.g. a pediatrician seeing adults).
    else if (['Pediatrics', 'Dermatology'].includes(d.specialty)) score -= w.specialty * 2;
    if (language && (d.languages || []).includes(language)) score += w.language;
    score -= queue * w.waitPenalty;
    score -= tier * w.distancePenalty;
    return { doctor: d, score: Math.round(score), queue, tier, waitMin: queue * 8 + 2 };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

// 6.3 Supply grid — widen the search step by step; prefer near-expiry; respect safety stock.
function findStock(db, drug, { district, state }, qtyNeeded = 1) {
  const name = String(drug || '').toLowerCase(); // query input may be anything (array, number) — never crash
  const facById = new Map(db.facilities.map((f) => [f.id, f])); // one map per call, not a facilities scan per stock row
  const rows = db.inventory
    .filter((i) => String(i.drug || '').toLowerCase().includes(name))
    .map((i) => ({ ...i, facility: facById.get(i.facilityId) }))
    .filter((i) => i.facility && i.qty - (i.safetyStock || 0) >= qtyNeeded);

  const tierOf = (f) => (f.district === district ? (f.distanceKm !== undefined && f.distanceKm <= 5 ? 0 : 1) : f.state === state ? 2 : 3);
  const tierNames = ['within 5 km', 'in district', 'in state', 'national'];
  rows.forEach((r) => { r.tier = tierOf(r.facility); r.tierName = tierNames[r.tier]; });
  rows.sort((a, b) => a.tier - b.tier || (a.expiry < b.expiry ? -1 : 1));
  return rows;
}

const INTERACTIONS = [
  { a: 'aspirin', b: 'clopidogrel', msg: 'Aspirin + Clopidogrel: increased bleeding risk — confirm dual antiplatelet is intended.' },
  { a: 'ibuprofen', b: 'aspirin', msg: 'Ibuprofen may reduce the cardioprotective effect of aspirin.' },
  { a: 'ibuprofen', b: 'telmisartan', msg: 'NSAIDs can reduce the effect of ARBs and affect kidney function.' },
  { a: 'ibuprofen', b: 'losartan', msg: 'NSAIDs can reduce the effect of ARBs and affect kidney function.' },
  { a: 'azithromycin', b: 'ondansetron', msg: 'Both can prolong QT interval — consider ECG if cardiac history.' },
  { a: 'glimepiride', b: 'cotrimoxazole', msg: 'Cotrimoxazole may increase hypoglycaemia risk with sulfonylureas.' },
];
const ALLERGY_CLASSES = {
  penicillin: ['amoxicillin', 'ampicillin', 'penicillin', 'clavulanate'],
  'sulfa drugs': ['cotrimoxazole', 'sulfamethoxazole'],
  ibuprofen: ['ibuprofen'],
};

function checkPrescription(patient, items) {
  const warnings = [];
  // Items/allergies come straight from request bodies and profiles — tolerate a missing or non-string name.
  const drugs = (Array.isArray(items) ? items : []).map((i) => String(i?.drug || '').toLowerCase());
  for (const allergy of (patient.allergies || []).map((x) => String(x || '')).filter(Boolean)) {
    // Own keys only: an allergy typed as "constructor" must not resolve to Object.prototype and crash every check.
    const key = String(allergy || '').toLowerCase();
    const cls = (Object.prototype.hasOwnProperty.call(ALLERGY_CLASSES, key) && ALLERGY_CLASSES[key]) || [key];
    drugs.forEach((d, idx) => { if (d && cls.some((c) => d.includes(c))) warnings.push({ type: 'allergy', severity: 'high', msg: `${patient.name} is allergic to ${allergy}. "${items[idx].drug}" may cause a reaction.` }); });
  }
  const all = [...drugs, ...(patient.currentMeds || []).map((m) => String(m || '').toLowerCase())];
  for (const it of INTERACTIONS) {
    if (all.some((d) => d.includes(it.a)) && all.some((d) => d.includes(it.b)) && drugs.some((d) => d.includes(it.a) || d.includes(it.b))) {
      warnings.push({ type: 'interaction', severity: 'medium', msg: it.msg });
    }
  }
  return warnings;
}

// 6.4 Outbreak — compare last-7-day positives in a pin code with a seasonal baseline.
const NOTIFIABLE = { 'dengue': 'Dengue', 'malaria': 'Malaria', 'typhoid': 'Typhoid', 'widal': 'Typhoid', 'influenza': 'Influenza' };
function outbreakCheck(db, labOrder) {
  const positives = (labOrder.results || []).filter((r) => r.flag === 'positive');
  const created = [];
  for (const r of positives) {
    const key = Object.keys(NOTIFIABLE).find((k) => String(r.name || '').toLowerCase().includes(k));
    if (!key) continue;
    const disease = NOTIFIABLE[key];
    const existing = db.alerts.find((a) => a.type === 'outbreak' && a.disease === disease && a.pincode === labOrder.pincode && a.status !== 'dismissed' && a.status !== 'resolved');
    if (existing) {
      existing.cases = (existing.cases || 0) + 1;
      existing.multiplier = +(existing.cases / (existing.baseline || 10)).toFixed(1);
      existing.message = `${disease} positives ${existing.multiplier}× seasonal baseline in pin ${existing.pincode} over the last 7 days.`;
      continue;
    }
    // In the POC each pin code has a synthetic baseline; a fresh spike creates a low-confidence watch alert.
    const fac = db.facilities.find((f) => f.id === labOrder.labId) || {};
    const alert = {
      id: `al_${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`, type: 'outbreak', disease, district: fac.district, state: fac.state, pincode: labOrder.pincode,
      confidence: 0.52, multiplier: 1.4, cases: 1, baseline: 5, status: 'open',
      message: `New ${disease} positive reported in pin ${labOrder.pincode}. Watching for a cluster.`, createdAt: new Date().toISOString(), actions: [],
    };
    db.alerts.unshift(alert);
    created.push(alert);
  }
  return created;
}

module.exports = { LEVELS, triage, routeDoctor, findStock, checkPrescription, outbreakCheck };
