// Near-expiry stock goes where it will be used. For each medicine on a pharmacy's shelf that expires within 90
// days, find nearby verified pharmacies that will actually sell it before it expires — from their own sales in
// the last 30 days — or that have run low. The pharmacy offers it in one tap; the receiving store accepts or
// declines, and an accepted offer follows the usual transfer flow (dispatch → rider → received).

const WINDOW_DAYS = 90;
const RADIUS_KM = 40;

module.exports = function registerExpiry(app, x) {
  const { auth, role, db, store, notify, audit, broadcast, touchFacility, nowIso, istDay, geo, catalog, normDrug, facilityName } = x;

  const keyOf = (drug) => normDrug(catalog.priceOf(drug)?.name || drug); // brand / generic lines count together
  const facilityUsers = (d, fid) => d.users.filter((u) => u.facilityId === fid).map((u) => u.id);

  // Units of a medicine a store sold or dispensed in the last 30 days.
  function sold30(d, fid, key) {
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    let n = 0;
    for (const o of d.medOrders || []) if (o.pharmacyId === fid && o.packedAt >= since) for (const it of o.items || []) if (keyOf(it.drug) === key) n += Number(it.qty) || 0;
    for (const r of d.prescriptions || []) if (r.pharmacyId === fid && r.dispensedAt >= since) for (const it of r.items || []) if (keyOf(it.drug) === key) n += catalog.unitsFor(it);
    return n;
  }
  const stockOf = (d, fid, key) => (d.inventory || []).filter((i) => i.facilityId === fid && keyOf(i.drug) === key)
    .reduce((s, i) => ({ qty: s.qty + (i.qty || 0), safety: Math.max(s.safety, i.safetyStock || 0) }), { qty: 0, safety: 0 });

  function matchesFor(d, me, inv) {
    const key = keyOf(inv.drug);
    const daysLeft = Math.ceil((Date.parse(inv.expiry) - Date.now()) / 86400000);
    const here = geo.pointOf(me);
    return d.facilities
      .filter((f) => f.type === 'pharmacy' && f.verified && f.id !== me.id)
      .map((f) => {
        const km = here ? geo.km(here, geo.pointOf(f)) : null;
        if (km == null ? f.district !== me.district : km > RADIUS_KM) return null;
        const perDay = sold30(d, f.id, key) / 30;
        const st = stockOf(d, f.id, key);
        // What they would sell before it expires, beyond what they already hold — plus any gap below safety stock.
        const willUse = Math.max(0, Math.floor(perDay * Math.max(daysLeft - 3, 0)) - st.qty) + Math.max(0, st.safety - st.qty);
        if (willUse < 1) return null;
        const why = st.qty === 0 && perDay === 0 ? 'Out of stock'
          : st.qty < st.safety ? `Below safety stock (${st.qty} of ${st.safety})`
            : `Sells about ${Math.round(perDay * 30)} a month — would use ${willUse} before it expires`;
        return { id: f.id, name: f.name, district: f.district, km, willUse, suggestQty: Math.min(inv.qty, willUse), why };
      })
      .filter(Boolean)
      .sort((a, b) => b.willUse - a.willUse || (a.km ?? 99) - (b.km ?? 99))
      .slice(0, 3);
  }

  app.get('/api/pharmacy/expiry-matches', auth, role('pharmacist'), (req, res) => {
    const d = db();
    const me = d.facilities.find((f) => f.id === req.user.facilityId);
    if (!me) return res.status(404).json({ error: 'Store not found.' });
    const cutoff = istDay(Date.now() + WINDOW_DAYS * 86400000);
    const today = istDay(Date.now());
    const offered = new Set((d.transfers || []).filter((t) => t.kind === 'expiry' && t.fromId === me.id && ['offered', 'accepted', 'dispatched'].includes(t.status)).map((t) => t.inventoryId));
    const items = (d.inventory || [])
      .filter((i) => i.facilityId === me.id && i.qty > 0 && i.expiry && i.expiry <= cutoff && i.expiry > today)
      .map((i) => ({
        id: i.id, drug: i.drug, batch: i.batch || null, qty: i.qty, expiry: i.expiry,
        daysLeft: Math.ceil((Date.parse(i.expiry) - Date.now()) / 86400000),
        offered: offered.has(i.id), matches: offered.has(i.id) ? [] : matchesFor(d, me, i),
      }))
      .sort((a, b) => a.daysLeft - b.daysLeft);
    res.json({ items });
  });

  app.post('/api/pharmacy/expiry-offer', auth, role('pharmacist'), (req, res) => {
    const d = db();
    const me = d.facilities.find((f) => f.id === req.user.facilityId);
    const inv = (d.inventory || []).find((i) => i.id === req.body?.inventoryId && i.facilityId === me?.id);
    if (!inv) return res.status(404).json({ error: 'That stock line is not on your shelf.' });
    const qty = parseInt(req.body?.qty, 10);
    if (!Number.isInteger(qty) || qty < 1 || qty > inv.qty) return res.status(400).json({ error: `Offer between 1 and ${inv.qty}.` });
    if (!inv.expiry || inv.expiry <= istDay(Date.now())) return res.status(400).json({ error: 'Expired stock can’t be transferred — it must be returned or destroyed.' });
    const match = matchesFor(d, me, inv).find((m) => m.id === req.body?.toId);
    if (!match) return res.status(400).json({ error: 'Pick one of the suggested stores.' });
    if ((d.transfers || []).some((t) => t.kind === 'expiry' && t.inventoryId === inv.id && ['offered', 'accepted', 'dispatched'].includes(t.status))) {
      return res.status(409).json({ error: 'This batch is already offered.' });
    }
    const t = {
      id: store.id('tr'), kind: 'expiry', drug: inv.drug, qty, fromId: me.id, toId: match.id, inventoryId: inv.id, batch: inv.batch || null, expiry: inv.expiry,
      status: 'offered', reason: `Near-expiry stock offered by ${me.name} — expires ${inv.expiry}. ${match.why}.`, createdAt: nowIso(),
    };
    d.transfers.unshift(t);
    facilityUsers(d, match.id).forEach((u) => notify(u, 'Stock offered to you', `${me.name} offers ${qty} × ${inv.drug} (expires ${inv.expiry}). ${match.why}. Accept or decline under Transfers.`));
    audit(req.user, 'expiry_offer', null, 'supply', `${t.id} · ${qty} ${inv.drug} (exp ${inv.expiry}) → ${facilityName(match.id)}`);
    touchFacility(me.id, match.id);
    store.save();
    broadcast('supply', 'pharmacy');
    res.json({ ...t, toName: match.name });
  });
};
