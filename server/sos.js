// One-tap SOS. A patient (or a guardian, for a family member) presses and holds SOS: their phone opens 108, and
// this server alerts their family, ranks nearby hospitals (emergency department first, free beds and how fresh
// that count is), and opens an unguessable family page that works for 24 hours or until they mark themselves safe.
// Telling a hospital they're coming is opt-in per hospital — only then does any health detail leave the family.
const crypto = require('crypto');

const LIVE_MS = 24 * 3600000;    // family page lifetime while the SOS is active
const AFTER_SAFE_MS = 2 * 3600000; // the page shows "safe" for a while after, then stops working
const ACTIVE_REUSE_MS = 30 * 60000; // a second press soon after reuses the same alert (no duplicate alarms)

// Precise distance in km (the shared geo.km rounds to whole kilometres — too coarse for "which hospital is closest").
function distKm(a, b) {
  if (!a || !b) return null;
  const R = 6371; const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat); const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}

module.exports = function registerSos(app, x) {
  const { auth, role, activePatient, db, store, notify, touch, touchFacility, broadcast, audit, nowIso, clean, findUserByPhone,
    patientOwnerUserIds, patientPoint, geo, otp, publicLimiter, userById, ageOf, appUrl, emailsOn, escHtml, DEMO_EMAIL, circleUserIds = () => [] } = x;

  const events = () => { const d = db(); if (!d.sosEvents) d.sosEvents = []; return d.sosEvents; };
  const first = (name) => String(name || '').split(/\s+/)[0] || 'Someone';
  const shareUrl = (e) => `${appUrl()}/sos/${e.token}`;
  const expired = (e) => (e.status === 'active' ? Date.now() > Date.parse(e.startedAt) + LIVE_MS : Date.now() > Date.parse(e.resolvedAt || e.startedAt) + AFTER_SAFE_MS);
  const hasEmergency = (h) => /emergency|24\s*[x×]\s*7|casualty/i.test(h.hours || '') || (h.departments || []).some((dep) => /emergency|casualty|trauma/i.test(dep));

  // Verified hospitals near a point: emergency departments first (a 30 km handicap for the rest), then distance.
  function nearbyHospitals(point, p, limit = 5) {
    const d = db();
    return d.facilities.filter((f) => f.type === 'hospital' && f.subtype !== 'clinic' && f.verified)
      .map((f) => {
        const exact = geo.validCoord(f.lat, f.lng) ? { lat: f.lat, lng: f.lng } : null;
        const km = distKm(point, exact || geo.pointOf(f));
        const rows = d.beds.filter((b) => b.facilityId === f.id && Number(b.total) > 0);
        const beds = rows.length ? {
          total: rows.reduce((s, b) => s + Number(b.total || 0), 0),
          free: rows.reduce((s, b) => s + Math.max(0, Number(b.total || 0) - Number(b.occupied || 0)), 0),
          updatedAt: rows.map((b) => b.updatedAt).filter(Boolean).sort().pop() || null,
        } : null;
        return { f, km, er: hasEmergency(f), exact, beds };
      })
      .filter((h) => h.km != null ? h.km <= 80 : (h.f.district && h.f.district === p?.district))
      .sort((a, b) => ((a.km ?? 40) + (a.er ? 0 : 30)) - ((b.km ?? 40) + (b.er ? 0 : 30)))
      .slice(0, limit);
  }
  const hasDesk = (fid) => db().users.some((u) => u.role === 'hospital_admin' && u.facilityId === fid && !u.disabled);

  // Everyone on Sehatra who should hear about it: the profile's other owner (guardian / the person themself) and
  // emergency contacts whose phone number has a Sehatra account. Never the person who pressed it.
  function familyUsers(p, presserId) {
    const ids = new Set([...patientOwnerUserIds(p), ...circleUserIds(p)]); // + everyone who joined their emergency circle
    for (const c of p.emergencyContacts || []) {
      if (c.relation === 'Mobile' || !c.phone) continue;
      const u = findUserByPhone(c.phone);
      if (u) ids.add(u.id);
    }
    ids.delete(presserId);
    return [...ids].map((id) => userById(id)).filter((u) => u && !u.disabled);
  }

  function mailFamily(users, subject, lines) {
    if (!emailsOn()) return;
    for (const u of users) {
      const to = u.email && !DEMO_EMAIL.test(u.email) ? u.email : null;
      if (!to) continue;
      const text = [`Hello ${first(u.name)},`, '', ...lines].join('\n');
      const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;border:2px solid #c4483f;border-radius:14px;color:#1d2b2a"><h2 style="color:#c4483f;margin:0 0 12px">Sehatra SOS</h2><p>${escHtml(`Hello ${first(u.name)},`)}</p>${lines.map((l) => (/^https?:\/\//.test(l) ? `<p><a href="${escHtml(l)}" style="background:#c4483f;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none">Open the live SOS page</a></p>` : `<p>${escHtml(l)}</p>`)).join('')}<p style="color:#6f7c78;font-size:12px">You are receiving this because you are an emergency contact on Sehatra.</p></div>`;
      otp.sendMail({ to, subject, text, html }).catch(() => {});
    }
  }

  // What the patient app shows. Hospitals are re-ranked on every read so bed counts are always current.
  function view(e, p) {
    const point = e.location || patientPoint(p);
    const hospitals = nearbyHospitals(point, p).map((h) => ({
      id: h.f.id, name: h.f.name, address: [h.f.address, h.f.district].filter(Boolean).join(', '), phone: h.f.phone || null,
      distanceKm: h.km, emergency: h.er, lat: h.exact?.lat ?? null, lng: h.exact?.lng ?? null, beds: h.beds,
      canPrealert: e.status === 'active' && hasDesk(h.f.id), prealerted: (e.prealerts || []).some((a) => a.facilityId === h.f.id),
    }));
    return {
      id: e.id, status: e.status, name: p.name, startedAt: e.startedAt, resolvedAt: e.resolvedAt || null,
      location: e.location || null, approximate: !e.location, shareUrl: shareUrl(e), hospitals,
      alerted: (e.alerted || []).map((a) => ({ name: a.name, email: a.email })),
      contacts: (p.emergencyContacts || []).filter((c) => c.relation !== 'Mobile' && c.phone).map((c) => ({ name: c.name, relation: c.relation, phone: c.phone })),
      views: e.views || 0, lastViewAt: e.lastViewAt || null,
    };
  }

  const readLoc = (b) => {
    const lat = Number(b?.lat); const lng = Number(b?.lng);
    if (!geo.validCoord(lat, lng)) return null;
    // Full precision: an ambulance needs the gate, not the neighbourhood. Kept only on this SOS record.
    return { lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5, accuracy: Math.min(100000, Math.max(0, Math.round(Number(b.accuracy) || 0))) || null, at: nowIso() };
  };
  const mine = (req) => {
    const p = activePatient(req);
    const e = events().find((x) => x.id === req.params.id && x.patientId === p.id);
    return { p, e };
  };

  app.get('/api/patient/sos', auth, role('patient', 'caregiver'), (req, res) => {
    const p = activePatient(req);
    const e = events().filter((x) => x.patientId === p.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
    if (e && e.status === 'active' && expired(e)) { e.status = 'safe'; e.resolvedAt = nowIso(); e.autoClosed = true; store.save(); }
    res.json({ sos: e ? view(e, p) : null });
  });

  app.post('/api/patient/sos', auth, role('patient', 'caregiver'), (req, res) => {
    const p = activePatient(req);
    const loc = readLoc(req.body);
    const recent = events().find((x) => x.patientId === p.id && x.status === 'active' && Date.now() - Date.parse(x.startedAt) < ACTIVE_REUSE_MS);
    if (recent) {
      if (loc) recent.location = loc;
      store.save();
      touch(patientOwnerUserIds(p), (recent.alerted || []).map((a) => a.userId));
      broadcast('sos');
      return res.json({ sos: view(recent, p), repeated: true });
    }
    const family = familyUsers(p, req.user.id);
    const e = {
      id: store.id('sos'), patientId: p.id, byUserId: req.user.id, status: 'active', startedAt: nowIso(), resolvedAt: null,
      location: loc, token: crypto.randomBytes(18).toString('base64url'), views: 0, lastViewAt: null, viewLog: [], prealerts: [],
      alerted: family.map((u) => ({ userId: u.id, name: u.name, email: Boolean(u.email && !DEMO_EMAIL.test(u.email) && emailsOn()) })),
    };
    events().unshift(e);
    const url = shareUrl(e);
    const who = first(p.name);
    for (const u of family) notify(u.id, `🚨 SOS from ${who}`, `${who} pressed SOS on Sehatra and may need help now. Live location and nearby hospitals: ${url}`, 'sos');
    mailFamily(family, `SOS: ${who} needs help`, [`${who} pressed SOS on Sehatra at ${new Date(e.startedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: process.env.APP_TZ || 'Asia/Kolkata' })} and may need help now.`, 'Try calling them. If you cannot reach them, call 108.', 'Their location and the nearest hospitals:', url]);
    audit(req.user, 'sos_started', p.id, 'sos', `SOS · ${family.length} family alerted${loc ? ' · with location' : ''}`);
    store.save();
    touch(patientOwnerUserIds(p));
    broadcast('sos', 'notifications');
    res.json({ sos: view(e, p) });
  });

  app.post('/api/patient/sos/:id/location', auth, role('patient', 'caregiver'), (req, res) => {
    const { p, e } = mine(req);
    if (!e || e.status !== 'active') return res.status(404).json({ error: 'This SOS has ended.' });
    const loc = readLoc(req.body);
    if (!loc) return res.status(400).json({ error: 'That location could not be read.' });
    e.location = loc;
    store.save();
    touch(patientOwnerUserIds(p));
    broadcast('sos');
    res.json({ sos: view(e, p) });
  });

  app.post('/api/patient/sos/:id/safe', auth, role('patient', 'caregiver'), (req, res) => {
    const { p, e } = mine(req);
    if (!e) return res.status(404).json({ error: 'SOS not found.' });
    if (e.status === 'active') {
      e.status = 'safe';
      e.resolvedAt = nowIso();
      const family = (e.alerted || []).map((a) => userById(a.userId)).filter(Boolean);
      const who = first(p.name);
      for (const u of family) notify(u.id, `✅ ${who} is safe`, `${who} marked themselves safe on Sehatra.`, 'sos');
      mailFamily(family, `${who} is safe`, [`${who} has marked themselves safe on Sehatra. The SOS is over.`]);
      audit(req.user, 'sos_safe', p.id, 'sos', 'Marked safe');
      store.save();
      touch(patientOwnerUserIds(p));
      broadcast('sos', 'notifications');
    }
    res.json({ sos: view(e, p) });
  });

  // Opt-in: tell one hospital's desk that this person may be on the way, with what the emergency team needs.
  app.post('/api/patient/sos/:id/prealert', auth, role('patient', 'caregiver'), (req, res) => {
    const { p, e } = mine(req);
    if (!e || e.status !== 'active') return res.status(404).json({ error: 'This SOS has ended.' });
    const fid = clean(req.body?.facilityId, 60);
    const near = nearbyHospitals(e.location || patientPoint(p), p);
    const h = near.find((x) => x.f.id === fid)?.f;
    if (!h) return res.status(400).json({ error: 'Pick one of the hospitals shown.' });
    if (!hasDesk(h.id)) return res.status(400).json({ error: 'This hospital is not taking alerts on Sehatra yet — please call them.' });
    if (!(e.prealerts || []).some((a) => a.facilityId === h.id)) {
      const age = ageOf(p.dob);
      const phone = userById(p.userId)?.phone || p.emergencyContacts?.find((c) => c.relation === 'Mobile')?.phone || '';
      const where = e.location ? ` Location: https://www.google.com/maps/search/?api=1&query=${e.location.lat},${e.location.lng}.` : '';
      const body = `${p.name}${age != null ? `, ${age} yrs` : ''}${p.gender ? `, ${p.gender}` : ''} pressed SOS and may be coming to you. Blood group: ${p.bloodGroup || 'unknown'}. Allergies: ${(p.allergies || []).join(', ') || 'none recorded'}. Conditions: ${(p.conditions || []).join(', ') || 'none recorded'}.${phone ? ` Phone: ${phone}.` : ''}${where}`;
      for (const u of db().users.filter((x) => x.role === 'hospital_admin' && x.facilityId === h.id && !x.disabled)) notify(u.id, '🚑 Incoming SOS patient', body, 'sos');
      (e.prealerts = e.prealerts || []).push({ facilityId: h.id, at: nowIso() });
      audit(req.user, 'sos_prealert', p.id, 'facility', `Shared emergency details with ${h.name} (patient's choice)`);
      store.save();
      touchFacility(h.id);
      broadcast('sos', 'notifications');
    }
    res.json({ sos: view(e, p) });
  });

  // The family page — no sign-in, so the link itself is the key: 144 random bits, compared in constant time.
  app.get('/api/public/sos/:token', publicLimiter, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Robots-Tag', 'noindex');
    const t = String(req.params.token || '');
    if (!/^[\w-]{20,64}$/.test(t)) return res.status(404).json({ error: 'This SOS link is not valid.' });
    const e = events().find((x) => x.token.length === t.length && crypto.timingSafeEqual(Buffer.from(x.token), Buffer.from(t)));
    if (!e || expired(e)) return res.status(410).json({ error: 'This SOS link has expired.' });
    const p = db().patients.find((x) => x.id === e.patientId);
    if (!p) return res.status(410).json({ error: 'This SOS link has expired.' });
    e.views = (e.views || 0) + 1;
    e.lastViewAt = nowIso();
    (e.viewLog = e.viewLog || []).push({ at: e.lastViewAt });
    if (e.viewLog.length > 100) e.viewLog.splice(0, e.viewLog.length - 100);
    store.save();
    touch(patientOwnerUserIds(p));
    broadcast('sos');
    const phone = userById(p.userId)?.phone || p.emergencyContacts?.find((c) => c.relation === 'Mobile')?.phone || null;
    const hospitals = nearbyHospitals(e.location || patientPoint(p), p, 3).map((h) => ({
      name: h.f.name, address: [h.f.address, h.f.district].filter(Boolean).join(', '), phone: h.f.phone || null, distanceKm: h.km, emergency: h.er,
      lat: h.exact?.lat ?? null, lng: h.exact?.lng ?? null, prealerted: (e.prealerts || []).some((a) => a.facilityId === h.f.id),
    }));
    // Once they're safe, the page only says so — no location, phone or hospitals any more.
    if (e.status !== 'active') return res.json({ name: first(p.name), status: e.status, startedAt: e.startedAt, resolvedAt: e.resolvedAt, location: null, phone: null, hospitals: [] });
    res.json({ name: first(p.name), status: e.status, startedAt: e.startedAt, resolvedAt: e.resolvedAt, location: e.location, phone, hospitals });
  });
};
