// Membership plans: admin publishes, patient pays a month, a video consult is paid from the plan, a refunded
// cancellation gives the consult back.
import { call, check, demo, done } from './lib.mjs';

const admin = await demo('admin');
const patient = await demo('patient');

let r = await call('GET', '/membership', patient);
check(r.s === 200 && Array.isArray(r.j.plans) && r.j.active === null, 'no plan shown until one is published');
r = await call('POST', '/admin/member-plans', admin, { name: 'Family Care', price: 0, consults: 2 });
check(r.s === 400, 'a plan needs a real price');
r = await call('POST', '/admin/member-plans', patient, { name: 'X', price: 10, consults: 1 });
check(r.s === 403, 'only admins publish plans');
r = await call('POST', '/admin/member-plans', admin, { name: 'Family Care', price: 199, consults: 2, family: true, note: 'Test plan' });
const plan = r.j;
check(r.s === 200 && plan.id && plan.price === 199, 'admin publishes a plan');

r = await call('GET', '/membership', patient);
check(r.j.plans.some((p) => p.id === plan.id), 'patient sees it');
r = await call('POST', '/membership/subscribe', patient, { planId: plan.id });
check(r.s === 200 && r.j.payment.amount === 199 && r.j.membership.status === 'pending', 'joining creates a ₹199 payment');
r = await call('POST', `/payments/${r.j.payment.id}/confirm`, patient, {});
check(r.s === 200 && r.j.status === 'paid', 'paid (demo payment)');
r = await call('GET', '/membership', patient);
const a = r.j.active;
const days = a && Math.round((Date.parse(a.endsAt) - Date.parse(a.startsAt)) / 86400000);
check(a && a.consultsLeft === 2 && days === 30, 'plan active for 30 days with 2 consults', a && `${a.consultsLeft} left, ${days} days`);
r = await call('POST', '/membership/subscribe', patient, { planId: plan.id });
check(r.s === 409, 'can\'t buy a second month until the last week');

// A video consult paid from the plan.
const when = new Date(Date.now() + 3 * 86400000); when.setUTCHours(5, 0, 0, 0);
r = await call('POST', '/bookings', patient, { doctorId: 'doc_1', visitType: 'video', mode: 'video', when: 'later', scheduledAt: when.toISOString(), symptoms: 'Sugar follow-up, feeling tired' });
const consultId = r.j.consult?.id;
const payId = r.j.payment?.id;
check(r.s === 200 && payId, 'video consult booked, awaiting payment', r.j.error);
r = await call('GET', `/payments/${payId}/membership`, patient);
check(r.j.covered === true && r.j.consultsLeft === 2, 'payment screen offers the plan');
r = await call('POST', `/payments/${payId}/membership`, patient);
check(r.s === 200 && r.j.payment.status === 'paid' && r.j.payment.amount === 0 && r.j.consultsLeft === 1, 'paid from the plan — nothing to pay, 1 consult left');
r = await call('POST', `/payments/${payId}/membership`, patient);
check(r.s >= 400, 'the same payment can\'t use the plan twice');

// Cancelling well ahead gives the consult back.
r = await call('POST', `/consults/${consultId}/cancel`, patient, {});
check(r.s === 200, 'patient cancels 3 days ahead');
r = await call('GET', '/membership', patient);
check(r.j.active?.consultsLeft === 2, 'the consult goes back to the plan', `${r.j.active?.consultsLeft} left`);

// Plan off sale: hidden from patients, the current month keeps working.
r = await call('PUT', `/admin/member-plans/${plan.id}`, admin, { active: false });
check(r.s === 200 && r.j.active === false, 'admin takes the plan off sale');
r = await call('GET', '/membership', patient);
check(!r.j.plans.some((p) => p.id === plan.id) && r.j.active?.planId === plan.id, 'off-sale plan hidden, existing member keeps it');
done();
