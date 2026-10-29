// Software connectors — a hospital's HMIS, a lab's LIS or a chemist's billing software (Marg, GoFrugal, any other)
// talks to Sehatra through one small, documented API instead of staff typing the same thing twice.
//
// A facility's staff create a key in their portal (shown once, stored only as a sha256 hash, revocable, last use
// tracked). The software sends it as "Authorization: Bearer sehatra_…". A key belongs to one facility and one
// kind, and can only touch that facility's own data:
//   hmis     GET  /api/integration/v1/beds                    bed counts
//            PUT  /api/integration/v1/beds                    { beds: [{ type, total?, occupied? }] }
//            GET  /api/integration/v1/referrals?since=ISO     referrals sent to this hospital
//   lis      GET  /api/integration/v1/lab-orders?status=…     paid / confirmed orders for this lab (tests carry LOINC codes)
//            PUT  /api/integration/v1/lab-orders/:id/status   { status: collected | received | processing }
//            POST /api/integration/v1/lab-orders/:id/results  { results: [{ name, value, unit, range, flag }] }
//                 → goes to the pathologist's queue; software can never sign or release a report
//   billing  GET  /api/integration/v1/stock
//            PUT  /api/integration/v1/stock                   { rows: [{ drug, batch, expiry, qty, gtin? }], mode: 'set' | 'add' }
//            POST /api/integration/v1/sales                   { lines: [{ drug, qty, batch? }] } — sold at the counter (exact name)
//   all      GET  /api/integration/v1/me
// Webhooks (optional, https only, never to private/internal addresses): a POST of { event, id, facilityId,
// occurredAt } — ids only, never patient details; the software fetches what it needs with its key. Signed with
// HMAC-SHA256 over "<timestamp>.<body>" (headers X-Sehatra-Timestamp, X-Sehatra-Signature: sha256=<hex>).
//   hmis → referral.created     lis → lab_order.created
// The same in HL7 FHIR R4: fhir.js.
// Staff routes (session login): GET/POST /api/facility/integrations, PUT/DELETE /api/facility/integrations/:id,
// POST /api/facility/integrations/:id/test.
const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');

const KIND_BY_ROLE = { hospital_admin: 'hmis', lab_tech: 'lis', pharmacist: 'billing', distributor: 'billing' };
const KIND_LABEL = { hmis: 'Hospital software (HMIS)', lis: 'Lab software (LIS)', billing: 'Billing software' };
const MAX_KEYS = 5;
const PAUSE_AFTER = 30; // consecutive failed deliveries before a webhook is paused (staff are told)

// Addresses a webhook must never reach: loopback, private, link-local (cloud metadata), CGNAT, multicast, reserved.
function privateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const s = ip.toLowerCase();
  if (s.startsWith('::ffff:')) return privateIp(s.slice(7));
  return s === '::' || s === '::1' || s.startsWith('fc') || s.startsWith('fd') || s.startsWith('fe8') || s.startsWith('fe9') || s.startsWith('fea') || s.startsWith('feb') || s.startsWith('ff');
}

