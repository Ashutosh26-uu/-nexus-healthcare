// Smoke test: every demo account signs in and its portal's main screen loads; public pages answer; roles stay apart.
import { call, check, demo, done } from './lib.mjs';

const r0 = await call('GET', '/health');
check(r0.s === 200 && r0.j.ok, 'API is up');
for (const p of ['/public/config', '/public/stats', '/public/stories']) {
  const r = await call('GET', p);
  check(r.s === 200, `public ${p}`);
}

const HOMES = [
  ['patient', '/patient/home'], ['caregiver', '/patient/home'], ['doctor', '/doctor/home'], ['kiosk', '/kiosk/home'],
  ['hospital', '/hospital/home'], ['lab', '/lab/home'], ['pathologist', '/lab/home'], ['pharmacy', '/pharmacy/home'],
  ['distributor', '/distributor/home'], ['admin', '/admin/home'], ['rider', '/dispatch/jobs'], ['official', '/gov/overview'], ['national', '/gov/overview'],
];
for (const [who, path] of HOMES) {
  const t = await demo(who);
  const r = await call('GET', path, t);
  check(r.s === 200, `${who} opens ${path}`, r.s === 200 ? '' : `${r.s} ${r.j.error || ''}`);
}

// Role walls: a patient can't open staff screens, and nobody gets in without signing in.
const pat = await demo('patient');
for (const path of ['/doctor/home', '/admin/home', '/gov/overview', '/pharmacy/home', '/facility/integrations']) {
  const r = await call('GET', path, pat);
  check(r.s === 403, `patient blocked from ${path}`, r.s);
}
for (const path of ['/patient/home', '/notifications']) {
  const r = await call('GET', path);
  check(r.s === 401, `${path} needs sign-in`, r.s);
}
const wrong = await call('POST', '/auth/login', null, { identifier: 'nobody@omnicare.in', password: 'wrong-password' });
check(wrong.s === 401 || wrong.s === 400, 'wrong password refused', wrong.s);
const nf = await call('GET', '/no-such-thing');
check(nf.s === 404, 'unknown API path → 404');
done();
