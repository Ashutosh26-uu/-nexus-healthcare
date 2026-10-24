// Missed follow-ups: the doctor asked to see someone again, the day came and went, and they never showed.
// The doctor sees who, and can send one "please book again" nudge (or set it aside).
//   GET  /api/doctor/missed-followups
//   POST /api/doctor/missed-followups/:id/remind
//   POST /api/doctor/missed-followups/:id/dismiss

const GRACE_MS = 2 * 3600000;   // a visit counts as missed 2 hours after its time
const LOOKBACK_DAYS = 30;
const REMIND_EVERY_MS = 3 * 86400000;

module.exports = function registerFollowups(app, x) {
  const { auth, role, db, store, notify, audit, broadcast, touch, nowIso, handledDoctorIds, doctorById, patientById, patientOwnerUserIds, ageOf } = x;

  function missedFor(user) {
    const d = db();
    const mine = new Set(handledDoctorIds(user));
    const now = Date.now();
    return d.consults.filter((c) => {
      if (!c.followUp || !mine.has(c.doctorId) || !c.scheduledAt || c.missedDismissedAt) return false;
      const t = Date.parse(c.scheduledAt);
      if (!(t < now - GRACE_MS && t > now - LOOKBACK_DAYS * 86400000)) return false;
      if (c.checkedInAt || ['completed', 'cancelled', 'in_progress', 'expired'].includes(c.status)) return false;
      // Came back some other way since (a newer visit with the same doctor): not missed.
      return !d.consults.some((y) => y.id !== c.id && y.patientId === c.patientId && y.doctorId === c.doctorId && Date.parse(y.createdAt) > t - 86400000 && (y.status === 'completed' || y.checkedInAt || (y.status === 'scheduled' && Date.parse(y.scheduledAt) > now)));
    });
  }

  app.get('/api/doctor/missed-followups', auth, role('doctor'), (req, res) => {
    res.json(missedFor(req.user).sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt)).map((c) => {
      const p = patientById(c.patientId);
      return {
        id: c.id, patientId: c.patientId, patientName: p?.name || 'Patient', age: ageOf(p?.dob), scheduledAt: c.scheduledAt,
        reason: c.triage?.symptoms || null, remindedAt: c.missedRemindedAt || null,
        canRemind: !c.missedRemindedAt || Date.now() - Date.parse(c.missedRemindedAt) > REMIND_EVERY_MS,
      };
    }));
  });

  const find = (req) => missedFor(req.user).find((c) => c.id === req.params.id);

  app.post('/api/doctor/missed-followups/:id/remind', auth, role('doctor'), (req, res) => {
    const c = find(req);
    if (!c) return res.status(404).json({ error: 'Not found.' });
    if (c.missedRemindedAt && Date.now() - Date.parse(c.missedRemindedAt) <= REMIND_EVERY_MS) return res.status(409).json({ error: 'A reminder went out recently. Give them a day or two.' });
    const p = patientById(c.patientId);
    const doc = doctorById(c.doctorId);
    c.missedRemindedAt = nowIso();
    patientOwnerUserIds(p || {}).forEach((u) => notify(u, `${doc?.name || 'Your doctor'} would like to see ${p?.name?.split(' ')[0] || 'you'} again`,
      'The follow-up visit was missed. Please book a new time from Visits → Follow-ups, or talk to a doctor now.', 'reminder'));
    audit(req.user, 'followup_missed_reminded', c.patientId, 'consult', c.id);
    store.save();
    touch(patientOwnerUserIds(p || {}));
    broadcast('consults');
    res.json({ ok: true });
  });

  app.post('/api/doctor/missed-followups/:id/dismiss', auth, role('doctor'), (req, res) => {
    const c = find(req);
    if (!c) return res.status(404).json({ error: 'Not found.' });
    c.missedDismissedAt = nowIso();
    store.save();
    broadcast('consults');
    res.json({ ok: true });
  });
};