module.exports = function registerIntegrations(app, x) {
  const { auth, role, db, store, notify, audit, broadcast, touch, touchFacility, nowIso, clean, addStock, validStockRow, sameDrug,
    labView, moveLabStatus, labStaffIds, isPathologist, facilityUsers, secret, allowLocalWebhooks, security } = x;
  const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
  const list = () => { const d = db(); if (!d.integrations) d.integrations = []; return d.integrations; };
  // The webhook signing secret is derived from the server secret — shown once, never stored.
  const hookSecret = (it) => `whsec_${crypto.createHmac('sha256', secret).update(`webhook:${it.id}:${it.secretVersion || 1}`).digest('base64url')}`;
  const view = (it) => ({
    id: it.id, kind: it.kind, name: it.name, keyPrefix: it.keyPrefix, createdAt: it.createdAt, createdBy: it.createdByName, lastUsedAt: it.lastUsedAt || null,
    calls: it.calls || 0, webhookUrl: it.webhookUrl || null, webhookPausedAt: it.webhookPausedAt || null, lastDelivery: it.lastDelivery || null,
  });

  async function checkWebhookUrl(raw) {
    if (!raw) return { url: null };
    let u;
    try { u = new URL(String(raw).trim()); } catch { return { error: 'That isn\'t a web address.' }; }
    const local = allowLocalWebhooks && ['localhost', '127.0.0.1'].includes(u.hostname);
    if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return { error: 'The webhook address must start with https://' };
    if (u.username || u.password) return { error: 'Don\'t put a password in the webhook address.' };
    if (String(raw).length > 300) return { error: 'That address is too long.' };
    if (!local) {
      const host = u.hostname.replace(/^\[|\]$/g, '');
      let addrs;
      try { addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }); } catch { return { error: 'That web address can\'t be found.' }; }
      if (!addrs.length || addrs.some((a) => privateIp(a.address))) return { error: 'Webhooks can only go to a public internet address.' };
    }
    return { url: u.toString() };
  }

  async function deliver(it, event, id, occurredAt) {
    const check = await checkWebhookUrl(it.webhookUrl); // re-checked on every send: DNS can change
    if (check.error) return { ok: false, error: check.error };
    const body = JSON.stringify({ event, id, facilityId: it.facilityId, occurredAt });
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = crypto.createHmac('sha256', hookSecret(it)).update(`${ts}.${body}`).digest('hex');
    try {
      const r = await fetch(check.url, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(6000), body,
        headers: { 'content-type': 'application/json', 'user-agent': 'Sehatra-Webhooks/1', 'x-sehatra-event': event, 'x-sehatra-timestamp': ts, 'x-sehatra-signature': `sha256=${sig}` },
      });
      return r.ok ? { ok: true, status: r.status } : { ok: false, status: r.status, error: `Their server answered ${r.status}.` };
    } catch (e) {
      return { ok: false, error: e.name === 'TimeoutError' ? 'Their server didn\'t answer within 6 seconds.' : 'Their server couldn\'t be reached.' };
    }
  }

  // ---------- staff: keys for this facility ----------
  const staff = role('hospital_admin', 'lab_tech', 'pharmacist', 'distributor');
  const mine = (req) => list().filter((it) => it.facilityId === req.user.facilityId && !it.revokedAt);

  app.get('/api/facility/integrations', auth, staff, (req, res) => {
    res.json({ kind: KIND_BY_ROLE[req.user.role], label: KIND_LABEL[KIND_BY_ROLE[req.user.role]], keys: mine(req).map(view) });
  });

  app.post('/api/facility/integrations', auth, staff, async (req, res) => {
    const d = db();
    const fac = d.facilities.find((f) => f.id === req.user.facilityId);
    if (!fac) return res.status(404).json({ error: 'Facility not found.' });
    if (!fac.verified) return res.status(403).json({ error: 'Software can be connected once your facility is verified.' });
    if (req.user.role === 'lab_tech' && d.users.some((u) => isPathologist(u) && u.facilityId === fac.id && u.status === 'active') && !isPathologist(req.user)) {
      return res.status(403).json({ error: 'Your lab\'s pathologist connects lab software.' });
    }
    if (mine(req).length >= MAX_KEYS) return res.status(409).json({ error: `Up to ${MAX_KEYS} connections — switch an old one off first.` });
    const name = clean(req.body?.name, 60);
    if (name.length < 2) return res.status(400).json({ error: 'Name the software, e.g. “Marg ERP” or “Lab analyser PC”.' });
    const hook = await checkWebhookUrl(req.body?.webhookUrl);
    if (hook.error) return res.status(400).json({ error: hook.error });
    const key = `sehatra_${crypto.randomBytes(24).toString('base64url')}`;
    const it = {
      id: store.id('int'), facilityId: fac.id, kind: KIND_BY_ROLE[req.user.role], name, keyHash: hash(key), keyPrefix: key.slice(0, 12),
      createdAt: nowIso(), createdBy: req.user.id, createdByName: req.user.name, webhookUrl: hook.url, cursor: nowIso(),
    };
    list().push(it);
    audit(req.user, 'integration_key_created', null, 'integration', `${it.kind} · ${name} · ${it.keyPrefix}…`);
    facilityUsers(d, fac.id).filter((u) => u !== req.user.id).forEach((u) => notify(u, 'Software connected', `${req.user.name} connected “${name}” (${KIND_LABEL[it.kind]}) to ${fac.name}. If that's unexpected, switch it off under Connectors.`));
    store.save();
    touchFacility(fac.id); broadcast('integrations');
    res.json({ ...view(it), key, webhookSecret: hookSecret(it) });
  });

  app.put('/api/facility/integrations/:id', auth, staff, async (req, res) => {
    const it = mine(req).find((k) => k.id === req.params.id);
    if (!it) return res.status(404).json({ error: 'Connection not found.' });
    const hook = await checkWebhookUrl(req.body?.webhookUrl);
    if (hook.error) return res.status(400).json({ error: hook.error });
    it.webhookUrl = hook.url; it.webhookPausedAt = null; it.failures = 0;
    if (hook.url) it.cursor = it.cursor || nowIso();
    audit(req.user, 'integration_webhook_set', null, 'integration', `${it.name} → ${hook.url ? new URL(hook.url).host : 'none'}`);
    store.save();
    touchFacility(it.facilityId); broadcast('integrations');
    res.json(view(it));
  });

  app.delete('/api/facility/integrations/:id', auth, staff, (req, res) => {
    const it = mine(req).find((k) => k.id === req.params.id);
    if (!it) return res.status(404).json({ error: 'Connection not found.' });
    it.revokedAt = nowIso(); it.revokedBy = req.user.id;
    audit(req.user, 'integration_key_revoked', null, 'integration', `${it.name} · ${it.keyPrefix}…`);
    store.save();
    touchFacility(it.facilityId); broadcast('integrations');
    res.json({ ok: true });
  });

  const testLimiter = security.rateLimit({ windowMs: 60000, max: 6, key: (req) => req.user?.id || '', message: 'Please wait a minute before testing again.' });
  app.post('/api/facility/integrations/:id/test', auth, staff, testLimiter, async (req, res) => {
    const it = mine(req).find((k) => k.id === req.params.id);
    if (!it) return res.status(404).json({ error: 'Connection not found.' });
    if (!it.webhookUrl) return res.status(400).json({ error: 'Add a webhook address first.' });
    const r = await deliver(it, 'ping', it.id, nowIso());
    it.lastDelivery = { at: nowIso(), event: 'ping', ok: r.ok, status: r.status || null, error: r.error || null };
    if (r.ok) { it.failures = 0; it.webhookPausedAt = null; }
    store.save();
    touchFacility(it.facilityId); broadcast('integrations');
    res.json(it.lastDelivery);
  });

  // ---------- software: key auth ----------
  const keyLimiter = security.rateLimit({ windowMs: 60000, max: 240, key: (req) => req.integration?.id || '', message: 'Too many requests from this software — slow down to 4 a second.' });
  function keyAuth(kind) {
    return (req, res, next) => {
      const h = String(req.headers.authorization || '');
      const key = h.startsWith('Bearer ') ? h.slice(7).trim() : String(req.headers['x-api-key'] || '').trim();
      if (!/^sehatra_[A-Za-z0-9_-]{20,64}$/.test(key)) return res.status(401).json({ error: 'Send your Sehatra key as "Authorization: Bearer sehatra_…".' });
      const k = hash(key);
      const it = list().find((i) => i.keyHash === k && !i.revokedAt);
      if (!it) return res.status(401).json({ error: 'This key isn\'t valid or was switched off.' });
      const fac = db().facilities.find((f) => f.id === it.facilityId);
      if (!fac?.verified) return res.status(403).json({ error: 'This facility isn\'t active on Sehatra.' });
      if (kind && it.kind !== kind) return res.status(403).json({ error: `This is a ${KIND_LABEL[it.kind]} key — it can't use this endpoint.` });
      // last-use stamped at most once a minute (no write per call)
      it.calls = (it.calls || 0) + 1;
      if (!it.lastUsedAt || Date.now() - Date.parse(it.lastUsedAt) > 60000) { it.lastUsedAt = nowIso(); store.save(); }
      req.integration = it; req.facility = fac;
      // Who did it, for the audit log and "entered by": the software, under its own name.
      req.actor = { id: `integration:${it.id}`, name: `${it.name} (software)`, role: `integration_${it.kind}` };
      next();
    };
  }
  const V1 = '/api/integration/v1';
  const k = (kind) => [keyAuth(kind), keyLimiter];

  app.get(`${V1}/me`, ...k(null), (req, res) => {
    res.json({ facility: { id: req.facility.id, name: req.facility.name, type: req.facility.type, district: req.facility.district, state: req.facility.state }, kind: req.integration.kind, connection: req.integration.name });
  });

  // ---------- HMIS ----------
  const bedRow = (b) => ({ type: b.type, total: b.total || 0, occupied: b.occupied || 0, free: Math.max(0, (b.total || 0) - (b.occupied || 0)), updatedAt: b.updatedAt || null });
  app.get(`${V1}/beds`, ...k('hmis'), (req, res) => {
    res.json({ beds: db().beds.filter((b) => b.facilityId === req.facility.id).map(bedRow) });
  });
  app.put(`${V1}/beds`, ...k('hmis'), (req, res) => {
    const d = db();
    const rows = Array.isArray(req.body?.beds) ? req.body.beds.slice(0, 20) : [];
    if (!rows.length) return res.status(400).json({ error: 'Send { beds: [{ type, total, occupied }] }.' });
    const errors = []; const updated = [];
    for (const r of rows) {
      const b = d.beds.find((x) => x.facilityId === req.facility.id && x.type === r?.type);
      if (!b) { errors.push({ type: clean(r?.type, 30) || null, error: `Unknown bed type. Use one of: ${d.beds.filter((x) => x.facilityId === req.facility.id).map((x) => x.type).join(', ')}.` }); continue; }
      const total = r.total === undefined ? b.total : Number(r.total);
      const occ = r.occupied === undefined ? b.occupied : Number(r.occupied);
      if (!Number.isFinite(total) || total < 0 || total > 100000 || !Number.isFinite(occ) || occ < 0) { errors.push({ type: b.type, error: 'Counts must be whole numbers, 0 or more.' }); continue; }
      b.total = Math.round(total); b.occupied = Math.min(b.total, Math.round(occ)); b.updatedAt = nowIso(); b.updatedBy = req.actor.name;
      updated.push(bedRow(b));
    }
    if (updated.length) {
      audit(req.actor, 'beds_synced', null, 'beds', updated.map((b) => `${b.type} ${b.occupied}/${b.total}`).join(', '));
      store.save();
      touchFacility(req.facility.id);
      broadcast('beds', 'gov');
    }
    res.status(updated.length ? 200 : 400).json({ updated, errors });
  });
  app.get(`${V1}/referrals`, ...k('hmis'), (req, res) => {
    const since = Date.parse(req.query.since || '') || 0;
    const rows = db().referrals.filter((r) => r.toFacilityId === req.facility.id && Date.parse(r.createdAt) > since).slice(0, 200);
    audit(req.actor, 'referrals_pulled', null, 'referral', `${rows.length} referrals`);
    res.json({ referrals: rows });
  });

  // ---------- LIS ----------
  const labVisible = (o) => !o.needsBooking || o.booking?.paidAt;
  const STATUSES = ['ordered', 'collected', 'received', 'processing', 'review', 'reported'];
  app.get(`${V1}/lab-orders`, ...k('lis'), (req, res) => {
    const d = db();
    const want = String(req.query.status || '').split(',').filter((s) => STATUSES.includes(s));
    const since = Date.parse(req.query.since || '') || 0;
    const rows = d.labOrders.filter((o) => o.labId === req.facility.id && labVisible(o) && (!want.length || want.includes(o.status)) && Date.parse(o.createdAt) > since).slice(0, 200);
    audit(req.actor, 'lab_orders_pulled', null, 'lab', `${rows.length} orders`);
    res.json({ orders: rows.map((o) => labView(d, o)) });
  });
  const labOrder = (req, res) => {
    const o = db().labOrders.find((x) => x.id === req.params.id && x.labId === req.facility.id && labVisible(x));
    if (!o) res.status(404).json({ error: 'Order not found.' });
    return o;
  };
  app.put(`${V1}/lab-orders/:id/status`, ...k('lis'), (req, res) => {
    const o = labOrder(req, res); if (!o) return;
    const steps = ['ordered', 'collected', 'received', 'processing'];
    if (!steps.includes(req.body?.status)) return res.status(400).json({ error: 'Status must be collected, received or processing. Send results to the results endpoint.' });
    if (['review', 'reported'].includes(o.status) || steps.indexOf(req.body.status) <= steps.indexOf(o.status)) return res.status(409).json({ error: `Lab steps only move forward (now: ${o.status}).` });
    moveLabStatus(db(), o, req.body.status);
    touch(labStaffIds(o.labId));
    store.save();
    broadcast('lab', 'records');
    res.json(labView(db(), o));
  });
  // Results from the analyser / LIS land as a draft for the pathologist — exactly like a technician entering them.
  app.post(`${V1}/lab-orders/:id/results`, ...k('lis'), (req, res) => {
    const o = labOrder(req, res); if (!o) return;
    const out = saveDraft(req, o, req.body?.results);
    if (out.error) return res.status(out.status).json({ error: out.error });
    res.json({ id: o.id, status: o.status, awaitingApproval: true });
  });
  // Shared by the JSON API and FHIR (fhir.js): results become the pathologist's draft, never a signed report.
  function saveDraft(req, o, raw) {
    const d = db();
    if (o.status === 'reported') return { status: 409, error: 'This report is already signed and released.' };
    if (o.status === 'ordered') return { status: 409, error: 'The sample hasn\'t been collected yet.' };
    const results = (Array.isArray(raw) ? raw : []).slice(0, 60).filter((r) => r && typeof r === 'object')
      .map((r) => {
        const code = clean(r.code, 20);
        const test = code && o.tests.find((t) => t.code === code);
        return { name: clean(r.name, 80) || test?.name || code, value: clean(r.value, 40), unit: clean(r.unit, 20), range: clean(r.range, 40), flag: clean(r.flag, 20).toLowerCase() };
      })
      .filter((r) => r.name && r.value !== '');
    if (!results.length) return { status: 400, error: 'Send at least one result: { results: [{ name or code, value, unit, range, flag }] }.' };
    o.draftReport = { results, reportFileId: o.draftReport?.reportFileId || null, critical: results.some((r) => r.flag === 'critical'), enteredBy: { id: req.actor.id, name: req.actor.name }, enteredAt: nowIso(), source: 'lis' };
    o.returnNote = null;
    if (o.status !== 'review') { o.status = 'review'; o.reviewAt = nowIso(); }
    audit(req.actor, 'uploaded_report', o.patientId, 'lab', `${o.id} · from lab software · awaiting pathologist`);
    const p = d.patients.find((x) => x.id === o.patientId) || {};
    const crit = o.draftReport.critical;
    d.users.filter((u) => isPathologist(u) && u.facilityId === o.labId && u.status === 'active')
      .forEach((u) => notify(u.id, crit ? '🚨 Critical report to sign' : 'Report waiting for your signature', `${p.name} · ${o.tests.map((t) => t.name).join(', ')} · from ${req.integration.name}`, crit ? 'alert' : undefined));
    touch(labStaffIds(o.labId));
    store.save();
    broadcast('lab');
    return { ok: true };
  }

  // ---------- billing ----------
  const stockRow = (i) => ({ id: i.id, drug: i.drug, batch: i.batch || null, expiry: i.expiry || null, qty: i.qty, gtin: i.gtin || null, updatedAt: i.updatedAt || null });
  app.get(`${V1}/stock`, ...k('billing'), (req, res) => {
    res.json({ stock: db().inventory.filter((i) => i.facilityId === req.facility.id).map(stockRow) });
  });
  // mode 'set' (default): the quantity is what's on the shelf now — a re-sync never double-counts.
  app.put(`${V1}/stock`, ...k('billing'), (req, res) => {
    const out = upsertStock(req.facility, req.body?.rows, req.body?.mode === 'add' ? 'add' : 'set');
    if (out.error) return res.status(400).json({ error: out.error });
    if (out.changed) audit(req.actor, 'stock_synced', null, 'inventory', `${out.changed} rows`);
    res.json(out);
  });
  app.post(`${V1}/sales`, ...k('billing'), (req, res) => {
    const d = db();
    const lines = (Array.isArray(req.body?.lines) ? req.body.lines : []).slice(0, 100).filter((l) => l && typeof l === 'object');
    if (!lines.length) return res.status(400).json({ error: 'Send { lines: [{ drug, qty, batch? }] }.' });
    const done = []; const errors = [];
    lines.forEach((l, n) => {
      const drug = clean(l.drug, 80); const qty = parseInt(l.qty, 10); const batch = clean(l.batch, 30);
      if (drug.length < 2 || !Number.isInteger(qty) || qty < 1 || qty > 100000) { errors.push({ line: n + 1, error: 'Needs a medicine name and a whole quantity.' }); return; }
      let left = qty;
      if (batch) {
        const row = d.inventory.find((i) => i.facilityId === req.facility.id && sameDrug(i.drug, drug) && i.batch === batch && i.qty > 0);
        if (row) { const take = Math.min(row.qty, left); row.qty -= take; left -= take; row.updatedAt = nowIso(); }
      }
      // The rest from this exact medicine, earliest expiry first. Not takeStock's generic-name match: the billing
      // software names the product it sold, and a look-alike (Zinctest vs Zinc) must never lose stock.
      const rows = d.inventory.filter((i) => i.facilityId === req.facility.id && i.qty > 0 && sameDrug(i.drug, drug))
        .sort((p, q) => String(p.expiry || '9999').localeCompare(String(q.expiry || '9999')));
      for (const row of rows) {
        if (left <= 0) break;
        const take = Math.min(row.qty, left);
        row.qty -= take; left -= take; row.updatedAt = nowIso();
      }
      done.push({ drug, qty, shortBy: left });
    });
    if (done.length) {
      audit(req.actor, 'sales_synced', null, 'inventory', `${done.length} lines`);
      store.save();
      touchFacility(req.facility.id);
      broadcast('pharmacy', 'supply');
    }
    res.json({ recorded: done, errors });
  });

  // Shared with the staff CSV import (Marg / GoFrugal export): one row checked at a time; mode 'set' replaces the
  // quantity of the same medicine + batch + expiry instead of adding to it.
  function upsertStock(fac, input, mode) {
    const d = db();
    const rows = Array.isArray(input) ? input.filter((r) => r && typeof r === 'object').slice(0, 300) : [];
    if (!rows.length) return { error: 'Nothing to add — send at least one row.' };
    let changed = 0; const errors = [];
    rows.forEach((r, n) => {
      const { row, error } = validStockRow(r);
      if (error) { errors.push({ row: n + 1, drug: clean(r.drug, 80) || null, error }); return; }
      const same = mode === 'set' && d.inventory.find((i) => i.facilityId === fac.id && sameDrug(i.drug, row.drug) && (i.batch || null) === (row.batch || null) && i.expiry === row.expiry);
      if (same) { same.qty = row.qty; same.updatedAt = nowIso(); if (row.gtin && !same.gtin) same.gtin = row.gtin; } else addStock(d, fac.id, row);
      changed += 1;
    });
    if (changed) { touchFacility(fac.id); store.save(); broadcast('pharmacy', 'supply'); }
    return { added: changed, changed, errors };
  }

  // ---------- webhook sender: new referrals / lab orders since each connection's cursor ----------
  let running = false;
  async function sweep() {
    if (running) return;
    running = true;
    try {
      const d = db();
      let changed = false;
      for (const it of list()) {
        if (it.revokedAt || !it.webhookUrl || it.webhookPausedAt) continue;
        const cursor = Date.parse(it.cursor) || Date.now();
        let due = [];
        if (it.kind === 'hmis') due = d.referrals.filter((r) => r.toFacilityId === it.facilityId).map((r) => ({ event: 'referral.created', id: r.id, at: r.createdAt }));
        if (it.kind === 'lis') due = d.labOrders.filter((o) => o.labId === it.facilityId && labVisible(o)).map((o) => ({ event: 'lab_order.created', id: o.id, at: o.booking?.paidAt || o.createdAt }));
        due = due.filter((e) => Date.parse(e.at) > cursor).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(0, 20);
        for (const e of due) {
          const r = await deliver(it, e.event, e.id, e.at);
          changed = true;
          it.lastDelivery = { at: nowIso(), event: e.event, ok: r.ok, status: r.status || null, error: r.error || null };
          if (!r.ok) {
            it.failures = (it.failures || 0) + 1;
            if (it.failures >= PAUSE_AFTER) {
              it.webhookPausedAt = nowIso();
              facilityUsers(d, it.facilityId).forEach((u) => notify(u, 'Webhook paused', `Sehatra couldn't reach “${it.name}” ${PAUSE_AFTER} times in a row (${r.error}). Fix the address under Connectors and save it to resume — nothing is lost.`));
              touchFacility(it.facilityId); broadcast('integrations');
            }
            break; // retry from here next round, in order
          }
          it.failures = 0; it.cursor = e.at;
        }
      }
      if (changed) store.save();
    } catch (e) {
      console.warn('[integrations] webhook sweep failed:', e.message);
    } finally { running = false; }
  }
  setInterval(sweep, 20000).unref?.();

  return { upsertStock, privateIp, keyAuth, keyLimiter, labVisible, saveDraft };
};
