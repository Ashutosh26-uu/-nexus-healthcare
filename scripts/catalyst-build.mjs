// Builds a self-contained folder for Zoho Catalyst AppSail (Catalyst-managed Node.js runtime):
//   catalyst-build/
//     package.json        → "start": "node server/index.js"
//     app-config.json     → AppSail service config (startup command, stack, memory)
//     server/             → API code + production node_modules (no local DB, no .env)
//     client/dist/        → the built PWA, served by the API in production
// Usage:  npm run catalyst:build     then, inside catalyst-build/:  catalyst deploy
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'catalyst-build');
const run = (cmd, cwd = root) => { console.log(`> ${cmd}`); execSync(cmd, { cwd, stdio: 'inherit' }); };

// Keep an existing app-config.json (the Catalyst CLI may have filled in buildPath / env for this machine).
const keptConfig = existsSync(join(out, 'app-config.json')) ? readFileSync(join(out, 'app-config.json'), 'utf8') : null;
const keptCatalystJson = existsSync(join(out, 'catalyst.json')) ? readFileSync(join(out, 'catalyst.json'), 'utf8') : null;
const keptRc = existsSync(join(out, '.catalystrc')) ? readFileSync(join(out, '.catalystrc'), 'utf8') : null;
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

run('npm run build --prefix client');

// Server code only — never the local SQLite database, uploads or secrets.
const skip = new Set(['node_modules', 'data', '.env', 'loadtest.js']);
cpSync(join(root, 'server'), join(out, 'server'), { recursive: true, filter: (src) => !skip.has(src.split(/[\\/]/).pop()) || src === join(root, 'server') });
cpSync(join(root, 'client', 'dist'), join(out, 'client', 'dist'), { recursive: true });
// The API reads the language list and UI string catalog from the client source tree.
for (const f of ['languages.json', 'catalog.json']) cpSync(join(root, 'client', 'src', 'i18n', f), join(out, 'client', 'src', 'i18n', f));
run('npm install --omit=dev --no-audit --no-fund', join(out, 'server'));

const serverPkg = JSON.parse(readFileSync(join(root, 'server', 'package.json'), 'utf8'));
writeFileSync(join(out, 'package.json'), JSON.stringify({
  name: 'nexus-healthcare-appsail', version: serverPkg.version, private: true,
  scripts: { start: 'node server/index.js' }, engines: { node: '>=22' },
}, null, 2));

writeFileSync(join(out, 'app-config.json'), keptConfig || JSON.stringify({
  command: 'node server/index.js',
  buildPath: out,
  stack: 'node22',
  env_variables: { NODE_ENV: 'production', DATA_MODE: 'live' },
  memory: 1024,
}, null, 2));
if (keptCatalystJson) writeFileSync(join(out, 'catalyst.json'), keptCatalystJson);
if (keptRc) writeFileSync(join(out, '.catalystrc'), keptRc);

console.log(`\n✓ AppSail bundle ready in ${out}`);
console.log('  Secrets (JWT_SECRET, DATABASE_URL, ADMIN_EMAIL, SMTP_*, RAZORPAY_*) go in the Catalyst console → AppSail → Environment Variables, never in this folder.');
