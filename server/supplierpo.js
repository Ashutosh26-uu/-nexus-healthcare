// Purchase orders sent to the supplier from the app. The warehouse taps "Send": the supplier gets an email (and/or
// the warehouse shares a WhatsApp message) with a private link to the PO — no Sehatra account needed. On that page
// the supplier accepts it (with the date they'll deliver), marks it dispatched, or declines it; the warehouse sees
// each step live. Links are random (144 bits), stored only as a hash, and stop working 60 days after sending.
//   Warehouse  POST /api/distributor/purchase-orders/:id/send     { email?, phone? } → { url, emailed, whatsapp }
//   Supplier   GET  /api/public/po/:token
//              POST /api/public/po/:token/respond               { action: accept | dispatch | decline, date?, note?, name? }
const crypto = require('crypto');

const LINK_DAYS = 60;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i;

module.exports = function registerSupplierPo(app, x) {
  const { auth, role, db, store, notify, audit, broadcast, touchFacility, nowIso, clean, publicLimiter, otp, appUrl, escHtml, facilityUsers, security } = x;
  const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
  const SUPPLIER = (name) => ({ id: 'supplier-link', name: name ? `${name} (supplier)` : 'Supplier (via PO link)', role: 'supplier' });
  const sendLimiter = security.rateLimit({ windowMs: 3600000, max: 30, key: (req) => req.user?.id || '', message: 'Too many orders sent this hour — please wait a little.' });

  const linesText = (po) => po.lines.map((l, i) => `${i + 1}. ${l.drug} — ${l.qty} units`).join('\n');

  app.post('/api/distributor/purchase-orders/:id/send', auth, role('distributor'), sendLimiter, async (req, res) => {
    const d = db();
    const po = (d.purchaseOrders || []).find((o) => o.id === req.params.id && o.facilityId === req.user.facilityId);
    if (!po) return res.status(404).json({ error: 'Purchase order not found.' });
    if (!['raised', 'sent'].includes(po.status)) return res.status(409).json({ error: `This order is already ${po.status}.` });
    const email = clean(req.body?.email ?? po.supplierEmail, 120).toLowerCase();
    if (email && !EMAIL_RE.test(email)) return res.status(400).json({ error: 'That email address doesn\'t look right.' });
    const phone = String(req.body?.phone ?? po.supplierPhone ?? '').replace(/[^\d+]/g, '').slice(0, 16);
    const fac = d.facilities.find((f) => f.id === po.facilityId) || {};
    // A fresh link each send; the old one stops working.
    const token = crypto.randomBytes(18).toString('base64url');
    po.supplierLink = { hash: hash(token), sentAt: nowIso(), expiresAt: new Date(Date.now() + LINK_DAYS * 86400000).toISOString() };
    if (email) po.supplierEmail = email;
    if (phone) po.supplierPhone = phone;
    if (po.status === 'raised') { po.status = 'sent'; po.sentAt = nowIso(); }
    const url = `${appUrl()}/po/${token}`;
    const intro = `${fac.name || 'A warehouse'}${fac.district ? `, ${fac.district}` : ''} has sent you purchase order ${po.poNo}.`;
    const text = `${intro}\n\n${linesText(po)}\n${po.deliverBy ? `\nPlease deliver by ${po.deliverBy}.` : ''}${po.notes ? `\nNotes: ${po.notes}` : ''}\n\nOpen the order to accept it, give your delivery date or mark it dispatched:\n${url}\n\nSent through Sehatra on behalf of ${fac.name || 'the warehouse'}.`;
    let emailed = null;
    if (email) {
      const html = `<p>${escHtml(intro)}</p><table style="border-collapse:collapse">${po.lines.map((l) => `<tr><td style="padding:4px 12px 4px 0">${escHtml(l.drug)}</td><td style="padding:4px 0"><strong>${l.qty}</strong> units</td></tr>`).join('')}</table>`
        + `${po.deliverBy ? `<p>Please deliver by <strong>${escHtml(po.deliverBy)}</strong>.</p>` : ''}${po.notes ? `<p>Notes: ${escHtml(po.notes)}</p>` : ''}`
        + `<p><a href="${escHtml(url)}" style="display:inline-block;padding:10px 16px;background:#1f6f5c;color:#fff;border-radius:8px;text-decoration:none">Open the purchase order</a></p><p style="color:#777;font-size:12px">Sent through Sehatra on behalf of ${escHtml(fac.name || 'the warehouse')}. No account needed.</p>`;
      const r = await otp.sendMail({ to: email, subject: `Purchase order ${po.poNo} from ${fac.name || 'Sehatra'}`, text, html }).catch(() => ({ sent: false }));
      emailed = { sent: Boolean(r?.sent), to: email, reason: r?.sent ? null : 'Email isn\'t available right now — share the link on WhatsApp instead.' };
    }
    audit(req.user, 'po_sent', null, 'purchase_order', `${po.poNo} → ${po.supplier}${email ? ` · email ${emailed.sent ? 'sent' : 'not sent'}` : ''}`);
    store.save();
    broadcast('supply');
    const wa = phone.replace(/\D/g, '');
    res.json({ po, url, emailed, whatsapp: `https://wa.me/${wa.length === 10 ? `91${wa}` : wa}?text=${encodeURIComponent(text)}` });
  });

  // ---------- the supplier's side ----------
  const find = (token) => {
    if (!/^[A-Za-z0-9_-]{20,40}$/.test(String(token))) return null;
    const h = hash(token);
    return (db().purchaseOrders || []).find((o) => o.supplierLink?.hash === h) || null;
  };
  const supplierView = (po) => {
    const fac = db().facilities.find((f) => f.id === po.facilityId) || {};
    return {
      poNo: po.poNo, status: po.status, createdAt: po.createdAt, sentAt: po.sentAt || null, deliverBy: po.deliverBy, notes: po.notes || '',
      supplier: po.supplier, lines: po.lines, units: po.units,
      buyer: { name: fac.name || 'Warehouse', district: fac.district || null, state: fac.state || null, phone: fac.phone || null, address: fac.address || null },
      response: po.supplierResponse || null, cancelledAt: po.cancelledAt || null,
    };
  };
  const open = (req, res) => {
    res.set('Cache-Control', 'no-store');
    const po = find(req.params.token);
    if (!po || Date.parse(po.supplierLink.expiresAt) < Date.now()) { res.status(410).json({ error: 'This purchase-order link has expired or was replaced. Ask the warehouse to send it again.' }); return null; }
    return po;
  };

  app.get('/api/public/po/:token', publicLimiter, (req, res) => {
    const po = open(req, res); if (!po) return;
    if (!po.supplierLink.firstViewAt) {
      po.supplierLink.firstViewAt = nowIso();
      facilityUsers(db(), po.facilityId).forEach((u) => notify(u, `${po.supplier} opened ${po.poNo}`, 'The supplier has seen your purchase order.'));
      store.save();
      touchFacility(po.facilityId);
      broadcast('supply');
    }
    res.json(supplierView(po));
  });

  const NEXT = { accept: ['sent', 'raised'], dispatch: ['sent', 'raised', 'accepted'], decline: ['sent', 'raised', 'accepted'] };
  app.post('/api/public/po/:token/respond', publicLimiter, (req, res) => {
    const po = open(req, res); if (!po) return;
    const action = String(req.body?.action || '');
    if (!NEXT[action]) return res.status(400).json({ error: 'Choose accept, dispatch or decline.' });
    if (po.status === 'cancelled') return res.status(409).json({ error: 'The warehouse cancelled this order.' });
    if (!NEXT[action].includes(po.status)) return res.status(409).json({ error: `This order is already ${po.status}.` });
    const raw = String(req.body?.date || '');
    const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) && Number.isFinite(Date.parse(raw)) ? raw : null;
    if (action === 'accept' && !date) return res.status(400).json({ error: 'Give the date you\'ll deliver.' });
    if (date && (Date.parse(date) < Date.now() - 2 * 86400000 || Date.parse(date) > Date.now() + 366 * 86400000)) return res.status(400).json({ error: 'That date doesn\'t look right.' });
    const note = clean(req.body?.note, 300);
    const name = clean(req.body?.name, 60);
    if (action === 'decline' && note.length < 3) return res.status(400).json({ error: 'Tell the warehouse why, so they can order elsewhere.' });
    const status = { accept: 'accepted', dispatch: 'dispatched', decline: 'declined' }[action];
    po.status = status;
    po.supplierResponse = { ...(po.supplierResponse || {}), [action === 'accept' ? 'acceptedAt' : action === 'dispatch' ? 'dispatchedAt' : 'declinedAt']: nowIso(),
      ...(date ? { [action === 'dispatch' ? 'arrivesBy' : 'deliverOn']: date } : {}), ...(note ? { note } : {}), ...(name ? { by: name } : {}) };
    audit(SUPPLIER(name), `po_${status}`, null, 'purchase_order', `${po.poNo}${date ? ` · ${date}` : ''}${note ? ` · ${note}` : ''}`);
    const msg = { accepted: `${po.supplier} accepted ${po.poNo}${date ? ` — delivery on ${date}` : ''}.`, dispatched: `${po.supplier} dispatched ${po.poNo}${date ? ` — arrives by ${date}` : ''}.`, declined: `${po.supplier} declined ${po.poNo}: ${note}` }[status];
    facilityUsers(db(), po.facilityId).forEach((u) => notify(u, `Purchase order ${status}`, msg, status === 'declined' ? 'alert' : undefined));
    store.save();
    touchFacility(po.facilityId);
    broadcast('supply');
    res.json(supplierView(po));
  });

  // Tell the supplier when the warehouse cancels an order it had already sent them.
  return {
    cancelled(po, fac) {
      if (!po.supplierEmail || !po.sentAt) return;
      otp.sendMail({ to: po.supplierEmail, subject: `Cancelled: purchase order ${po.poNo}`, text: `${fac?.name || 'The warehouse'} has cancelled purchase order ${po.poNo}. Please don't dispatch it.\n\nSent through Sehatra.` }).catch(() => {});
    },
  };
};
