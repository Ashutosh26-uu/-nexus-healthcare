// India's Digital Personal Data Protection Act, 2023 and DPDP Rules, 2025: the privacy notice, a record of every
// consent given or withdrawn, and grievances answered within 90 days.
// - The notice stands on its own (what we collect, why, how to withdraw, how to complain) and is shown before
//   sign-up and once to every existing account. A new NOTICE_VERSION shows it again.
// - Consent is per purpose. "care" is needed to run the service; "ai" (Saathi's AI answers) is optional, off
//   until ticked, and can be switched off as easily as it was switched on. Without it Saathi uses only its
//   built-in answers and nothing typed leaves our servers.
// - Every change is kept as a consent record (who, which version, which purposes, which language, when).
const NOTICE_VERSION = '2026-11-v1';
const GRIEVANCE_DAYS = 90;
const TOPICS = ['access', 'correction', 'erasure', 'consent', 'misuse', 'other'];

function notice() {
  const officer = String(process.env.GRIEVANCE_OFFICER_NAME || '').trim().slice(0, 80) || null;
  const email = String(process.env.GRIEVANCE_EMAIL || process.env.SUPPORT_EMAIL || '').trim().slice(0, 120) || null;
  return {
    version: NOTICE_VERSION,
    controller: 'Sehatra',
    collect: [
      'Your name, email, mobile number, age, gender, language and address.',
      'Health details you or your care team add: symptoms, visits, prescriptions, lab reports, vitals, allergies and conditions.',
      'Family members you add, and the people in your emergency circle.',
      'Payments you make (we never see your card or UPI PIN), and basic device and sign-in records for security.',
    ],
    purposes: [
      { key: 'care', required: true, title: 'Run your care', text: 'Keep your Health Passport; book doctors, labs and medicines; share your record only with the people you approve; send you reminders and safety alerts; keep sign-in safe.' },
      { key: 'ai', required: false, title: 'Saathi AI answers (optional)', text: 'What you type to Saathi is sent to our AI service so it can answer. Your health record, name and contact details are never sent. Leave this off and Saathi uses only its built-in answers.' },
    ],
    rights: [
      'See what we hold about you, and correct or update it — in your profile and records.',
      'Withdraw consent at any time, as easily as you gave it — account menu → Privacy & consent.',
      'Ask us to erase your data — Settings → Delete my account (patients). Records the law requires us to keep are kept only as long as required.',
      'Nominate someone to act for you if you cannot — tell us through a privacy complaint.',
      `Raise a complaint. We reply within ${GRIEVANCE_DAYS} days. If you are not satisfied, you can approach the Data Protection Board of India.`,
    ],
    grievance: { officer, email, inApp: 'Account menu → Privacy & consent → Raise a privacy complaint' },
    retention: 'We keep your data while your account is open. When you delete it, we erase it after the grace period shown, except what the law requires us to keep.',
  };
}

