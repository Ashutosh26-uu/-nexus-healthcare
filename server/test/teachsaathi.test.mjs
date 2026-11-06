// Teach Saathi: the team's own answers, given word for word on a trigger word.
import { BASE, call, check, demo, done } from './lib.mjs';

async function chat(content) {
  const r = await fetch(`${BASE}/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content }], lang: 'en' }) });
  let text = ''; let emergency = false;
  for (const part of (await r.text()).split('\n\n')) {
    try { const o = JSON.parse(part.replace(/^data:\s*/, '')); if (o.delta) text += o.delta; if (o.emergency) emergency = true; } catch { /* [DONE] */ }
  }
  return { text, emergency };
}

const admin = await demo('admin');
let r = await call('POST', '/admin/saathi-faqs', admin, { question: 'When does the E-Clinic open?', answer: 'Our E-Clinics are open 9 am to 5 pm, Monday to Saturday.' });
check(r.s === 400, 'an answer needs trigger words');
r = await call('POST', '/admin/saathi-faqs', admin, { question: 'When does the E-Clinic open?', answer: 'Our E-Clinics are open 9 am to 5 pm, Monday to Saturday.', triggers: 'timing, khulta, opening hours' });
const faq = r.j;
check(r.s === 200 && faq.id, 'admin teaches an answer');
r = await call('POST', '/admin/saathi-faqs', admin, { question: 'Is there a booking fee?', answer: 'Each doctor sets their own fee, shown before you book.', triggers: 'fee' });
const fee = r.j;
check((await call('POST', '/admin/saathi-faqs', await demo('patient'), { question: 'x', answer: 'y', triggers: 'z' })).s === 403, 'only admins teach');

r = await call('POST', '/admin/saathi-faqs/test', admin, { message: 'E-clinic kitne baje khulta hai?' });
check(r.j.match?.id === faq.id, 'Hinglish message matches the trigger');
r = await call('POST', '/admin/saathi-faqs/test', admin, { message: 'My feet are swollen' });
check(r.j.match === null, 'whole words only — "feet" doesn\'t trigger "fee"');

let c = await chat('E-clinic kitne baje khulta hai?');
check(c.text.includes('9 am to 5 pm'), 'Saathi gives the taught answer word for word', c.text.slice(0, 60));
c = await chat('I have chest pain, what is the clinic timing?');
check(c.emergency, 'an emergency still goes to 108 first');
r = await call('GET', '/admin/saathi-faqs', admin);
check(r.j.find((x) => x.id === faq.id)?.uses >= 1, 'usage counted');

r = await call('PUT', `/admin/saathi-faqs/${faq.id}`, admin, { active: false });
c = await chat('E-clinic kitne baje khulta hai?');
check(r.j.active === false && !c.text.includes('9 am to 5 pm'), 'switched off → not used');
await call('DELETE', `/admin/saathi-faqs/${faq.id}`, admin);
await call('DELETE', `/admin/saathi-faqs/${fee.id}`, admin);
r = await call('GET', '/admin/saathi-faqs', admin);
check(!r.j.some((x) => x.id === faq.id || x.id === fee.id), 'deleted');
done();
