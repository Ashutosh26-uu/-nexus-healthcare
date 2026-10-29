// Shared bits for the API tests (run through run.mjs, which sets API_BASE and TOKEN_CACHE).
import { readFileSync, writeFileSync } from 'node:fs';

export const BASE = `${process.env.API_BASE || 'http://localhost:4500'}/api`;
let fail = 0;
export const check = (ok, label, extra = '') => { if (!ok) fail += 1; console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ` — ${extra}` : ''}`); };
export const done = () => { console.log(fail ? `${fail} failed` : 'all passed'); process.exit(fail ? 1 : 0); };

// call(method, path, token?, body?) → { s: status, j: json, h: headers }
export async function call(m, p, t, b) {
  const r = await fetch(BASE + p, { method: m, headers: { 'content-type': 'application/json', ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: b ? JSON.stringify(b) : undefined });
  return { s: r.status, j: await r.json().catch(() => ({})), h: r.headers };
}

// Demo accounts (password Demo@123). Tokens are shared between test files so sign-in limits aren't hit.
const cacheFile = process.env.TOKEN_CACHE;
const cache = (() => { try { return cacheFile ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {}; } catch { return {}; } })();
export async function login(email) {
  if (cache[email]) return cache[email];
  const r = await call('POST', '/auth/login', null, { identifier: email, password: 'Demo@123' });
  if (!r.j.token) throw new Error(`login ${email}: ${r.s} ${r.j.error || ''}`);
  cache[email] = r.j.token;
  if (cacheFile) writeFileSync(cacheFile, JSON.stringify(cache));
  return r.j.token;
}
export const demo = (who) => login(`${who}@omnicare.in`);
