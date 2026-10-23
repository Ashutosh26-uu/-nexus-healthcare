// Critical lab values must never sit unread. When a signed report has a critical value, the ordering doctor is
// alerted at once (approveLabReport). If nobody acknowledges it, this climbs a ladder, each step logged:
//   30 min  → the doctor again, and the lab is asked to phone the doctor
//   60 min  → the patient and their family on Sehatra: see a doctor today / call 108 if unwell
//   120 min → Sehatra's admin team
// A doctor acknowledges with one tap — or by writing advice on the report — and the ladder stops.

const LADDER = [
  { level: 2, after: 30 },
  { level: 3, after: 60 },
  { level: 4, after: 120 },
];
const WINDOW_H = 48; // older reports are not escalated (and old demo data never is)
const SYSTEM = { id: 'system', name: 'Sehatra safety check', role: 'system' };
// Length of a ladder 'minute' — only tests shorten it (never in production).
const MINUTE_MS = process.env.NODE_ENV !== 'production' && Number(process.env.ESCALATION_MINUTE_MS) > 0 ? Number(process.env.ESCALATION_MINUTE_MS) : 60000;

module.exports = function registerEscalation(app, x) {
  const { auth, role, db, store, notify, audit, broadcast, touch, nowIso, doctorFor, handledDoctorIds, patientOwnerUserIds,
    findUserByPhone, labStaffIds, facilityName, userById } = x;

  const acked = (o) => Boolean(o.criticalAckAt || o.doctorNote);
  const criticalLines = (o) => (o.results || []).filter((r) => r.flag === 'critical').map((r) => `${r.name} ${r.value} ${r.unit || ''}`.trim()).join(', ');
  const open = (o) => o.critical && o.status === 'reported' && !acked(o) && Date.now() - Date.parse(o.reportedAt) < WINDOW_H * 3600000;

  function step(d, o, level) {
    const p = d.patients.find((y) => y.id === o.patientId) || {};
    const doc = d.doctors.find((y) => y.id === o.doctorId);
    const docUser = doc?.userId ? userById(doc.userId) : null;
    const docPhone = docUser?.phone || doc?.phone || null;
    const lab = labStaffIds(o.labId);
    const what = criticalLines(o);
    const sent = [];
    if (level === 2) {
      if (doc?.userId) { notify(doc.userId, '🚨 Still unread: critical lab value', `${p.name}: ${what}. Please review now — the lab and patient will be alerted next.`, 'alert'); sent.push('doctor'); }
      lab.forEach((u) => notify(u, '📞 Call the doctor: critical value unread', doc
        ? `${doc.name} hasn't opened ${p.name}'s critical result (${what}) for 30 minutes.${docPhone ? ` Please phone ${docPhone}.` : ' Please phone the doctor.'}`
        : `${p.name}'s critical result (${what}) has no ordering doctor. Please phone the patient.`, 'alert'));
      if (lab.length) sent.push('lab');
    } else if (level === 3) {
      const family = new Set(patientOwnerUserIds(p));
      for (const c of p.emergencyContacts || []) { if (c.relation !== 'Mobile' && c.phone) { const u = findUserByPhone(c.phone); if (u) family.add(u.id); } }
      family.forEach((u) => notify(u, '⚠️ A test result needs a doctor today', `${p.name?.split(' ')[0] || 'Your'}'s lab report has a result that needs urgent attention. Please see a doctor today — book one in the app or go to the nearest hospital. If they feel very unwell, call 108.`, 'alert'));
      if (family.size) sent.push('patient & family');
      lab.forEach((u) => notify(u, 'Critical value still unread', `${p.name}'s result (${what}) is still not acknowledged after an hour. The patient has been told to see a doctor today.`));
    } else if (level === 4) {
      const admins = d.users.filter((u) => u.role === 'super_admin' && u.status !== 'disabled');
      admins.forEach((u) => notify(u.id, '🚨 Unacknowledged critical result', `${facilityName(o.labId) || 'A lab'} · report ${o.id} · ${what}. Not acknowledged for 2 hours${doc ? ` by ${doc.name}${docPhone ? ` (${docPhone})` : ''}` : ''}. Please follow up.`, 'alert'));
      if (admins.length) sent.push('admin');
    }
    (o.escalation.steps = o.escalation.steps || []).push({ level, at: nowIso(), to: sent });
    o.escalation.level = level;
    audit(SYSTEM, 'critical_escalation', p.id || null, 'lab', `${o.id} · step ${level} → ${sent.join(', ') || 'nobody reachable'}`);
    touch(doc?.userId, lab, patientOwnerUserIds(p));
  }

  function sweep() {
    const d = db();
    let changed = false;
    for (const o of d.labOrders || []) {
      if (!open(o)) continue;
      o.escalation = o.escalation || { level: 1, steps: [{ level: 1, at: o.reportedAt, to: o.doctorId ? ['doctor', 'patient'] : ['patient'] }] };
      const mins = (Date.now() - Date.parse(o.reportedAt)) / MINUTE_MS;
      for (const s of LADDER) {
        if (mins >= s.after && o.escalation.level < s.level) { step(d, o, s.level); changed = true; }
      }
    }
    if (changed) { store.save(); broadcast('lab', 'notifications'); }
  }

  // The ordering doctor (or a doctor they handle bookings for) acknowledges — the ladder stops.
  app.post('/api/doctor/labs/:id/ack-critical', auth, role('doctor'), (req, res) => {
    const d = db();
    const o = d.labOrders.find((y) => y.id === req.params.id);
    if (!o || !new Set(handledDoctorIds(req.user)).has(o.doctorId)) return res.status(404).json({ error: 'Report not found.' });
    if (!o.critical) return res.status(400).json({ error: 'This report has no critical value.' });
    if (!o.criticalAckAt) {
      o.criticalAckAt = nowIso();
      o.criticalAckBy = doctorFor(req.user)?.name || req.user.name;
      const p = d.patients.find((y) => y.id === o.patientId) || {};
      labStaffIds(o.labId).forEach((u) => notify(u, '✅ Critical value acknowledged', `${o.criticalAckBy} has seen ${p.name}'s critical result.`));
      audit(req.user, 'critical_acknowledged', o.patientId, 'lab', `${o.id}${o.escalation ? ` · after step ${o.escalation.level}` : ''}`);
      store.save();
      touch(labStaffIds(o.labId));
      broadcast('lab', 'notifications');
    }
    res.json({ ok: true, ackAt: o.criticalAckAt });
  });

  // The lab's view: every critical result of the last two days, who has seen it, and how far it has escalated.
  app.get('/api/lab/critical', auth, role('lab_tech'), (req, res) => {
    const d = db();
    const rows = (d.labOrders || [])
      .filter((o) => o.labId === req.user.facilityId && o.critical && o.status === 'reported' && Date.now() - Date.parse(o.reportedAt) < WINDOW_H * 3600000)
      .map((o) => {
        const p = d.patients.find((y) => y.id === o.patientId) || {};
        const doc = d.doctors.find((y) => y.id === o.doctorId);
        const docUser = doc?.userId ? userById(doc.userId) : null;
        return {
          id: o.id, patientName: p.name, values: criticalLines(o), reportedAt: o.reportedAt,
          doctorName: doc?.name || null, doctorPhone: docUser?.phone || doc?.phone || null,
          acknowledged: acked(o), ackAt: o.criticalAckAt || o.doctorNote?.at || null, ackBy: o.criticalAckBy || o.doctorNote?.by || null,
          level: o.escalation?.level || 1, steps: o.escalation?.steps || [],
        };
      })
      .sort((a, b) => Number(a.acknowledged) - Number(b.acknowledged) || b.reportedAt.localeCompare(a.reportedAt));
    res.json({ results: rows });
  });

  const timer = setInterval(() => { try { sweep(); } catch (e) { console.warn('[escalation] sweep failed:', e.message); } }, 60000);
  timer.unref?.();
  return { sweep };
};
