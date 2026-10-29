// Care abroad: the English medical summary on a private, expiring link.
import { call, check, demo, done } from './lib.mjs';

const pat = await demo('patient');
const other = await demo('ramesh');
const doc = await demo('doctor');

let r = await call('GET', '/patient/travel-summary', pat);
check(r.s === 200 && r.j.patient?.name && Array.isArray(r.j.allergies), 'owner previews the summary', `${r.j.prescriptions?.length} rx · ${r.j.labResults?.length} lab reports`);
r = await call('POST', '/patient/travel-summary/links', pat, { days: 7, sections: { labs: false } });
check(r.s === 200 && /\/summary\//.test(r.j.url), 'private link made');
const token = r.j.url.split('/summary/')[1]; const linkId = r.j.id;
r = await call('GET', `/public/travel-summary/${token}`);
check(r.s === 200 && r.j.patient.name === 'Sunita Devi' && !r.j.labResults && r.j.prescriptions, 'a doctor abroad opens it without logging in (labs left out as chosen)');
check(r.h.get('cache-control') === 'no-store', 'not cached by browsers or proxies');
check(!JSON.stringify(r.j).includes('userId') && !JSON.stringify(r.j).includes('aadhaar') && !JSON.stringify(r.j).includes('hash'), 'no account ids, Aadhaar or link hashes in it');
const notes = (await call('GET', '/notifications', pat)).j || [];
check(notes.some((n) => /summary was opened/.test(n.title)), 'patient told it was opened');
r = await call('GET', '/patient/travel-summary/links', other);
check(r.s === 200 && !r.j.some((l) => l.id === linkId), 'another patient can’t see her links');
r = await call('DELETE', `/patient/travel-summary/links/${linkId}`, other);
check(r.s === 404, 'another patient can’t switch it off');
r = await call('GET', '/public/travel-summary/aaaaaaaaaaaaaaaaaaaaaaaa');
check(r.s === 410, 'a made-up link doesn’t open', r.s);
r = await call('DELETE', `/patient/travel-summary/links/${linkId}`, pat);
check(r.s === 200, 'patient switches it off');
r = await call('GET', `/public/travel-summary/${token}`);
check(r.s === 410, 'switched-off link no longer opens', r.j.error);
r = await call('GET', '/doctors/recommend?abroad=1', pat);
check(r.s === 200 && Array.isArray(r.j.doctors), 'doctors in other countries list answers', `${r.j.doctors?.length} doctors`);
r = await call('GET', '/patient/travel-summary', doc);
check(r.s === 403, 'doctors can’t call the patient endpoint');
done();
