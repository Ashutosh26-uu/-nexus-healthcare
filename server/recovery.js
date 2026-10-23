// Care Companion: after a doctor writes a short-course prescription (fever, infection, cough…), the patient is
// asked once a day, for as long as the medicines run, "How are you feeling?" and "Did you take your medicines?".
// Feeling worse — or any danger sign — alerts the doctor at once; the doctor sees who is recovering and who isn't.
// Nothing is added to the prescription itself: the window is worked out from the medicines' own durations.

const MAX_DAYS = 14;     // longer courses are chronic care — that's Care Plans' job, not this
const DEFAULT_DAYS = 5;  // a course with no duration written still gets a few days of check-ins

// Danger signs that turn "worse" into "get help now".
const DANGER = {
  breathing: 'Trouble breathing',
  chest: 'Chest pain',
  confused: 'Very drowsy or confused',
  bleeding: 'Bleeding (gums, nose, vomit or stool)',
  fluids: "Can't keep water down",
  highfever: 'Fever above 103°F (39.5°C)',
  rash: 'New rash',
};

module.exports = function registerRecovery(app, x) {
  const { auth, role, activePatient, db, store, notify, touch, broadcast, audit, nowIso, clean, istDay, doctorFor, handledDoctorIds,
    patientOwnerUserIds, patientById, doctorById } = x;

  const checks = () => { const d = db(); if (!d.recoveryChecks) d.recoveryChecks = []; return d.recoveryChecks; };
  const first = (name) => String(name || '').replace(/^Dr\.?\s*/i, '').split(/\s+/)[0] || '';

  // How many days of check-ins this prescription gets (null = not a short course).
  function courseDays(rx) {
    if (!rx || rx.source === 'care_plan_renewal' || !(rx.items || []).length) return null;
    const longest = Math.max(0, ...rx.items.map((it) => Number(it.days) || 0));
    if (longest > MAX_DAYS) return null;
    return longest || DEFAULT_DAYS;
  }
  const dayNo = (rx) => Math.floor((Date.parse(`${istDay(nowIso())}T00:00:00Z`) - Date.parse(`${istDay(rx.createdAt)}T00:00:00Z`)) / 86400000) + 1;
  const recordFor = (rx) => checks().find((c) => c.rxId === rx.id);
  function ensureRecord(rx) {
    let r = recordFor(rx);
    if (!r) {
      r = { id: store.id('rc'), rxId: rx.id, patientId: rx.patientId, doctorId: rx.doctorId, entries: [], status: 'open', needsReview: false, createdAt: nowIso() };
      checks().unshift(r);
    }
    return r;
  }
  // A course is "live" from the day it was written until its last day (and a day after, to catch the final check-in).
  function liveCourses(rxList) {
    return rxList.map((rx) => {
      const days = courseDays(rx);
      if (!days) return null;
      const n = dayNo(rx);
      const rec = recordFor(rx);
      if (n < 1 || n > days + 1 || rec?.status === 'recovered') return null;
      return { rx, days, day: Math.min(n, days), rec };
    }).filter(Boolean);
  }
  const summary = (rec) => {
    const e = rec?.entries || [];
    const doses = e.filter((x) => x.took);
    return {
      latest: e[e.length - 1] || null,
      trend: e.map((x) => x.feel),
      adherence: doses.length ? Math.round((doses.filter((x) => x.took === 'all').length / doses.length) * 100) : null,
    };
  };

  // ---------- patient ----------
  app.get('/api/patient/recovery', auth, role('patient', 'caregiver'), (req, res) => {
    const p = activePatient(req);
    const today = istDay(nowIso());
    const mine = db().prescriptions.filter((rx) => rx.patientId === p.id);
    const list = liveCourses(mine).map(({ rx, days, day, rec }) => ({
      rxId: rx.id, doctorName: doctorById(rx.doctorId)?.name || 'your doctor', diagnosis: rx.diagnosis || rx.complaint || null,
      medicines: rx.items.map((it) => it.drug).slice(0, 4), day, days, startedAt: rx.createdAt,
      today: (rec?.entries || []).find((e) => e.date === today) || null,
      entries: (rec?.entries || []).map((e) => ({ date: e.date, feel: e.feel, took: e.took })),
    }));
    res.json({ courses: list, dangerSigns: DANGER });
  });

  app.post('/api/patient/recovery/:rxId', auth, role('patient', 'caregiver'), (req, res) => {
    const p = activePatient(req);
    const rx = db().prescriptions.find((r) => r.id === req.params.rxId && r.patientId === p.id);
    const live = rx && liveCourses([rx])[0];
    if (!live) return res.status(404).json({ error: 'This course has ended — if you still feel unwell, please book a doctor.' });
    const b = req.body || {};
    const feel = ['better', 'same', 'worse'].includes(b.feel) ? b.feel : null;
    if (!feel) return res.status(400).json({ error: 'Please choose how you feel today.' });
    const took = ['all', 'some', 'none'].includes(b.took) ? b.took : null;
    const flags = (Array.isArray(b.flags) ? b.flags : []).filter((f) => Object.prototype.hasOwnProperty.call(DANGER, f)).slice(0, 7);
    const note = clean(b.note, 300) || null;
    const rec = ensureRecord(rx);
    const today = istDay(nowIso());
    const entry = { date: today, day: live.day, feel, took, flags, note, at: nowIso(), byUserId: req.user.id };
    const i = rec.entries.findIndex((e) => e.date === today);
    if (i >= 0) rec.entries[i] = entry; else rec.entries.push(entry);

    // Worse, a danger sign, or "same" for three days running → the doctor hears about it now.
    const lastThree = rec.entries.slice(-3);
    const stuck = lastThree.length === 3 && lastThree.every((e) => e.feel !== 'better');
    const alert = flags.length > 0 || feel === 'worse' || stuck;
    const doc = doctorById(rx.doctorId);
    if (alert && doc?.userId) {
      const what = flags.length ? `danger signs: ${flags.map((f) => DANGER[f]).join(', ')}` : feel === 'worse' ? 'feels worse' : 'not improving after 3 days';
      notify(doc.userId, `⚠️ ${first(p.name)} — ${flags.length ? 'needs help now' : 'not getting better'}`, `${p.name} (day ${live.day} of ${live.days}${rx.diagnosis ? `, ${rx.diagnosis}` : ''}): ${what}${took === 'none' ? ' · missed today\'s medicines' : ''}.${note ? ` They wrote: “${note}”` : ''}`, 'alert');
      rec.needsReview = true;
      rec.flaggedAt = nowIso();
    }
    audit(req.user, 'recovery_checkin', p.id, 'prescription', `${rx.id} · day ${live.day} · ${feel}${flags.length ? ` · ${flags.length} danger sign(s)` : ''}`);
    store.save();
    touch(patientOwnerUserIds(p), doc?.userId);
    broadcast('recovery', 'notifications');
    // What the patient should do next, in plain words.
    const next = flags.length ? 'urgent' : feel === 'worse' || stuck ? 'see-doctor' : took === 'none' || took === 'some' ? 'take-medicines' : 'keep-going';
    res.json({ ok: true, next, alertedDoctor: Boolean(alert && doc?.userId), doctorName: doc?.name || null });
  });

  app.post('/api/patient/recovery/:rxId/recovered', auth, role('patient', 'caregiver'), (req, res) => {
    const p = activePatient(req);
    const rx = db().prescriptions.find((r) => r.id === req.params.rxId && r.patientId === p.id);
    if (!rx) return res.status(404).json({ error: 'Prescription not found.' });
    const rec = ensureRecord(rx);
    rec.status = 'recovered';
    rec.recoveredAt = nowIso();
    rec.needsReview = false;
    store.save();
    const doc = doctorById(rx.doctorId);
    touch(patientOwnerUserIds(p), doc?.userId);
    broadcast('recovery');
    res.json({ ok: true });
  });

  // ---------- doctor ----------
  app.get('/api/doctor/recovery', auth, role('doctor'), (req, res) => {
    const doc = doctorFor(req.user);
    if (!doc) return res.json({ patients: [], dangerSigns: DANGER });
    const ids = new Set(handledDoctorIds(req.user));
    const today = istDay(nowIso());
    const mine = db().prescriptions.filter((rx) => ids.has(rx.doctorId));
    const rows = liveCourses(mine).map(({ rx, days, day, rec }) => {
      const p = patientById(rx.patientId);
      if (!p) return null;
      const s = summary(rec);
      return {
        id: rec?.id || null, rxId: rx.id, patientId: p.id, patientName: p.name, diagnosis: rx.diagnosis || rx.complaint || null,
        day, days, needsReview: Boolean(rec?.needsReview), checkedInToday: Boolean((rec?.entries || []).some((e) => e.date === today)),
        latest: s.latest ? { feel: s.latest.feel, took: s.latest.took, flags: (s.latest.flags || []).map((f) => DANGER[f] || f), note: s.latest.note, date: s.latest.date } : null,
        trend: s.trend, adherence: s.adherence,
      };
    }).filter(Boolean)
      .sort((a, b) => Number(b.needsReview) - Number(a.needsReview) || (b.latest?.feel === 'worse') - (a.latest?.feel === 'worse') || a.day - b.day);
    res.json({ patients: rows, dangerSigns: DANGER, needsReview: rows.filter((r) => r.needsReview).length });
  });

  app.post('/api/doctor/recovery/:id/seen', auth, role('doctor'), (req, res) => {
    const rec = checks().find((c) => c.id === req.params.id);
    if (!rec || !new Set(handledDoctorIds(req.user)).has(rec.doctorId)) return res.status(404).json({ error: 'Not found.' });
    rec.needsReview = false;
    rec.reviewedAt = nowIso();
    store.save();
    touch(req.user.id);
    broadcast('recovery');
    res.json({ ok: true });
  });

  // ---------- one gentle reminder a day ----------
  // From 9 am (network time), anyone mid-course who hasn't checked in today gets one in-app nudge.
  function remind() {
    const d = db();
    const now = new Date();
    const hour = Number(now.toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: process.env.APP_TZ || 'Asia/Kolkata' }));
    if (hour < 9 || hour > 20) return;
    const today = istDay(nowIso());
    let changed = false;
    for (const { rx, days, day, rec } of liveCourses(d.prescriptions || [])) {
      if ((rec?.entries || []).some((e) => e.date === today)) continue;
      const r = rec || ensureRecord(rx);
      if (r.remindedOn === today) continue;
      const p = patientById(rx.patientId);
      if (!p) continue;
      r.remindedOn = today;
      changed = true;
      for (const uid of patientOwnerUserIds(p)) notify(uid, `How is ${first(p.name)} feeling today?`, `Day ${day} of ${days} of the medicines from ${doctorById(rx.doctorId)?.name || 'the doctor'}. Two taps on Sehatra's home screen tell the doctor how it's going.`, 'reminder');
    }
    if (changed) { store.save(); broadcast('recovery', 'notifications'); }
  }
  const timer = setInterval(() => { try { remind(); } catch (e) { console.warn('[recovery] reminder failed:', e.message); } }, 30 * 60000);
  timer.unref?.();
};
