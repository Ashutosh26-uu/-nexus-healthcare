// Ayushman Bharat (PM-JAY) helper. Sehatra can't decide who is covered — only the government's own check can —
// so this guides people to it, keeps their card number on their passport, and lists hospitals that have
// themselves marked on Sehatra that they accept PM-JAY patients (never a list we made up).

module.exports = function registerAyushman(app, x) {
  const { auth, role, activePatient, db, store, audit, touchFacility, broadcast, patientPoint, geo, ageOf } = x;
  const CARD = 'Ayushman Bharat (PM-JAY) card';

  // Hospitals switch this on themselves (the person signing in for the hospital confirms it is empanelled).
  app.put('/api/hospital/schemes', auth, role('hospital_admin'), (req, res) => {
    const f = db().facilities.find((h) => h.id === req.user.facilityId);
    if (!f || f.type !== 'hospital') return res.status(404).json({ error: 'Hospital not found.' });
    const on = req.body?.pmjay === true;
    const set = new Set(f.schemes || []);
    if (on) set.add('PM-JAY'); else set.delete('PM-JAY');
    f.schemes = [...set];
    audit(req.user, on ? 'pmjay_on' : 'pmjay_off', null, 'facility', `${f.name}: ${on ? 'accepts' : 'does not accept'} Ayushman Bharat (PM-JAY)`);
    store.save();
    touchFacility(f.id);
    broadcast('facilities', 'doctors');
    res.json({ schemes: f.schemes });
  });

  // Keep the card number on the Health Passport, so hospitals and kiosks can see it (same rules as the profile form).
  app.post('/api/patient/ayushman/card', auth, role('patient', 'caregiver'), (req, res) => {
    const p = activePatient(req);
    const num = String(req.body?.number || '').trim().slice(0, 30).toUpperCase();
    if (!/^[A-Z0-9 /-]{4,30}$/.test(num)) return res.status(400).json({ error: 'Please check the card number — letters, numbers and dashes only.' });
    p.govIds = [{ type: CARD, number: num, addedAt: new Date().toISOString() }, ...(p.govIds || []).filter((g) => g.type !== CARD)];
    audit(req.user, 'added_pmjay_card', p.id, 'passport', 'Ayushman Bharat card saved to passport');
    store.save();
    res.json({ card: { number: num } });
  });

  app.get('/api/patient/ayushman', auth, role('patient', 'caregiver'), (req, res) => {
    const p = activePatient(req);
    const card = (p.govIds || []).find((g) => g.type === CARD) || null;
    const here = patientPoint(p);
    const hospitals = db().facilities
      .filter((f) => f.type === 'hospital' && f.verified && (f.schemes || []).includes('PM-JAY'))
      .map((f) => ({ id: f.id, name: f.name, address: [f.address, f.district, f.state].filter(Boolean).join(', '), phone: f.phone || null, km: here ? geo.km(here, geo.pointOf(f)) : null, emergency: /emergency|24\s*[x×]\s*7/i.test(f.hours || '') }))
      .sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9))
      .slice(0, 12);
    res.json({
      name: p.name, age: ageOf(p.dob), state: p.state || null,
      card: card ? { number: card.number } : null,
      hospitals,
    });
  });
};
