// Retention features for families: the child vaccination schedule (due / overdue maths on calendar dates) and the
// home health tracker (validation, plain-language flags, BMI, doctor-facing summary). Pure functions only — routes,
// ownership checks and persistence live in index.js.
const { UIP_SCHEDULE, IAP_OPTIONAL, ADULT_VACCINES, UIP_NOTE, UIP_SOURCE } = require('./catalog');

/* ---------------- calendar dates (YYYY-MM-DD, no time zones) ---------------- */
const DAY = 86400000;
const isDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
const plusDays = (s, n) => new Date(Date.parse(`${s}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
// Months clamp to the month's last day (31 Jan + 1 month = 28/29 Feb; 29 Feb + 1 year = 28 Feb) — the way
// birthdays and "9 completed months" are counted on a vaccination card.
function plusMonths(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  const total = (m - 1) + n;
  const yy = y + Math.floor(total / 12);
  const mm = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
  return new Date(Date.UTC(yy, mm, Math.min(d, last))).toISOString().slice(0, 10);
}
function addAge(dob, [n, unit]) {
  if (unit === 'd') return plusDays(dob, n);
  if (unit === 'w') return plusDays(dob, n * 7);
  if (unit === 'm') return plusMonths(dob, n);
  return plusMonths(dob, n * 12);
}
const isChild = (dob, today) => isDay(dob) && today < addAge(dob, [18, 'y']);

/* ---------------- vaccinations ---------------- */
// A recorded dose for a schedule code. Older records have only a name (e.g. seeded "MMR"); those stay under
// "other vaccinations" rather than being guessed into a UIP slot.
const givenFor = (p, code) => (p.vaccinations || []).find((v) => v.code === code);

// One dose's state on `today`: given | missed | overdue | due | upcoming.
function doseStatus(dob, dose, today, given) {
  const dueOn = addAge(dob, dose.due);
  const lateOn = addAge(dob, dose.late);
  const lastOn = dose.last ? addAge(dob, dose.last) : null;
  // No NIS upper age: a dose still open a year after its window is a "catch-up? ask your doctor" item, not an
  // ever-growing overdue count (older children's earlier doses often were given but never entered here).
  const stale = lastOn || plusMonths(lateOn, 12);
  let status;
  if (given) status = 'given';
  else if (today > stale) status = 'missed';
  else if (today > lateOn) status = 'overdue';
  else if (today >= dueOn) status = 'due';
  else status = 'upcoming';
  return { dueOn, lateOn, lastOn, status, daysUntil: daysBetween(today, dueOn) };
}

function childSchedule(p, today) {
  return UIP_SCHEDULE.map((dose) => {
    const g = givenFor(p, dose.code);
    return {
      code: dose.code, name: dose.name, group: dose.group, protects: dose.protects, note: dose.note || null,
      ...doseStatus(p.dob, dose, today, g),
      given: g ? { date: g.date, place: g.place || null, fileId: g.fileId || null } : null,
    };
  });
}

// Adult flu / tetanus: next due = last dose + interval; never recorded → due from the day reminders were turned on
// (rolling forward a year at a time for the flu shot so an unrecorded season still gets one nudge a year).
function adultStatus(p, today) {
  const out = {};
  for (const [key, v] of Object.entries(ADULT_VACCINES)) {
    const pref = p.vaxPrefs?.[key] || null;
    // Any recorded dose counts by name too (a seeded "Tetanus", a childhood "Td", an IAP "Influenza (flu)").
    const last = (p.vaccinations || []).filter((x) => x.code === `adult_${key}` || v.match.test(x.name || ''))
      .sort((a, b) => (a.date < b.date ? 1 : -1))[0] || null;
    let dueOn = null;
    if (last && isDay(last.date)) dueOn = addAge(last.date, [v.everyYears, 'y']);
    else if (pref?.on && isDay(pref.since)) {
      dueOn = pref.since;
      if (v.everyYears === 1) while (addAge(dueOn, [1, 'y']) <= today) dueOn = addAge(dueOn, [1, 'y']);
    }
    out[key] = { name: v.name, on: Boolean(pref?.on), every: v.everyYears, last: last ? { date: last.date, place: last.place || null } : null, dueOn, status: !dueOn ? 'unknown' : today >= dueOn ? 'due' : 'upcoming' };
  }
  return out;
}

function vaccinePlan(p, today) {
  const child = isChild(p.dob, today);
  const known = new Set([...UIP_SCHEDULE.map((x) => x.code), ...IAP_OPTIONAL.map((x) => x.code), 'adult_flu', 'adult_tetanus']);
  return {
    profile: { id: p.id, name: p.name, dob: p.dob || null },
    child, hasDob: isDay(p.dob), note: UIP_NOTE, source: UIP_SOURCE,
    schedule: child ? childSchedule(p, today) : [],
    optional: child ? IAP_OPTIONAL.map((o) => { const g = givenFor(p, o.code); return { ...o, given: g ? { date: g.date, place: g.place || null, fileId: g.fileId || null } : null }; }) : [],
    adult: child ? null : adultStatus(p, today),
    other: (p.vaccinations || []).filter((v) => !v.code || !known.has(v.code)).map((v) => ({ name: v.name, date: v.date, place: v.place || null })),
  };
}

// Small card numbers for the family hub / home.
function vaccineCounts(p, today) {
  if (!isChild(p.dob, today)) {
    const a = adultStatus(p, today);
    const due = Object.values(a).filter((x) => x.on && x.status === 'due');
    return { child: false, due: due.length, overdue: 0, next: due[0] ? { name: due[0].name, dueOn: due[0].dueOn, status: 'due' } : null };
  }
  const s = childSchedule(p, today);
  const open = s.filter((x) => ['due', 'overdue', 'upcoming'].includes(x.status)).sort((a, b) => (a.dueOn < b.dueOn ? -1 : 1));
  const next = open[0];
  return {
    child: true, due: s.filter((x) => x.status === 'due').length, overdue: s.filter((x) => x.status === 'overdue').length,
    dueNames: s.filter((x) => x.status === 'due' || x.status === 'overdue').map((x) => x.name).slice(0, 4),
    next: next ? { code: next.code, name: next.name, dueOn: next.dueOn, status: next.status } : null,
  };
}

// Which vaccine reminders should go out on `today`: 7 days before and on the due date, once each. The key carries
// the due date so a corrected date of birth gets fresh reminders; the windows (pre: 7…1 days before, due: day 0…3)
// stop a newly added older child from receiving reminders for every past dose.
function vaccineRemindersDue(p, today) {
  const out = [];
  const sent = p.vaxReminded || {};
  const consider = (code, name, dueOn) => {
    if (!dueOn) return;
    const until = daysBetween(today, dueOn);
    const band = until >= 1 && until <= 7 ? 'pre' : until <= 0 && until >= -3 ? 'due' : null;
    if (!band) return;
    const key = `${code}|${band}|${dueOn}`;
    if (sent[key]) return;
    // The "due" reminder supersedes a "pre" that the sweeper never got to send (downtime) — never both on one day.
    out.push({ key, code, name, dueOn, band, days: until });
  };
  if (isChild(p.dob, today)) {
    for (const d of childSchedule(p, today)) if (d.status === 'due' || d.status === 'upcoming') consider(d.code, d.name, d.dueOn);
  } else {
    const a = adultStatus(p, today);
    for (const [k, v] of Object.entries(a)) if (v.on) consider(`adult_${k}`, v.name, v.dueOn);
  }
  return out;
}

/* ---------------- home health tracker ---------------- */
const KINDS = ['bp', 'sugar', 'weight', 'spo2', 'temp'];
const SUGAR_CONTEXTS = ['fasting', 'post_meal', 'random'];
const VITALS_CAP = 5000;
const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
const inRange = (n, lo, hi) => Number.isFinite(n) && n >= lo && n <= hi;
const r1 = (n) => Math.round(n * 10) / 10;

// Strict validation — returns { error } or { entry } with only the fields this kind uses.
function validateReading(b = {}) {
  const kind = String(b.kind || '');
  if (!KINDS.includes(kind)) return { error: 'Choose what you are recording: BP, sugar, weight, oxygen or temperature.' };
  const e = { kind };
  if (kind === 'bp') {
    const sys = num(b.sys); const dia = num(b.dia);
    if (!Number.isInteger(sys) || !inRange(sys, 60, 260)) return { error: 'The top BP number (systolic) should be between 60 and 260.' };
    if (!Number.isInteger(dia) || !inRange(dia, 30, 160)) return { error: 'The bottom BP number (diastolic) should be between 30 and 160.' };
    if (dia >= sys) return { error: 'The top BP number should be higher than the bottom one — please check the reading.' };
    Object.assign(e, { sys, dia });
  } else if (kind === 'sugar') {
    const v = num(b.value);
    if (!Number.isInteger(v) || !inRange(v, 20, 600)) return { error: 'Blood sugar should be a whole number between 20 and 600 mg/dL.' };
    if (!SUGAR_CONTEXTS.includes(b.context)) return { error: 'Was this fasting, after a meal, or random?' };
    Object.assign(e, { value: v, context: b.context, unit: 'mg/dL' });
  } else if (kind === 'weight') {
    const v = num(b.value);
    if (!inRange(v, 1, 300)) return { error: 'Weight should be between 1 and 300 kg.' };
    Object.assign(e, { value: r1(v), unit: 'kg' });
    if (b.heightCm !== undefined && b.heightCm !== '' && b.heightCm !== null) {
      const h = num(b.heightCm);
      if (!inRange(h, 40, 250)) return { error: 'Height should be between 40 and 250 cm.' };
      e.heightCm = r1(h);
    }
  } else if (kind === 'spo2') {
    const v = num(b.value);
    if (!Number.isInteger(v) || !inRange(v, 50, 100)) return { error: 'Oxygen (SpO₂) should be a whole number between 50 and 100 %.' };
    Object.assign(e, { value: v, unit: '%' });
  } else if (kind === 'temp') {
    const unit = b.unit === 'C' ? 'C' : 'F';
    const v = num(b.value);
    if (unit === 'C' ? !inRange(v, 32, 43.5) : !inRange(v, 90, 110)) return { error: unit === 'C' ? 'Temperature should be between 32 and 43.5 °C.' : 'Temperature should be between 90 and 110 °F.' };
    // Stored in °F (what most home thermometers in India show and what clinic vitals use).
    Object.assign(e, { value: unit === 'C' ? r1(v * 9 / 5 + 32) : r1(v), unit: '°F' });
  }
  if (kind === 'bp' || kind === 'spo2') {
    if (b.pulse !== undefined && b.pulse !== '' && b.pulse !== null) {
      const pulse = num(b.pulse);
      if (!Number.isInteger(pulse) || !inRange(pulse, 30, 220)) return { error: 'Pulse should be a whole number between 30 and 220.' };
      e.pulse = pulse;
    }
  }
  return { entry: e };
}

const CALL = 'Get medical help now / call 108.';
// Plain-language flag for one reading. level: ok | watch | urgent. Standard adult thresholds; for children only
// the emergency cut-offs apply (their normal BP / BMI depend on age and height).
function flagFor(e, { child = false } = {}) {
  const f = (level, text) => ({ level, text });
  if (e.kind === 'bp') {
    if (e.sys >= 180 || e.dia >= 120) return f('urgent', `Very high blood pressure (180/120 or above). ${CALL} Go at once if there is chest pain, breathlessness, a severe headache, weakness or trouble speaking.`);
    if (child) return f('ok', 'Children’s normal BP depends on age and height — share these readings with your paediatrician.');
    if (e.sys >= 140 || e.dia >= 90) return f('watch', 'Higher than the healthy range (140/90 or above). Sit quietly for 5 minutes and check again. If it stays high on 2–3 different days, talk to your doctor.');
    if (e.sys <= 90 || e.dia <= 60) return f('watch', 'Lower than usual (90/60 or below). If you feel dizzy or faint, sit or lie down and drink water, and talk to your doctor.');
    if (e.pulse && (e.pulse > 120 || e.pulse < 50)) return f('watch', 'Your BP is fine, but the pulse is outside the usual resting range (50–120). If this keeps happening, talk to your doctor.');
    return f('ok', 'In the healthy range.');
  }
  if (e.kind === 'sugar') {
    if (e.value < 54) return f('urgent', `Very low sugar. Take sugar now (3 teaspoons in water, or a glass of juice). ${CALL} if it isn’t better in 15 minutes or the person is drowsy or confused.`);
    if (e.value > 300) return f('urgent', `Very high sugar. ${CALL} Especially with vomiting, drowsiness, deep fast breathing or a lot of thirst.`);
    if (e.value < 70) return f('watch', 'Low sugar. Eat or drink something sweet now and check again in 15 minutes. Talk to your doctor — your medicine dose may need changing.');
    if (e.context === 'fasting' && e.value >= 126) return f('watch', 'Fasting sugar is high (126 or above). Talk to your doctor — they may want to recheck it or adjust treatment.');
    if (e.context !== 'fasting' && e.value >= 200) return f('watch', 'Sugar is high (200 or above). Talk to your doctor, especially if it keeps happening.');
    if (e.context === 'fasting' && e.value >= 100) return f('watch', 'A little above the normal fasting range (70–99). Worth mentioning to your doctor at your next visit.');
    return f('ok', 'In the usual range.');
  }
  if (e.kind === 'spo2') {
    if (e.value < 90) return f('urgent', `Oxygen level is low (below 90%). ${CALL}`);
    if (e.value < 95) return f('watch', 'A bit lower than normal (95–100%). Sit still, warm your hands and check again. If it stays below 95% or there is breathlessness, talk to your doctor.');
    return f('ok', 'Normal oxygen level.');
  }
  if (e.kind === 'temp') {
    if (e.value < 95) return f('urgent', `Body temperature is very low. Warm the person up. ${CALL}`);
    if (e.value >= 104) return f('urgent', `Very high fever (104 °F or above). Sponge with lukewarm water and ${CALL.charAt(0).toLowerCase()}${CALL.slice(1)}`);
    if (e.value >= 100.4) return f('watch', child ? 'Fever. Give fluids and rest. For a baby under 3 months, any fever needs a doctor today; for older children, talk to your doctor if it lasts over 2 days.' : 'Fever. Drink fluids and rest. Talk to your doctor if it lasts more than 2–3 days, or sooner if you feel very unwell.');
    return f('ok', 'Normal temperature.');
  }
  if (e.kind === 'weight') {
    if (child || !e.bmi) return f('ok', child ? 'Children’s weight is judged on growth charts — your paediatrician can check it.' : 'Add your height once to see your BMI.');
    // Asian-Indian cut-offs (Indian consensus guidelines): healthy 18.5–22.9, overweight 23–24.9, obese 25+.
    if (e.bmi < 18.5) return f('watch', `BMI ${e.bmi} — underweight. Talk to your doctor about healthy weight gain.`);
    if (e.bmi >= 25) return f('watch', `BMI ${e.bmi} — above the healthy range for Indians (18.5–22.9). Talk to your doctor about a weight plan that suits you.`);
    if (e.bmi >= 23) return f('ok', `BMI ${e.bmi} — slightly above the healthy range for Indians (18.5–22.9). Small daily changes help.`);
    return f('ok', `BMI ${e.bmi} — in the healthy range.`);
  }
  return f('ok', '');
}

const bmiOf = (kg, cm) => (kg > 0 && cm > 0 ? r1(kg / ((cm / 100) ** 2)) : null);
// What a reading looks like on screen / in the doctor's summary.
function readingView(e, { heightCm = null, child = false } = {}) {
  const v = { id: e.id, kind: e.kind, at: e.at, by: e.byName || null, note: e.note || null };
  if (e.kind === 'bp') Object.assign(v, { sys: e.sys, dia: e.dia, pulse: e.pulse ?? null });
  else Object.assign(v, { value: e.value, unit: e.unit, context: e.context || null, pulse: e.pulse ?? null });
  if (e.kind === 'weight' && !child) v.bmi = bmiOf(e.value, heightCm);
  v.flag = flagFor(v, { child });
  return v;
}
const readingText = (r) => (r.kind === 'bp' ? `${r.sys}/${r.dia} mmHg${r.pulse ? `, pulse ${r.pulse}` : ''}`
  : r.kind === 'sugar' ? `${r.value} mg/dL (${r.context === 'post_meal' ? 'after meal' : r.context})`
    : r.kind === 'weight' ? `${r.value} kg${r.bmi ? ` (BMI ${r.bmi})` : ''}`
      : r.kind === 'spo2' ? `${r.value}%${r.pulse ? `, pulse ${r.pulse}` : ''}` : `${r.value} °F`);

// Compact "Home readings" block for a doctor: latest of each kind, 30-day count, flagged count and averages.
// `upTo` limits it to readings on or before a date (read-only copy after a care transfer).
function homeReadingsSummary(entries, { heightCm = null, child = false, upTo = null, now = Date.now() } = {}) {
  const list = entries.filter((e) => !upTo || e.at <= upTo).sort((a, b) => (a.at < b.at ? 1 : -1));
  if (!list.length) return { count: 0, latest: [], last30: null };
  const since = new Date((upTo ? Date.parse(upTo) : now) - 30 * DAY).toISOString();
  const recent = list.filter((e) => e.at >= since).map((e) => readingView(e, { heightCm, child }));
  const latest = KINDS.map((k) => list.find((e) => e.kind === k)).filter(Boolean).map((e) => { const v = readingView(e, { heightCm, child }); return { ...v, text: readingText(v) }; });
  const avg = (xs) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
  const bp = recent.filter((r) => r.kind === 'bp');
  const fasting = recent.filter((r) => r.kind === 'sugar' && r.context === 'fasting');
  return {
    count: list.length, latest,
    last30: {
      readings: recent.length,
      flagged: recent.filter((r) => r.flag.level !== 'ok').length,
      urgent: recent.filter((r) => r.flag.level === 'urgent').length,
      bpAvg: bp.length ? `${avg(bp.map((r) => r.sys))}/${avg(bp.map((r) => r.dia))}` : null, bpCount: bp.length,
      fastingAvg: avg(fasting.map((r) => r.value)), fastingCount: fasting.length,
    },
    note: 'Measured at home by the patient or family — not clinically verified.',
  };
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

module.exports = {
  isDay, addAge, daysBetween, plusDays, isChild, vaccinePlan, vaccineCounts, vaccineRemindersDue,
  KINDS, SUGAR_CONTEXTS, VITALS_CAP, validateReading, flagFor, readingView, readingText, homeReadingsSummary, bmiOf, TIME_RE,
};
