// "Teach Saathi": answers the Sehatra team writes (timings, fees policy, where a service is, how something works)
// that Saathi gives word for word when a message contains one of the entry's trigger words. Checked before any AI
// and before the built-in answers, so the team's own answer always wins. Emergencies still go to 108 first.
const MAX = 200;

const norm = (s) => ` ${String(s || '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;
// Trigger words: comma-separated phrases; a phrase matches as whole words ("fee" doesn't match "feet").
const phrases = (s) => String(s || '').split(',').map((x) => norm(x).trim()).filter((x) => x.length >= 2).slice(0, 20);

// Best entry for a message: the one with the most matching trigger phrases (longer phrases win ties).
function match(entries, message) {
  const m = norm(message);
  let best = null;
  for (const e of entries) {
    if (e.active === false) continue;
    const hits = e.triggers.filter((p) => m.includes(` ${p} `));
    if (!hits.length) continue;
    const score = hits.length * 100 + Math.max(...hits.map((h) => h.length));
    if (!best || score > best.score) best = { e, score, hits };
  }
  return best ? { id: best.e.id, question: best.e.question, answer: best.e.answer, hits: best.hits } : null;
}

module.exports = function saathiFaq(app, { auth, role, db, store, audit, clean, nowIso, broadcast }) {
  const list = () => { const x = db(); x.saathiFaqs ||= []; return x.saathiFaqs; };
  const out = (e) => ({ id: e.id, question: e.question, answer: e.answer, triggers: e.triggers.join(', '), active: e.active !== false, uses: e.uses || 0, updatedAt: e.updatedAt });
  function read(b) {
    const question = clean(b.question, 200);
    const answer = String(b.answer || '').replace(/\r/g, '').trim().slice(0, 1500);
    const triggers = phrases(b.triggers);
    if (question.length < 5) return { error: 'Write the question people ask.' };
    if (answer.length < 10) return { error: 'Write the answer Saathi should give.' };
    if (!triggers.length) return { error: 'Add at least one trigger word, e.g. "timing, open, hours".' };
    return { entry: { question, answer, triggers, active: b.active !== false } };
  }

  app.get('/api/admin/saathi-faqs', auth, role('super_admin'), (_req, res) => res.json(list().map(out)));
  app.post('/api/admin/saathi-faqs', auth, role('super_admin'), (req, res) => {
    if (list().length >= MAX) return res.status(400).json({ error: `Up to ${MAX} answers.` });
    const { entry, error } = read(req.body || {});
    if (error) return res.status(400).json({ error });
    const e = { id: store.id('faq'), ...entry, createdAt: nowIso(), updatedAt: nowIso(), by: req.user.id };
    list().unshift(e);
    audit(req.user, 'saathi_faq_added', null, 'saathi', e.question);
    store.save(); broadcast('admin');
    res.json(out(e));
  });
  app.put('/api/admin/saathi-faqs/:id', auth, role('super_admin'), (req, res) => {
    const e = list().find((x) => x.id === req.params.id);
    if (!e) return res.status(404).json({ error: 'Answer not found.' });
    const { entry, error } = read({ ...out(e), ...req.body });
    if (error) return res.status(400).json({ error });
    Object.assign(e, entry, { updatedAt: nowIso() });
    audit(req.user, 'saathi_faq_updated', null, 'saathi', e.question);
    store.save(); broadcast('admin');
    res.json(out(e));
  });
  app.delete('/api/admin/saathi-faqs/:id', auth, role('super_admin'), (req, res) => {
    const i = list().findIndex((x) => x.id === req.params.id);
    if (i < 0) return res.status(404).json({ error: 'Answer not found.' });
    const [e] = list().splice(i, 1);
    audit(req.user, 'saathi_faq_deleted', null, 'saathi', e.question);
    store.save(); broadcast('admin');
    res.json({ ok: true });
  });
  // "Try it": which answer a message would get.
  app.post('/api/admin/saathi-faqs/test', auth, role('super_admin'), (req, res) => res.json({ match: match(list(), clean(req.body?.message, 500)) }));

  // For chat.js: the team's answer for this message, if any (counts how often each is used).
  function answerFor(message) {
    const hit = match(list(), message);
    if (!hit) return null;
    const e = list().find((x) => x.id === hit.id);
    if (e) e.uses = (e.uses || 0) + 1;
    return hit.answer;
  }
  return { answerFor };
};
module.exports.match = match;
module.exports.phrases = phrases;
