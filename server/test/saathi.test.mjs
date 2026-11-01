// Saathi finds doctors and opens a booking card (the built-in path — tests run without any AI key).
import { BASE, check, demo, done } from './lib.mjs';

async function chat(token, messages) {
  const r = await fetch(`${BASE}/chat`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ messages, lang: 'en' }) });
  const raw = await r.text();
  const out = { text: '', doctors: null, book: null };
  for (const part of raw.split('\n\n')) {
    const p = part.trim().replace(/^data:\s*/, '');
    if (!p || p === '[DONE]') continue;
    try {
      const o = JSON.parse(p);
      if (o.delta) out.text += o.delta;
      if (o.doctors) out.doctors = o.doctors;
      if (o.book) out.book = o.book;
    } catch { /* not JSON */ }
  }
  return out;
}
// What ChatWidget sends back for a reply that showed doctor cards.
const shownNote = (text, list) => `${text}\n\n(Doctors shown as cards in the app: ${list.map((d) => `${d.name} (${d.specialty}) [id: ${d.id}]`).join('; ')})`;

const patient = await demo('patient');
const ask = 'Mujhe 3 din se bukhar hai aur body pain bhi hai';
let r = await chat(patient, [{ role: 'user', content: ask }]);
const list = r.doctors?.list || [];
check(r.text.length > 20, 'Saathi answers the health worry');
check(list.length >= 2 && list.length <= 5, 'real doctors shown for it', `${list.length} doctors`);
check(list.every((d) => d.id && d.name && d.specialty && 'fee' in d && 'online' in d), 'cards carry name, specialty, fee, availability');
check(!JSON.stringify(r.doctors).match(/passwordHash|regNo|phone|email/), 'only the public listing goes to the chat');

const history = [{ role: 'user', content: ask }, { role: 'assistant', content: shownNote(r.text, list) }];
r = await chat(patient, [...history, { role: 'user', content: 'doosre wale doctor ko book kar do' }]);
check(r.book?.doctor?.id === list[1].id, '"book the second one" → booking card for the second doctor', r.book?.doctor?.name);
check(/bukhar/.test(r.book?.note || ''), 'note for the doctor taken from what the person said', r.book?.note);
check(/not booked|Nothing is booked/i.test(r.text), 'never claims the booking is done');

const named = list[list.length - 1];
const surname = named.name.replace(/^Dr\.?\s*/, '').split(' ').pop();
r = await chat(patient, [...history, { role: 'user', content: `${surname} ji ke saath appointment book karo` }]);
check(r.book?.doctor?.id === named.id, 'doctor picked by name', named.name);

r = await chat(patient, [{ role: 'user', content: 'Book this' }, { role: 'assistant', content: shownNote('Here:', [{ name: 'Dr Fake', specialty: 'X', id: 'doc_nope' }]) }, { role: 'user', content: 'book kar do' }]);
check(!r.book, 'an id that isn\'t a verified doctor gets no booking card');

r = await chat(null, [{ role: 'user', content: ask }]);
check(!r.doctors && r.text.length > 0, 'signed-out visitors get an answer but no doctor search');
const doctor = await demo('doctor');
r = await chat(doctor, [{ role: 'user', content: ask }]);
check(!r.doctors, 'staff accounts don\'t get patient booking cards');
done();
