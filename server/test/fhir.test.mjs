// HL7 FHIR R4 connector: lab orders and referrals as ServiceRequest, results in as DiagnosticReport.
import { BASE, call, check, demo, done } from './lib.mjs';

const F = '/integration/fhir/r4';
const fhir = async (m, p, key, body) => {
  const r = await fetch(BASE + F + p, { method: m, headers: { 'content-type': 'application/fhir+json', ...(key ? { authorization: `Bearer ${key}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, j: await r.json().catch(() => ({})), type: r.headers.get('content-type') || '' };
};

const pathologist = await demo('pathologist');
const hospital = await demo('hospital');
const pharmacy = await demo('pharmacy');
const lis = (await call('POST', '/facility/integrations', pathologist, { name: 'FHIR LIS' })).j.key;
const hmis = (await call('POST', '/facility/integrations', hospital, { name: 'FHIR HMIS' })).j.key;
const billing = (await call('POST', '/facility/integrations', pharmacy, { name: 'FHIR billing' })).j.key;

let r = await fhir('GET', '/metadata');
check(r.s === 200 && r.j.resourceType === 'CapabilityStatement' && r.j.fhirVersion === '4.0.1' && /fhir\+json/.test(r.type), 'CapabilityStatement, served as application/fhir+json');
r = await fhir('GET', '/ServiceRequest');
check(r.s === 401 && r.j.resourceType === 'OperationOutcome', 'no key → 401 OperationOutcome');
r = await fhir('GET', '/ServiceRequest', billing);
check(r.s === 403 && r.j.resourceType === 'OperationOutcome', 'billing key can’t read ServiceRequests');

r = await fhir('GET', '/ServiceRequest', lis);
const lab = await demo('lab');
const orders = (await call('GET', '/lab/home', lab)).j.orders;
check(r.s === 200 && r.j.resourceType === 'Bundle' && r.j.total === orders.length, 'LIS: Bundle of this lab’s orders', `${r.j.total}`);
const sr = r.j.entry.map((e) => e.resource).find((x) => x.status === 'active');
check(sr && sr.contained[0].resourceType === 'Patient' && sr.subject.reference === '#p', 'patient carried as a contained Patient');
check(r.j.entry.some((e) => (e.resource.code.coding || e.resource.orderDetail?.[0]?.coding || [])[0]?.system === 'http://loinc.org'), 'tests coded in LOINC');
r = await fhir('GET', '/ServiceRequest?status=completed', lis);
check(r.s === 200 && r.j.entry.every((e) => e.resource.status === 'completed'), 'status filter works');
r = await fhir('GET', `/ServiceRequest?_lastUpdated=gt${new Date(Date.now() + 86400000).toISOString()}`, lis);
check(r.s === 200 && r.j.total === 0, '_lastUpdated=gt filter works');
r = await fhir('GET', `/ServiceRequest/${sr.id}`, lis);
check(r.s === 200 && r.j.id === sr.id, 'read one ServiceRequest');
r = await fhir('GET', `/ServiceRequest/${sr.id}`, hmis);
check(r.s === 404, 'a hospital key can’t read a lab’s order');
r = await fhir('GET', '/ServiceRequest', hmis);
check(r.s === 200 && r.j.entry.every((e) => e.resource.category[0].coding[0].code === '3457005'), 'HMIS: referrals as ServiceRequests', `${r.j.total}`);

// results in — needs a collected sample
const o = orders.find((x) => ['collected', 'received', 'processing'].includes(x.status)) || orders.find((x) => x.status === 'ordered');
if (o.status === 'ordered') await call('PUT', `/integration/v1/lab-orders/${o.id}/status`, lis, { status: 'collected' });
const code = o.tests[0].code;
const report = {
  resourceType: 'DiagnosticReport', status: 'preliminary', basedOn: [{ reference: `ServiceRequest/${o.id}` }], code: { text: 'Lab report' },
  contained: [
    { resourceType: 'Observation', id: 'o1', status: 'preliminary', code: { coding: [{ system: 'http://loinc.org', code }] }, valueQuantity: { value: 6.1, unit: 'mmol/L' }, referenceRange: [{ low: { value: 3.5 }, high: { value: 5.5 } }], interpretation: [{ coding: [{ code: 'H' }] }] },
    { resourceType: 'Observation', id: 'o2', status: 'preliminary', code: { text: 'Comment' }, valueString: 'Sample slightly haemolysed' },
  ],
  result: [{ reference: '#o1' }, { reference: '#o2' }],
};
r = await fhir('POST', '/DiagnosticReport', hmis, report);
check(r.s === 403, 'hospital key can’t post lab results');
r = await fhir('POST', '/DiagnosticReport', lis, { ...report, basedOn: [{ reference: 'ServiceRequest/nope' }] });
check(r.s === 404 && r.j.resourceType === 'OperationOutcome', 'unknown order → 404 OperationOutcome');
r = await fhir('POST', '/DiagnosticReport', lis, report);
check(r.s === 201 && /pathologist/.test(r.j.issue?.[0]?.diagnostics || ''), 'DiagnosticReport accepted (201)');
const after = (await call('GET', '/lab/home', pathologist)).j.orders.find((x) => x.id === o.id);
const res1 = after.draftReport?.results?.[0];
check(after.status === 'review' && res1?.value === '6.1' && res1.unit === 'mmol/L' && res1.range === '3.5-5.5' && res1.flag === 'high', 'mapped into the pathologist’s draft', JSON.stringify(res1));
check(after.draftReport.results[1]?.value === 'Sample slightly haemolysed', 'text observations kept');
const pat = await demo('patient');
const seen = (await call('GET', `/lab-orders/${o.id}`, pat)).j;
check(!seen.results?.length && !seen.draftReport, 'patient sees nothing until it’s signed');
done();
