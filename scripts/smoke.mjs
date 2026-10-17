// End-to-end smoke test against a running DEMO API (resets demo data first).
//   node scripts/smoke.mjs [http://localhost:4000]
// Never point this at the live site — it calls /api/dev/reset, which is refused there anyway.
const B = `${process.argv[2] || 'http://localhost:4000'}/api`;
let pass = 0; let fail = 0;
const check = (c, msg) => { if (c) pass += 1; else fail += 1; console.log(c ? 'PASS' : 'FAIL', msg); };
const call = async (m, p, t, b) => {
  const r = await fetch(B + p, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: b ? JSON.stringify(b) : undefined });
  const j = await r.json().catch(() => ({}));
  // `http` is the HTTP code; payloads often carry their own `status` field (paid, accepted…).
  return { ...(Array.isArray(j) ? { list: j } : j), http: r.status };
};
const tokens = {};
const login = async (email) => (tokens[email] ||= (await call('POST', '/auth/login', null, { identifier: email, password: 'Demo@123' })).token);

const admin = await login('admin@omnicare.in');
check((await call('POST', '/dev/reset', admin, {})).http === 200, 'demo data reset');
const pt = await login('patient@omnicare.in');
const doc = await login('doctor@omnicare.in');
const lab = await login('lab@omnicare.in');
const path = await login('pathologist@omnicare.in');
const ph = await login('pharmacy@omnicare.in');
const hosp = await login('hospital@omnicare.in');
check([pt, doc, lab, path, ph, hosp].every(Boolean), 'all demo roles sign in');

// Auth: email-only codes, neutral password reset
const cfg = await call('GET', '/auth/otp/config');
check(JSON.stringify(cfg.channels) === '["email"]', 'one-time codes are email only');
check((await call('POST', '/auth/otp/request', null, { phone: '9876500001', channel: 'sms' })).http === 400, 'phone code refused');
const rr = await call('POST', '/auth/password-reset/request', null, { email: 'nobody@example.com' });
check(rr.http === 200 && !rr.devCode, 'password reset: neutral answer for unknown email');

// Lab: book with 20% advance → collect → report → pathologist approves
const labs = await call('GET', '/lab-orders/lab_305/labs?near=home&sort=cost', pt);
check(labs.labs?.length > 0 && labs.labs.every((l) => l.offersAll), 'labs offering all tests listed');
const bk = await call('POST', '/lab-orders/lab_305/book', pt, { labId: 'fac_l1', near: 'home' });
check(bk.payment?.amount > 0, 'lab booking creates a 20% advance');
check((await call('POST', `/payments/${bk.payment?.id}/confirm`, pt, {})).http === 200, 'lab advance paid (demo)');
check((await call('PUT', '/lab-orders/lab_305/status', lab, { status: 'collected' })).http === 200, 'lab marks sample collected');
await call('PUT', '/lab-orders/lab_305/status', lab, { status: 'processing' });
const rep = await call('POST', '/lab-orders/lab_305/report', lab, { results: [{ name: 'Fasting Blood Sugar', value: '142', unit: 'mg/dL', range: '70-100', flag: 'high' }] });
check(rep.http === 200, 'lab enters results');
let tests = await call('GET', '/patient/tests', pt);
check(tests.orders?.find((o) => o.id === 'lab_305')?.status === 'review', 'report hidden from patient until sign-off');
check((await call('POST', '/lab-orders/lab_305/approve', path, {})).http === 200, 'pathologist approves');
tests = await call('GET', '/patient/tests', pt);
const o305 = tests.orders?.find((o) => o.id === 'lab_305');
check(o305?.status === 'reported' && o305.nextSteps?.length > 0, 'patient sees report with next steps');

// Pharmacy: pickup order → accept → pack → collect with code
const mo = await call('POST', '/medicine-orders', pt, { items: [{ drug: 'Paracetamol 500mg', qty: 10 }], pharmacyId: 'fac_p1', fulfilment: 'pickup' });
check(!!mo.order?.id, 'medicine order placed');
check((await call('POST', `/medicine-orders/${mo.order?.id}/respond`, ph, { action: 'accept' })).http === 200, 'chemist accepts');
check((await call('POST', `/medicine-orders/${mo.order?.id}/status`, ph, { status: 'packed' })).http === 200, 'chemist packs');
const mine = await call('GET', '/patient/medicine-orders', pt);
const otp = mine.list?.find((x) => x.id === mo.order?.id)?.otp;
check((await call('POST', `/medicine-orders/${mo.order?.id}/status`, ph, { status: 'collected', otp })).http === 200, 'patient collects with code');
const subs = await call('GET', `/medicines/substitutes?drug=${encodeURIComponent('Dolo 650')}`, pt);
check(subs.http === 200 && subs.salt, 'generic substitutes available');

// Doctor booking: audio mode → pay → reschedule → cancel with refund
const when = new Date(Date.now() + 30 * 3600000).toISOString();
const b1 = await call('POST', '/bookings', pt, { doctorId: 'doc_1', visitType: 'video', mode: 'audio', when: 'later', scheduledAt: when, symptoms: 'Cough for 3 days' });
check(!!b1.payment?.id, 'doctor booking created');
await call('POST', `/payments/${b1.payment?.id}/confirm`, pt, {});
const cid = b1.consult?.id;
const moved = await call('POST', `/consults/${cid}/reschedule`, pt, { scheduledAt: new Date(Date.now() + 50 * 3600000).toISOString() });
check(moved.http === 200, 'patient reschedules');
const canc = await call('POST', `/consults/${cid}/cancel`, pt, {});
check(canc.http === 200 && canc.refund > 0, 'cancel >2 h ahead gives a refund');

// Doctor tools
const kit = await call('GET', '/doctor/rx-kit', doc);
check(Array.isArray(kit.drugs) && kit.drugs.length > 0, 'doctor quick-prescribe kit loads');
const sum = await call('GET', '/consults/con_103/summary', doc);
check(sum.http === 200 && sum.patient, 'patient summary card for the treating doctor');
check((await call('GET', '/consults/con_103/summary', await login('arjun@omnicare.in'))).http === 403, 'another doctor cannot read the summary');

// Reception + waiting-room display
const lk = await call('GET', '/hospital/reception/lookup?q=OC-2041-5521', hosp);
const pid = lk.list?.[0]?.id;
check(!!pid && !('allergies' in (lk.list?.[0] || {})), 'reception finds patient (identity only)');
const visit = await call('POST', '/hospital/reception/visits', hosp, { patientId: pid, doctorId: 'doc_2' });
check(visit.token >= 1, `walk-in token issued (#${visit.token})`);
const desk = await call('POST', '/hospital/reception/display-code', hosp, {});
const disp = await call('GET', `/public/queue-display/${desk.displayCode}`);
check(disp.http === 200 && !JSON.stringify(disp).includes('OC-2041'), 'TV display works without personal data');

await call('POST', '/dev/reset', admin, {});
console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
