// Helper for building bundled translation files (server/i18n/seed/<lang>.json).
//
//   node seed-tool.mjs split <outDir> [chunkSize]   → writes chunk-000.json … (arrays of English strings)
//   node seed-tool.mjs merge <lang> <partsDir>       → merges part files ({ "English": "translation" })
//                                                      into seed/<lang>.json, validating placeholders
//   node seed-tool.mjs status                        → coverage of every seed file
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const catalogFile = path.join(here, '..', '..', '..', 'client', 'src', 'i18n', 'catalog.json');
const seedDir = path.join(here, '..', 'seed');
const catalog = JSON.parse(fs.readFileSync(catalogFile, 'utf8'));
const all = [...catalog.strings, ...catalog.patterns];
const ph = (s) => (s.match(/\{\d+\}/g) || []).sort().join();

const [cmd, a, b] = process.argv.slice(2);

if (cmd === 'split') {
  const size = Number(b || 250);
  fs.mkdirSync(a, { recursive: true });
  for (let i = 0; i < all.length; i += size) {
    fs.writeFileSync(path.join(a, `chunk-${String(i / size).padStart(3, '0')}.json`), JSON.stringify(all.slice(i, i + size), null, 1));
  }
  console.log(`${all.length} strings → ${Math.ceil(all.length / size)} chunks in ${a}`);
} else if (cmd === 'merge') {
  const lang = a;
  const out = path.join(seedDir, `${lang}.json`);
  const merged = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : {};
  const known = new Set(all);
  let added = 0; let bad = 0; let unknown = 0;
  for (const f of fs.readdirSync(b).filter((x) => x.endsWith('.json')).sort()) {
    let data;
    try { data = JSON.parse(fs.readFileSync(path.join(b, f), 'utf8')); } catch (e) { console.error(`✗ ${f}: invalid JSON — ${e.message}`); bad += 1; continue; }
    for (const [src, tgt] of Object.entries(data)) {
      if (!known.has(src)) { unknown += 1; continue; }
      if (typeof tgt !== 'string' || !tgt.trim() || ph(src) !== ph(tgt)) { bad += 1; continue; }
      if (merged[src] !== tgt) added += 1;
      merged[src] = tgt;
    }
  }
  fs.mkdirSync(seedDir, { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(merged, null, 1)}\n`);
  const missing = all.filter((s) => !merged[s]);
  console.log(`${lang}: +${added} · total ${Object.keys(merged).length}/${all.length} (${Math.round((Object.keys(merged).length / all.length) * 100)}%) · rejected ${bad} · not in catalog ${unknown}`);
  if (missing.length) fs.writeFileSync(path.join(b, '_missing.json'), JSON.stringify(missing, null, 1));
  if (missing.length) console.log(`missing strings listed in ${path.join(b, '_missing.json')}`);
} else if (cmd === 'status') {
  for (const f of fs.existsSync(seedDir) ? fs.readdirSync(seedDir).filter((x) => x.endsWith('.json')) : []) {
    const d = JSON.parse(fs.readFileSync(path.join(seedDir, f), 'utf8'));
    const have = all.filter((s) => d[s]).length;
    console.log(`${f.replace('.json', '').padEnd(6)} ${have}/${all.length} (${Math.round((have / all.length) * 100)}%)`);
  }
} else {
  console.log('usage: split <outDir> [size] | merge <lang> <partsDir> | status');
}
