// HL7 FHIR R4 face of the software connectors (integrations.js) — for hospital and lab software that speaks FHIR
// rather than our JSON API. Same keys, same rules: a key only sees its own facility, and lab results sent this way
// still wait for the pathologist's signature.
//   GET  /api/integration/fhir/r4/metadata                         CapabilityStatement (no key needed)
//   GET  /api/integration/fhir/r4/ServiceRequest?status=&_lastUpdated=gt…&_count=
//          lis key  → this lab's orders (tests as LOINC codes, sample ID as an identifier)
//          hmis key → referrals to this hospital
//   GET  /api/integration/fhir/r4/ServiceRequest/:id
//   POST /api/integration/fhir/r4/DiagnosticReport   (lis key) basedOn ServiceRequest/<order id>, Observations contained
//                                                     or in result[] → the pathologist's queue, never released
const FHIR = 'application/fhir+json';
const LOINC = 'http://loinc.org';
const SNOMED = 'http://snomed.info/sct';
const SYS = 'https://sehatra.in/fhir';
// Observation interpretation (HL7 v3 ObservationInterpretation) → our flag
const FLAG = { H: 'high', HU: 'high', L: 'low', LU: 'low', HH: 'critical', LL: 'critical', AA: 'critical', A: 'abnormal', N: 'normal', POS: 'positive', NEG: 'negative', DET: 'positive', ND: 'negative' };
const GENDER = { male: 'male', female: 'female', m: 'male', f: 'female', other: 'other' };

