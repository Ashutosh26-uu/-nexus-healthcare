// Error monitoring and request health, built in — nothing leaves the server, no third-party tracker.
//   • every API request: status + duration (memory, last hour) → requests, 5xx rate, p95 latency
//   • server faults (500s, stray promise rejections, crashes) and browser errors (POST /api/client-errors)
//     grouped by fingerprint in d.errorEvents (capped), with counts and first/last seen
//   • admins get an in-app notice and an email when a NEW kind of error appears (at most every 30 min)
//   Admin  GET  /api/admin/errors            groups + health numbers
//          POST /api/admin/errors/:id/resolve
//   Public POST /api/client-errors           { message, stack?, path? } — scrubbed, rate-limited, ≤ 4 KB
// Never stored: request bodies, query strings, user ids, record ids (path segments that look like ids → :id),
// emails, phone / Aadhaar-like numbers, tokens.
const crypto = require('crypto');

const MAX_GROUPS = 300;
const WINDOW_MS = 3600000;
const ALERT_EVERY_MS = 30 * 60000;
const started = Date.now();
const samples = []; // { t, ms, status }

// Strip anything personal before it is stored.
function scrub(s, max = 300) {
  return String(s ?? '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
    .replace(/\b(Bearer\s+)?[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g, '<token>') // JWT
    .replace(/\bsehatra_[A-Za-z0-9_-]+/g, '<key>')
    .replace(/\+?\d[\d\s-]{8,}\d/g, '<number>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
// /api/lab-orders/lab_m3k2j9/report → /api/lab-orders/:id/report
const routeOf = (path) => String(path || '').split('?')[0].split('/').map((seg) => (/\d/.test(seg) && seg.length > 5) || seg.length > 24 ? ':id' : seg).join('/').slice(0, 120);

function track(req, res, next) {
  if (!req.path.startsWith('/api/') || req.path === '/api/events' || req.path === '/api/public/stats/stream') return next();
  const t0 = process.hrtime.bigint();
  res.on('finish', () => {
    samples.push({ t: Date.now(), ms: Number(process.hrtime.bigint() - t0) / 1e6, status: res.statusCode });
    if (samples.length > 20000) samples.splice(0, samples.length - 20000);
  });
  next();
}

function health() {
  const cut = Date.now() - WINDOW_MS;
  while (samples.length && samples[0].t < cut) samples.shift();
  const n = samples.length;
  const errors = samples.filter((s) => s.status >= 500).length;
  const sorted = samples.map((s) => s.ms).sort((a, b) => a - b);
  return {
    requestsLastHour: n,
    serverErrorsLastHour: errors,
    apiErrorRate: n ? Math.round((errors / n) * 10000) / 100 : null, // %
    p95LatencyMs: n ? Math.round(sorted.at(Math.min(n - 1, Math.floor(n * 0.95)))) : null,
    processUptimeHours: Math.round((Date.now() - started) / 360000) / 10,
  };
}

let deps = null;
let lastAlert = 0;
const pending = []; // errors seen before attach() (start-up) are kept until the store is ready

function capture({ source, message, stack, route, method, status }) {
  const ev = { source, message: scrub(message), stack: scrub(stack, 1200), route: routeOf(route), method: method || null, status: status || null };
  if (!deps) { if (pending.length < 50) pending.push(ev); return; }
  try { record(ev); } catch (e) { console.error('[monitor] could not record an error:', e.message); }
}

function record(ev) {
  const { db, store, notify, otp, nowIso } = deps;
  const d = db();
  if (!d.errorEvents) d.errorEvents = [];
  // Same source + message + first stack frame + route = the same problem.
  const frame = (ev.stack.match(/at [^(]*\(?([^)]*)\)?/) || [])[1] || '';
  const fp = crypto.createHash('sha1').update(`${ev.source}|${ev.message.replace(/\d+/g, 'n')}|${frame.replace(/:\d+:\d+/, '')}|${ev.route}`).digest('hex').slice(0, 16);
  let g = d.errorEvents.find((x) => x.fingerprint === fp);
  const isNew = !g || g.resolvedAt;
  if (!g) {
    g = { id: `err_${fp}`, fingerprint: fp, source: ev.source, message: ev.message, stack: ev.stack, route: ev.route, method: ev.method, status: ev.status, count: 0, firstAt: nowIso() };
    d.errorEvents.unshift(g);
    if (d.errorEvents.length > MAX_GROUPS) d.errorEvents.length = MAX_GROUPS;
  }
  g.count += 1; g.lastAt = nowIso(); g.resolvedAt = null;
  store.save();
  if (isNew) { deps.touch(d.users.filter((u) => u.role === 'super_admin').map((u) => u.id)); deps.broadcast('admin'); } // live on the admin Monitoring page
  if (isNew && Date.now() - lastAlert > ALERT_EVERY_MS) {
    lastAlert = Date.now();
    const admins = d.users.filter((u) => u.role === 'super_admin' && u.status !== 'suspended');
    const title = `New ${ev.source === 'browser' ? 'app' : 'server'} error`;
    const body = `${ev.message}${ev.route ? ` · ${ev.method || ''} ${ev.route}` : ''}. Details under Admin → Monitoring.`;
    admins.forEach((u) => notify(u.id, title, body, 'alert'));
    admins.filter((u) => u.email).forEach((u) => otp.sendMail({ to: u.email, subject: `Sehatra: ${title}`, text: `${body}\n\nFurther new errors in the next 30 minutes are recorded without another email.` }).catch(() => {}));
  }
}

function attach(app, x) {
  deps = x;
  const { auth, role, db, store, security, broadcast, nowIso } = x;
  pending.splice(0).forEach((ev) => { try { record(ev); } catch { /* ignore */ } });

  const clientLimiter = security.rateLimit({ windowMs: 10 * 60000, max: 20, message: 'Too many reports.' });
  app.post('/api/client-errors', clientLimiter, (req, res) => {
    const b = req.body || {};
    if (JSON.stringify(b).length > 4096) return res.status(413).json({ error: 'Too big.' });
    const message = String(b.message || '').trim();
    if (message.length < 3) return res.status(400).json({ error: 'Missing message.' });
    // Noise from browser extensions and dropped connections isn't our bug.
    if (/ResizeObserver loop|Script error\.?$|chrome-extension:|moz-extension:|Load failed|NetworkError|Failed to fetch/i.test(`${message} ${b.stack || ''}`)) return res.json({ ok: true, ignored: true });
    capture({ source: 'browser', message, stack: String(b.stack || '').split('\n').slice(0, 6).join('\n'), route: b.path });
    res.json({ ok: true });
  });

  app.get('/api/admin/errors', auth, role('super_admin'), (_req, res) => {
    const list = (db().errorEvents || []).slice(0, 100);
    res.json({ health: health(), open: list.filter((g) => !g.resolvedAt), resolved: list.filter((g) => g.resolvedAt).slice(0, 20) });
  });
  app.post('/api/admin/errors/:id/resolve', auth, role('super_admin'), (req, res) => {
    const g = (db().errorEvents || []).find((x) => x.id === req.params.id);
    if (!g) return res.status(404).json({ error: 'Not found.' });
    g.resolvedAt = nowIso(); g.resolvedBy = req.user.name;
    store.save();
    broadcast('admin');
    res.json(g);
  });
}

module.exports = { track, capture, health, attach, scrub, routeOf };
