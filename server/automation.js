// Automations (n8n or any webhook tool).
//
// Nexus → n8n: when something happens (booking paid, prescription issued, lab report ready…) we POST a
// small JSON event to N8N_WEBHOOK_URL. Delivery never blocks the request that caused it: events go on an
// in-memory queue, are sent in the background and retried with back-off if n8n is down.
//
// Privacy: events carry IDs, amounts, times and facility/doctor names — never symptoms, diagnoses,
// medicines or results. Patient contact details (first name, mobile, email) are only added when
// N8N_SHARE_CONTACT=true, for reminder workflows. Every request is signed so n8n can reject fakes:
//   X-Nexus-Token      the shared secret (for n8n's built-in "Header Auth" on the Webhook node)
//   X-Nexus-Timestamp  unix seconds
//   X-Nexus-Signature  sha256=HMAC_SHA256(secret, `${timestamp}.${rawBody}`)
//
// n8n → Nexus: workflows call /api/automation/* with `Authorization: Bearer N8N_API_KEY`. That key only
// reaches those few routes (summaries, reminders, low stock, in-app notices) — never a user's account.
const crypto = require('crypto');

const env = (k) => String(process.env[k] || '').trim();
const RETRY_DELAYS = [10e3, 30e3, 120e3, 600e3, 1800e3]; // then give up
const MAX_QUEUE = 2000;
const CONCURRENCY = 4;
const TIMEOUT_MS = 8000;

// Every event Nexus can send, with a line for the admin screen and the docs.
const EVENTS = {
  'patient.registered': 'A new patient created their Health Passport',
  'booking.confirmed': 'A doctor booking was paid and confirmed',
  'consult.completed': 'A doctor finished a consult',
  'prescription.issued': 'A prescription was issued',
  'followup.scheduled': 'A doctor booked a follow-up visit',
  'lab.booked': 'A patient paid the 20% advance for a lab test',
  'lab.sample_collected': 'The lab collected the sample (report due time is known)',
  'lab.report_ready': 'A lab report was signed by the pathologist and released to the patient',
  'medicine_order.placed': 'A medicine order reached the chemist(s)',
  'medicine_order.updated': 'A chemist accepted, declined, packed or handed over an order',
  'medicine_order.delivered': 'A rider delivered a medicine order',
  'care.transferred': 'A patient moved their care to another doctor',
  'onboarding.submitted': 'A doctor, chemist or facility is waiting for verification',
  'payment.refund_due': 'Money was captured for something no longer payable — refund it',
  'test.ping': 'Test event sent from the admin screen',
};

let dataMode = 'demo';
const queue = [];
let inFlight = 0;
let timer = null;
const stats = { queued: 0, sent: 0, failed: 0, retried: 0, dropped: 0, lastSuccessAt: null, lastError: null, recent: [] };

function config() {
  const url = env('N8N_WEBHOOK_URL');
  const secret = env('N8N_WEBHOOK_SECRET');
  const list = env('N8N_EVENTS');
  return {
    url, secret,
    events: !list || list === '*' ? null : new Set(list.split(',').map((s) => s.trim()).filter(Boolean)),
    shareContact: env('N8N_SHARE_CONTACT') === 'true',
    apiKey: env('N8N_API_KEY'),
  };
}

// Refuse a half-set-up or unsafe configuration instead of silently leaking events.
function problems() {
  const c = config();
  const out = [];
  if (c.url) {
    let u = null;
    try { u = new URL(c.url); } catch { out.push('N8N_WEBHOOK_URL is not a valid URL.'); }
    if (u && u.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) && process.env.NODE_ENV === 'production') out.push('N8N_WEBHOOK_URL must use https in production.');
    if (c.secret.length < 24) out.push('N8N_WEBHOOK_SECRET must be at least 24 characters.');
  }
  if (c.apiKey && c.apiKey.length < 32) out.push('N8N_API_KEY must be at least 32 characters.');
  return out;
}

const webhookOn = () => { const c = config(); return Boolean(c.url && c.secret.length >= 24 && !problems().length); };
const apiOn = () => config().apiKey.length >= 32;

function init(opts = {}) {
  dataMode = opts.dataMode || dataMode;
  const p = problems();
  if (p.length) console.warn(`[automation] off: ${p.join(' ')}`);
  else if (webhookOn()) console.log(`[automation] sending events to ${new URL(config().url).host}${config().shareContact ? ' (with patient contact details)' : ''}`);
}

// Queue an event. `contact` is only attached when contact sharing is switched on.
function emit(event, data = {}, { contact } = {}) {
  if (!webhookOn()) return null;
  const c = config();
  if (event !== 'test.ping' && c.events && !c.events.has(event)) return null;
  const payload = {
    id: `evt_${crypto.randomBytes(9).toString('hex')}`,
    event,
    occurredAt: new Date().toISOString(),
    source: 'nexus-healthcare',
    mode: dataMode, // 'demo' events come from sample data — filter them out in n8n if you like
    data: { ...data, ...(c.shareContact && contact ? { contact } : {}) },
  };
  if (queue.length >= MAX_QUEUE) { queue.shift(); stats.dropped += 1; }
  queue.push({ payload, attempts: 0, notBefore: 0 });
  stats.queued += 1;
  schedule(0);
  return payload.id;
}