module.exports = function dpdp(app, { auth, role, db, store, notify, audit, clean, nowIso, broadcast, touch }) {
  const d = () => { const x = db(); x.consentRecords ||= []; x.grievances ||= []; return x; };
  const currentFor = (user) => (user?.consent?.version === NOTICE_VERSION ? user.consent : null);

  // Records a decision and applies it to the account. `via`: signup | notice | settings.
  function record(user, { ai, lang, via }) {
    const at = nowIso();
    const prev = user.consent || null;
    const c = { version: NOTICE_VERSION, care: true, ai: ai === true, lang: clean(lang, 12) || 'en', at, via };
    user.consent = c;
    d().consentRecords.unshift({ id: store.id('cr'), userId: user.id, ...c, previous: prev ? { version: prev.version, ai: prev.ai } : null });
    return c;
  }

  // Validates what sign-up sent; returns the consent to record, or an error message.
  function fromSignup(body) {
    const c = body?.consent;
    if (!c || c.version !== NOTICE_VERSION || c.care !== true) return { error: 'Please read the privacy notice and tick that you agree, to create your account.' };
    return { ai: c.ai === true, lang: c.lang };
  }

  app.get('/api/public/privacy-notice', (_req, res) => res.json(notice()));

  app.get('/api/me/consent', auth, (req, res) => {
    const mine = d().consentRecords.filter((r) => r.userId === req.user.id).slice(0, 20);
    res.json({ version: NOTICE_VERSION, current: currentFor(req.user), needsNotice: !currentFor(req.user), history: mine.map(({ userId: _u, ...r }) => r) });
  });

  // Accept the notice (first time / new version) or change the optional purpose. Turning "ai" off is one call.
  app.post('/api/me/consent', auth, (req, res) => {
    const b = req.body || {};
    if (b.version !== NOTICE_VERSION) return res.status(409).json({ error: 'The privacy notice has changed. Please read the latest one.', version: NOTICE_VERSION });
    if (b.care !== true) return res.status(400).json({ error: 'Using Sehatra needs consent to run your care. To stop, delete your account instead.' });
    const before = req.user.consent;
    const c = record(req.user, { ai: b.ai === true, lang: b.lang, via: currentFor(req.user) ? 'settings' : 'notice' });
    const what = !before || before.version !== NOTICE_VERSION ? `accepted notice ${NOTICE_VERSION}` : before.ai !== c.ai ? (c.ai ? 'gave consent: Saathi AI' : 'withdrew consent: Saathi AI') : 'confirmed consent';
    audit(req.user, 'consent', null, 'privacy', `${what} (AI ${c.ai ? 'on' : 'off'})`);
    store.save();
    res.json({ current: c });
  });

  // ---- Grievances (Rule: answered within 90 days) ----
  const pub = (g, { admin = false } = {}) => ({
    id: g.id, topic: g.topic, text: g.text, status: g.status, at: g.at, dueBy: g.dueBy, replies: g.replies || [], closedAt: g.closedAt || null,
    ...(admin ? { user: g.userName, role: g.role, email: g.email } : {}),
  });

  app.post('/api/grievances', auth, (req, res) => {
    const topic = TOPICS.includes(req.body?.topic) ? req.body.topic : 'other';
    const text = clean(req.body?.text, 2000);
    if (text.length < 10) return res.status(400).json({ error: 'Please tell us a little more — at least a sentence.' });
    const open = d().grievances.filter((g) => g.userId === req.user.id && g.status === 'open');
    if (open.length >= 5) return res.status(429).json({ error: 'You already have 5 open complaints. We will reply to those first.' });
    const at = nowIso();
    const g = { id: store.id('gr'), userId: req.user.id, userName: req.user.name, role: req.user.role, email: req.user.email || '', topic, text, status: 'open', at, dueBy: new Date(Date.parse(at) + GRIEVANCE_DAYS * 86400000).toISOString(), replies: [] };
    d().grievances.unshift(g);
    const admins = db().users.filter((u) => u.role === 'super_admin');
    admins.forEach((a) => notify(a.id, 'New privacy complaint', `${topic} · reply by ${g.dueBy.slice(0, 10)}`));
    touch(admins.map((a) => a.id));
    audit(req.user, 'grievance_raised', null, 'privacy', `${g.id} · ${topic}`);
    store.save();
    broadcast('admin');
    res.json(pub(g));
  });

  app.get('/api/grievances', auth, (req, res) => res.json(d().grievances.filter((g) => g.userId === req.user.id).slice(0, 20).map((g) => pub(g))));

  app.get('/api/admin/grievances', auth, role('super_admin'), (_req, res) => {
    const all = d().grievances;
    const now = Date.now();
    res.json({
      open: all.filter((g) => g.status === 'open').sort((a, b) => a.dueBy.localeCompare(b.dueBy)).map((g) => ({ ...pub(g, { admin: true }), daysLeft: Math.ceil((Date.parse(g.dueBy) - now) / 86400000) })),
      closed: all.filter((g) => g.status !== 'open').slice(0, 50).map((g) => pub(g, { admin: true })),
      consents: { total: db().users.filter((u) => u.consent?.version === NOTICE_VERSION).length, ai: db().users.filter((u) => u.consent?.version === NOTICE_VERSION && u.consent.ai).length, version: NOTICE_VERSION },
    });
  });

  app.post('/api/admin/grievances/:id/reply', auth, role('super_admin'), (req, res) => {
    const g = d().grievances.find((x) => x.id === req.params.id);
    if (!g) return res.status(404).json({ error: 'Complaint not found.' });
    const text = clean(req.body?.text, 2000);
    if (text.length < 5) return res.status(400).json({ error: 'Write a reply first.' });
    g.replies = [...(g.replies || []), { by: req.user.name, text, at: nowIso() }];
    if (req.body?.close) { g.status = 'closed'; g.closedAt = nowIso(); }
    notify(g.userId, req.body?.close ? 'Your privacy complaint is resolved' : 'Reply to your privacy complaint', text.slice(0, 160));
    touch(g.userId);
    audit(req.user, req.body?.close ? 'grievance_closed' : 'grievance_replied', null, 'privacy', g.id);
    store.save();
    broadcast('admin');
    res.json(pub(g, { admin: true }));
  });

  return { NOTICE_VERSION, record, fromSignup, aiAllowed: (user) => Boolean(currentFor(user)?.ai) };
};
