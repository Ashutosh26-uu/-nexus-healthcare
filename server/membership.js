// Sehatra membership plans: a monthly price that includes a number of video consults (for the account holder,
// or the whole family on the account). The admin sets every plan — name, price, consults — Sehatra never shows a
// plan or price it didn't publish. Paid through the normal payment flow (Razorpay / UPI / demo), one month at a
// time; three days before it ends the person is reminded to renew. (UPI AutoPay needs Razorpay subscriptions
// switched on for the account — renewal stays a tap until then.)
// Using it: on a video-consult payment, "Use my plan" pays it from the month's consults.
const DAY = 86400000;
const PERIOD_DAYS = 30;

module.exports = function membership(app, deps) {
  const { auth, role, db, store, notify, audit, clean, nowIso, broadcast, touch, payments, dataMode, finalizePayment, payableProblem, patientOwnerUserIds } = deps;
  const d = () => { const x = db(); x.memberPlans ||= []; x.memberships ||= []; return x; };

  const planOut = (p) => ({ id: p.id, name: p.name, price: p.price, consults: p.consults, family: p.family, note: p.note || '', active: p.active !== false });
  const memOut = (m) => m && ({ id: m.id, planId: m.planId, planName: m.planName, status: m.status, startsAt: m.startsAt, endsAt: m.endsAt, consultsLeft: m.consultsLeft, consultsTotal: m.consultsTotal, family: m.family });
  // The month running now (a paid renewal waits until the current month ends).
  const activeFor = (userId, at = Date.now()) => d().memberships.find((m) => m.userId === userId && m.status === 'active' && Date.parse(m.startsAt) <= at && Date.parse(m.endsAt) > at) || null;

  function readPlan(b) {
    const name = clean(b.name, 60);
    const price = Math.round(Number(b.price));
    const consults = Math.round(Number(b.consults));
    if (name.length < 2) return { error: 'Give the plan a name.' };
    if (!(price >= 1 && price <= 100000)) return { error: 'Price must be between ₹1 and ₹1,00,000 a month.' };
    if (!(consults >= 1 && consults <= 50)) return { error: 'Included video consults: 1 to 50 a month.' };
    return { plan: { name, price, consults, family: b.family === true, note: clean(b.note, 300), active: b.active !== false } };
  }

  // ---- admin: publish plans ----
  app.get('/api/admin/member-plans', auth, role('super_admin'), (_req, res) => {
    const now = Date.now();
    res.json({
      plans: d().memberPlans.map(planOut),
      members: d().memberships.filter((m) => m.status === 'active' && Date.parse(m.endsAt) > now).length,
    });
  });
  app.post('/api/admin/member-plans', auth, role('super_admin'), (req, res) => {
    const { plan, error } = readPlan(req.body || {});
    if (error) return res.status(400).json({ error });
    if (d().memberPlans.length >= 10) return res.status(400).json({ error: 'Up to 10 plans.' });
    const p = { id: store.id('mp'), ...plan, createdAt: nowIso() };
    d().memberPlans.push(p);
    audit(req.user, 'member_plan_created', null, 'membership', `${p.name} · ₹${p.price}/month · ${p.consults} consults`);
    store.save(); broadcast('membership');
    res.json(planOut(p));
  });
  app.put('/api/admin/member-plans/:id', auth, role('super_admin'), (req, res) => {
    const p = d().memberPlans.find((x) => x.id === req.params.id);
    if (!p) return res.status(404).json({ error: 'Plan not found.' });
    const { plan, error } = readPlan({ ...planOut(p), ...req.body });
    if (error) return res.status(400).json({ error });
    Object.assign(p, plan, { updatedAt: nowIso() }); // members keep what they paid for until their month ends
    audit(req.user, 'member_plan_updated', null, 'membership', `${p.name} · ₹${p.price}/month · ${p.consults} consults · ${p.active ? 'on sale' : 'off sale'}`);
    store.save(); broadcast('membership');
    res.json(planOut(p));
  });

  // ---- patient: see, buy, renew ----
  app.get('/api/membership', auth, role('patient', 'caregiver'), (req, res) => {
    const mine = d().memberships.filter((m) => m.userId === req.user.id);
    res.json({
      plans: d().memberPlans.filter((p) => p.active !== false).map(planOut),
      active: memOut(activeFor(req.user.id)),
      history: mine.filter((m) => m.status !== 'pending').slice(0, 6).map(memOut),
    });
  });

  app.post('/api/membership/subscribe', auth, role('patient', 'caregiver'), async (req, res) => {
    const plan = d().memberPlans.find((p) => p.id === req.body?.planId && p.active !== false);
    if (!plan) return res.status(404).json({ error: 'This plan isn\'t available.' });
    const cur = activeFor(req.user.id);
    if (cur?.renewedBy) return res.status(409).json({ error: 'You have already renewed — the next month starts when this one ends.' });
    if (cur && Date.parse(cur.endsAt) - Date.now() > 7 * DAY) return res.status(409).json({ error: `Your ${cur.planName} plan runs until ${cur.endsAt.slice(0, 10)}. You can renew in its last week.` });
    // An unpaid earlier attempt is replaced, not stacked.
    for (const m of d().memberships) if (m.userId === req.user.id && m.status === 'pending') m.status = 'abandoned';
    d().payments.filter((x) => x.purpose === 'membership' && x.userId === req.user.id && x.status === 'created').forEach((x) => { x.status = 'void'; });
    const self = db().patients.find((p) => p.userId === req.user.id);
    const m = { id: store.id('mem'), userId: req.user.id, planId: plan.id, planName: plan.name, price: plan.price, consultsTotal: plan.consults, consultsLeft: plan.consults, family: plan.family, status: 'pending', createdAt: nowIso(), renews: cur?.id || null };
    const pay = { id: store.id('pay'), purpose: 'membership', refId: m.id, amount: plan.price, status: 'created', provider: payments.provider(), label: `${plan.name} · 1 month`, userId: req.user.id, patientId: self?.id || null, createdAt: nowIso() };
    try {
      const order = await payments.createOrder({ amount: pay.amount, receipt: pay.id, notes: { membership: m.id } });
      if (order) pay.orderId = order.orderId;
    } catch (e) { return res.status(502).json({ error: e.message }); }
    m.paymentId = pay.id;
    d().memberships.unshift(m);
    d().payments.push(pay);
    store.save();
    res.json({ membership: memOut(m), payment: payments.publicPayment(pay, { dataMode }) });
  });

  // ---- paying a consult from the plan ----
  // Is this payment a video consult the person's active plan covers? (Family plans cover every profile on the account.)
  function coverage(pay, user) {
    if (pay.purpose !== 'consult' || pay.status !== 'created' || pay.userId !== user.id) return null;
    const c = db().consults.find((x) => x.id === pay.refId);
    if (!c || c.visitType !== 'video') return null;
    const m = activeFor(user.id);
    if (!m || m.consultsLeft <= 0) return null;
    const self = db().patients.find((p) => p.userId === user.id);
    if (!m.family && c.patientId !== self?.id) return null;
    return m;
  }
  app.get('/api/payments/:id/membership', auth, role('patient', 'caregiver'), (req, res) => {
    const pay = d().payments.find((x) => x.id === req.params.id);
    if (!pay || pay.userId !== req.user.id) return res.status(404).json({ error: 'Payment not found.' });
    const m = coverage(pay, req.user);
    res.json(m ? { covered: true, planName: m.planName, consultsLeft: m.consultsLeft } : { covered: false });
  });
  app.post('/api/payments/:id/membership', auth, role('patient', 'caregiver'), (req, res) => {
    const pay = d().payments.find((x) => x.id === req.params.id);
    if (!pay || pay.userId !== req.user.id) return res.status(404).json({ error: 'Payment not found.' });
    if (pay.creditApplied > 0) return res.status(409).json({ error: 'Take the Sehatra credit off first, then use your plan.' });
    const problem = payableProblem(d(), pay);
    if (problem) return res.status(409).json({ error: problem });
    const m = coverage(pay, req.user);
    if (!m) return res.status(400).json({ error: 'Your plan doesn\'t cover this visit (video consults only, while consults are left this month).' });
    m.consultsLeft -= 1;
    Object.assign(pay, { gross: pay.gross ?? pay.amount, amount: 0, status: 'paid', paidAt: nowIso(), method: 'membership', membershipId: m.id, orderId: null });
    audit(req.user, 'paid_with_membership', pay.patientId, 'payment', `${pay.id} · ${m.planName} · ${m.consultsLeft} left`);
    finalizePayment(d(), pay, req.user);
    store.save();
    broadcast('consults', 'queue', 'payments', 'membership');
    res.json({ payment: payments.publicPayment(pay, { dataMode }), consultsLeft: m.consultsLeft });
  });

  // finalizePayment / payableProblem hooks for purpose 'membership'.
  function onPaid(dd, pay, user) {
    const m = dd.memberships.find((x) => x.id === pay.refId);
    if (!m || m.status !== 'pending') return;
    const prev = m.renews ? dd.memberships.find((x) => x.id === m.renews && x.status === 'active') : null;
    const start = prev && Date.parse(prev.endsAt) > Date.now() ? Date.parse(prev.endsAt) : Date.now();
    Object.assign(m, { status: 'active', paidAt: nowIso(), startsAt: new Date(start).toISOString(), endsAt: new Date(start + PERIOD_DAYS * DAY).toISOString() });
    if (prev) prev.renewedBy = m.id; // a renewal starts when the current month ends
    notify(m.userId, `${m.planName} is active ✅`, `${m.consultsTotal} video consult${m.consultsTotal > 1 ? 's' : ''} included until ${m.endsAt.slice(0, 10)}. Choose "Use my plan" when you pay for a video consult.`);
    touch(m.userId);
    audit(user, 'membership_paid', pay.patientId, 'membership', `${m.planName} · ₹${pay.amount} · until ${m.endsAt.slice(0, 10)}`);
  }
  function problem(dd, pay) {
    const m = dd.memberships.find((x) => x.id === pay.refId);
    if (!m || m.status !== 'pending') return 'This plan purchase was replaced or has expired. Please choose the plan again.';
    if (!dd.memberPlans.some((p) => p.id === m.planId && p.active !== false)) return 'This plan is no longer on sale.';
    return null;
  }

  // A plan-paid visit that is cancelled with a refund gets its consult back (no money moved, so nothing to refund).
  function returnUsed(dd = d()) {
    let n = 0;
    for (const pay of dd.payments) {
      if (pay.method !== 'membership' || pay.membershipReturned || !['refund_pending', 'refunded'].includes(pay.status)) continue;
      const m = dd.memberships.find((x) => x.id === pay.membershipId);
      if (m && m.status === 'active' && Date.parse(m.endsAt) > Date.now()) m.consultsLeft = Math.min(m.consultsTotal, m.consultsLeft + 1);
      Object.assign(pay, { membershipReturned: nowIso(), status: 'refunded', refundedAt: nowIso() });
      n += 1;
    }
    return n;
  }

  // Renewal reminders (3 days before the end) and expiry. Runs every 6 hours.
  function sweep(now = Date.now()) {
    let changed = returnUsed() > 0;
    for (const m of d().memberships) {
      if (m.status !== 'active') continue;
      const end = Date.parse(m.endsAt);
      if (end <= now) { m.status = 'expired'; changed = true; continue; }
      if (!m.reminded && !m.renewedBy && end - now < 3 * DAY) {
        m.reminded = nowIso(); changed = true;
        notify(m.userId, `Your ${m.planName} plan ends soon`, `It ends on ${m.endsAt.slice(0, 10)}. Renew from Wallet → Sehatra plan to keep your included consults.`);
      }
    }
    if (changed) store.save();
    return changed;
  }
  setInterval(() => { try { sweep(); } catch (e) { console.warn('[membership] sweep failed:', e.message); } }, 6 * 3600000).unref?.();

  return { onPaid, problem, sweep, activeFor, returnUsed };
};
