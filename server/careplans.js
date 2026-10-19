// Chronic care plans (BP and diabetes): the maths behind the monthly loop. No I/O here — index.js owns routes,
// notifications and storage; this file only turns a plan + the patient's own readings and lab results into
// progress, "off target" reasons and what is due. Every number shown comes from a real reading; nothing is guessed.

const DAY = 86400000;
const CONDITIONS = ['bp', 'diabetes'];
const CONDITION_LABEL = { bp: 'Blood pressure', diabetes: 'Diabetes' };
const REVIEW_EVERY_DAYS = 28;     // a doctor looks at every active plan at least this often
const HBA1C_EVERY_DAYS = 90;      // HbA1c reflects ~3 months; due again after this
const READING_GAP_DAYS = 3;       // no reading of a tracked kind for this long → remind the patient
const PLAN_DAYS = 30;             // one paid month
const MIN_READINGS_FOR_JUDGEMENT = 3; // fewer readings than this in 14 days → "not enough readings", never "off target"

// Usual targets (ADA / ESC-ESH style); the doctor can change every one of them per patient.
function defaultTargets(age) {
  const older = Number.isFinite(age) && age >= 65;
  return { bpSys: older ? 140 : 130, bpDia: older ? 90 : 80, fasting: 130, hba1c: older ? 7.5 : 7 };
}

const num = (v) => { const n = parseFloat(String(v ?? '').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : null; };
const clampInt = (v, lo, hi, dflt) => { const n = parseInt(v, 10); return Number.isInteger(n) ? Math.max(lo, Math.min(hi, n)) : dflt; };
const clampNum = (v, lo, hi, dflt) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n * 10) / 10)) : dflt; };

// What a doctor may set — anything else is ignored, out-of-range values are pulled into range.
function cleanSetup(b = {}, age) {
  const conditions = (Array.isArray(b.conditions) ? b.conditions : []).filter((c) => CONDITIONS.includes(c));
  const d = defaultTargets(age);
  const t = b.targets || {};
  return {
    conditions: [...new Set(conditions)],
    targets: {
      bpSys: clampInt(t.bpSys, 100, 180, d.bpSys), bpDia: clampInt(t.bpDia, 60, 110, d.bpDia),
      fasting: clampInt(t.fasting, 70, 200, d.fasting), hba1c: clampNum(t.hba1c, 5, 10, d.hba1c),
    },
    perWeek: { bp: clampInt(b.perWeek?.bp, 1, 14, 3), sugar: clampInt(b.perWeek?.sugar, 1, 14, 3) },
    fee: clampInt(b.fee, 0, 5000, 249),
  };
}

const avg = (xs) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
const within = (e, from, to = Infinity) => { const t = Date.parse(e.at); return Number.isFinite(t) && t >= from && t < to; };

// Latest HbA1c from reported lab orders, if any.
function latestHba1c(labOrders) {
  let best = null;
  for (const o of labOrders || []) {
    if (o.status !== 'reported' || !o.reportedAt) continue;
    for (const r of o.results || []) {
      if (!/hba1c|a1c|glycated|glycosylated/i.test(String(r.name || ''))) continue;
      const v = num(r.value);
      if (v === null || v < 3 || v > 20) continue; // a percentage; anything else is a misread
      if (!best || o.reportedAt > best.at) best = { value: v, at: o.reportedAt, labOrderId: o.id };
    }
  }
  return best;
}

// BP and fasting-sugar picture over a window [from, to).
function windowStats(entries, from, to) {
  const bp = entries.filter((e) => e.kind === 'bp' && within(e, from, to));
  const fasting = entries.filter((e) => e.kind === 'sugar' && e.context === 'fasting' && within(e, from, to));
  return {
    bp: { count: bp.length, sys: avg(bp.map((e) => e.sys)), dia: avg(bp.map((e) => e.dia)) },
    fasting: { count: fasting.length, avg: avg(fasting.map((e) => e.value)) },
  };
}

const bpAtTarget = (s, t) => (s.bp.count >= MIN_READINGS_FOR_JUDGEMENT ? s.bp.sys <= t.bpSys && s.bp.dia <= t.bpDia : null);
const sugarAtTarget = (s, t) => (s.fasting.count >= MIN_READINGS_FOR_JUDGEMENT ? s.fasting.avg <= t.fasting : null);