let timerDue = Infinity;
function schedule(ms) {
  const due = Date.now() + ms;
  if (timer && due >= timerDue) return; // an earlier wake-up is already set
  // A new event must not wait behind a long retry back-off (up to 30 min) — move the wake-up forward.
  clearTimeout(timer);
  timerDue = due;
  timer = setTimeout(() => { timer = null; timerDue = Infinity; pump(); }, ms);
  timer.unref?.();
}

function pump() {
  const now = Date.now();
  while (inFlight < CONCURRENCY) {
    const i = queue.findIndex((j) => j.notBefore <= now);
    if (i < 0) break;
    const [job] = queue.splice(i, 1);
    inFlight += 1;
    deliver(job.payload).then((r) => settle(job, r)).finally(() => { inFlight -= 1; pump(); });
  }
  if (queue.length) {
    const next = Math.min(...queue.map((j) => j.notBefore));
    schedule(Math.max(250, next - Date.now()));
  }
}

function sign(secret, ts, body) {
  return `sha256=${crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')}`;
}

async function deliver(payload) {
  const { url, secret } = config();
  const body = JSON.stringify(payload);
  const ts = Math.floor(Date.now() / 1000);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'NexusHealthcare-Webhooks/1.0',
        'X-Nexus-Event': payload.event,
        'X-Nexus-Delivery': payload.id,
        'X-Nexus-Timestamp': String(ts),
        'X-Nexus-Signature': sign(secret, ts, body),
        'X-Nexus-Token': secret,
      },
      body,
      redirect: 'error', // never follow a redirect with the secret attached
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { ok: r.ok, code: r.status, retry: r.status === 429 || r.status >= 500, error: r.ok ? null : `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, code: 0, retry: true, error: e.name === 'TimeoutError' ? 'Timed out' : (e.cause?.code || e.message || 'Network error') };
  }
}

function record(payload, status, r, attempts) {
  stats.recent.unshift({ id: payload.id, event: payload.event, status, code: r.code, error: r.error || null, attempts, at: new Date().toISOString() });
  stats.recent.length = Math.min(stats.recent.length, 30);
}

function settle(job, r) {
  job.attempts += 1;
  if (r.ok) {
    stats.sent += 1; stats.lastSuccessAt = new Date().toISOString();
    record(job.payload, 'sent', r, job.attempts);
    return;
  }
  stats.lastError = { at: new Date().toISOString(), event: job.payload.event, message: r.error };
  if (r.retry && job.attempts <= RETRY_DELAYS.length) {
    stats.retried += 1;
    job.notBefore = Date.now() + RETRY_DELAYS[job.attempts - 1];
    if (queue.length < MAX_QUEUE) queue.push(job); else stats.dropped += 1;
    record(job.payload, 'retrying', r, job.attempts);
  } else {
    stats.failed += 1;
    record(job.payload, 'failed', r, job.attempts);
    console.warn(`[automation] gave up on ${job.payload.event} ${job.payload.id}: ${r.error}`);
  }
}

// Admin "Send test event": delivered right away so the admin sees the result.
async function sendTest(by) {
  if (!webhookOn()) return { ok: false, error: problems()[0] || 'Set N8N_WEBHOOK_URL and N8N_WEBHOOK_SECRET first.' };
  const payload = { id: `evt_${crypto.randomBytes(9).toString('hex')}`, event: 'test.ping', occurredAt: new Date().toISOString(), source: 'nexus-healthcare', mode: dataMode, data: { message: 'Hello from Nexus Healthcare 👋', by } };
  const r = await deliver(payload);
  if (r.ok) { stats.sent += 1; stats.lastSuccessAt = new Date().toISOString(); } else stats.lastError = { at: new Date().toISOString(), event: 'test.ping', message: r.error };
  record(payload, r.ok ? 'sent' : 'failed', r, 1);
  return { ok: r.ok, code: r.code, error: r.error };
}

function status() {
  const c = config();
  let host = null;
  try { host = c.url ? new URL(c.url).host : null; } catch { /* reported in problems */ }
  return {
    webhook: { on: webhookOn(), host, events: c.events ? [...c.events] : 'all', shareContact: c.shareContact },
    api: { on: apiOn() },
    problems: problems(),
    queue: queue.length,
    stats: { ...stats, recent: stats.recent.slice(0, 15) },
    catalog: Object.entries(EVENTS).map(([name, about]) => ({ name, about })),
  };
}

// Bearer-key guard for /api/automation/*. Hidden (404) when no key is configured.
function apiAuth(req, res, next) {
  const key = config().apiKey;
  if (key.length < 32) return res.status(404).json({ error: 'Not found.' });
  const got = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = crypto.createHash('sha256').update(got).digest();
  const b = crypto.createHash('sha256').update(key).digest();
  if (!got || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'Invalid automation key.' });
  req.user = { id: 'automation', name: 'n8n automation', role: 'automation' };
  next();
}

module.exports = { init, emit, sendTest, status, apiAuth, webhookOn, apiOn, EVENTS, sign, shareContact: () => config().shareContact };
