// DxGPT (Foundation29) — the medical engine behind Saathi's health answers.
// API: https://dxgpt-apim.azure-api.net/api (OpenAPI: github.com/foundation29org/Dx29_server_gpt docs/apim).
//   POST /ask       general health questions → { medicalAnswer, intentAction, sonarData.citations }
//   POST /diagnose  a described case        → { data: [{ diagnosis, description, symptoms_in_common }] }
// Only the person's latest message is sent — never their name, Health Passport, records or medicines —
// and DxGPT strips any personal details it still finds. `myuuid` is a keyed hash, not an account id.
const crypto = require('crypto');

const BASE = (process.env.DXGPT_BASE_URL || 'https://dxgpt-apim.azure-api.net/api').replace(/\/+$/, '');
const TIMEOUT_MS = Math.max(5000, Number(process.env.DXGPT_TIMEOUT_MS) || 45000);
// Calls per day (the free tier allows 50). Each health question uses 1–2 calls.
const DAILY_LIMIT = Math.max(0, Number(process.env.DXGPT_DAILY_LIMIT ?? 50));
const budget = { day: '', used: 0 };

const enabled = () => Boolean(process.env.DXGPT_API_KEY);

function takeBudget() {
  const day = new Date().toISOString().slice(0, 10);
  if (budget.day !== day) Object.assign(budget, { day, used: 0 });
  if (budget.used >= DAILY_LIMIT) return false;
  budget.used += 1;
  return true;
}

// A stable, anonymous UUID per visitor (DxGPT rate-limits per id) — derived, so no account id leaves us.
function anonUuid(seed) {
  const h = crypto.createHmac('sha256', process.env.JWT_SECRET || 'sehatra').update(`dxgpt|${seed || 'anon'}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

async function call(path, description, seed) {
  if (!enabled()) throw new Error('DxGPT is not configured');
  if (!takeBudget()) throw new Error('DxGPT daily limit reached');
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${BASE}${path}`, {
      method: 'POST',
      signal: ac.signal,
      headers: { 'content-type': 'application/json', 'Ocp-Apim-Subscription-Key': process.env.DXGPT_API_KEY },
      body: JSON.stringify({
        description: String(description).slice(0, 2000),
        myuuid: anonUuid(seed),
        timezone: process.env.APP_TZ || 'Asia/Kolkata',
        countryCode: process.env.DXGPT_COUNTRY || 'IN',
        response_mode: 'direct', // wait for the answer instead of a WebSocket ticket
      }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || j.result !== 'success') throw new Error(`DxGPT ${path} ${r.status} ${j?.result || ''}`.trim());
    return j;
  } finally { clearTimeout(timer); }
}

// "[2][3]" citation markers → removed; the sources become one short line instead.
const clean = (t) => String(t || '').replace(/\s*\[\d+\](\[\d+\])*/g, '').replace(/[ \t]+\n/g, '\n').trim();
function sourcesLine(citations) {
  const hosts = [];
  for (const u of citations || []) {
    try { const h = new URL(u).hostname.replace(/^www\./, ''); if (!hosts.includes(h)) hosts.push(h); } catch { /* skip */ }
    if (hosts.length >= 3) break;
  }
  return hosts.length ? `_Sources: ${hosts.join(' · ')}_` : '';
}

/**
 * Answer a health message. Returns { kind: 'answer', text, sources } for a question, or
 * { kind: 'differential', items: [{ name, about }] } when it reads as a description of someone's symptoms.
 */
async function answer(message, seed) {
  const a = await call('/ask', message, seed);
  const text = clean(a.medicalAnswer);
  if (text) return { kind: 'answer', text, sources: sourcesLine(a.sonarData?.citations) };
  // An empty answer means DxGPT read it as a case ("go"/"enrich") — ask it for the likely causes instead.
  const d = await call('/diagnose', message, seed);
  const items = (d.data || []).slice(0, 3).map((x) => ({ name: clean(x.diagnosis), about: clean(x.description) })).filter((x) => x.name);
  if (items.length) return { kind: 'differential', items };
  // Nothing from either endpoint: DxGPT wants more context ("enrich") — ask the person for it.
  return { kind: 'need-more', reason: d.intentReason || a.intentReason || '' };
}

module.exports = { enabled, answer, anonUuid, _budget: budget };
