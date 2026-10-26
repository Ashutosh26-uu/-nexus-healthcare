// Pregnancy care (ANC) — the schedule from India's Mother & Child Protection card, kept per pregnancy:
// due date from the last period (or a due date the doctor gave), the four antenatal check-ups and their
// windows, the two Td injections, iron/folic acid and calcium, and the danger signs. Nothing here is a diagnosis:
// it tracks what was done and what is due, and tells the family (and their E-Clinic) when a check-up is due.
//   Patient  GET  /api/patient/pregnancy                 current pregnancy + plan (or null)
//            POST /api/patient/pregnancy                 start { lmp } or { edd }
//            POST /api/patient/pregnancy/visits          record a check-up { date, place, bp, weightKg, hb, notes }
//            POST /api/patient/pregnancy/td              record a Td injection { date }
//            POST /api/patient/pregnancy/end             { outcome: 'delivered' | 'loss' | 'other', date }
//   Doctor   GET  /api/doctor/patient/:id/pregnancy      with the patient's consent (history)

const DAY = 86400000;
// Week windows for the four ANC visits (MCP card / PMSMA): ≤12, 14–26, 28–34, 36 to term.
const ANC = [
  { n: 1, from: 0, to: 12, label: 'First check-up (register the pregnancy)', what: 'Weight, BP, Hb, blood group, urine, blood sugar, HIV & syphilis tests. Start folic acid. First Td injection.' },
  { n: 2, from: 14, to: 26, label: 'Second check-up', what: 'Weight, BP, Hb, urine. Ultrasound if advised. Start iron (IFA) and calcium tablets. Albendazole once.' },
  { n: 3, from: 28, to: 34, label: 'Third check-up', what: 'Weight, BP, Hb, urine, baby’s growth and heartbeat. Plan where you will deliver.' },
  { n: 4, from: 36, to: 40, label: 'Fourth check-up', what: 'BP, Hb, baby’s position. Keep a bag ready, save 102/108, and confirm the hospital for delivery.' },
];
const DANGER = [
  'Bleeding from the vagina', 'Severe headache or blurred vision', 'Fits (convulsions)', 'High fever',
  'Severe pain in the belly', 'Swelling of the face or hands', 'Baby moving less than usual', 'Water breaking before labour', 'Difficulty breathing',
];
const TIPS = [
  'Free check-up at government health centres on the 9th of every month (PM Surakshit Matritva Abhiyan).',
  'Free ambulance for pregnant women: call 102 (or 108 in an emergency).',
  'Delivering in a hospital is safest — Janani Suraksha Yojana gives cash support for institutional delivery.',
  'Eat an extra meal a day, rest, and take iron and calcium tablets as advised (not together, and not with tea).',
];

const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && Number.isFinite(Date.parse(s));

// The plan for a pregnancy on a given day: weeks, trimester, each check-up's state, Td, tablets.
function plan(pg, now = Date.now()) {
  if (!pg) return null;
  const lmp = Date.parse(pg.lmp);
  const days = Math.max(0, Math.floor((now - lmp) / DAY));
  const week = Math.floor(days / 7);
  const visits = pg.visits || [];
  const weekOf = (date) => Math.floor((Date.parse(date) - lmp) / DAY / 7);
  // Each recorded visit fills one check-up at most (windows overlap by a week at 13, 27 and 35), in order.
  const used = new Set();
  const anc = ANC.map((v) => {
    const done = visits.find((x) => { const w = weekOf(x.date); return !used.has(x) && w >= v.from - 1 && w <= v.to + 1; });
    if (done) used.add(done);
    const dueFrom = dayOf(lmp + v.from * 7 * DAY);
    const dueBy = dayOf(lmp + (v.to + 1) * 7 * DAY - DAY);
    const status = done ? 'done' : week > v.to ? 'missed' : week >= v.from ? 'due' : 'upcoming';
    return { ...v, status, dueFrom, dueBy, doneOn: done?.date || null };
  });
  const td = (pg.td || []).slice().sort();
  const tdNext = td.length >= 2 ? null : td.length === 1
    ? { dose: 2, from: dayOf(Date.parse(td[0]) + 28 * DAY) }
    : { dose: 1, from: dayOf(now) };
  const next = anc.find((a) => a.status === 'due') || anc.find((a) => a.status === 'upcoming') || null;
  return {
    week, days: days % 7, trimester: week < 14 ? 1 : week < 28 ? 2 : 3,
    edd: pg.edd, daysToEdd: Math.ceil((Date.parse(pg.edd) - now) / DAY),
    anc, next, td: { given: td, next: tdNext },
    tablets: {
      folicAcid: week < 14 ? 'Take folic acid daily until week 12.' : null,
      ifa: week >= 14 ? 'Iron (IFA) — 1 tablet daily, for 180 days.' : null,
      calcium: week >= 14 ? 'Calcium — 2 tablets daily, for 180 days (not at the same time as iron).' : null,
    },
    danger: DANGER, tips: TIPS,
  };
}

