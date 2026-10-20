// Corti Models (corti.ai) — the backup brain for Saathi's health answers, used when every DxGPT key is out of
// quota. OpenAI-compatible chat completions at https://ai.{eu|us}.corti.app/v1 (docs.corti.ai/models).
// Credentials, either:
//   CORTI_API_KEY                                   a "Corti Models Service API Key" from the Corti Console, or
//   CORTI_CLIENT_ID + CORTI_CLIENT_SECRET + CORTI_TENANT  an API client (OAuth client credentials).
// CORTI_REGION = eu (default) | us. Like DxGPT, Corti only ever gets what the person typed — never their record.
// The Corti Console's "Copy all as .env" names (CORTI_TENANT_NAME, CORTI_ENVIRONMENT) work as well.
const TENANT = () => process.env.CORTI_TENANT || process.env.CORTI_TENANT_NAME;
const REGION = () => (String(process.env.CORTI_REGION || process.env.CORTI_ENVIRONMENT || 'eu').toLowerCase() === 'us' ? 'us' : 'eu');
const MODEL = () => process.env.CORTI_MODEL || 'corti-s1-mini-instant';
const TIMEOUT_MS = Math.max(5000, Number(process.env.CORTI_TIMEOUT_MS) || 40000);
const DAILY_LIMIT = Math.max(0, Number(process.env.CORTI_DAILY_LIMIT ?? 200));

const configured = () => Boolean(process.env.CORTI_API_KEY || (process.env.CORTI_CLIENT_ID && process.env.CORTI_CLIENT_SECRET && TENANT()));
const state = { day: '', used: 0, blockedUntil: 0, warned: false, token: null, tokenExp: 0 };

class LimitError extends Error {}

async function withTimeout(url, opts) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try { return await fetch(url, { ...opts, signal: ac.signal }); } finally { clearTimeout(t); }
}

async function bearer() {
  if (process.env.CORTI_API_KEY) return process.env.CORTI_API_KEY;
  if (state.token && Date.now() < state.tokenExp) return state.token;
  const url = `https://auth.${REGION()}.corti.app/realms/${encodeURIComponent(TENANT())}/protocol/openid-connect/token`;
  const r = await withTimeout(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.CORTI_CLIENT_ID, client_secret: process.env.CORTI_CLIENT_SECRET, scope: 'openid' }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.access_token) { const e = new Error(`Corti sign-in failed (${r.status})`); e.auth = true; throw e; }
  state.token = j.access_token;
  state.tokenExp = Date.now() + Math.max(30, (Number(j.expires_in) || 300) - 30) * 1000;
  return state.token;
}

/** One chat completion. messages: [{ role: 'system'|'user'|'assistant', content }] → text. */
async function complete(messages) {
  if (!configured()) throw new LimitError('Corti is not configured');
  if (Date.now() < state.blockedUntil) throw new LimitError('Corti is paused');
  const day = new Date().toISOString().slice(0, 10);
  if (state.day !== day) Object.assign(state, { day, used: 0 });
  if (state.used >= DAILY_LIMIT) throw new LimitError('Corti daily limit reached');
  state.used += 1;
  let r;
  try {
    r = await withTimeout(`${process.env.CORTI_BASE_URL || `https://ai.${REGION()}.corti.app/v1`}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${await bearer()}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL(), messages, max_tokens: 700, temperature: 0.3 }),
    });
  } catch (e) {
    if (e.auth) { state.blockedUntil = Date.now() + 3600000; if (!state.warned) { console.warn('[corti]', e.message, '— check CORTI_* settings; paused for an hour'); state.warned = true; } }
    throw e;
  }
  // 400/401/403 here mean the key is wrong or not a Models key: stop trying for an hour instead of every message.
  if ([400, 401, 403].includes(r.status)) {
    state.blockedUntil = Date.now() + 3600000;
    if (!state.warned) { console.warn(`[corti] credentials rejected (${r.status}) — needs a "Corti Models Service API Key" or client id + secret + tenant; paused for an hour`); state.warned = true; }
    throw new LimitError(`Corti rejected the credentials (${r.status})`);
  }
  if (r.status === 429) {
    state.blockedUntil = Date.now() + (Number(r.headers.get('retry-after')) || 600) * 1000;
    throw new LimitError('Corti rate limit');
  }
  const j = await r.json().catch(() => null);
  const text = j?.choices?.[0]?.message?.content;
  if (!r.ok || !text) throw new Error(`Corti ${r.status}`);
  state.warned = false;
  return String(text).trim();
}

module.exports = { configured, complete, LimitError, _state: state };
