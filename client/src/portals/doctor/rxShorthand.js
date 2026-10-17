// Prescription shorthand → a fully formed medicine line, the way doctors already write on paper:
//   "para 650 1-0-1 5d"   "amlo 5 od 30"   "pan 40 1-0-0 bf 14d"   "cetriz 10 hs 5"   "ors sos"   "metf 500 bd 1m"
// Pure module (no React, no fetch) so it is unit-tested under plain `node` and stays instant on every keystroke.
// Grammar: <drug words> [strength] [dose] [frequency] [food] [duration] — any order after the drug words.

const PATTERNS = { od: [1, 0, 0], om: [1, 0, 0], qd: [1, 0, 0], once: [1, 0, 0], bd: [1, 0, 1], bid: [1, 0, 1], twice: [1, 0, 1], tds: [1, 1, 1], tid: [1, 1, 1], thrice: [1, 1, 1], qid: [1, 1, 1, 1], qds: [1, 1, 1, 1] };
const TIMES_X = { 1: 'od', 2: 'bd', 3: 'tds', 4: 'qid' };
const FOODS = { af: 'after food', pc: 'after food', after: 'after food', bf: 'before food', ac: 'before food', before: 'before food', wf: 'with food', with: 'with food', es: 'empty stomach', empty: 'empty stomach', ef: 'empty stomach' };
const BEDTIME = new Set(['hs', 'bedtime', 'night', 'qhs']);
const SOS = new Set(['sos', 'prn']);
const CONT = new Set(['cont', 'contd', 'continue', 'ongoing', 'lt', 'longterm']);
const FILLER = new Set(['for', 'x', 'food', 'meal', 'meals', 'stomach', 'then', 'and', 'daily', 'a', 'day']);
const DOSE_UNITS = { tab: 'tablet', tabs: 'tablet', tablet: 'tablet', tablets: 'tablet', cap: 'capsule', caps: 'capsule', capsule: 'capsule', capsules: 'capsule', puff: 'puff', puffs: 'puff', sachet: 'sachet', sachets: 'sachet', ml: 'ml', drop: 'drop', drops: 'drop', gtt: 'drop', unit: 'unit', units: 'unit', iu: 'unit' };
const DAY_UNITS = { d: 1, day: 1, days: 1, w: 7, wk: 7, wks: 7, week: 7, weeks: 7, m: 30, mo: 30, mon: 30, month: 30, months: 30 };
const FOOD_TEXT = ['before food', 'after food', 'with food', 'empty stomach'];

const lc = (s) => String(s || '').toLowerCase();
const compact = (s) => lc(s).replace(/[^a-z0-9.]/g, '');
const plural = (n, unit) => (unit === 'ml' ? `${n} ml` : `${n} ${unit}${n === '½' || Number(n) === 1 ? '' : 's'}`);

/** "Paracetamol 650mg" → { base: 'paracetamol', strength: '650', unit: 'mg' } */
export function strengthOf(name) {
  const m = String(name || '').match(/(\d+(?:\.\d+)?)\s*(mg|mcg|g|iu|ml)\b/i);
  return m ? { strength: m[1], unit: m[2].toLowerCase() } : { strength: null, unit: null };
}

/** Pattern [m, a, n] or [m, a, e, n] → "1-0-1" (evening shown only in the 4-slot form, like medTiming). */
export const patternText = (p) => p.join('-');
export const timingOf = (p) => (p.length === 4 ? { morning: p[0], afternoon: p[1], evening: p[2], night: p[3] } : { morning: p[0], afternoon: p[1], evening: 0, night: p[2] });
export const foodOf = (freq = '') => FOOD_TEXT.find((f) => lc(freq).includes(f)) || (/bedtime|any time|sos|when needed/i.test(freq) ? 'any time' : null);
export function parsePattern(freq = '') {
  const m = String(freq).match(/^\s*(\d)-(\d)-(\d)(?:-(\d))?/);
  return m ? m.slice(1).filter((x) => x !== undefined).map(Number) : null;
}

