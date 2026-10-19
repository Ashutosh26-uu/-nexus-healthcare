// Ambient scribe: consultation transcript → draft SOAP note, suggested ICD-10 codes and a draft prescription.
// The doctor always edits and signs; nothing here is ever filed on its own.
//
// Two engines:
//  • rules (default) — runs on our server only, nothing leaves it. Sorts what was said into S/O/A/P, picks out
//    vitals, durations and medicines (from the drug master and the doctor's own list), and suggests codes from a
//    small, conservative symptom map. It never invents a finding that wasn't said.
//  • claude — only when SCRIBE_AI=on and ANTHROPIC_API_KEY is set (an explicit admin decision, because the
//    transcript is health data). The model gets the transcript plus age and sex — never the patient's name,
//    phone, ID or record — and must answer through a fixed schema. Any failure falls back to the rules engine.
const Anthropic = require('@anthropic-ai/sdk');

const MAX_TRANSCRIPT = 20000;

// Conservative symptom/condition → ICD-10 map. Only common primary-care terms; the doctor confirms every code.
const ICD = [
  { re: /\b(diabet\w*|sugar (is )?high|high sugar|madhumeh)\b/i, code: 'E11.9', label: 'Type 2 diabetes mellitus without complications' },
  { re: /\b(hypertension|high (bp|blood pressure)|bp (is )?high)\b/i, code: 'I10', label: 'Essential (primary) hypertension' },
  { re: /\b(fever|bukhar|pyrexia|temperature)\b/i, code: 'R50.9', label: 'Fever, unspecified' },
  { re: /\b(cough|khansi)\b/i, code: 'R05.9', label: 'Cough, unspecified' },
  { re: /\b(sore throat|throat pain|runny nose|common cold|urti|upper respiratory( tract)? infection)\b/i, code: 'J06.9', label: 'Acute upper respiratory infection, unspecified' },
  { re: /\b(headache|sir dard|migraine)\b/i, code: 'R51.9', label: 'Headache, unspecified' },
  { re: /\b(loose motion\w*|diarrh\w*|dast)\b/i, code: 'R19.7', label: 'Diarrhoea, unspecified' },
  { re: /\b(vomit\w*|nausea|ulti)\b/i, code: 'R11.2', label: 'Nausea with vomiting, unspecified' },
  { re: /\b(acidity|gastritis|heartburn|acid reflux)\b/i, code: 'K29.70', label: 'Gastritis, unspecified' },
  { re: /\b(burning (urine|urination)|uti|urine infection)\b/i, code: 'N39.0', label: 'Urinary tract infection, site not specified' },
  { re: /\bcopd\b.{0,40}\b(exacerbation|flare)\b|\b(exacerbation|flare)\b.{0,40}\bcopd\b/i, code: 'J44.1', label: 'COPD with (acute) exacerbation' },
  { re: /\b(copd|chronic obstructive)\b/i, code: 'J44.9', label: 'Chronic obstructive pulmonary disease, unspecified' },
  { re: /\basthma\b/i, code: 'J45.909', label: 'Asthma, unspecified' },
  { re: /\b(back pain|kamar dard|lower back)\b/i, code: 'M54.50', label: 'Low back pain, unspecified' },
  { re: /\b(joint pain|knee pain|arthralgia)\b/i, code: 'M25.50', label: 'Pain in unspecified joint' },
  { re: /\b(chest pain)\b/i, code: 'R07.9', label: 'Chest pain, unspecified' },
  { re: /\b(breathless\w*|shortness of breath|saans)\b/i, code: 'R06.02', label: 'Shortness of breath' },
  { re: /\b(dizz\w*|chakkar|vertigo)\b/i, code: 'R42', label: 'Dizziness and giddiness' },
  { re: /\b(rash|itch\w*|khujli)\b/i, code: 'R21', label: 'Rash and other nonspecific skin eruption' },
  { re: /\b(anaemi\w*|anemi\w*|low (hb|haemoglobin|hemoglobin))\b/i, code: 'D64.9', label: 'Anaemia, unspecified' },
  { re: /\b(thyroid|hypothyroid\w*)\b/i, code: 'E03.9', label: 'Hypothyroidism, unspecified' },
];

