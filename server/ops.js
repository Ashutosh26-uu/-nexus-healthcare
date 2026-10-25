// Operational tools for the people around the patient — labs, hospitals, E-Clinic operators, riders, officials.
// Everything here works from real network data; where there isn't enough data yet (bed history), it says so.
//   Lab       GET  /api/lab/collection-route          today's home collections in driving order
//   Hospital  POST /api/hospital/referrals/:id/discharge  discharge summary → patient's records, bed freed, doctor told
//             GET  /api/hospital/bed-forecast         occupancy trend from hourly snapshots → days until full
//   Kiosk     GET  /api/kiosk/tasks                   today's to-do list for this E-Clinic's own patients
//   Rider     GET  /api/dispatch/route                today's pickups and drops in order
//   Official  GET  /api/gov/alerts/:id/plan           outbreak action plan: stock gaps + a draft advisory
//             GET  /api/gov/shortage-risk             essential medicines about to run out, by district

const SPEED_KMH = 25;      // town traffic, two-wheeler
const STOP_MIN = 10;       // minutes spent at each stop
const HISTORY_DAYS = 30;

// What an outbreak needs on the shelf, by disease. Matched loosely against stock names.
const OUTBREAK_KIT = {
  dengue: [{ item: 'Dengue NS1 rapid kit', min: 20 }, { item: 'Platelet count kit', min: 20 }, { item: 'Paracetamol', min: 200 }, { item: 'ORS', min: 100 }],
  malaria: [{ item: 'Malaria rapid test kit', min: 20 }, { item: 'Artemether-Lumefantrine', min: 30 }, { item: 'Paracetamol', min: 200 }],
  typhoid: [{ item: 'Azithromycin', min: 60 }, { item: 'Paracetamol', min: 200 }, { item: 'ORS', min: 100 }],
  cholera: [{ item: 'ORS', min: 300 }, { item: 'Zinc', min: 100 }],
  diarrhoea: [{ item: 'ORS', min: 300 }, { item: 'Zinc', min: 100 }],
  default: [{ item: 'Paracetamol', min: 200 }, { item: 'ORS', min: 100 }],
};
const ADVICE = {
  dengue: ['Empty standing water around your home every week — coolers, pots, tyres.', 'Use mosquito nets and repellent, and wear full sleeves, especially at dawn and dusk.', 'High fever with body ache, pain behind the eyes or rash? Get a dengue test and see a doctor. Take paracetamol only — not ibuprofen or aspirin.'],
  malaria: ['Sleep under a mosquito net and clear standing water.', 'Fever with chills or shivering? Get a malaria test the same day — treatment is free at government centres.'],
  typhoid: ['Drink boiled or filtered water and eat freshly cooked food.', 'Wash hands with soap before eating and after using the toilet.', 'Fever for more than 3 days? See a doctor and get tested.'],
  cholera: ['Drink only boiled or treated water.', 'Start ORS at the first loose motion and keep drinking.', 'Watery diarrhoea with weakness or very little urine — go to a hospital at once.'],
  diarrhoea: ['Drink boiled or treated water, and wash hands with soap.', 'Give ORS after every loose motion; zinc for children for 14 days.', 'Blood in stool, high fever or very little urine — see a doctor today.'],
  default: ['Wash hands with soap, drink clean water and cover coughs.', 'See a doctor early if you or your child has a fever that does not settle.'],
};
const ESSENTIAL = ['Paracetamol', 'ORS', 'Amoxicillin', 'Azithromycin', 'Metformin', 'Amlodipine', 'Insulin', 'Salbutamol', 'Artemether-Lumefantrine', 'Dengue NS1 rapid kit'];