// The patient's progress on a plan. `entries` = their vitalsLog rows; `labs` = their lab orders.
function progress(plan, entries, labs, now = Date.now()) {
  const t = plan.targets;
  const has = (c) => plan.conditions.includes(c);
  const recent = windowStats(entries, now - 14 * DAY, now);  // what "now" means for targets
  const week = windowStats(entries, now - 7 * DAY, now);
  const lastOf = (pred) => entries.filter(pred).reduce((m, e) => (!m || e.at > m ? e.at : m), null);
  const lastBp = lastOf((e) => e.kind === 'bp');
  const lastSugar = lastOf((e) => e.kind === 'sugar');
  const hba1c = has('diabetes') ? latestHba1c(labs) : null;

  // Eight weekly points (oldest first) for the trend chart.
  const weeks = [];
  for (let i = 7; i >= 0; i -= 1) {
    const to = now - i * 7 * DAY; const from = to - 7 * DAY;
    const s = windowStats(entries, from, to);
    weeks.push({ from: new Date(from).toISOString(), bpSys: s.bp.sys, bpDia: s.bp.dia, bpCount: s.bp.count, fasting: s.fasting.avg, fastingCount: s.fasting.count });
  }

  const offTarget = [];
  const bpOk = has('bp') ? bpAtTarget(recent, t) : undefined;
  const sugarOk = has('diabetes') ? sugarAtTarget(recent, t) : undefined;
  if (bpOk === false) offTarget.push(`BP averaging ${recent.bp.sys}/${recent.bp.dia} over 2 weeks (target ${t.bpSys}/${t.bpDia} or lower)`);
  if (sugarOk === false) offTarget.push(`Fasting sugar averaging ${recent.fasting.avg} mg/dL over 2 weeks (target ${t.fasting} or lower)`);
  const hba1cOk = hba1c ? hba1c.value <= t.hba1c : null;
  if (hba1c && hba1cOk === false && now - Date.parse(hba1c.at) < HBA1C_EVERY_DAYS * DAY) offTarget.push(`HbA1c ${hba1c.value}% (target ${t.hba1c}% or lower)`);

  const gap = (last) => (last ? Math.floor((now - Date.parse(last)) / DAY) : null);
  const missing = [];
  if (has('bp') && (gap(lastBp) === null || gap(lastBp) >= READING_GAP_DAYS)) missing.push('bp');
  if (has('diabetes') && (gap(lastSugar) === null || gap(lastSugar) >= READING_GAP_DAYS)) missing.push('sugar');

  const sinceReview = Date.parse(plan.lastReviewAt || plan.startedAt || plan.createdAt);
  const reviewDueOn = new Date(sinceReview + REVIEW_EVERY_DAYS * DAY).toISOString();
  const hba1cDue = has('diabetes') && (!hba1c || now - Date.parse(hba1c.at) >= HBA1C_EVERY_DAYS * DAY);

  return {
    targets: t,
    bp: has('bp') ? { ...recent.bp, atTarget: bpOk, thisWeek: week.bp.count, perWeek: plan.perWeek.bp, last: lastBp } : null,
    sugar: has('diabetes') ? { fastingAvg: recent.fasting.avg, fastingCount: recent.fasting.count, atTarget: sugarOk, thisWeek: entries.filter((e) => e.kind === 'sugar' && within(e, now - 7 * DAY, now)).length, perWeek: plan.perWeek.sugar, last: lastSugar } : null,
    hba1c: has('diabetes') ? (hba1c ? { ...hba1c, atTarget: hba1cOk } : null) : undefined,
    hba1cDue,
    weeks,
    offTarget,
    missing,
    reviewDueOn,
    // Off target asks for a review straight away the first time, then at most weekly after each review.
    reviewDue: plan.status === 'active' && (now >= Date.parse(reviewDueOn) || (offTarget.length > 0 && (!plan.lastReviewAt || now - Date.parse(plan.lastReviewAt) >= 7 * DAY))),
  };
}

// Snapshot used as the "before" for outcomes, and stored on every review.
function snapshot(plan, entries, labs, now = Date.now()) {
  const p = progress(plan, entries, labs, now);
  return {
    at: new Date(now).toISOString(),
    bp: p.bp && p.bp.count ? { sys: p.bp.sys, dia: p.bp.dia, count: p.bp.count, atTarget: p.bp.atTarget } : null,
    fasting: p.sugar && p.sugar.fastingCount ? { avg: p.sugar.fastingAvg, count: p.sugar.fastingCount, atTarget: p.sugar.atTarget } : null,
    hba1c: p.hba1c ? { value: p.hba1c.value, at: p.hba1c.at, atTarget: p.hba1c.atTarget } : null,
  };
}

// Network outcomes: of the plans running 30+ days with enough readings at both ends, how many were at target
// when they joined vs now. Only real counts; plans without a "before" are left out rather than guessed.
function outcomes(plans, now, progressOf) {
  const out = { active: 0, invited: 0, lapsed: 0, ended: 0, measured: 0, bp: { before: 0, now: 0, n: 0 }, fasting: { before: 0, now: 0, n: 0 }, reviewDue: 0 };
  for (const pl of plans) {
    out[pl.status] = (out[pl.status] || 0) + 1;
    if (pl.status !== 'active') continue;
    const pr = progressOf(pl);
    if (pr.reviewDue) out.reviewDue += 1;
    if (!pl.baseline || now - Date.parse(pl.startedAt) < 30 * DAY) continue;
    let counted = false;
    if (pl.baseline.bp?.atTarget != null && pr.bp?.atTarget != null) { out.bp.n += 1; out.bp.before += pl.baseline.bp.atTarget ? 1 : 0; out.bp.now += pr.bp.atTarget ? 1 : 0; counted = true; }
    if (pl.baseline.fasting?.atTarget != null && pr.sugar?.atTarget != null) { out.fasting.n += 1; out.fasting.before += pl.baseline.fasting.atTarget ? 1 : 0; out.fasting.now += pr.sugar.atTarget ? 1 : 0; counted = true; }
    if (counted) out.measured += 1;
  }
  return out;
}

module.exports = {
  CONDITIONS, CONDITION_LABEL, REVIEW_EVERY_DAYS, HBA1C_EVERY_DAYS, READING_GAP_DAYS, PLAN_DAYS, MIN_READINGS_FOR_JUDGEMENT, DAY,
  defaultTargets, cleanSetup, latestHba1c, progress, snapshot, outcomes,
};
