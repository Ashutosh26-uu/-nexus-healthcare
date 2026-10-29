// npm test — starts a throw-away API server (demo data, temp SQLite file, no email / AI / webhooks to the outside)
// and runs every *.test.mjs here against it, one after another. Exit code 1 if any check fails.
//   npm test                 all files
//   npm test -- integrations only files whose name contains "integrations"
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.TEST_PORT) || 4590;
const base = `http://localhost:${PORT}`;
const tmp = mkdtempSync(join(tmpdir(), 'sehatra-test-'));
const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const files = readdirSync(here).filter((f) => f.endsWith('.test.mjs') && (!only.length || only.some((o) => f.includes(o)))).sort();

const blank = ['DATABASE_URL', 'SMTP_HOST', 'ANTHROPIC_API_KEY', 'DXGPT_API_KEY', 'DXGPT_API_KEYS', 'CORTI_CLIENT_ID', 'CORTI_API_KEY', 'AUTOMATION_WEBHOOK_URL', 'RAZORPAY_KEY_ID', 'TWILIO_FROM', 'MFA_ENFORCE'];
const env = {
  ...process.env, ...Object.fromEntries(blank.map((k) => [k, ''])),
  NODE_ENV: 'test', DATA_MODE: 'demo', PORT: String(PORT), DB_FILE: join(tmp, 'test.db'), APP_URL: base,
  DATA_ENCRYPTION_KEY: randomBytes(32).toString('hex'), JWT_SECRET: randomBytes(32).toString('hex'),
};
const server = spawn(process.execPath, ['index.js'], { cwd: join(here, '..'), env, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
server.stdout.on('data', (c) => { log += c; });
server.stderr.on('data', (c) => { log += c; });

const stop = () => { try { server.kill(); } catch { /* gone */ } setTimeout(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* Windows lock */ } }, 500); };
let up = false;
for (let i = 0; i < 60 && !up; i += 1) {
  await new Promise((ok) => setTimeout(ok, 500));
  up = await fetch(`${base}/api/health`).then((r) => r.ok, () => false);
}
if (!up) { console.error('Test server did not start:\n', log.slice(-2000)); stop(); process.exit(1); }

let failed = 0;
for (const f of files) {
  console.log(`\n── ${f}`);
  const code = await new Promise((ok) => {
    const c = spawn(process.execPath, [join(here, f)], { env: { ...process.env, API_BASE: base, TOKEN_CACHE: join(tmp, 'tokens.json') }, stdio: 'inherit' });
    c.on('exit', ok);
  });
  if (code !== 0) failed += 1;
}
if (/\b(TypeError|ReferenceError|SyntaxError)\b/.test(log)) { console.error('\nServer logged a code error:\n', log.split('\n').filter((l) => /Error/.test(l)).slice(0, 10).join('\n')); failed += 1; }
stop();
console.log(`\n${failed ? `${failed} file(s) failed` : `all ${files.length} files passed`}`);
process.exit(failed ? 1 : 0);
