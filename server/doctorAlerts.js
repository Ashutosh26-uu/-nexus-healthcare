// "Tell me when a doctor joins near me": while the network is small, a patient who finds no doctor can ask to be
// told. When the Sehatra team verifies a doctor in their district (or any doctor, if they chose "any — video is
// fine"), they get one notification and the request is cleared.
//   GET    /api/patient/doctor-alert     current request (or null)
//   POST   /api/patient/doctor-alert     { anywhere: boolean } — district/state come from the profile or the body
//   DELETE /api/patient/doctor-alert

module.exports = function registerDoctorAlerts(app, x) {
  const { auth, role, activePatient, db, store, notify, nowIso, clean, patientOwnerUserIds } = x;
  const view = (a) => (a ? { district: a.district || null, state: a.state || null, anywhere: Boolean(a.anywhere), since: a.at } : null);

  app.get('/api/patient/doctor-alert', auth, role('patient', 'caregiver'), (req, res) => res.json(view(activePatient(req).doctorAlert)));

  app.post('/api/patient/doctor-alert', auth, role('patient', 'caregiver'), (req, res) => {
    const p = activePatient(req);
    const district = clean(req.body?.district, 80) || p.district || '';
    const state = clean(req.body?.state, 80) || p.state || '';
    const anywhere = req.body?.anywhere === true || !district;
    p.doctorAlert = { district, state, anywhere, at: nowIso() };
    store.save();
    res.json(view(p.doctorAlert));
  });

  app.delete('/api/patient/doctor-alert', auth, role('patient', 'caregiver'), (req, res) => {
    const p = activePatient(req);
    delete p.doctorAlert;
    store.save();
    res.json({ ok: true });
  });

  // Called when a doctor is verified (and so becomes bookable).
  function doctorVerified(doc) {
    if (!doc?.verified) return 0;
    const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
    let n = 0;
    for (const p of db().patients) {
      const a = p.doctorAlert;
      if (!a || p.erasedAt) continue;
      const near = a.district && same(a.district, doc.district);
      if (!near && !a.anywhere) continue;
      delete p.doctorAlert;
      n += 1;
      const where = near ? `in ${doc.district}` : 'on Sehatra';
      patientOwnerUserIds(p).forEach((u) => notify(u, `A doctor has joined ${where}`,
        `${doc.name}${doc.specialty ? ` (${doc.specialty})` : ''} can now be booked${near ? '' : ' — many doctors consult by video'}. Open "Talk to a doctor" to see their timings.`));
    }
    if (n) store.save();
    return n;
  }

  return { doctorVerified };
};
