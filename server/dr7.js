// Dr7.ai — the last AI in Saathi's chain (after DxGPT and Corti). OpenAI-compatible medical models at
// https://dr7.ai/api/v1/medical (dr7.ai/llms.txt). Key: DR7_API_KEY (sk-dr7-…). Like the others it only ever
// receives what the person typed — Dr7 asks for no names or ID numbers without a data processing agreement.
const BASE = () => (process.env.DR7_BASE_URL || 'https://dr7.ai/api/v1/medical').replace(/\/+$/, '');
const MODEL = () => process.env.DR7_MODEL || 'medgemma-4b-it';
const TIMEOUT_MS = Math.max(5000, Number(process.env.DR7_TIMEOUT_MS) || 40000);
const DAILY_LIMIT = Math.max(0, Number(process.env.DR7_DAILY_LIMIT ?? 200));

const configured = () => Boolean(process.env.DR7_API_KEY);
const state = { day: '', used: 0, blockedUntil: 0, warned: '' };
class LimitError extends Error {}

function park(ms, why) {
  state.blockedUntil = Date.now() + ms;
  if (state.warned !== why) { console.warn(`[dr7] ${why} — skipping Dr7.ai for ${Math.round(ms / 60000)} min`); state.warned = why; }
  throw new LimitError(`Dr7.ai ${why}`);
}

/** One chat completion. messages: [{ role, content }] → text. */
async function complete(messages) {
  if (!configured()) throw new LimitError('Dr7.ai is not configured');
  if (Date.now() < state.blockedUntil) throw new LimitError('Dr7.ai is paused');
  const day = new Date().toISOString().slice(0, 10);
  if (state.day !== day) Object.assign(state, { day, used: 0 });
  if (state.used >= DAILY_LIMIT) throw new LimitError('Dr7.ai daily limit reached');
  state.used += 1;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  let r;
  try {
    r = await fetch(`${BASE()}/chat/completions`, {
      method: 'POST',
      signal: ac.signal,
      headers: { authorization: `Bearer ${process.env.DR7_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL(), messages, max_tokens: 700, temperature: 0.3 }),
    });
  } finally { clearTimeout(timer); }
  const j = await r.json().catch(() => null);
  if (r.status === 402) park(3600000, 'out of credit'); // re-check hourly: credit may have been added
  if (r.status === 429) park((Number(r.headers.get('retry-after')) || 60) * 1000, 'rate-limited');
  if (r.status === 401 || r.status === 403) park(6 * 3600000, `rejected the key (${r.status})`);
  const text = j?.choices?.[0]?.message?.content;
  if (!r.ok || !text) throw new Error(`Dr7.ai ${r.status}`);
  state.warned = '';
  return String(text).trim();
}

module.exports = { configured, complete, LimitError, _state: state };
