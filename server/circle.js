// Emergency circle: grown-up family and friends with their own Sehatra accounts who should hear about an SOS
// (and a critical lab result) at once. A phone number can't prove who owns it (we have no SMS), so joining is by
// invitation: the patient shares a one-time link, the other person opens it signed in and accepts.
//   Patient  GET    /api/patient/circle                   members + open invites
//            POST   /api/patient/circle/invite            { name } → { url } to share on WhatsApp/SMS
//            DELETE /api/patient/circle/:userId           remove someone
//   Anyone   GET    /api/circle/invite/:token             who invited you (first name only)
//   signed   POST   /api/circle/invite/:token/accept      join
//            GET    /api/circle/mine                      whose circles I'm in
//            POST   /api/circle/leave/:patientId          leave one
const crypto = require('crypto');

const INVITE_DAYS = 7;
const MAX_MEMBERS = 10;
const MAX_OPEN_INVITES = 5;

module.exports = function registerCircle(app, x) {
  const { auth, role, activePatient, db, store, notify, audit, broadcast, touch, nowIso, clean, patientOwnerUserIds, userById, appUrl, publicLimiter } = x;
  const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
  const first = (n) => String(n || '').split(/\s+/)[0] || 'Someone';
  const live = (p) => (p.circleInvites || []).filter((i) => Date.parse(i.expiresAt) > Date.now());
  const findInvite = (token) => {
    const h = hash(token);
    for (const p of db().patients) {
      if (p.erasedAt) continue;
      const inv = live(p).find((i) => i.hash === h);
      if (inv) return { p, inv };
    }
    return null;
  };
  const members = (p) => (p.circle || []).map((m) => ({ ...m, user: userById(m.userId) })).filter((m) => m.user && !['deleted', 'suspended'].includes(m.user.status));

  app.get('/api/patient/circle', auth, role('patient', 'caregiver'), (req, res) => {
    const p = activePatient(req);
    res.json({
      members: members(p).map((m) => ({ userId: m.userId, name: m.user.name, relation: m.relation || null, since: m.at })),
      invites: live(p).map((i) => ({ id: i.id, name: i.name || null, expiresAt: i.expiresAt })),
    });
  });

  app.post('/api/patient/circle/invite', auth, role('patient', 'caregiver'), (req, res) => {
    const p = activePatient(req);
    if (members(p).length >= MAX_MEMBERS) return res.status(409).json({ error: `Your emergency circle already has ${MAX_MEMBERS} people.` });
    const open = live(p);
    if (open.length >= MAX_OPEN_INVITES) return res.status(409).json({ error: 'You have several invites waiting. Ask them to accept, or wait a few days.' });
    const token = crypto.randomBytes(18).toString('base64url');
    const inv = { id: store.id('ci'), hash: hash(token), name: clean(req.body?.name, 60) || null, relation: clean(req.body?.relation, 30) || null, by: req.user.id, at: nowIso(), expiresAt: new Date(Date.now() + INVITE_DAYS * 86400000).toISOString() };
    p.circleInvites = [...open, inv];
    audit(req.user, 'circle_invite', p.id, 'circle', inv.name || 'invite link');
    store.save();
    res.json({ url: `${appUrl()}/circle/${token}`, expiresAt: inv.expiresAt });
  });

  app.delete('/api/patient/circle/:userId', auth, role('patient', 'caregiver'), (req, res) => {
    const p = activePatient(req);
    const before = (p.circle || []).length;
    p.circle = (p.circle || []).filter((m) => m.userId !== req.params.userId);
    if (p.circle.length === before) {
      const n = (p.circleInvites || []).length;
      p.circleInvites = (p.circleInvites || []).filter((i) => i.id !== req.params.userId); // also cancels an invite by id
      if (p.circleInvites.length === n) return res.status(404).json({ error: 'Not in your circle.' });
    }
    audit(req.user, 'circle_removed', p.id, 'circle', req.params.userId);
    store.save();
    touch(req.params.userId);
    broadcast('patients');
    res.json({ ok: true });
  });

  app.get('/api/circle/invite/:token', publicLimiter, (req, res) => {
    const f = findInvite(req.params.token);
    if (!f) return res.status(404).json({ error: 'This invite has expired or was already used. Ask them to send a new one.' });
    res.json({ from: first(f.p.name), expiresAt: f.inv.expiresAt });
  });

  app.post('/api/circle/invite/:token/accept', auth, role('patient', 'caregiver'), (req, res) => {
    const f = findInvite(req.params.token);
    if (!f) return res.status(404).json({ error: 'This invite has expired or was already used. Ask them to send a new one.' });
    const { p, inv } = f;
    if (patientOwnerUserIds(p).includes(req.user.id)) return res.status(400).json({ error: 'This is your own profile — send the link to a family member instead.' });
    const already = (p.circle || []).some((m) => m.userId === req.user.id);
    // Check before using up the link: a refusal leaves the invite working.
    if (!already && (p.circle || []).length >= MAX_MEMBERS) return res.status(409).json({ error: 'Their emergency circle is full.' });
    p.circleInvites = (p.circleInvites || []).filter((i) => i.id !== inv.id); // one use
    if (!already) p.circle = [...(p.circle || []), { userId: req.user.id, relation: inv.relation, at: nowIso() }];
    patientOwnerUserIds(p).forEach((u) => notify(u, `${first(req.user.name)} joined your emergency circle`, `If you press SOS, ${first(req.user.name)} will be alerted at once with your location.`));
    audit(req.user, 'circle_joined', p.id, 'circle', req.user.id);
    store.save();
    touch(patientOwnerUserIds(p));
    broadcast('patients', 'notifications');
    res.json({ ok: true, name: first(p.name) });
  });

  app.get('/api/circle/mine', auth, role('patient', 'caregiver'), (req, res) => {
    res.json(db().patients.filter((p) => !p.erasedAt && (p.circle || []).some((m) => m.userId === req.user.id)).map((p) => ({ patientId: p.id, name: first(p.name) })));
  });

  app.post('/api/circle/leave/:patientId', auth, role('patient', 'caregiver'), (req, res) => {
    const p = db().patients.find((y) => y.id === req.params.patientId);
    if (!p || !(p.circle || []).some((m) => m.userId === req.user.id)) return res.status(404).json({ error: 'You are not in that circle.' });
    p.circle = p.circle.filter((m) => m.userId !== req.user.id);
    audit(req.user, 'circle_left', p.id, 'circle', req.user.id);
    store.save();
    touch(patientOwnerUserIds(p));
    res.json({ ok: true });
  });

  // For SOS and critical results: the account ids in this profile's circle.
  return { circleUserIds: (p) => members(p).map((m) => m.userId) };
};