/* ---------- 1. tokenise ---------- */
function tokenize(text) {
  const t = lc(text)
    .replace(/×/g, 'x').replace(/½/g, '1/2')
    .replace(/\b([abph])\.([cs])\.?/g, '$1$2') // "a.c." / "h.s." → "ac" / "hs"
    .replace(/(\d)\s*-\s*(?=\d)/g, '$1-') // "1 - 0 - 1" → "1-0-1"
    .replace(/\bx\s+(\d)\b/g, 'x$1') // "x 3" → "x3"
    // "650 mg", "5 days", "2 tabs" → one token
    .replace(/(\d)\s+(mg|mcg|g|iu|ml|d|days?|w|wks?|weeks?|mo|mon|months?|tabs?|tablets?|caps?|capsules?|puffs?|sachets?|drops?|units?)\b/g, '$1$2')
    .trim();
  const tokens = t.split(/[\s,;]+/).filter(Boolean);
  // "para650" — drug glued to its strength
  if (tokens[0]) { const g = tokens[0].match(/^([a-z][a-z-]*?)(\d+(?:\.\d+)?)(mg|mcg|g|iu)?$/); if (g && g[1].length >= 2) tokens.splice(0, 1, g[1], g[2] + (g[3] || '')); }
  return tokens;
}

/** Classify one token. Bare numbers stay 'num' — strength vs days is decided once we know the drug. */
function classify(tok) {
  let m;
  if ((m = tok.match(/^(\d)-(\d)-(\d)(?:-(\d))?$/))) return { kind: 'freq', pattern: m.slice(1).filter((x) => x !== undefined).map(Number) };
  if (PATTERNS[tok]) return { kind: 'freq', pattern: PATTERNS[tok], word: tok };
  if ((m = tok.match(/^x([1-4])$|^([1-4])x$/))) return { kind: 'freq', pattern: PATTERNS[TIMES_X[m[1] || m[2]]], word: tok };
  if (BEDTIME.has(tok)) return { kind: 'freq', pattern: [0, 0, 1], hs: true };
  if (SOS.has(tok)) return { kind: 'freq', sos: true };
  if (tok === 'stat') return { kind: 'freq', stat: true };
  if (FOODS[tok]) return { kind: 'food', food: FOODS[tok] };
  if (CONT.has(tok)) return { kind: 'cont' };
  if ((m = tok.match(/^(\d+(?:\.\d+)?)(mg|mcg|g|iu)$/))) return { kind: 'strength', strength: m[1], unit: m[2] };
  if ((m = tok.match(/^(\d+(?:\.\d+)?|1\/2)(tabs?|tablets?|caps?|capsules?|puffs?|sachets?|ml|drops?|gtt|units?)$/))) {
    const n = m[1] === '1/2' ? '½' : m[1];
    return { kind: 'dose', dose: plural(n, DOSE_UNITS[m[2]]) };
  }
  if (tok === '1/2') return { kind: 'dose', dose: '½ tablet' };
  if ((m = tok.match(/^(\d{1,3})(d|days?|w|wks?|weeks?|m|mo|mon|months?)$/))) return { kind: 'days', days: Number(m[1]) * DAY_UNITS[m[2]] };
  if (/^\d+(?:\.\d+)?$/.test(tok)) return { kind: 'num', value: tok };
  if (FILLER.has(tok)) return { kind: 'filler' };
  return { kind: 'word' };
}

/* ---------- 2. drug matching ---------- */
function lev(a, b) {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= b.length; j += 1) { const tmp = dp[j]; dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = tmp; }
  }
  return dp[b.length];
}
const isSubseq = (q, s) => { let i = 0; for (const ch of s) if (ch === q[i]) i += 1; return i === q.length; };

/** How well the typed words name this product (0 = not at all). */
function nameScore(words, target) {
  const q = words.join('');
  const s = compact(target);
  const tw = lc(target).split(/[\s\-()+]+/).filter(Boolean);
  if (!q) return 0;
  if (s.startsWith(q)) return 100;
  if (words.every((w) => tw.some((x) => x.startsWith(w)))) return 85;
  if (s.includes(q)) return 60;
  if (q.length >= 4) {
    const L = q.length;
    const d = Math.min(lev(q, s.slice(0, L - 1)), lev(q, s.slice(0, L)), lev(q, s.slice(0, L + 1)));
    if (d <= (L >= 7 ? 2 : 1)) return 50 - d * 5;
  }
  if (q.length >= 3 && q[0] === s[0] && isSubseq(q, s)) return 35;
  return 0;
}

/**
 * Index the products the doctor can pick from. Entries: { name, alias?, count? (times this doctor prescribed it), saved? }.
 * Brand aliases ("Dolo 650") resolve to their generic name, so the prescription stays generic.
 */
export function buildIndex(entries = []) {
  return entries.filter((e) => e && e.name).map((e) => ({ ...e, ...strengthOf(e.name), aliasStrength: e.alias ? strengthOf(e.alias).strength : null }));
}