module.exports = function registerOps(app, x) {
  const { auth, role, db, store, notify, audit, broadcast, touch, touchFacility, nowIso, istDay, clean, geo, catalog, normDrug,
    patientById, patientPoint, facilityName, patientOwnerUserIds, govScope, wellness, planProgress, userById, pregnancyPlan, activePregnancy } = x;

  const exact = (o) => (o && geo.validCoord(o.lat, o.lng) ? { lat: o.lat, lng: o.lng } : null);
  const patientExact = (p) => exact(p) || (p?.currentLocation && Date.now() - Date.parse(p.currentLocation.at) < 7 * 86400000 ? exact(p.currentLocation) : null);
  const kmBetween = (a, b) => {
    if (!a || !b) return null;
    const R = 6371; const r = (v) => (v * Math.PI) / 180;
    const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
  };
  // Nearest-next ordering from a start point; stops without a known point keep their order at the end.
  // `ready(stop, done)` lets a drop wait until its pickup is done.
  function order(start, stops, ready = () => true) {
    const left = [...stops];
    const out = [];
    let here = start;
    let minutes = 0;
    while (left.length) {
      const choices = left.filter((s) => ready(s, out));
      const pool = choices.length ? choices : left;
      const withPt = pool.filter((s) => s.point && here);
      const next = withPt.length ? withPt.sort((a, b) => kmBetween(here, a.point) - kmBetween(here, b.point))[0] : pool[0];
      const km = next.point && here ? kmBetween(here, next.point) : null;
      minutes += (km != null ? (km / SPEED_KMH) * 60 : 0) + (out.length ? STOP_MIN : 0);
      out.push({ ...next, legKm: km, etaMin: Math.round(minutes) });
      left.splice(left.indexOf(next), 1);
      if (next.point) here = next.point;
    }
    return out;
  }
  const mapsUrl = (start, stops) => {
    const pts = stops.filter((s) => s.point).map((s) => `${s.point.lat},${s.point.lng}`);
    if (!pts.length) return null;
    const origin = start ? `&origin=${start.lat},${start.lng}` : '';
    const dest = pts.pop();
    return `https://www.google.com/maps/dir/?api=1${origin}&destination=${dest}${pts.length ? `&waypoints=${encodeURIComponent(pts.join('|'))}` : ''}&travelmode=driving`;
  };
  const strip = ({ point, ...s }) => ({ ...s, hasLocation: Boolean(point) });

  // ---------- Lab: today's home collections in driving order ----------
  app.get('/api/lab/collection-route', auth, role('lab_tech'), (req, res) => {
    const d = db();
    const lab = d.facilities.find((f) => f.id === req.user.facilityId);
    const today = istDay(Date.now());
    const who = clean(req.query.collector, 40);
    const stops = d.labOrders
      .filter((o) => o.labId === lab?.id && o.booking?.homeCollection && o.collection && ['assigned', 'on_the_way'].includes(o.collection.status)
        && (!who || o.collection.collectorId === who)
        && istDay(Date.parse(o.collection.window?.from || o.booking.slot || o.createdAt)) === today)
      .map((o) => {
        const p = patientById(o.patientId) || {};
        return {
          orderId: o.id, patientName: p.name, address: [p.address, p.district].filter(Boolean).join(', ') || null,
          tests: o.tests.map((t) => t.name), window: o.collection.window || null, collector: o.collection.name || null,
          status: o.collection.status, point: patientExact(p),
        };
      });
    const start = exact(lab) || geo.pointOf(lab);
    const route = order(start, stops);
    const km = route.reduce((s, x) => s + (x.legKm || 0), 0);
    res.json({ date: today, stops: route.map(strip), totalKm: Math.round(km * 10) / 10, totalMin: route.length ? route[route.length - 1].etaMin + STOP_MIN : 0, mapsUrl: mapsUrl(start, route) });
  });

  // ---------- Hospital: discharge from an accepted referral ----------
  app.post('/api/hospital/referrals/:id/discharge', auth, role('hospital_admin'), (req, res) => {
    const d = db();
    const r = d.referrals.find((y) => y.id === req.params.id && y.toFacilityId === req.user.facilityId);
    if (!r) return res.status(404).json({ error: 'Referral not found.' });
    if (r.status !== 'accepted') return res.status(409).json({ error: 'Only an admitted (accepted) referral can be discharged.' });
    const b = req.body || {};
    const summary = clean(b.summary, 1500);
    if (summary.length < 10) return res.status(400).json({ error: 'Please write the discharge summary — what was done and the condition now.' });
    const diagnosis = clean(b.diagnosis, 200);
    const medicines = clean(b.medicines, 600);
    const instructions = clean(b.instructions, 600);
    const followUpDays = Math.max(0, Math.min(90, parseInt(b.followUpDays, 10) || 0));
    const p = patientById(r.patientId);
    const hosp = facilityName(r.toFacilityId) || 'the hospital';
    const followUpOn = followUpDays ? istDay(Date.now() + followUpDays * 86400000) : null;
    r.status = 'discharged';
    r.dischargedAt = nowIso();
    r.followUpOn = followUpOn;
    // The bed this admission took is free again.
    const bed = d.beds.find((y) => y.facilityId === r.toFacilityId && y.type === (r.bedType || 'general'));
    // Only if accepting this referral actually took a bed (a full ward isn't charged one) — older referrals
    // from before that was recorded are assumed to have taken one.
    if (bed && bed.occupied > 0 && r.bedTaken !== false) { bed.occupied -= 1; bed.updatedAt = nowIso(); }
    if (p) {
      const text = [
        diagnosis && `Diagnosis: ${diagnosis}`,
        `Summary: ${summary}`,
        medicines && `Medicines at home: ${medicines}`,
        instructions && `Care at home: ${instructions}`,
        followUpOn && `Follow-up: see your doctor by ${followUpOn}.`,
      ].filter(Boolean).join('\n');
      d.records.push({ id: store.id('rec'), patientId: p.id, kind: 'discharge', title: `Discharge summary — ${hosp}`, date: istDay(Date.now()), fileName: null, summary: text, extracted: [], uploadedAt: nowIso(), fileId: null, fileUrl: null, facilityId: r.toFacilityId, by: req.user.name });
      patientOwnerUserIds(p).forEach((u) => notify(u, `Discharged from ${hosp}`, `${p.name.split(' ')[0]}'s discharge summary is in My records.${followUpOn ? ` Please book a follow-up by ${followUpOn}.` : ''}`));
    }
    const doc = d.doctors.find((y) => y.id === r.fromDoctorId);
    if (doc?.userId) notify(doc.userId, `${r.patientName} discharged`, `${hosp}: ${diagnosis ? `${diagnosis}. ` : ''}${summary.slice(0, 160)}${followUpOn ? ` Follow-up by ${followUpOn}.` : ''}`);
    audit(req.user, 'discharged', r.patientId, 'referral', `${r.id}${followUpOn ? ` · follow-up ${followUpOn}` : ''}`);
    store.save();
    touch(p ? patientOwnerUserIds(p) : [], doc?.userId);
    touchFacility(r.toFacilityId);
    broadcast('referrals', 'beds', 'records', 'gov');
    res.json({ ok: true, followUpOn });
  });

  // ---------- Hospital: bed history → forecast ----------
  const history = () => { const d = db(); if (!d.bedHistory) d.bedHistory = []; return d.bedHistory; };
  function snapshot() {
    const d = db();
    const hour = new Date().toISOString().slice(0, 13); // UTC hour
    const h = history();
    let added = 0;
    for (const f of d.facilities.filter((y) => y.type === 'hospital')) {
      const rows = d.beds.filter((y) => y.facilityId === f.id && Number(y.total) > 0);
      if (!rows.length) continue;
      const id = `${f.id}|${hour}`;
      if (h.some((y) => y.id === id)) continue;
      h.push({ id, facilityId: f.id, at: nowIso(), total: rows.reduce((s, y) => s + Number(y.total), 0), occupied: rows.reduce((s, y) => s + Number(y.occupied || 0), 0) });
      added += 1;
    }
    const cutoff = Date.now() - HISTORY_DAYS * 86400000;
    const keep = h.filter((y) => Date.parse(y.at) >= cutoff);
    if (keep.length !== h.length) d.bedHistory = keep;
    if (added || keep.length !== h.length) store.save();
  }
  setTimeout(() => { try { snapshot(); } catch { /* next hour */ } }, 20000).unref?.();
  setInterval(() => { try { snapshot(); } catch (e) { console.warn('[ops] bed snapshot failed:', e.message); } }, 15 * 60000).unref?.();

  app.get('/api/hospital/bed-forecast', auth, role('hospital_admin'), (req, res) => {
    const d = db();
    const fid = req.user.facilityId;
    const rows = d.beds.filter((y) => y.facilityId === fid && Number(y.total) > 0);
    const total = rows.reduce((s, y) => s + Number(y.total), 0);
    const occupied = rows.reduce((s, y) => s + Number(y.occupied || 0), 0);
    // Busiest hour of each day = the day's occupancy.
    const byDay = new Map();
    for (const y of history().filter((z) => z.facilityId === fid)) {
      const day = istDay(Date.parse(y.at));
      byDay.set(day, Math.max(byDay.get(day) || 0, y.occupied));
    }
    const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-14);
    const first = history().filter((z) => z.facilityId === fid).map((z) => z.at).sort()[0] || null;
    if (!total) return res.json({ status: 'no-beds', total, occupied });
    if (days.length < 3) return res.json({ status: 'collecting', total, occupied, since: first, days: days.length, needDays: 3 });
    // Straight-line trend through the daily figures.
    const n = days.length;
    const xs = days.map((_, i) => i);
    const ys = days.map(([, v]) => v);
    const mx = xs.reduce((s, v) => s + v, 0) / n;
    const my = ys.reduce((s, v) => s + v, 0) / n;
    const slope = xs.reduce((s, v, i) => s + (v - mx) * (ys[i] - my), 0) / (xs.reduce((s, v) => s + (v - mx) ** 2, 0) || 1);
    const perDay = Math.round(slope * 10) / 10;
    const daysToFull = perDay > 0.05 ? Math.max(0, Math.ceil((total - occupied) / perDay)) : null;
    res.json({ status: 'ok', total, occupied, perDay, daysToFull, fullBy: daysToFull != null ? istDay(Date.now() + daysToFull * 86400000) : null, series: days.map(([day, v]) => ({ day, occupied: v, pct: Math.round((v / total) * 100) })) });
  });

  // ---------- Kiosk: today's tasks for this E-Clinic's own patients ----------
  app.get('/api/kiosk/tasks', auth, role('kiosk_operator'), (req, res) => {
    const d = db();
    const k = d.facilities.find((f) => f.id === req.user.facilityId);
    if (!k) return res.json({ tasks: [] });
    const today = istDay(Date.now());
    // Only people this E-Clinic already looks after: registered or seen here.
    // Same rule as the kiosk look-up: registered here, last seen here, or ever consulted from here.
    const consulted = new Set(d.consults.filter((c) => c.kioskId === k.id).map((c) => c.patientId));
    const ours = d.patients.filter((p) => !p.erasedAt && (p.registeredAt === k.name || p.kioskSeen?.kioskId === k.id || consulted.has(p.id)));
    const ids = new Set(ours.map((p) => p.id));
    const tasks = [];
    for (const p of ours) {
      if (p.dob && wellness.isChild(p.dob, today)) {
        const c = wellness.vaccineCounts(p, today);
        if (c && (c.overdue || c.due) && c.next) tasks.push({ kind: 'vaccine', urgent: Boolean(c.overdue), patientId: p.id, name: p.name, text: `${c.next.name} ${c.overdue ? 'is overdue' : 'is due'}${c.next.dueOn ? ` (due ${c.next.dueOn})` : ''}` });
      }
    }
    for (const p of ours) {
      const pg = activePregnancy?.(p.id);
      const pl = pg && pregnancyPlan(pg);
      if (!pl || pl.daysToEdd < -42) continue; // long past the due date: closed by the pregnancy sweep
      const missed = pl.anc.filter((a) => a.status === 'missed');
      const due = pl.anc.find((a) => a.status === 'due');
      if (due) tasks.push({ kind: 'pregnancy', urgent: Date.parse(due.dueBy) - Date.now() < 7 * 86400000, patientId: p.id, name: p.name, text: `Week ${pl.week} of pregnancy — ${due.label.toLowerCase()} due by ${due.dueBy}` });
      else if (missed.length) tasks.push({ kind: 'pregnancy', urgent: true, patientId: p.id, name: p.name, text: `Week ${pl.week} of pregnancy — check-up ${missed.map((m) => m.n).join(', ')} was missed; please get her checked` });
      if (pl.daysToEdd <= 14 && pl.daysToEdd >= -7) tasks.push({ kind: 'pregnancy', urgent: true, patientId: p.id, name: p.name, text: `Due date ${pl.edd} — confirm the hospital for delivery and that 102 is saved` });
    }
    for (const pl of d.carePlans || []) {
      if (pl.status !== 'active' || !ids.has(pl.patientId)) continue;
      const pr = planProgress(pl);
      const p = patientById(pl.patientId);
      if (pr?.missing?.length) tasks.push({ kind: 'readings', urgent: false, patientId: p.id, name: p.name, text: `No ${pr.missing.map((m) => (m === 'bp' ? 'BP' : 'sugar')).join(' or ')} reading for 3+ days — check it at the E-Clinic or at home` });
      if (pr?.offTarget?.length) tasks.push({ kind: 'readings', urgent: true, patientId: p.id, name: p.name, text: 'Readings are above target — ask them to see their doctor' });
    }
    for (const rc of d.recoveryChecks || []) {
      if (rc.status !== 'open' || !ids.has(rc.patientId)) continue;
      // Courses are short (two weeks at most): an old record left "open" is not today's task.
      if (Date.now() - Date.parse(rc.createdAt) > 21 * 86400000) continue;
      const answered = (rc.entries || []).some((e) => e.date === today);
      if (!rc.needsReview && (rc.remindedOn !== today || answered)) continue;
      const p = patientById(rc.patientId);
      tasks.push({ kind: 'recovery', urgent: Boolean(rc.needsReview), patientId: p.id, name: p.name, text: rc.needsReview ? 'Feeling worse on their medicines — check on them today' : "Hasn't answered today's recovery check-in" });
    }
    tasks.sort((a, b) => Number(b.urgent) - Number(a.urgent));
    res.json({ date: today, tasks: tasks.slice(0, 60), people: ours.length });
  });

  // ---------- Rider: today's pickups and drops in order ----------
  app.get('/api/dispatch/route', auth, role('delivery'), (req, res) => {
    const d = db();
    const jobs = d.deliveries.filter((y) => y.courierId === req.user.id && !['delivered', 'cancelled', 'failed'].includes(y.status));
    const stops = [];
    for (const j of jobs) {
      let from = null; let to = null; let toLabel = j.drop;
      if (j.kind === 'transfer') {
        const t = d.transfers.find((y) => y.id === j.refId);
        from = d.facilities.find((f) => f.id === t?.fromId); to = d.facilities.find((f) => f.id === t?.toId);
      } else {
        const ref = j.kind === 'med_order' ? d.medOrders.find((y) => y.id === j.refId) : d.prescriptions.find((y) => y.id === j.refId);
        from = d.facilities.find((f) => f.id === ref?.pharmacyId);
        const p = patientById(ref?.patientId);
        to = p ? { point: patientExact(p) } : null;
        toLabel = p ? `${p.name.split(' ')[0]} · ${[p.address, p.district].filter(Boolean).join(', ') || j.drop}` : j.drop;
      }
      const picked = ['picked', 'in_transit'].includes(j.status);
      if (!picked) stops.push({ jobId: j.id, kind: 'pickup', label: j.pickup || from?.name, point: from ? (exact(from) || geo.pointOf(from)) : null, coldChain: Boolean(j.coldChain) });
      stops.push({ jobId: j.id, kind: 'drop', label: toLabel, point: to?.point !== undefined ? to.point : (to ? (exact(to) || geo.pointOf(to)) : null), collect: j.collect || 0 });
    }
    // A drop comes only after its pickup.
    const ready = (s, done) => s.kind === 'pickup' || !stops.some((y) => y.jobId === s.jobId && y.kind === 'pickup') || done.some((y) => y.jobId === s.jobId && y.kind === 'pickup');
    const firstPickup = stops.find((s) => s.kind === 'pickup' && s.point)?.point || stops.find((s) => s.point)?.point || null;
    const route = order(firstPickup, stops, ready);
    res.json({ stops: route.map(strip), jobs: jobs.length, totalKm: Math.round(route.reduce((s, y) => s + (y.legKm || 0), 0) * 10) / 10, mapsUrl: mapsUrl(null, route) });
  });

  // ---------- Officials: outbreak action plan ----------
  const matches = (name, item) => normDrug(name).includes(normDrug(item));
  app.get('/api/gov/alerts/:id/plan', auth, role('official'), (req, res) => {
    const d = db();
    const sc = govScope(req.user);
    const a = d.alerts.find((y) => y.id === req.params.id && y.type === 'outbreak');
    if (!a || !sc.inScope(a)) return res.status(404).json({ error: 'Alert not found.' });
    const key = Object.keys(OUTBREAK_KIT).find((k) => k !== 'default' && new RegExp(k, 'i').test(a.disease || '')) || (/(gastro|loose|diarr)/i.test(a.disease || '') ? 'diarrhoea' : 'default');
    const kit = OUTBREAK_KIT[key];
    // Only sites that keep their stock on Sehatra — a lab with no stock list here isn't "short", it's unknown.
    const tracked = new Set(d.inventory.map((i) => i.facilityId));
    const sites = d.facilities.filter((f) => f.verified && tracked.has(f.id) && ['pharmacy', 'hospital', 'lab'].includes(f.type) && f.district === a.district && (!a.state || f.state === a.state));
    const gaps = [];
    const supply = kit.map(({ item, min }) => {
      // Medicines are counted on chemists' shelves; test kits wherever they are stocked.
      const at = sites.filter((f) => /kit/i.test(item) || f.type === 'pharmacy').map((f) => {
        const qty = d.inventory.filter((i) => i.facilityId === f.id && matches(i.drug, item)).reduce((s, i) => s + (i.qty || 0), 0);
        if (qty < min) gaps.push({ facility: f.name, type: f.type, item, qty, needed: min - qty });
        return { facility: f.name, qty };
      });
      const total = at.reduce((s, y) => s + y.qty, 0);
      const short = Math.max(0, min * Math.max(1, at.length) - total);
      return { item, total, sites: at.length, perSiteMin: min, short };
    });
    const advice = ADVICE[key] || ADVICE.default;
    const advisory = {
      title: `${a.disease} cases are rising in ${a.district}`,
      body: `Health alert for ${a.district}: ${a.disease} cases are higher than usual this week.\n\n${advice.map((s) => `• ${s}`).join('\n')}\n\nIn an emergency call 108.`,
      region: a.district,
    };
    res.json({ alertId: a.id, disease: a.disease, district: a.district, state: a.state, supply, gaps: gaps.sort((x, y) => x.qty - y.qty).slice(0, 20), advisory });
  });

  // ---------- Officials: essential medicines about to run out, by district ----------
  app.get('/api/gov/shortage-risk', auth, role('official'), (req, res) => {
    const d = db();
    const sc = govScope(req.user);
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const pharmacies = d.facilities.filter((f) => f.type === 'pharmacy' && f.verified && sc.inScope(f));
    const byDistrict = new Map();
    for (const f of pharmacies) { const k = `${f.district}|${f.state}`; if (!byDistrict.has(k)) byDistrict.set(k, []); byDistrict.get(k).push(f.id); }
    const rows = [];
    for (const [k, ids] of byDistrict) {
      const [district, state] = k.split('|');
      const set = new Set(ids);
      for (const item of ESSENTIAL) {
        const stock = d.inventory.filter((i) => set.has(i.facilityId) && matches(i.drug, item)).reduce((s, i) => s + (i.qty || 0), 0);
        let used = 0;
        for (const o of d.medOrders || []) if (set.has(o.pharmacyId) && o.packedAt >= since) for (const it of o.items || []) if (matches(it.drug, item)) used += Number(it.qty) || 0;
        for (const r of d.prescriptions || []) if (set.has(r.pharmacyId) && r.dispensedAt >= since) for (const it of r.items || []) if (matches(it.drug, item)) used += catalog.unitsFor(it);
        const perDay = used / 30;
        const cover = perDay > 0 ? Math.floor(stock / perDay) : null;
        // Only medicines people actually buy here: no sales and no stock means it isn't needed in this district.
        const risk = perDay > 0 && cover < 7 ? 'critical' : perDay > 0 && cover < 14 ? 'low' : 'ok';
        if (risk !== 'ok') rows.push({ district, state, item, stock, perDay: Math.round(perDay * 10) / 10, daysCover: cover, risk, pharmacies: ids.length });
      }
    }
    const rank = { critical: 0, low: 1 };
    rows.sort((a, b) => rank[a.risk] - rank[b.risk] || (a.daysCover ?? 1e9) - (b.daysCover ?? 1e9));
    res.json({ rows, districts: byDistrict.size, essential: ESSENTIAL });
  });

  return { snapshot };
};
