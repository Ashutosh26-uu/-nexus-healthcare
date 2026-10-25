// Remote monitoring: patterns across a patient's home readings that a doctor should know about.
// A single reading is already flagged on its own (wellness.flagFor); this looks across readings for what one
// number can't show — BP high on several days, a rising average, repeated lows, fever that won't settle,
// sudden weight gain. Thresholds are standard adult primary-care rules of thumb, stated in every alert so the
// doctor can judge them. Children get only the urgent single-reading alerts (their ranges depend on age).
const wellness = require('./wellness');

const DAY = 86400000;
// The calendar day in India (a 4 am IST reading is still "today", not yesterday in UTC).
const dayOf = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: process.env.APP_TZ || 'Asia/Kolkata' });
const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const r0 = (n) => Math.round(n);

function within(entries, now, days, kind) {
  const since = now - days * DAY;
  return entries.filter((e) => e.kind === kind && Date.parse(e.at) >= since && Date.parse(e.at) <= now + 5 * 60000);
}

// entries: every reading for one patient (any order). Returns the patterns present right now.
function detect(entries, { child = false, heightCm = null, now = Date.now() } = {}) {
  const list = [...entries].sort((a, b) => (a.at < b.at ? 1 : -1));
  const out = [];
  const add = (key, severity, kind, title, detail, rows) => out.push({ key, severity, kind, title, detail, readingIds: rows.map((r) => r.id).slice(0, 10), lastAt: rows[0]?.at || null });

  // 1 · Urgent single readings in the last 48 h — one alert per reading.
  for (const e of list.filter((x) => Date.parse(x.at) >= now - 2 * DAY)) {
    const v = wellness.readingView(e, { heightCm, child });
    if (v.flag.level === 'urgent') add(`urgent:${e.id}`, 'urgent', e.kind, `Urgent ${label(e.kind)} reading: ${wellness.readingText(v)}`, v.flag.text, [e]);
  }
  if (child) return out;

  // 2 · BP at or above 140/90 on 3+ readings across 2+ days in the last 7 days.
  const bp7 = within(list, now, 7, 'bp');
  const highBp = bp7.filter((e) => e.sys >= 140 || e.dia >= 90);
  if (highBp.length >= 3 && new Set(highBp.map((e) => dayOf(e.at))).size >= 2) {
    add('bp_sustained', 'watch', 'bp', `BP high on ${highBp.length} of ${bp7.length} readings this week`,
      `Average ${r0(avg(bp7.map((e) => e.sys)))}/${r0(avg(bp7.map((e) => e.dia)))} mmHg over 7 days; readings at or above 140/90 on ${new Set(highBp.map((e) => dayOf(e.at))).size} different days.`, highBp);
  }
  // 3 · Average systolic up by 10+ week on week (needs 3+ readings in each week).
  const bpPrev = within(list, now - 7 * DAY, 7, 'bp');
  if (bp7.length >= 3 && bpPrev.length >= 3) {
    const a = avg(bp7.map((e) => e.sys)); const b = avg(bpPrev.map((e) => e.sys));
    if (a - b >= 10 && a >= 130) add('bp_rising', 'watch', 'bp', `BP rising: average ${r0(b)} → ${r0(a)} systolic`, `This week’s average systolic is ${r0(a - b)} mmHg higher than last week’s (${bp7.length} and ${bpPrev.length} readings).`, bp7);
  }
  // 4 · Fasting sugar 126+ on 3+ readings in 14 days.
  const fast14 = within(list, now, 14, 'sugar').filter((e) => e.context === 'fasting');
  const highFast = fast14.filter((e) => e.value >= 126);
  if (highFast.length >= 3) {
    add('sugar_fasting_high', 'watch', 'sugar', `Fasting sugar high on ${highFast.length} of ${fast14.length} readings`, `Fasting readings at or above 126 mg/dL in the last 14 days; average fasting ${r0(avg(fast14.map((e) => e.value)))} mg/dL. Treatment may need review.`, highFast);
  }
  // 5 · Two or more low sugars (below 70) in 7 days — hypoglycaemia risk, often a dose problem.
  const lows = within(list, now, 7, 'sugar').filter((e) => e.value < 70);
  if (lows.length >= 2) {
    add('sugar_lows', 'watch', 'sugar', `${lows.length} low sugar readings this week`, `Readings below 70 mg/dL (lowest ${Math.min(...lows.map((e) => e.value))}). Repeated lows usually mean the diabetes medicine dose needs review.`, lows);
  }
  // 6 · Oxygen below 95% on 2+ readings in 3 days.
  const lowO2 = within(list, now, 3, 'spo2').filter((e) => e.value < 95);
  if (lowO2.length >= 2) {
    add('spo2_low', 'watch', 'spo2', `Oxygen below 95% on ${lowO2.length} readings`, `Lowest ${Math.min(...lowO2.map((e) => e.value))}% in the last 3 days. Persistent low oxygen needs a clinical review.`, lowO2);
  }
  // 7 · Fever (100.4 °F+) recorded across more than 72 hours.
  const fev = within(list, now, 7, 'temp').filter((e) => e.value >= 100.4);
  if (fev.length >= 2) {
    const span = Date.parse(fev[0].at) - Date.parse(fev[fev.length - 1].at);
    if (span > 3 * DAY) add('fever_persistent', 'watch', 'temp', `Fever for ${Math.floor(span / DAY)}+ days`, `Temperatures of 100.4 °F or more recorded over ${Math.floor(span / DAY)} days (highest ${Math.max(...fev.map((e) => e.value))} °F).`, fev);
  }
  // 8 · Weight up 2+ kg within 7 days — fluid build-up in heart or kidney disease.
  const w7 = within(list, now, 7, 'weight');
  if (w7.length >= 2) {
    const newest = w7[0]; const lightest = w7.reduce((m, e) => (e.value < m.value ? e : m), w7[0]);
    if (newest.value - lightest.value >= 2 && Date.parse(newest.at) > Date.parse(lightest.at)) {
      add('weight_gain', 'watch', 'weight', `Weight up ${(newest.value - lightest.value).toFixed(1)} kg in a week`, `${lightest.value} kg → ${newest.value} kg. Rapid gain can mean fluid retention in heart or kidney disease.`, [newest, lightest]);
    }
  }
  return out;
}

const LABELS = { bp: 'blood pressure', sugar: 'blood sugar', spo2: 'oxygen', temp: 'temperature', weight: 'weight' };
function label(kind) { return LABELS[kind] || kind; }

module.exports = { detect, label };