export const MIN_SCORE = 35;
/** Ranked distinct products for the typed words (+ strength). The doctor's frequent and saved medicines win ties. */
export function rankDrugs(words, strength, index) {
  const best = new Map();
  for (const e of index) {
    let s = nameScore(words, e.name);
    let viaAlias = false;
    if (e.alias) { const a = nameScore(words, e.alias) * 0.95; if (a > s) { s = a; viaAlias = true; } }
    if (s < MIN_SCORE) continue;
    const raw = s;
    if (e.count) s += 20 + Math.min(e.count, 10);
    if (e.saved) s += 10;
    if (strength) s += e.strength === strength || (viaAlias && e.aliasStrength === strength) ? 40 : e.strength ? -30 : 0;
    const key = compact(e.name); // "Pantoprazole 40 mg" (saved) and "Pantoprazole 40mg" (formulary) are one product
    const prev = best.get(key);
    if (!prev || s > prev.score) best.set(key, { name: e.name, alias: viaAlias ? e.alias : null, score: s, raw, frequent: !!e.count, saved: !!e.saved, strength: e.strength, unit: e.unit });
  }
  // With a real prefix hit ("para" → Paracetamol), loose letter-order matches (Pantoprazole) are just noise.
  const top = Math.max(0, ...[...best.values()].map((m) => m.raw));
  return [...best.values()].filter((m) => top < 85 || m.raw >= 60).sort((a, b) => b.score - a.score || a.name.length - b.name.length || a.name.localeCompare(b.name)).slice(0, 6);
}

const titleCase = (words) => words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

/* ---------- 3. interpret ---------- */
/**
 * Read a shorthand line. `pick` chooses another match (Tab / ↑↓). Returns null for an empty line.
 * { drug, matches, unknown, strengthMismatch, given: { dose, pattern, hs, sos, stat, food, days, cont }, ignored }
 */
export function interpret(text, index = [], pick = 0) {
  const toks = tokenize(text).map((tok) => ({ tok, ...classify(tok) }));
  if (!toks.length) return null;
  // Drug words: the first token always, then every plain word until the first recognised token.
  let i = 0;
  const words = [];
  while (i < toks.length && (i === 0 || toks[i].kind === 'word')) { words.push(toks[i].tok.replace(/[^a-z0-9-]/g, '')); i += 1; }
  const qWords = words.map((w) => w.replace(/-/g, '')).filter(Boolean);
  if (!qWords.length) return null;
  const rest = toks.slice(i);
  const given = {};
  const ignored = [];
  let strength = null; let unit = null;
  const loose = rank0(qWords, index);
  rest.forEach((t, k) => {
    if (t.kind === 'freq') { Object.assign(given, t.sos ? { sos: true } : t.stat ? { stat: true } : { pattern: t.pattern, hs: !!t.hs }); }
    else if (t.kind === 'food') given.food = t.food;
    else if (t.kind === 'cont') given.cont = true;
    else if (t.kind === 'dose') given.dose = t.dose;
    else if (t.kind === 'days') given.days = t.days;
    else if (t.kind === 'strength') { strength = t.value || t.strength; unit = t.unit; }
    else if (t.kind === 'num') {
      // A number straight after the drug name is its strength when a matching product has it (or when it's a
      // decimal / another number or a frequency follows for an unknown drug); otherwise it's the duration in days.
      const first = k === 0 && !strength;
      const laterNum = rest.slice(k + 1).some((x) => x.kind === 'num' || x.kind === 'days');
      const laterFreq = rest.slice(k + 1).some((x) => x.kind === 'freq');
      const known = loose.some((m) => m.strength === t.value || m.aliasStrength === t.value);
      if (first && (known || t.value.includes('.') || (!loose.length && (laterNum || laterFreq)) || (loose.length && laterNum && Number(t.value) > 31))) strength = t.value;
      else if (given.days === undefined && /^\d{1,3}$/.test(t.value)) given.days = Number(t.value);
      else ignored.push(t.tok);
    } else if (t.kind === 'word') ignored.push(t.tok);
  });
  const matches = rankDrugs(qWords, strength, index);
  const chosen = matches.length ? matches[((pick % matches.length) + matches.length) % matches.length] : null;
  let drug; let strengthMismatch = false;
  if (!chosen) drug = titleCase(words) + (strength ? ` ${strength}${unit || 'mg'}` : '');
  else if (!pick && strength && chosen.strength !== strength && !(chosen.alias && strengthOf(chosen.alias).strength === strength)) {
    // "para 1000": the right drug, at a strength not on the list — keep the doctor's strength, flag it. (A product the
    // doctor picked with Tab/↑↓ is taken as it is.)
    drug = `${chosen.name.replace(/\s*\d+(?:\.\d+)?\s*(mg|mcg|g|iu|ml)\b.*$/i, '')} ${strength}${unit || chosen.unit || 'mg'}`;
    strengthMismatch = true;
  } else drug = chosen.name;
  return { drug, query: words.join(' '), strength, matches, pick: chosen ? matches.indexOf(chosen) : -1, alias: chosen?.alias || null, unknown: !chosen, strengthMismatch, given, ignored };
}
// Loose ranking (no strength) used to decide whether a bare number is a strength.
function rank0(words, index) {
  return index.filter((e) => nameScore(words, e.name) >= MIN_SCORE || (e.alias && nameScore(words, e.alias) >= MIN_SCORE));
}

