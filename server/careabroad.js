// Care abroad — for a patient who needs treatment or a consultation in another country.
// A medical summary in English (allergies, conditions, current medicines, recent prescriptions and lab
// results, vaccinations, emergency contacts) that a doctor anywhere can open from a private link — no Sehatra
// account needed. The patient makes the link, chooses what's in it and for how long, sees every time it's
// opened, and can switch it off at any moment. Links are random (144 bits), stored only as a hash.
//   Patient  GET    /api/patient/travel-summary                 preview of what a doctor would see
//            GET    /api/patient/travel-summary/links           my links
//            POST   /api/patient/travel-summary/links           { days: 7|30|90, sections: { prescriptions, labs, pregnancy } }
//            DELETE /api/patient/travel-summary/links/:id       switch a link off
//   Anyone   GET    /api/public/travel-summary/:token           the summary (no-store, rate-limited)
const crypto = require('crypto');

const DAYS = [7, 30, 90];
const MAX_LINKS = 5;

module.exports = function registerCareAbroad(app, x) {
  const { auth, role, activePatient, db, store, notify, audit, nowIso, patientOwnerUserIds, doctorById, facilityName, ageOf,
    publicLimiter, appUrl, pregnancyFor } = x;
  const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
  const live = (p) => (p.travelLinks || []).filter((l) => !l.revokedAt && Date.parse(l.expiresAt) > Date.now());
  const PUBLIC_ACTOR = { id: 'public-link', name: 'Shared medical summary link', role: 'public' };

  function summary(p, sections = {}) {
    const d = db();
    const want = { prescriptions: true, labs: true, pregnancy: true, ...sections };
    const out = {
      generatedAt: nowIso(),
      patient: {
        name: p.name, age: ageOf(p.dob), dateOfBirth: p.dobApprox ? null : p.dob || null, sex: p.gender,
        bloodGroup: p.bloodGroup || 'Unknown', language: p.language || null, country: p.country || 'IN', passportId: p.id,
      },
      allergies: p.allergies || [], conditions: p.conditions || [], currentMedicines: p.currentMeds || [],
      emergencyContacts: (p.emergencyContacts || []).filter((c) => c.relation !== 'Mobile').map((c) => ({ name: c.name, relation: c.relation, phone: c.phone })),
      vaccinations: (p.vaccinations || []).slice(-15).map((v) => ({ name: v.name, date: v.date || null })),
    };
    if (want.prescriptions) {
      out.prescriptions = d.prescriptions.filter((r) => r.patientId === p.id).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 5)
        .map((r) => ({
          date: String(r.createdAt).slice(0, 10), doctor: doctorById(r.doctorId)?.name || null, diagnosis: r.diagnosis || null,
          medicines: (r.items || []).map((it) => ({ name: it.drug, dose: it.dose || null, frequency: it.freq || null, days: it.days || null })),
          advice: r.advice || null,
        }));
    }
    if (want.labs) {
      out.labResults = d.labOrders.filter((o) => o.patientId === p.id && o.status === 'reported' && (o.results || []).length)
        .sort((a, b) => String(b.reportedAt).localeCompare(String(a.reportedAt))).slice(0, 5)
        .map((o) => ({ date: String(o.reportedAt).slice(0, 10), lab: facilityName(o.labId) || null, results: o.results.map((r) => ({ test: r.name, value: r.value, unit: r.unit || '', range: r.range || '', flag: r.flag || null })) }));
    }
    if (want.pregnancy) {
      const pg = pregnancyFor?.(p.id);
      if (pg) out.pregnancy = { weeks: pg.week, dueDate: pg.edd };
    }
    return out;
  }

  app.get('/api/patient/travel-summary', auth, role('patient', 'caregiver'), (req, res) => {
    res.json(summary(activePatient(req)));
  });

  const linkView = (l) => ({ id: l.id, createdAt: l.createdAt, expiresAt: l.expiresAt, sections: l.sections, views: l.views || 0, lastViewAt: l.lastViewAt || null });
  app.get('/api/patient/travel-summary/links', auth, role('patient', 'caregiver'), (req, res) => res.json(live(activePatient(req)).map(linkView)));

  app.post('/api/patient/travel-summary/links', auth, role('patient', 'caregiver'), (req, res) => {
    const p = activePatient(req);
    if (live(p).length >= MAX_LINKS) return res.status(409).json({ error: `You already have ${MAX_LINKS} links open. Switch one off first.` });
    const days = DAYS.includes(Number(req.body?.days)) ? Number(req.body.days) : 30;
    const s = req.body?.sections || {};
    const sections = { prescriptions: s.prescriptions !== false, labs: s.labs !== false, pregnancy: s.pregnancy !== false };
    const token = crypto.randomBytes(18).toString('base64url');
    const link = { id: store.id('tl'), hash: hash(token), createdAt: nowIso(), expiresAt: new Date(Date.now() + days * 86400000).toISOString(), sections, views: 0, by: req.user.id };
    p.travelLinks = [...(p.travelLinks || []).filter((l) => !l.revokedAt && Date.parse(l.expiresAt) > Date.now() - 30 * 86400000), link];
    audit(req.user, 'travel_summary_link', p.id, 'summary', `${days} days`);
    store.save();
    res.json({ ...linkView(link), url: `${appUrl()}/summary/${token}` });
  });

  app.delete('/api/patient/travel-summary/links/:id', auth, role('patient', 'caregiver'), (req, res) => {
    const p = activePatient(req);
    const l = (p.travelLinks || []).find((y) => y.id === req.params.id && !y.revokedAt);
    if (!l) return res.status(404).json({ error: 'Link not found.' });
    l.revokedAt = nowIso();
    audit(req.user, 'travel_summary_link_off', p.id, 'summary', l.id);
    store.save();
    res.json({ ok: true });
  });

  app.get('/api/public/travel-summary/:token', publicLimiter, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Robots-Tag', 'noindex');
    const t = String(req.params.token || '');
    if (!/^[\w-]{20,64}$/.test(t)) return res.status(404).json({ error: 'This link is not valid.' });
    const h = hash(t);
    let p = null; let link = null;
    for (const y of db().patients) {
      if (y.erasedAt) continue;
      const l = (y.travelLinks || []).find((z) => z.hash === h);
      if (l) { p = y; link = l; break; }
    }
    if (!p || link.revokedAt || Date.parse(link.expiresAt) <= Date.now()) return res.status(410).json({ error: 'This medical summary link has expired or was switched off by the patient.' });
    link.views = (link.views || 0) + 1;
    const first = !link.lastViewAt || Date.now() - Date.parse(link.lastViewAt) > 6 * 3600000;
    link.lastViewAt = nowIso();
    audit(PUBLIC_ACTOR, 'travel_summary_viewed', p.id, 'summary', link.id);
    // The patient hears when their summary is opened (at most every six hours, so a doctor scrolling isn't spam).
    if (first) patientOwnerUserIds(p).forEach((u) => notify(u, 'Your medical summary was opened', `Someone opened the summary link you shared (valid until ${link.expiresAt.slice(0, 10)}). Not expected? Switch the link off in Care abroad.`));
    store.save();
    res.json({ ...summary(p, link.sections), validUntil: link.expiresAt });
  });
};