module.exports = function registerPregnancy(app, x) {
  const { auth, role, activePatient, db, store, notify, audit, broadcast, touch, nowIso, clean, istDay, patientOwnerUserIds, patientById,
    ageOf, consentScopes, doctorFor } = x;
  const list = () => { const d = db(); if (!d.pregnancies) d.pregnancies = []; return d.pregnancies; };
  const activeFor = (pid) => list().find((p) => p.patientId === pid && p.status === 'active') || null;
  const view = (pg) => (pg ? { id: pg.id, lmp: pg.lmp, edd: pg.edd, status: pg.status, visits: pg.visits || [], td: pg.td || [], createdAt: pg.createdAt, plan: plan(pg) } : null);
  const owners = (p) => patientOwnerUserIds(p);
  const lastViewed = new Map();

  app.get('/api/patient/pregnancy', auth, role('patient', 'caregiver'), (req, res) => {
    const p = activePatient(req);
    res.json({ pregnancy: view(activeFor(p.id)), canTrack: p.gender !== 'Male' && (ageOf(p.dob) == null || (ageOf(p.dob) >= 10 && ageOf(p.dob) <= 55)), danger: DANGER, tips: TIPS });
  });

  app.post('/api/patient/pregnancy', auth, role('patient', 'caregiver'), (req, res) => {
    const p = activePatient(req);
    if (p.gender === 'Male') return res.status(400).json({ error: 'Pregnancy care can be added to a woman’s profile.' });
    if (activeFor(p.id)) return res.status(409).json({ error: 'A pregnancy is already being tracked on this profile.' });
    const b = req.body || {};
    let lmp = isDay(b.lmp) ? Date.parse(b.lmp) : null;
    if (!lmp && isDay(b.edd)) lmp = Date.parse(b.edd) - 280 * DAY;
    if (!lmp) return res.status(400).json({ error: 'Enter the first day of the last period, or the due date your doctor gave.' });
    const weeks = (Date.now() - lmp) / DAY / 7;
    if (weeks < 0 || weeks > 42) return res.status(400).json({ error: 'That date doesn’t fit a current pregnancy (it should be within the last 42 weeks). Please check it.' });
    const pg = { id: store.id('preg'), patientId: p.id, lmp: dayOf(lmp), edd: dayOf(lmp + 280 * DAY), status: 'active', visits: [], td: [], createdAt: nowIso(), createdBy: req.user.id, reminded: {} };
    list().push(pg);
    audit(req.user, 'pregnancy_started', p.id, 'pregnancy', `EDD ${pg.edd}`);
    store.save();
    touch(owners(p));
    broadcast('patients');
    res.json({ pregnancy: view(pg) });
  });

  app.post('/api/patient/pregnancy/visits', auth, role('patient', 'caregiver'), (req, res) => {
    const p = activePatient(req);
    const pg = activeFor(p.id);
    if (!pg) return res.status(404).json({ error: 'No pregnancy is being tracked.' });
    const b = req.body || {};
    if (!isDay(b.date) || Date.parse(b.date) > Date.now() + DAY || Date.parse(b.date) < Date.parse(pg.lmp)) return res.status(400).json({ error: 'Please choose the date of the check-up.' });
    const bp = clean(b.bp, 12);
    if (bp && !/^\d{2,3}\/\d{2,3}$/.test(bp)) return res.status(400).json({ error: 'Write BP like 120/80.' });
    const weightKg = b.weightKg === '' || b.weightKg == null ? null : Number(b.weightKg);
    if (weightKg != null && !(weightKg >= 25 && weightKg <= 200)) return res.status(400).json({ error: 'Please check the weight (kg).' });
    const hb = b.hb === '' || b.hb == null ? null : Number(b.hb);
    if (hb != null && !(hb >= 3 && hb <= 20)) return res.status(400).json({ error: 'Please check the Hb (g/dL).' });
    const v = { id: store.id('anc'), date: b.date, place: clean(b.place, 120), bp: bp || null, weightKg, hb, notes: clean(b.notes, 400), by: req.user.id, at: nowIso() };
    pg.visits = [...(pg.visits || []), v].sort((a, c) => a.date.localeCompare(c.date)).slice(-30);
    const warn = [];
    const [sys, dia] = (bp || '').split('/').map(Number);
    if (sys >= 140 || dia >= 90) warn.push('BP is high for pregnancy — please see a doctor within a day or two.');
    if (hb != null && hb < 7) warn.push('Hb is very low (severe anaemia) — please see a doctor today.');
    else if (hb != null && hb < 11) warn.push('Hb is low (anaemia) — take iron tablets daily and ask your doctor.');
    audit(req.user, 'pregnancy_visit', p.id, 'pregnancy', v.date);
    store.save();
    touch(owners(p));
    broadcast('patients');
    res.json({ pregnancy: view(pg), warnings: warn });
  });

  app.post('/api/patient/pregnancy/td', auth, role('patient', 'caregiver'), (req, res) => {
    const p = activePatient(req);
    const pg = activeFor(p.id);
    if (!pg) return res.status(404).json({ error: 'No pregnancy is being tracked.' });
    const date = req.body?.date;
    if (!isDay(date) || Date.parse(date) > Date.now() + DAY) return res.status(400).json({ error: 'Please choose the date of the injection.' });
    if ((pg.td || []).length >= 2) return res.status(409).json({ error: 'Both Td injections are already recorded.' });
    pg.td = [...(pg.td || []), date].sort();
    store.save();
    touch(owners(p));
    res.json({ pregnancy: view(pg) });
  });

  app.post('/api/patient/pregnancy/end', auth, role('patient', 'caregiver'), (req, res) => {
    const p = activePatient(req);
    const pg = activeFor(p.id);
    if (!pg) return res.status(404).json({ error: 'No pregnancy is being tracked.' });
    const outcome = ['delivered', 'loss', 'other'].includes(req.body?.outcome) ? req.body.outcome : 'other';
    Object.assign(pg, { status: 'ended', outcome, endedOn: isDay(req.body?.date) ? req.body.date : istDay(Date.now()), endedAt: nowIso() });
    audit(req.user, 'pregnancy_ended', p.id, 'pregnancy', outcome);
    store.save();
    touch(owners(p));
    broadcast('patients');
    res.json({ ok: true });
  });

  // The treating doctor, with the patient's consent to see history.
  app.get('/api/doctor/patient/:id/pregnancy', auth, role('doctor'), (req, res) => {
    const doc = doctorFor(req.user);
    const scopes = consentScopes(req.params.id, [doc?.id]);
    if (!scopes.has('history')) return res.status(403).json({ error: 'The patient hasn’t shared their history with you.' });
    const pg = activeFor(req.params.id);
    // Shows in the patient's access log — once per doctor per half hour (the screen refreshes itself live).
    const k = `${req.user.id}|${req.params.id}`;
    if (pg && !(Date.now() - (lastViewed.get(k) || 0) < 30 * 60000)) {
      lastViewed.set(k, Date.now());
      if (lastViewed.size > 5000) lastViewed.delete(lastViewed.keys().next().value);
      audit(req.user, 'viewed_pregnancy', req.params.id, 'pregnancy', pg.id);
    }
    res.json({ pregnancy: view(pg) });
  });

  // Once a day: when a check-up window opens (and again if it is a week from closing and still not done),
  // the family gets one gentle reminder.
  function remind() {
    const now = Date.now();
    let changed = false;
    for (const pg of list()) {
      if (pg.status !== 'active') continue;
      const p = patientById(pg.patientId);
      if (!p || p.erasedAt) continue;
      // Six weeks past the due date and still open: the family never closed it. Close it quietly so check-ups
      // don't show as "missed" forever and a new pregnancy can be added.
      if (now - Date.parse(pg.edd) > 42 * DAY) {
        Object.assign(pg, { status: 'ended', outcome: 'unknown', endedAt: nowIso(), endReason: 'Closed automatically six weeks after the due date' });
        changed = true;
        continue;
      }
      // Past the due date: no more check-up reminders.
      if (now - Date.parse(pg.edd) > 21 * DAY) continue;
      const pl = plan(pg, now);
      pg.reminded = pg.reminded || {};
      for (const a of pl.anc) {
        if (a.status !== 'due') continue;
        const closing = Date.parse(a.dueBy) - now < 7 * DAY;
        const key = `${a.n}${closing ? 'late' : ''}`;
        if (pg.reminded[key]) continue;
        pg.reminded[key] = istDay(now);
        changed = true;
        const first = p.name.split(' ')[0];
        owners(p).forEach((u) => notify(u, closing ? `${first}: check-up ${a.n} is due this week` : `${first}: time for pregnancy check-up ${a.n}`,
          `${a.label}, by ${a.dueBy}. ${a.what} Free at government centres on the 9th of every month.`, 'reminder'));
      }
    }
    if (changed) { store.save(); broadcast('notifications'); }
  }
  setTimeout(() => { try { remind(); } catch { /* next run */ } }, 60000).unref?.();
  setInterval(() => { try { remind(); } catch (e) { console.warn('[pregnancy] reminder failed:', e.message); } }, 6 * 3600000).unref?.();

  return { plan, activeFor };
};
module.exports.plan = plan;
