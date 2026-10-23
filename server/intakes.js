// Offline E-Clinic visits. When a kiosk loses the internet, the operator can still record a visit — name, age,
// phone, symptoms, vitals, danger signs. It waits on the kiosk and is sent here when the connection is back.
// It arrives as an "intake to finish": the operator then continues the normal visit with everything pre-filled
// (identify or register the patient, then the doctor). Sending is idempotent: a retried send never duplicates.
// Intakes are working notes, not the health record: done ones are deleted after 7 days, open ones after 30.

const DONE_KEEP_D = 7;
const OPEN_KEEP_D = 30;
const VITAL_KEYS = ['bp', 'pulse', 'spo2', 'temp', 'weight', 'sugar'];

module.exports = function registerIntakes(app, x) {
  const { auth, role, db, store, notify, audit, broadcast, touchFacility, nowIso, clean, engines } = x;
  const list = () => { const d = db(); if (!d.kioskIntakes) d.kioskIntakes = []; return d.kioskIntakes; };
  const view = (i) => ({ id: i.id, recordedAt: i.recordedAt, receivedAt: i.receivedAt, patient: i.patient, vitals: i.vitals, symptoms: i.symptoms, danger: i.danger, level: i.level, status: i.status });

  app.post('/api/kiosk/intakes', auth, role('kiosk_operator'), (req, res) => {
    const b = req.body || {};
    const kioskId = req.user.facilityId;
    const localId = clean(b.localId, 60);
    if (!/^[\w-]{8,60}$/.test(localId)) return res.status(400).json({ error: 'Missing visit id.' });
    const existing = list().find((i) => i.kioskId === kioskId && i.localId === localId);
    if (existing) return res.json({ intake: view(existing), duplicate: true }); // a retry after a dropped reply
    const p = b.patient || {};
    const name = clean(p.name, 80);
    if (name.length < 2) return res.status(400).json({ error: 'The visit has no name.' });
    const age = Math.max(0, Math.min(120, parseInt(p.age, 10) || 0)) || null;
    const vitals = {};
    for (const k of VITAL_KEYS) if (b.vitals?.[k] != null && String(b.vitals[k]).trim()) vitals[k] = k === 'bp' ? clean(b.vitals[k], 12) : Number(b.vitals[k]) || null;
    const symptoms = clean(b.symptoms, 600);
    const danger = (Array.isArray(b.danger) ? b.danger : []).map((s) => clean(s, 60)).filter(Boolean).slice(0, 10);
    const recordedAt = Number.isFinite(Date.parse(b.recordedAt)) && Date.parse(b.recordedAt) <= Date.now() + 60000 ? new Date(b.recordedAt).toISOString() : nowIso();
    // The same rule-based triage the online visit uses, so the operator sees the urgency at once.
    let level = 'routine';
    try { level = engines.triage({ symptoms: [symptoms, ...danger].filter(Boolean).join('. '), age, vitals }, db().aiConfig)?.level || 'routine'; } catch { /* keep routine */ }
    if (danger.length) level = 'emergency';
    const intake = {
      id: store.id('ki'), kioskId, localId, recordedAt, receivedAt: nowIso(), operatorId: req.user.id,
      patient: { name, age, gender: ['Female', 'Male', 'Other'].includes(p.gender) ? p.gender : null, phone: String(p.phone || '').replace(/\D/g, '').slice(0, 10) || null },
      vitals, symptoms, danger, level, status: 'open',
    };
    list().unshift(intake);
    audit(req.user, 'offline_intake', null, 'kiosk', `${intake.id} · recorded ${recordedAt} · ${level}`);
    db().users.filter((u) => u.role === 'kiosk_operator' && u.facilityId === kioskId).forEach((u) => notify(u.id,
      level === 'emergency' ? '🚨 Offline visit with danger signs' : 'Offline visit received',
      `${name}${age ? `, ${age} y` : ''} — recorded offline. Finish the visit from Operator → Offline visits.`, level === 'emergency' ? 'alert' : undefined));
    store.save();
    touchFacility(kioskId);
    broadcast('kiosks', 'notifications');
    res.json({ intake: view(intake) });
  });

  app.get('/api/kiosk/intakes', auth, role('kiosk_operator'), (req, res) => {
    const rows = list().filter((i) => i.kioskId === req.user.facilityId && i.status === 'open')
      .sort((a, b) => (a.level === 'emergency') === (b.level === 'emergency') ? a.recordedAt.localeCompare(b.recordedAt) : a.level === 'emergency' ? -1 : 1);
    res.json({ intakes: rows.map(view) });
  });

  app.post('/api/kiosk/intakes/:id/done', auth, role('kiosk_operator'), (req, res) => {
    const i = list().find((y) => y.id === req.params.id && y.kioskId === req.user.facilityId);
    if (!i) return res.status(404).json({ error: 'Not found.' });
    if (i.status !== 'done') {
      i.status = 'done';
      i.doneAt = nowIso();
      i.consultId = clean(req.body?.consultId, 60) || null;
      audit(req.user, 'offline_intake_done', null, 'kiosk', `${i.id}${i.consultId ? ` → ${i.consultId}` : ''}`);
      store.save();
      touchFacility(i.kioskId);
      broadcast('kiosks');
    }
    res.json({ ok: true });
  });

  // Working notes don't linger: done intakes go after a week, unfinished ones after a month.
  const purge = () => {
    const d = db();
    if (!d.kioskIntakes?.length) return;
    const now = Date.now();
    const keep = d.kioskIntakes.filter((i) => (i.status === 'done' ? now - Date.parse(i.doneAt || i.receivedAt) < DONE_KEEP_D * 86400000 : now - Date.parse(i.receivedAt) < OPEN_KEEP_D * 86400000));
    if (keep.length !== d.kioskIntakes.length) { d.kioskIntakes = keep; store.save(); }
  };
  const timer = setInterval(() => { try { purge(); } catch (e) { console.warn('[intakes] purge failed:', e.message); } }, 6 * 3600000);
  timer.unref?.();
};