// Sentence buckets. A sentence goes to the first bucket whose cue it matches; anything unmatched is history (S).
const CUES = {
  P: /\b(take|tablet|capsule|syrup|prescrib\w*|start(ing)? (on|you)|continue|stop|avoid|drink|rest|test|x-?ray|scan|ultrasound|ecg|cbc|follow[- ]?up|come back|review (in|after)|refer\w*|admit\w*)\b|\d\s*(mg|mcg|ml)\b/i,
  A: /\b(looks like|likely|probably|suggest\w* of|consistent with|diagnos\w*|impression|i think (it'?s|this is)|seems (to be|like)|could be|rule out)\b/i,
  O: /\b(bp|blood pressure|pulse|heart rate|spo2|oxygen|saturation|temperature|temp|weight|sugar (is|reading)|on exam\w*|examin\w*|chest (is )?clear|tender\w*|swelling|throat (is )?(red|congested)|crepitation\w*|wheeze heard)\b/i,
};

const FREQ = [
  { re: /\b(once (a|per) day|once daily|od|ek baar|one time a day)\b/i, freq: '1-0-0' },
  { re: /\b(twice (a|per) day|twice daily|bd|bid|do baar|two times a day|morning and night)\b/i, freq: '1-0-1' },
  { re: /\b(thrice (a|per) day|three times (a|per) day|tds|tid|teen baar)\b/i, freq: '1-1-1' },
  { re: /\b(at night|bedtime|before sleep|hs|raat ko)\b/i, freq: '0-0-1' },
  { re: /\b(sos|when needed|if needed|as needed|prn)\b/i, freq: 'SOS' },
];

// Negated mentions ("no vomiting", "denies chest pain", "bukhar nahi") must not become codes.
const NEGATED = /\b(no|not|denies|denied|without|never|negative for)\s+(\w+\s+){0,2}?\w+|\b\w+(\s+\w+)?\s+(nahi|nahin)\b/gi;
const affirmed = (text) => String(text).replace(NEGATED, ' ');
const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const sentencesOf = (t) => String(t).replace(/\r/g, '').split(/(?<=[.!?।])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 2);
const ageOf = (dob) => { if (!dob) return null; const d = new Date(dob); if (Number.isNaN(d.getTime())) return null; return Math.floor((Date.now() - d.getTime()) / 31557600000); };

function vitalsFrom(text) {
  const out = {};
  const bp = text.match(/\b(?:bp|blood pressure)\D{0,12}(\d{2,3})\s*(?:\/|over|by)\s*(\d{2,3})/i) || text.match(/\b(\d{2,3})\s*\/\s*(\d{2,3})\b/);
  if (bp && +bp[1] >= 70 && +bp[1] <= 260 && +bp[2] >= 40 && +bp[2] <= 160) out.bp = `${bp[1]}/${bp[2]}`;
  const pulse = text.match(/\b(?:pulse|heart rate|hr)\D{0,10}(\d{2,3})\b/i);
  if (pulse && +pulse[1] >= 30 && +pulse[1] <= 220) out.pulse = +pulse[1];
  const spo2 = text.match(/\b(?:spo2|sp o2|oxygen(?: saturation)?|saturation|sats)\D{0,10}(\d{2,3})\s*%?/i);
  if (spo2 && +spo2[1] >= 50 && +spo2[1] <= 100) out.spo2 = +spo2[1];
  const temp = text.match(/\b(?:temperature|temp|fever of)\D{0,10}(\d{2,3}(?:\.\d)?)\s*(?:°|degrees?)?\s*([fc])?/i);
  if (temp) { const v = +temp[1]; if ((v >= 94 && v <= 108) || (v >= 34 && v <= 42)) out.temp = `${v}°${temp[2] ? temp[2].toUpperCase() : v > 50 ? 'F' : 'C'}`; }
  const sugar = text.match(/\b(?:sugar|glucose|rbs|fbs|ppbs)\D{0,12}(\d{2,3})\b/i);
  if (sugar && +sugar[1] >= 30 && +sugar[1] <= 600) out.sugar = +sugar[1];
  const weight = text.match(/\b(?:weight|weighs)\D{0,10}(\d{2,3}(?:\.\d)?)\s*(?:kg|kilo)/i);
  if (weight) out.weight = `${weight[1]} kg`;
  return out;
}

function durationFrom(text) {
  const m = text.match(/\b(?:since|for|from|past|last)\s+(\d+|one|two|three|four|five|six|seven|a|few)\s+(day|week|month|year)s?\b/i)
    || text.match(/\b(\d+)\s+(din|hafte|mahine)\b/i);
  return m ? `${m[1]} ${m[2]}${/^(1|one|a)$/i.test(m[1]) ? '' : 's'}`.replace(/dins$/, ' days').replace(/haftes$/, ' weeks').replace(/mahines$/, ' months') : '';
}

// Medicines: whole-word matches against the drug master and the doctor's saved list, with the dose, frequency
// and duration spoken in the same sentence. Longest names win, so "Paracetamol 650mg" beats "Paracetamol".
function medicinesFrom(text, drugNames) {
  const names = [...new Set(drugNames.filter(Boolean))].sort((a, b) => b.length - a.length);
  const found = [];
  const seenBase = new Set();
  for (const sentence of sentencesOf(text)) {
    const low = sentence.toLowerCase();
    for (const name of names) {
      const base = name.toLowerCase().replace(/\s*\d.*$/, '').trim();
      if (!base || base.length < 4 || seenBase.has(base)) continue;
      const re = new RegExp(`\\b${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (!re.test(low)) continue;
      const strength = sentence.match(new RegExp(`${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(\\d+(?:\\.\\d+)?)\\s*(mg|mcg|ml|g)\\b`, 'i'));
      // Prefer the catalogue entry with the spoken strength ("Paracetamol 650mg"), else the plain match.
      const exact = strength && names.find((n) => n.toLowerCase().replace(/\s+/g, '') === `${base}${strength[1]}${strength[2]}`.toLowerCase().replace(/\s+/g, ''));
      const freq = (FREQ.find((f) => f.re.test(sentence)) || {}).freq || '';
      const days = (sentence.match(/\b(?:for\s+)?(\d{1,2})\s*(?:days?|din)\b/i) || [])[1] || '';
      const food = /\b(before (food|meal)|empty stomach|khali pet)\b/i.test(sentence) ? 'before food' : /\b(after (food|meal)|khane ke baad)\b/i.test(sentence) ? 'after food' : '';
      found.push({ drug: exact || (strength ? `${name.replace(/\s*\d.*$/, '')} ${strength[1]}${strength[2]}` : name), dose: '1 tablet', freq, days, food, heard: clip(sentence, 160) });
      seenBase.add(base);
    }
  }
  return found.slice(0, 12);
}

// "Looks like a viral upper respiratory infection." → "Viral upper respiratory infection"
function tidyDx(sentence) {
  const t = clip(sentence, 160)
    .replace(/^(it\s+)?(looks like|likely|probably|seems (to be|like)|consistent with|suggestive of|i think (it'?s|this is)|could be|impression( is)?:?|diagnosis( is)?:?)\s+((a|an)\s+)?/i, '')
    .replace(/[.!?]+$/, '');
  return clip(t.charAt(0).toUpperCase() + t.slice(1), 120);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function ruleDraft({ transcript, patient = {}, consult = {}, drugNames = [] }) {
  const text = clip(transcript, MAX_TRANSCRIPT);
  const buckets = { S: [], O: [], A: [], P: [] };
  // A sentence that names a medicine is part of the plan, whatever else it says.
  const medNames = [...new Set(drugNames.map((n) => String(n || '').toLowerCase().replace(/\s*\d.*$/, '').trim()).filter((b) => b.length >= 4))]
    .map((b) => new RegExp(`\\b${escapeRe(b)}\\b`, 'i'));
  for (const s of sentencesOf(text)) {
    const key = CUES.A.test(s) ? 'A' : (CUES.P.test(s) || medNames.some((re) => re.test(s))) ? 'P' : CUES.O.test(s) ? 'O' : 'S';
    buckets[key].push(s);
  }
  const vitals = { ...vitalsFrom(text) };
  const cv = consult.vitals || {};
  for (const k of ['bp', 'pulse', 'spo2', 'temp', 'sugar']) if (vitals[k] == null && cv[k] != null) vitals[k] = cv[k];
  const vitalLine = Object.entries({ BP: vitals.bp, Pulse: vitals.pulse, 'SpO₂': vitals.spo2 != null ? `${vitals.spo2}%` : null, Temp: vitals.temp, Sugar: vitals.sugar, Weight: vitals.weight })
    .filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k} ${v}`).join(', ');
  const duration = durationFrom(text);
  const codes = [];
  const positive = affirmed(text);
  for (const c of ICD) if (c.re.test(positive) && !codes.some((x) => x.code === c.code)) codes.push({ code: c.code, label: c.label });
  // The specific code wins: "COPD with exacerbation" makes plain "COPD" redundant.
  if (codes.some((c) => c.code === 'J44.1')) {
    const plain = codes.findIndex((c) => c.code === 'J44.9');
    if (plain >= 0) codes.splice(plain, 1);
  }
  // A sentence that only read out vitals is already in the Vitals line.
  buckets.O = buckets.O.filter((s) => s.replace(/\b(bp|blood pressure|pulse|heart rate|spo2|sp o2|oxygen|saturation|sats|temperature|temp|sugar|glucose|weight|is|was|of|over|by|percent|degrees?|[fc]|kg|and)\b|[\d/.,%°]+/gi, ' ').trim().split(/\s+/).filter(Boolean).length > 2);
  const medicines = medicinesFrom(text, drugNames);
  const age = ageOf(patient.dob);
  const who = [age != null ? `${age}y` : '', patient.gender || ''].filter(Boolean).join(' ');
  const known = [(patient.conditions || []).length ? `Known: ${patient.conditions.join(', ')}.` : '', (patient.allergies || []).length ? `Allergies: ${patient.allergies.join(', ')}.` : ''].filter(Boolean).join(' ');

  const soap = {
    subjective: [who && `${who}.`, buckets.S.join(' '), duration && `Duration: ${duration}.`, known].filter(Boolean).join(' ') || (consult.triage?.symptoms ? `Triage: ${consult.triage.symptoms}` : ''),
    objective: [vitalLine && `Vitals: ${vitalLine}.`, buckets.O.join(' ')].filter(Boolean).join(' '),
    assessment: buckets.A.join(' ') || (codes.length ? `To confirm: ${codes.map((c) => c.label.toLowerCase()).slice(0, 2).join('; ')}.` : ''),
    plan: buckets.P.join(' '),
  };
  return {
    engine: 'rules',
    soap,
    diagnosis: buckets.A.length ? tidyDx(buckets.A[0]) : codes[0]?.label || '',
    codes: codes.slice(0, 5),
    medicines,
    vitals,
    note: 'Drafted on our server by rules from what was said — no AI model, nothing sent outside. Check every line, then sign.',
  };
}

let client = null;
const aiOn = () => process.env.SCRIBE_AI === 'on' && Boolean(process.env.ANTHROPIC_API_KEY);
function getClient() {
  if (!aiOn()) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const NOTE_TOOL = {
  name: 'clinical_note',
  description: 'Return the structured draft note for the doctor to review.',
  input_schema: {
    type: 'object',
    properties: {
      subjective: { type: 'string', description: 'History in the patient’s words: complaints, onset, duration, relevant negatives.' },
      objective: { type: 'string', description: 'Only findings and vitals actually stated in the transcript.' },
      assessment: { type: 'string', description: 'The doctor’s stated impression. Empty if the doctor did not state one.' },
      plan: { type: 'string', description: 'Medicines, tests, advice and follow-up exactly as the doctor said them.' },
      diagnosis: { type: 'string', description: 'Short working diagnosis as the doctor stated it, or empty.' },
      codes: { type: 'array', items: { type: 'object', properties: { code: { type: 'string' }, label: { type: 'string' } }, required: ['code', 'label'] }, description: 'ICD-10 codes supported by the transcript, at most 5.' },
      medicines: { type: 'array', items: { type: 'object', properties: { drug: { type: 'string' }, dose: { type: 'string' }, freq: { type: 'string', description: 'Pattern like 1-0-1, 1-1-1, 0-0-1, or SOS' }, days: { type: 'string' }, food: { type: 'string', enum: ['before food', 'after food', 'with food', ''] } }, required: ['drug'] } },
    },
    required: ['subjective', 'objective', 'assessment', 'plan', 'diagnosis', 'codes', 'medicines'],
  },
};

async function aiDraft({ transcript, patient = {} }) {
  const anthropic = getClient();
  if (!anthropic) return null;
  const age = ageOf(patient.dob);
  const msg = await anthropic.messages.create({
    model: process.env.SCRIBE_MODEL || 'claude-opus-5-5',
    max_tokens: 2048,
    system: 'You are a clinical scribe. Turn a doctor–patient consultation transcript (it may mix English, Hindi, Arabic or other languages) into a concise English SOAP note. Record only what was said: never add findings, diagnoses, doses or tests that are not in the transcript. If something is unclear, leave it out. The doctor will review and sign.',
    tools: [NOTE_TOOL],
    tool_choice: { type: 'tool', name: NOTE_TOOL.name },
    messages: [{ role: 'user', content: `Patient: ${[age != null ? `${age} years` : 'age not recorded', patient.gender || 'sex not recorded'].join(', ')}.\n\nTranscript:\n${clip(transcript, MAX_TRANSCRIPT)}` }],
  });
  const block = msg.content.find((b) => b.type === 'tool_use');
  if (!block) return null;
  const n = block.input || {};
  const str = (v, max) => clip(typeof v === 'string' ? v : '', max);
  return {
    engine: 'claude',
    soap: { subjective: str(n.subjective, 3000), objective: str(n.objective, 2000), assessment: str(n.assessment, 1500), plan: str(n.plan, 3000) },
    diagnosis: str(n.diagnosis, 120),
    codes: (Array.isArray(n.codes) ? n.codes : []).slice(0, 5).map((c) => ({ code: str(c?.code, 12), label: str(c?.label, 120) })).filter((c) => c.code),
    medicines: (Array.isArray(n.medicines) ? n.medicines : []).slice(0, 12).map((m) => ({ drug: str(m?.drug, 80), dose: str(m?.dose, 40) || '1 tablet', freq: str(m?.freq, 30), days: str(m?.days, 10), food: str(m?.food, 20) })).filter((m) => m.drug),
    note: 'Drafted by AI from the transcript (no name or ID was sent). Check every line, then sign.',
  };
}

async function draft(input) {
  if (aiOn()) {
    try {
      const out = await aiDraft(input);
      if (out) return out;
    } catch (e) {
      console.error('[scribe] AI draft failed, using rules:', e.message);
    }
  }
  return ruleDraft(input);
}

const soapText = (s = {}) => [['S', s.subjective], ['O', s.objective], ['A', s.assessment], ['P', s.plan]].filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n');

module.exports = { draft, ruleDraft, aiOn, soapText, MAX_TRANSCRIPT };
