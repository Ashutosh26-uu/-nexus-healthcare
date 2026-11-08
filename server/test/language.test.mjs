// Saathi answers in the language of the person's latest message — English after Hinglish gets English.
import { createRequire } from 'node:module';
import { BASE, check, done } from './lib.mjs';

const require = createRequire(import.meta.url);
const { replyLang, sameLangTail } = require('../chat.js');
const { isHinglish } = require('../hinglish.js');

check(replyLang('', 'I have fever since 2 days', 'hi') === 'en', 'English message → English, even with the app in Hindi');
check(replyLang('', 'mujhe 3 din se bukhar hai', 'en') === 'hi-Latn', 'Hinglish message → Hinglish');
check(replyLang('', 'मुझे बुखार है', 'en') === 'hi', 'Devanagari → Hindi');
check(!isHinglish('Sir, I have a fever since 2 days') && !isHinglish('My papa has sugar'), 'English with "sir" / "papa" stays English');

const history = [
  { role: 'user', content: 'mujhe bukhar hai' },
  { role: 'assistant', content: 'Aapko kab se bukhar hai?' },
  { role: 'user', content: '3 din se hai aur sar dard bhi' },
  { role: 'assistant', content: '...' },
  { role: 'user', content: 'What should I take for the headache?' },
];
let tail = sameLangTail(history, 'en', 'hi');
check(tail.length === 1 && tail[0].startsWith('What should'), 'switching to English drops the earlier Hinglish messages', JSON.stringify(tail));
tail = sameLangTail(history.slice(0, 3), 'hi-Latn', 'en');
check(tail.length === 2, 'follow-ups in the same language keep their context', JSON.stringify(tail));

// Built-in answer, end to end: Hinglish first, then English.
const r = await fetch(`${BASE}/chat`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ lang: 'hi', messages: [{ role: 'user', content: 'mujhe bukhar hai' }, { role: 'assistant', content: 'Aap paani piyein.' }, { role: 'user', content: 'What should I do for a cough?' }] }),
});
let text = '';
for (const part of (await r.text()).split('\n\n')) { try { const o = JSON.parse(part.replace(/^data:\s*/, '')); if (o.delta) text += o.delta; } catch { /* [DONE] */ } }
check(text.length > 20 && !isHinglish(text) && !/[ऀ-ॿ]/.test(text), 'English question after Hinglish gets an English answer', text.slice(0, 70));
done();
