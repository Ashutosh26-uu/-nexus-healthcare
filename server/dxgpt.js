// DxGPT (Foundation29) — the medical engine behind Saathi's health answers.
// API: https://dxgpt-apim.azure-api.net/api (OpenAPI: github.com/foundation29org/Dx29_server_gpt docs/apim).
//   POST /ask       general health questions → { medicalAnswer, intentAction, sonarData.citations }
//   POST /diagnose  a described case        → { data: [{ diagnosis, description, symptoms_in_common }] }
// Only the person's latest message is sent — never their name, Health Passport, records or medicines —
// and DxGPT strips any personal details it still finds. `myuuid` is a keyed hash, not an account id.
const crypto = require('crypto');

const BASE = (process.env.DXGPT_BASE_URL || 'https://dxgpt-apim.azure-api.net/api').replace(/\/+$/, '');
const TIMEOUT_MS = Math.max(5000, Number(process.env.DXGPT_TIMEOUT_MS) || 30000);
// Calls per day PER KEY (the free tier allows 50). Each health question uses 1–2 calls.
const DAILY_LIMIT = Math.max(0, Number(process.env.DXGPT_DAILY_LIMIT ?? 50));

// Several keys, used in order: DXGPT_API_KEY, DXGPT_API_KEY_2, DXGPT_API_KEY_3… (or DXGPT_API_KEYS=a,b,c).
// When one is out of quota, rate-limited or rejected, the next one takes over automatically.
function keys() {
  const list = [process.env.DXGPT_API_KEY, ...String(process.env.DXGPT_API_KEYS || '').split(',')];
  for (let i = 2; i <= 9; i += 1) list.push(process.env[`DXGPT_API_KEY_${i}`]);
  return [...new Set(list.map((k) => String(k || '').trim()).filter(Boolean))];
}
const keyState = new Map(); // key → { day, used, blockedUntil }
const stateOf = (k) => { if (!keyState.has(k)) keyState.set(k, { day: '', used: 0, blockedUntil: 0 }); return keyState.get(k); };
const today = () => new Date().toISOString().slice(0, 10);
const tomorrow = () => { const d = new Date(); d.setUTCHours(24, 0, 0, 0); return d.getTime(); };
const label = (k) => `key #${keys().indexOf(k) + 1}`;
function usable(k) {
  const s = stateOf(k);
  if (s.day !== today()) Object.assign(s, { day: today(), used: 0 });
  return Date.now() >= s.blockedUntil && s.used < DAILY_LIMIT;
}

const enabled = () => keys().length > 0;
class LimitError extends Error {}

// A stable, anonymous UUID per visitor (DxGPT rate-limits per id) — derived, so no account id leaves us.
function anonUuid(seed) {
  const h = crypto.createHmac('sha256', process.env.JWT_SECRET || 'sehatra').update(`dxgpt|${seed || 'anon'}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

async function callWith(key, path, description, seed) {
  const s = stateOf(key);
  s.used += 1;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${BASE}${path}`, {
      method: 'POST',
      signal: ac.signal,
      headers: { 'content-type': 'application/json', 'Ocp-Apim-Subscription-Key': key },
      body: JSON.stringify({
        description: String(description).slice(0, 2000),
        myuuid: anonUuid(seed),
        timezone: process.env.APP_TZ || 'Asia/Kolkata',
        countryCode: process.env.DXGPT_COUNTRY || 'IN',
        response_mode: 'direct', // wait for the answer instead of a WebSocket ticket
      }),
    });
    const j = await r.json().catch(() => null);
    // Out of quota / rate-limited / key no longer valid → park this key and let the next one answer.
    if (r.status === 429) { s.blockedUntil = Date.now() + (Number(r.headers.get('retry-after')) || 3600) * 1000; throw new LimitError(`DxGPT ${label(key)} rate-limited`); }
    if (r.status === 403 && /quota|volume|limit/i.test(j?.message || '')) { s.blockedUntil = tomorrow(); throw new LimitError(`DxGPT ${label(key)} out of quota for today`); }
    if (r.status === 401 || r.status === 403) { s.blockedUntil = Date.now() + 6 * 3600000; throw new LimitError(`DxGPT ${label(key)} rejected (${r.status})`); }
    if (!r.ok || !j || j.result !== 'success') throw new Error(`DxGPT ${path} ${r.status} ${j?.result || ''}`.trim());
    return j;
  } finally { clearTimeout(timer); }
}

// Try each usable key in order; a key that is out of quota or rejected hands over to the next one.
async function call(path, description, seed) {
  const all = keys();
  if (!all.length) throw new LimitError('DxGPT is not configured');
  let lastErr = null;
  for (const key of all) {
    if (!usable(key)) continue;
    try { return await callWith(key, path, description, seed); } catch (e) {
      lastErr = e;
      if (e instanceof LimitError) { console.warn(`[dxgpt] ${e.message} — switching to the next provider`); continue; }
      throw e; // a timeout or DxGPT itself failing: the next key wouldn't do better
    }
  }
  throw lastErr instanceof LimitError || !lastErr ? new LimitError('every DxGPT key is out of quota or rejected') : lastErr;
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

module.exports = { enabled, answer, anonUuid, keys, LimitError, _keyState: keyState };