/* ---------- 4. defaults ---------- */
// Sensible adult OPD starting points when the doctor has never prescribed the drug and hasn't saved it.
// Always editable — the composer shows them as filled-in suggestions, never silently signs them.
const CATALOG_DEFAULTS = [
  [/ors\b|oral rehydration/i, { dose: '1 sachet', freq: 'In 1 L water, sip through the day', days: 3, food: 'any time' }],
  [/salbutamol|levosalbutamol|asthalin/i, { dose: '2 puffs', freq: 'When breathless (SOS), max 4×/day', days: 30, food: 'any time' }],
  [/budesonide|formoterol|fluticasone/i, { dose: '2 puffs', freq: '1-0-1 · rinse mouth after', days: 30, food: 'any time' }],
  [/insulin/i, { dose: 'As advised (units)', freq: '0-0-1 before food', days: 30, food: 'before food' }],
  [/paracetamol|dolo|crocin|calpol/i, { dose: '1 tablet', freq: '1-1-1 after food', days: 3, food: 'after food' }],
  [/ibuprofen|diclofenac|aceclofenac/i, { dose: '1 tablet', freq: '1-0-1 after food', days: 3, food: 'after food' }],
  [/pantoprazole|omeprazole|rabeprazole|esomeprazole/i, { dose: '1 tablet', freq: '1-0-0 before food', days: 14, food: 'before food' }],
  [/cetirizine|levocetirizine|fexofenadine|chlorphen/i, { dose: '1 tablet', freq: '0-0-1 at bedtime', days: 5, food: 'any time' }],
  [/amoxicillin-clav|clavulan/i, { dose: '1 tablet', freq: '1-0-1 after food', days: 5, food: 'after food' }],
  [/amoxicillin/i, { dose: '1 capsule', freq: '1-1-1 after food', days: 5, food: 'after food' }],
  [/azithromycin/i, { dose: '1 tablet', freq: '1-0-0 after food', days: 3, food: 'after food' }],
  [/doxycycline/i, { dose: '1 capsule', freq: '1-0-1 after food', days: 7, food: 'after food' }],
  [/metformin/i, { dose: '1 tablet', freq: '1-0-1 after food', days: 30, food: 'after food' }],
  [/glimepiride|gliclazide/i, { dose: '1 tablet', freq: '1-0-0 before food', days: 30, food: 'before food' }],
  [/atorvastatin|rosuvastatin/i, { dose: '1 tablet', freq: '0-0-1 after food', days: 30, food: 'after food' }],
  [/amlodipine|telmisartan|losartan|aspirin|clopidogrel|vitamin b12|methylcobal/i, { dose: '1 tablet', freq: '1-0-0 after food', days: 30, food: 'after food' }],
  [/pregabalin|gabapentin/i, { dose: '1 capsule', freq: '0-0-1 at bedtime', days: 30, food: 'any time' }],
  [/ondansetron|domperidone/i, { dose: '1 tablet', freq: 'When needed (SOS), before food', days: 3, food: 'before food' }],
  [/prednisolone/i, { dose: '1 tablet', freq: '1-0-0 after food', days: 5, food: 'after food' }],
  [/zinc/i, { dose: '1 tablet', freq: '1-0-0 after food', days: 14, food: 'after food' }],
  [/cotrimoxazole/i, { dose: '1 tablet', freq: '1-0-1 after food', days: 5, food: 'after food' }],
  [/artemether/i, { dose: '4 tablets', freq: '1-0-1 after food', days: 3, food: 'after food' }],
  [/inhaler/i, { dose: '2 puffs', freq: '1-0-1', days: 30, food: 'any time' }],
  [/syrup|suspension/i, { dose: '5 ml', freq: '1-1-1 after food', days: 5, food: 'after food' }],
  [/sachet/i, { dose: '1 sachet', freq: '1-0-0 after food', days: 3, food: 'after food' }],
  [/capsule|\bcap\b/i, { dose: '1 capsule', freq: '1-0-1 after food', days: 5, food: 'after food' }],
  [/kit\b/i, { dose: '1 kit', freq: 'Once, as directed', days: 1, food: 'any time' }],
];
const GENERIC_DEFAULT = { dose: '1 tablet', freq: '1-0-1 after food', days: 5, food: 'after food' };
export function catalogDefault(name = '') {
  const hit = CATALOG_DEFAULTS.find(([re]) => re.test(name));
  return { ...(hit ? hit[1] : GENERIC_DEFAULT), source: 'catalog' };
}

