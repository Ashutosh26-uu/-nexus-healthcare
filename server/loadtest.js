#!/usr/bin/env node
// Dependency-free HTTP load test for the Sehatra API.
//
//   node loadtest.js [--url http://localhost:4100/api] [--concurrency 200] [--duration 20] [--warmup 2]
//                    [--writes 0.1] [--timeout 30000]
//   (env equivalents: LT_URL, LT_CONCURRENCY, LT_DURATION, LT_WARMUP, LT_WRITES, LT_TIMEOUT)
//
// Logs in ONCE per role (the login route is rate-limited) and reuses the tokens, then runs
// `concurrency` independent request loops over keep-alive sockets for `duration` seconds.
// Reports req/s, latency percentiles, error count and a status-code breakdown.
'use strict';
const http = require('http');
const https = require('https');

function arg(name, env, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i > -1 && process.argv[i + 1] !== undefined) return process.argv[i + 1];
  return process.env[env] ?? def;
}
const BASE = new URL(String(arg('url', 'LT_URL', 'http://localhost:4100/api')).replace(/\/$/, '') + '/');
const CONCURRENCY = Math.max(1, Number(arg('concurrency', 'LT_CONCURRENCY', 200)));
const DURATION = Math.max(1, Number(arg('duration', 'LT_DURATION', 20)));
const WARMUP = Math.max(0, Number(arg('warmup', 'LT_WARMUP', 2)));
const WRITE_SHARE = Math.min(1, Math.max(0, Number(arg('writes', 'LT_WRITES', 0.1))));
const TIMEOUT = Number(arg('timeout', 'LT_TIMEOUT', 30000));

const lib = BASE.protocol === 'https:' ? https : http;
const agent = new lib.Agent({ keepAlive: true, maxSockets: CONCURRENCY, maxFreeSockets: CONCURRENCY });

function request(method, path, { token, body } = {}) {
  return new Promise((resolve) => {
    const url = new URL(path.replace(/^\//, ''), BASE);
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const headers = { accept: 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    if (data) { headers['content-type'] = 'application/json'; headers['content-length'] = data.length; }
    const t0 = process.hrtime.bigint();
    const req = lib.request(url, { method, headers, agent, timeout: TIMEOUT }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, ms: Number(process.hrtime.bigint() - t0) / 1e6, body: Buffer.concat(chunks) }));
      res.on('error', (e) => resolve({ status: 0, error: e.code || e.message, ms: Number(process.hrtime.bigint() - t0) / 1e6 }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => resolve({ status: 0, error: e.code || e.message, ms: Number(process.hrtime.bigint() - t0) / 1e6 }));
    if (data) req.write(data);
    req.end();
  });
}

async function login(identifier) {
  const r = await request('POST', 'auth/login', { body: { identifier, password: 'Demo@123' } });
  if (r.status !== 200) throw new Error(`login ${identifier} failed: HTTP ${r.status} ${r.error || r.body?.toString().slice(0, 200)}`);
  return JSON.parse(r.body.toString()).token;
}

const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0);

async function main() {
  console.log(`[loadtest] ${BASE.href}  concurrency=${CONCURRENCY}  duration=${DURATION}s  warmup=${WARMUP}s  writes=${WRITE_SHARE}`);
  const tokens = { patient: await login('patient@omnicare.in'), doctor: await login('doctor@omnicare.in') };

  const reads = [
    { w: 25, role: 'patient', method: 'GET', path: 'patient/home' },
    { w: 20, role: 'patient', method: 'GET', path: 'doctors/recommend?symptoms=fever' },
    { w: 15, role: 'patient', method: 'GET', path: 'notifications' },
    { w: 10, role: 'doctor', method: 'GET', path: 'notifications' },
    { w: 20, role: 'doctor', method: 'GET', path: 'doctor/home' },
  ];
  const writes = [
    { w: 1, role: 'patient', method: 'POST', path: 'notifications/read', body: {} },
    { w: 1, role: 'doctor', method: 'POST', path: 'notifications/read', body: {} },
  ];
  const pick = (list) => {
    const total = list.reduce((s, x) => s + x.w, 0);
    let r = Math.random() * total;
    for (const x of list) if ((r -= x.w) < 0) return x;
    return list[list.length - 1];
  };

  const lat = [];
  const byStatus = {};
  const byRoute = {};
  let errors = 0;
  let measuring = WARMUP === 0;
  let stop = false;
  const startAt = Date.now();
  let measureStart = measuring ? process.hrtime.bigint() : 0n;
  if (!measuring) setTimeout(() => { measuring = true; measureStart = process.hrtime.bigint(); }, WARMUP * 1000);
  setTimeout(() => { stop = true; }, (WARMUP + DURATION) * 1000);
  const ticker = setInterval(() => process.stdout.write(`\r[loadtest] ${Math.round((Date.now() - startAt) / 1000)}s  done=${lat.length}  errors=${errors}   `), 1000);

  async function worker() {
    while (!stop) {
      const op = Math.random() < WRITE_SHARE ? pick(writes) : pick(reads);
      const r = await request(op.method, op.path, { token: tokens[op.role], body: op.body });
      if (!measuring || stop) continue;
      lat.push(r.ms);
      const key = r.status ? String(r.status) : `ERR:${r.error}`;
      byStatus[key] = (byStatus[key] || 0) + 1;
      const rk = `${op.method} ${op.path.split('?')[0]} (${op.role})`;
      const s = (byRoute[rk] ||= { n: 0, ms: 0, err: 0 });
      s.n += 1; s.ms += r.ms;
      if (!r.status || r.status >= 400) { errors += 1; s.err += 1; }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const elapsed = Number(process.hrtime.bigint() - measureStart) / 1e9;
  clearInterval(ticker);
  process.stdout.write('\n');
  agent.destroy();

  const sorted = Float64Array.from(lat).sort();
  const result = {
    url: BASE.href, concurrency: CONCURRENCY, seconds: +elapsed.toFixed(2), requests: lat.length,
    rps: +(lat.length / elapsed).toFixed(1),
    latencyMs: { p50: +pct(sorted, 50).toFixed(1), p95: +pct(sorted, 95).toFixed(1), p99: +pct(sorted, 99).toFixed(1), max: +(sorted[sorted.length - 1] || 0).toFixed(1), mean: +(lat.reduce((s, x) => s + x, 0) / (lat.length || 1)).toFixed(1) },
    errors, statusCodes: byStatus,
  };
  console.log(`requests ${result.requests} in ${result.seconds}s  →  ${result.rps} req/s`);
  console.log(`latency ms  p50 ${result.latencyMs.p50}  p95 ${result.latencyMs.p95}  p99 ${result.latencyMs.p99}  max ${result.latencyMs.max}  mean ${result.latencyMs.mean}`);
  console.log(`errors ${errors}  status ${JSON.stringify(byStatus)}`);
  for (const [k, s] of Object.entries(byRoute)) console.log(`  ${k.padEnd(48)} n=${String(s.n).padStart(7)}  avg=${(s.ms / s.n).toFixed(1)}ms  err=${s.err}`);
  if (process.env.LT_JSON) console.log(JSON.stringify(result));
}

main().catch((e) => { console.error('[loadtest]', e.message); process.exit(1); });