module.exports = function registerFhir(app, x) {
  const { db, audit, labView, keyAuth, keyLimiter, labVisible, saveDraft, appUrl } = x;
  const BASE = '/api/integration/fhir/r4';

  // Every answer here is FHIR JSON; errors become an OperationOutcome.
  app.use(BASE, (req, res, next) => {
    const json = res.json.bind(res);
    res.type(FHIR);
    res.json = (body) => {
      if (res.statusCode >= 400 && body && body.resourceType !== 'OperationOutcome') {
        const code = { 400: 'invalid', 401: 'login', 403: 'forbidden', 404: 'not-found', 409: 'conflict', 429: 'throttled' }[res.statusCode] || 'exception';
        return json(outcome('error', code, body.error || 'Request failed.'));
      }
      return json(body);
    };
    next();
  });
  const outcome = (severity, code, text) => ({ resourceType: 'OperationOutcome', issue: [{ severity, code, diagnostics: text }] });
  const bundle = (req, resources) => ({
    resourceType: 'Bundle', type: 'searchset', total: resources.length, link: [{ relation: 'self', url: `${appUrl()}${req.originalUrl}` }],
    entry: resources.map((r) => ({ fullUrl: `${appUrl()}${BASE}/${r.resourceType}/${r.id}`, resource: r, search: { mode: 'match' } })),
  });

  app.get(`${BASE}/metadata`, (_req, res) => {
    res.json({
      resourceType: 'CapabilityStatement', status: 'active', date: '2026-10-29', kind: 'instance', fhirVersion: '4.0.1', format: ['json'],
      software: { name: 'Sehatra connectors' }, implementation: { description: 'Sehatra — hospital, lab and billing software connectors', url: `${appUrl()}${BASE}` },
      rest: [{
        mode: 'server',
        security: { description: 'Send the facility key made under Connectors in the Sehatra portal: "Authorization: Bearer sehatra_…".' },
        resource: [
          { type: 'ServiceRequest', interaction: [{ code: 'read' }, { code: 'search-type' }], searchParam: [{ name: 'status', type: 'token' }, { name: '_lastUpdated', type: 'date' }, { name: '_count', type: 'number' }] },
          { type: 'DiagnosticReport', interaction: [{ code: 'create' }] },
        ],
      }],
    });
  });

  // ---------- lab order / referral → ServiceRequest ----------
  function labRequest(o) {
    const v = labView(db(), o);
    const tests = (o.tests || []).map((t) => ({ coding: t.code ? [{ system: LOINC, code: t.code, display: t.name }] : undefined, text: t.name }));
    const status = o.status === 'reported' ? 'completed' : o.status === 'cancelled' ? 'revoked' : 'active';
    return {
      resourceType: 'ServiceRequest', id: o.id,
      meta: { lastUpdated: o.reportedAt || o.reviewAt || o.collectedAt || o.booking?.paidAt || o.createdAt },
      contained: [{ resourceType: 'Patient', id: 'p', identifier: [{ system: `${SYS}/health-passport`, value: o.patientId }], name: [{ text: v.patientName }], gender: GENDER[String(v.patientGender || '').toLowerCase()] || 'unknown',
        ...(v.patientAge != null ? { extension: [{ url: `${SYS}/StructureDefinition/age-years`, valueInteger: v.patientAge }] } : {}) }],
      identifier: o.sampleId ? [{ system: `${SYS}/sample-id`, value: o.sampleId }] : undefined,
      status, intent: 'order', category: [{ coding: [{ system: SNOMED, code: '108252007', display: 'Laboratory procedure' }] }],
      code: tests.length === 1 ? tests[0] : { text: tests.map((t) => t.text).join(', ') },
      orderDetail: tests.length > 1 ? tests : undefined,
      subject: { reference: '#p', display: v.patientName }, authoredOn: o.createdAt,
      requester: v.doctorName ? { display: v.doctorName } : undefined,
      note: [{ text: `Sehatra lab status: ${o.status}` }],
    };
  }
  function referralRequest(r) {
    return {
      resourceType: 'ServiceRequest', id: r.id, meta: { lastUpdated: r.decidedAt || r.createdAt },
      contained: [{ resourceType: 'Patient', id: 'p', identifier: [{ system: `${SYS}/health-passport`, value: r.patientId }], name: [{ text: r.patientName }],
        ...(r.age != null ? { extension: [{ url: `${SYS}/StructureDefinition/age-years`, valueInteger: r.age }] } : {}) }],
      status: r.status === 'accepted' ? 'completed' : r.status === 'rejected' ? 'revoked' : 'active', intent: 'order',
      priority: ['emergency', 'urgent'].includes(r.urgency) ? (r.urgency === 'emergency' ? 'stat' : 'urgent') : 'routine',
      category: [{ coding: [{ system: SNOMED, code: '3457005', display: 'Patient referral' }] }],
      code: { text: `Admission — ${r.bedType || 'general'} bed` },
      subject: { reference: '#p', display: r.patientName }, authoredOn: r.createdAt,
      requester: r.fromName ? { display: r.fromName } : undefined,
      reasonCode: r.reason ? [{ text: r.reason }] : undefined,
      note: [{ text: `Sehatra referral status: ${r.status}` }],
    };
  }
  const k = (kind) => [keyAuth(kind), keyLimiter];
  const either = [keyAuth(null), keyLimiter, (req, res, next) => (['lis', 'hmis'].includes(req.integration.kind) ? next() : res.status(403).json({ error: 'Use a hospital (HMIS) or lab (LIS) key.' }))];

  function requestsFor(req) {
    const d = db(); const fid = req.facility.id;
    return req.integration.kind === 'lis'
      ? d.labOrders.filter((o) => o.labId === fid && labVisible(o)).map(labRequest)
      : d.referrals.filter((r) => r.toFacilityId === fid).map(referralRequest);
  }

  app.get(`${BASE}/ServiceRequest`, ...either, (req, res) => {
    const want = String(req.query.status || '').split(',').filter(Boolean);
    const lu = String(req.query._lastUpdated || '');
    const after = lu.startsWith('gt') ? Date.parse(lu.slice(2)) : NaN;
    const count = Math.min(200, Math.max(1, parseInt(req.query._count, 10) || 100));
    const rows = requestsFor(req).filter((r) => (!want.length || want.includes(r.status)) && (Number.isNaN(after) || Date.parse(r.meta.lastUpdated) > after)).slice(0, count);
    audit(req.actor, req.integration.kind === 'lis' ? 'lab_orders_pulled' : 'referrals_pulled', null, req.integration.kind === 'lis' ? 'lab' : 'referral', `${rows.length} via FHIR`);
    res.json(bundle(req, rows));
  });
  app.get(`${BASE}/ServiceRequest/:id`, ...either, (req, res) => {
    const r = requestsFor(req).find((x) => x.id === req.params.id);
    if (!r) return res.status(404).json({ error: 'ServiceRequest not found.' });
    res.json(r);
  });

  // ---------- results in: DiagnosticReport + Observations ----------
  function observationToResult(ob) {
    const coding = (ob.code?.coding || []).find((c) => c.system === LOINC) || ob.code?.coding?.[0];
    const q = ob.valueQuantity;
    const value = q?.value != null ? String(q.value) : ob.valueString ?? ob.valueCodeableConcept?.text ?? ob.valueCodeableConcept?.coding?.[0]?.display ?? (ob.valueBoolean != null ? String(ob.valueBoolean) : ob.valueInteger != null ? String(ob.valueInteger) : '');
    const rr = ob.referenceRange?.[0];
    const lo = rr?.low?.value; const hi = rr?.high?.value;
    const range = !rr ? '' : rr.text || (lo != null && hi != null ? `${lo}-${hi}` : lo != null ? `>${lo}` : hi != null ? `<${hi}` : '');
    const ic = String(ob.interpretation?.[0]?.coding?.[0]?.code || '').toUpperCase();
    return { code: coding?.system === LOINC ? coding.code : undefined, name: ob.code?.text || coding?.display || '', value: String(value ?? ''), unit: q?.unit || q?.code || '', range, flag: FLAG[ic] || '' };
  }
  app.post(`${BASE}/DiagnosticReport`, ...k('lis'), (req, res) => {
    const dr = req.body;
    if (dr?.resourceType !== 'DiagnosticReport') return res.status(400).json({ error: 'Send a DiagnosticReport resource.' });
    const ref = (dr.basedOn || []).map((b) => String(b.reference || '')).find((s) => s.startsWith('ServiceRequest/'));
    const id = ref && ref.slice('ServiceRequest/'.length);
    const o = id && db().labOrders.find((x) => x.id === id && x.labId === req.facility.id && labVisible(x));
    if (!o) return res.status(404).json({ error: 'basedOn must point to one of this lab\'s orders: ServiceRequest/<id>.' });
    const contained = new Map((dr.contained || []).filter((c) => c?.resourceType === 'Observation').map((c) => [`#${c.id}`, c]));
    const obs = (dr.result || []).map((r) => contained.get(r.reference)).filter(Boolean);
    const list = (obs.length ? obs : [...contained.values()]).slice(0, 60);
    if (!list.length) return res.status(400).json({ error: 'Put the Observations in DiagnosticReport.contained and point result[] at them.' });
    const out = saveDraft(req, o, list.map(observationToResult));
    if (out.error) return res.status(out.status).json({ error: out.error });
    res.status(201).set('Location', `${BASE}/ServiceRequest/${o.id}`)
      .json(outcome('information', 'informational', `Results saved for ${o.id}. They are waiting for the pathologist's signature and are not visible to the patient or doctor until signed.`));
  });
};
