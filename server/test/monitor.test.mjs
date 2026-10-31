// Built-in error monitoring: browser errors grouped and scrubbed, health numbers, admins only.
import { call, check, demo, done } from './lib.mjs';

const admin = await demo('admin');
const patient = await demo('patient');

let r = await call('POST', '/client-errors', null, {
  message: 'TypeError: Cannot read properties of undefined (reading map) for sunita@example.com 9876543210',
  stack: 'TypeError: x\n    at Home (https://app/assets/index-abc.js:12:34)\n    at render',
  path: '/patient/records/rec_m3k2j9a8?token=abc',
});
check(r.s === 200 && r.j.ok, 'browser error accepted without sign-in');
await call('POST', '/client-errors', null, { message: 'TypeError: Cannot read properties of undefined (reading map) for sunita@example.com 9876543210', stack: 'TypeError: x\n    at Home (https://app/assets/index-abc.js:12:34)', path: '/patient/records/rec_m3k2j9a8' });
r = await call('POST', '/client-errors', null, { message: 'ResizeObserver loop limit exceeded' });
check(r.s === 200 && r.j.ignored, 'browser noise ignored');
r = await call('POST', '/client-errors', null, { message: 'x'.repeat(5000) });
check(r.s === 413, 'oversized report refused');

r = await call('GET', '/admin/errors', admin);
const g = r.j.open?.find((x) => /reading map/.test(x.message));
check(r.s === 200 && g && g.count === 2, 'same error grouped, counted twice', g && `${g.count}×`);
check(g && !/sunita|9876543210/.test(JSON.stringify(g)) && /<email>/.test(g.message) && /<number>/.test(g.message), 'email and phone number scrubbed', g?.message);
check(g && g.route === '/patient/records/:id', 'record id and query string removed from the path', g?.route);
check(typeof r.j.health.requestsLastHour === 'number' && r.j.health.requestsLastHour > 0, 'request health measured', JSON.stringify(r.j.health));
const notes = (await call('GET', '/notifications', admin)).j || [];
check(notes.some((n) => /New app error/.test(n.title)), 'admin told about a new kind of error');

r = await call('GET', '/admin/errors', patient);
check(r.s === 403, 'non-admins can’t see errors');
r = await call('POST', `/admin/errors/${g.id}/resolve`, admin);
check(r.s === 200 && r.j.resolvedAt, 'admin marks it fixed');
r = await call('GET', '/admin/errors', admin);
check(!r.j.open.some((x) => x.id === g.id) && r.j.resolved.some((x) => x.id === g.id), 'fixed error moves to resolved');
const home = (await call('GET', '/admin/home', admin)).j;
check(home.monitoring && 'p95LatencyMs' in home.monitoring && 'openErrors' in home.monitoring, 'admin home carries the health numbers');
done();
