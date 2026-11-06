// DPDP: privacy notice before sign-up, consent records and one-tap withdrawal, grievances answered within 90 days.
import { call, check, demo, done } from './lib.mjs';

let r = await call('GET', '/public/privacy-notice');
const n = r.j;
check(r.s === 200 && n.version && n.purposes.some((p) => p.key === 'care' && p.required) && n.purposes.some((p) => p.key === 'ai' && !p.required), 'privacy notice with required and optional purposes', n.version);
check(n.rights.length >= 4 && /90 days/.test(n.rights.join(' ')) && n.grievance.inApp, 'notice lists rights, the 90-day reply and how to complain');

// Sign-up needs the notice accepted first.
const email = `dpdp-${Date.now()}@example.org`;
r = await call('POST', '/auth/otp/request', null, { email, channel: 'email' });
const code = r.j.devCode;
r = await call('POST', '/auth/otp/verify', null, { target: r.j.target, code });
const ticket = r.j.ticket;
check(Boolean(ticket), 'new email verified for sign-up');
const base = { ticket, name: 'Consent Tester', email, phone: '9812345670', dialCode: '+91', country: 'IN', language: 'English' };
r = await call('POST', '/auth/register/quick', null, base);
check(r.s === 400 && r.j.code === 'CONSENT_REQUIRED', 'no account without agreeing to the notice');
r = await call('POST', '/auth/register/quick', null, { ...base, consent: { version: 'old', care: true } });
check(r.s === 400, 'an old notice version isn\'t accepted');
r = await call('POST', '/auth/register/quick', null, { ...base, consent: { version: n.version, care: true, ai: false, lang: 'hi' } });
check(r.s === 200 && r.j.token, 'account created after agreeing');
const fresh = r.j.token;
r = await call('GET', '/me/consent', fresh);
check(r.j.current?.version === n.version && r.j.current.ai === false && r.j.current.lang === 'hi' && r.j.current.via === 'signup' && !r.j.needsNotice, 'consent recorded at sign-up: version, AI off, language');

// Existing account: sees the notice, gives and withdraws the optional consent.
const patient = await demo('patient');
r = await call('POST', '/me/consent', patient, { version: 'old', care: true });
check(r.s === 409, 'stale notice version refused');
r = await call('POST', '/me/consent', patient, { version: n.version, care: false });
check(r.s === 400, 'core consent can\'t be dropped here (delete the account instead)');
r = await call('POST', '/me/consent', patient, { version: n.version, care: true, ai: true, lang: 'en' });
check(r.s === 200 && r.j.current.ai === true, 'Saathi AI consent given');
r = await call('POST', '/me/consent', patient, { version: n.version, care: true, ai: false, lang: 'en' });
check(r.s === 200 && r.j.current.ai === false, 'withdrawn in one call');
r = await call('GET', '/me/consent', patient);
check(r.j.history.length >= 2 && r.j.history[0].ai === false && r.j.history[0].previous?.ai === true, 'every change kept as a consent record');
r = await call('GET', '/auth/me', patient);
check(r.j.user?.consent?.version === n.version, 'the app sees the current choice (notice not shown again)');

// Grievances.
r = await call('POST', '/grievances', patient, { topic: 'access', text: 'short' });
check(r.s === 400, 'empty complaint refused');
r = await call('POST', '/grievances', patient, { topic: 'access', text: 'Please send me a copy of everything you hold about me.' });
const g = r.j;
const days = Math.round((Date.parse(g.dueBy) - Date.parse(g.at)) / 86400000);
check(r.s === 200 && g.status === 'open' && days === 90, 'complaint logged with a 90-day deadline', `${days} days`);
const admin = await demo('admin');
r = await call('GET', '/admin/grievances', admin);
const row = r.j.open?.find((x) => x.id === g.id);
check(row && row.daysLeft >= 89 && row.user, 'admin sees it with days left', row && `${row.daysLeft} days`);
check((await call('GET', '/admin/grievances', patient)).s === 403, 'only admins see complaints');
r = await call('POST', `/admin/grievances/${g.id}/reply`, admin, { text: 'We have emailed you a full copy.', close: true });
check(r.s === 200 && r.j.status === 'closed', 'admin replies and resolves');
r = await call('GET', '/grievances', patient);
const mine = r.j.find((x) => x.id === g.id);
check(mine?.status === 'closed' && mine.replies[0]?.text.includes('full copy'), 'the person sees the reply');
const notes = (await call('GET', '/notifications', patient)).j || [];
check(notes.some((x) => /privacy complaint/i.test(x.title)), 'and is notified');
// Easy mode follows the account.
r = await call('PUT', '/me/easy', patient, { on: true });
const me = (await call('GET', '/auth/me', patient)).j;
check(r.j.on === true && me.user?.easyMode === true, 'easy mode saved on the account');
await call('PUT', '/me/easy', patient, { on: false });
done();