/**
 * Starting values for a drug: the doctor's last use of it → their saved medicine → the catalog default.
 * `lastUse` / `saved` are maps keyed by lower-cased drug name: { dose, freq, days, food }.
 */
// Older prescriptions say "Twice daily after meals" — read them into the 1-0-1 form so timing chips and
// shorthand food overrides work on them too. Anything else is kept exactly as the doctor wrote it.
export function normalizeFreq(freq = '') {
  const f = lc(freq);
  if (parsePattern(f) || /sos|when needed|stat/.test(f)) return freq;
  const p = /thrice|three times|\btds\b/.test(f) ? '1-1-1' : /twice|two times|\bbd\b/.test(f) ? '1-0-1' : /four times|\bqid\b/.test(f) ? '1-1-1-1'
    : /once|\bod\b/.test(f) ? (/night|bedtime|evening/.test(f) ? '0-0-1' : '1-0-0') : null;
  if (!p) return freq;
  const food = /after (food|meal)/.test(f) ? 'after food' : /before (food|meal|breakfast)/.test(f) ? 'before food' : /empty stomach/.test(f) ? 'empty stomach' : /with (food|meal)/.test(f) ? 'with food' : /bedtime/.test(f) ? 'at bedtime' : '';
  return food ? `${p} ${food}` : p;
}

export function defaultsFor(name, { lastUse, saved } = {}) {
  const key = lc(name).trim();
  const l = lastUse?.get?.(key);
  if (l && l.freq) { const freq = normalizeFreq(l.freq); return { dose: l.dose || '1 tablet', freq, days: l.days || '', food: l.food || foodOf(freq) || 'after food', source: 'last' }; }
  const s = saved?.get?.(key);
  if (s && s.freq) return { ...s, source: 'saved' };
  return catalogDefault(name);
}

/* ---------- 5. line ---------- */
/**
 * A full prescription line from an interpretation + starting values (what was typed always wins).
 * Returns { drug, dose, freq, days, food, timing, unknown, strengthMismatch, filled: [fields taken from defaults], source }.
 */
export function toLine(r, defaults) {
  const def = defaults || catalogDefault(r.drug);
  const g = r.given;
  const filled = [];
  let freq; let food; let timing = null;
  const defFood = def.food || foodOf(def.freq) || 'after food';
  if (g.stat) { freq = 'Once, immediately (stat)'; food = g.food || 'any time'; }
  else if (g.sos) {
    food = g.food || (/sos|when needed|breathless/i.test(def.freq) ? defFood : 'any time');
    freq = !g.food && /sos|when needed|breathless/i.test(def.freq) ? def.freq : `When needed (SOS)${food !== 'any time' ? `, ${food}` : ''}`;
  } else if (g.pattern) {
    food = g.food || (g.hs ? 'any time' : defFood);
    timing = timingOf(g.pattern);
    freq = `${patternText(g.pattern)}${g.hs && !g.food ? ' at bedtime' : food !== 'any time' ? ` ${food}` : ''}`;
    if (!g.food && !g.hs) filled.push('food');
  } else {
    filled.push('freq');
    const p = parsePattern(def.freq);
    if (g.food && p) { food = g.food; timing = timingOf(p); freq = `${patternText(p)} ${food}`; }
    else { food = g.food || defFood; freq = def.freq; timing = p ? timingOf(p) : null; }
  }
  if (g.cont && !/continue/i.test(freq)) freq += ' · continue';
  const days = g.days !== undefined ? g.days : g.stat ? 1 : g.cont ? 30 : def.days;
  if (g.days === undefined && !g.stat && !g.cont) filled.push('days');
  const dose = g.dose || def.dose || '1 tablet';
  if (!g.dose) filled.push('dose');
  return { drug: r.drug, dose, freq, days, food, timing, unknown: r.unknown, strengthMismatch: r.strengthMismatch, filled, source: def.source || 'catalog' };
}

/** One call for the UI: text → { r, line } (or null). */
export function quickLine(text, index, ctx, pick = 0) {
  const r = interpret(text, index, pick);
  if (!r) return null;
  return { r, line: toLine(r, defaultsFor(r.drug, ctx)) };
}
