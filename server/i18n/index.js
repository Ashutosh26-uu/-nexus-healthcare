// Translation engine.
//
// Privacy by design: only strings from the app's own UI catalog (extracted from the
// client source at build time) and the server's fixed help texts are ever sent to a
// translation provider — never patient names, notes or other personal data.
//
// Each string is translated once per language and stored in the database, so the
// whole app works in that language from then on (and offline). Bundled seed files in
// server/i18n/seed/<lang>.json cover the most-used languages out of the box.
//
// Providers, tried in order (whichever are configured):
//   Claude (ANTHROPIC_API_KEY) · Google Cloud Translation (GOOGLE_TRANSLATE_API_KEY) ·
//   LibreTranslate (LIBRETRANSLATE_URL, self-hostable)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('../db');

const LANGUAGES = require('../../client/src/i18n/languages.json');
const CATALOG_FILE = process.env.I18N_CATALOG || path.join(__dirname, '..', '..', 'client', 'src', 'i18n', 'catalog.json');
const SEED_DIR = path.join(__dirname, 'seed');
const SEED_MARK = '__seed'; // translations rows (lang='__seed', source=<lang>, text=<seed file hash>); never a real language code

const SERVER_STRINGS = new Set(); // fixed server-side texts (chat help answers etc.)
let catalog = new Set();
let broadcast = () => {};
const memory = new Map(); // lang -> Map(source -> text)
const jobs = new Map(); // lang -> Promise

const langInfo = (code) => LANGUAGES.find((l) => l.code === code);

function loadCatalog() {
  try {
    const c = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
    catalog = new Set([...(c.strings || []), ...(c.patterns || [])]);
  } catch {
    catalog = new Set();
    console.warn('[i18n] No UI catalog found yet — run "npm run i18n:extract --prefix client".');
  }
  for (const s of SERVER_STRINGS) catalog.add(s);
  return catalog.size;
}

function registerServerStrings(list) {
  for (const s of list) if (s && s.trim()) { SERVER_STRINGS.add(s); catalog.add(s); }
}

async function init(opts = {}) {
  if (opts.broadcast) broadcast = opts.broadcast;
  loadCatalog();
  // Seed bundled translations without overwriting human edits. Diffing a seed file means downloading that
  // language's whole dictionary (~3 MB for the bundled six) — on every boot that delayed start-up by minutes on
  // a slow link. So each imported file's hash is remembered (pseudo-language SEED_MARK in the same table) and an
  // unchanged, fully imported file is skipped; dictionaries then load lazily on first use.
  if (fs.existsSync(SEED_DIR)) {
    const a = store.adapter();
    const [marks, counts] = await Promise.all([a.trGetLang(SEED_MARK), a.trStats()]);
    const seen = new Map(marks.map((r) => [r.source, r.text]));
    const have = new Map(counts.map((r) => [r.lang, Number(r.n)]));
    await Promise.all(fs.readdirSync(SEED_DIR).filter((x) => x.endsWith('.json')).map(async (f) => {
      const lang = f.replace(/\.json$/, '');
      try {
        const text = fs.readFileSync(path.join(SEED_DIR, f), 'utf8');
        const sum = crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
        const data = JSON.parse(text);
        const filled = Object.values(data).filter(Boolean).length;
        if (seen.get(lang) === sum && (have.get(lang) || 0) >= filled) return;
        const existing = await getDict(lang);
        const pairs = Object.entries(data).filter(([s, t]) => t && !existing.has(s));
        if (pairs.length) {
          await a.trPut(lang, pairs, 'seed');
          pairs.forEach(([s, t]) => existing.set(s, t));
        }
        await a.trPut(SEED_MARK, [[lang, sum]], 'seed');
      } catch (e) { console.warn(`[i18n] bad seed file ${f}: ${e.message}`); }
    }));
  }
  const p = providers();
  console.log(`[i18n] ${catalog.size} UI strings · ${LANGUAGES.length} languages · auto-translate: ${p.length ? p.map((x) => x.name).join(' → ') : 'off (seed languages only)'}`);
}

async function getDict(lang) {
  if (!memory.has(lang)) {
    const rows = await store.adapter().trGetLang(lang);
    memory.set(lang, new Map(rows.map((r) => [r.source, r.text])));
  }
  return memory.get(lang);
}

/* ---------- providers ---------- */
const PLACEHOLDER = /\{\d+\}/g;
function validPair(src, out) {
  if (typeof out !== 'string' || !out.trim()) return false;
  const a = (src.match(PLACEHOLDER) || []).sort().join();
  const b = (out.match(PLACEHOLDER) || []).sort().join();
  return a === b;
}

let anthropic = null;
const claudeProvider = {
  name: 'claude',
  enabled: () => Boolean(process.env.ANTHROPIC_API_KEY) && process.env.I18N_USE_CLAUDE !== 'false',
  async translate(lang, texts) {
    if (!anthropic) anthropic = new (require('@anthropic-ai/sdk'))();
    const info = langInfo(lang) || { name: lang, native: lang };
    const resp = await anthropic.beta.messages.create({
      model: process.env.I18N_MODEL || 'claude-opus-5-5',
      max_tokens: 16000,
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: { type: 'object', properties: { translations: { type: 'array', items: { type: 'string' } } }, required: ['translations'], additionalProperties: false } },
      },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: `You translate the user interface of Nexus Healthcare, a friendly healthcare app used by patients (including people with little schooling), doctors, pharmacists and health officials.

Translate each string from English into ${info.name} (${info.native}).
- Use simple, warm, everyday words people actually speak — not stiff, bookish or overly formal vocabulary. For Indian languages prefer the common spoken register.
- Keep it about the same length; these are buttons, labels and short sentences.
- Keep exactly as-is: placeholders like {0} and {1}, numbers, ₹ and other currency signs, units (mg, mmHg, °F, %), emoji, and these names: Nexus Healthcare, Saathi, ABHA, Aadhaar, UPI, OTP, QR, ICU, SpO₂, BP, LOINC, HMIS, LIS, DPDP.
- Medical terms: use the word patients in that language would understand; if none exists, keep the English term.
- If a string is only a code, name or ID, return it unchanged.
Return the translations in the same order, one per input string.`,
      messages: [{ role: 'user', content: JSON.stringify(texts) }],
    });
    if (resp.stop_reason === 'refusal') throw new Error('translation refused');
    const block = resp.content.find((b) => b.type === 'text');
    const parsed = JSON.parse(block.text);
    return parsed.translations;
  },
};

const googleProvider = {
  name: 'google',
  enabled: () => Boolean(process.env.GOOGLE_TRANSLATE_API_KEY),
  async translate(lang, texts) {
    const target = langInfo(lang)?.google || lang;
    const res = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(process.env.GOOGLE_TRANSLATE_API_KEY)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: texts, source: 'en', target, format: 'text' }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || `Google ${res.status}`);
    return data.data.translations.map((t) => t.translatedText);
  },
};

const libreProvider = {
  name: 'libretranslate',
  enabled: () => Boolean(process.env.LIBRETRANSLATE_URL),
  async translate(lang, texts) {
    const res = await fetch(`${process.env.LIBRETRANSLATE_URL.replace(/\/$/, '')}/translate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: texts, source: 'en', target: lang.split('-')[0], format: 'text', api_key: process.env.LIBRETRANSLATE_API_KEY || undefined }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `LibreTranslate ${res.status}`);
    return Array.isArray(data.translatedText) ? data.translatedText : [data.translatedText];
  },
};

// MyMemory — a keyless public machine-translation API. Works with no setup (that's why it's the
// default fallback), translating one string per request. Anonymous quota is modest; set
// MYMEMORY_EMAIL in .env to raise it. Each string is cached in the DB, so a language fills in
// progressively across sessions and is then served instantly offline.
const mymemoryProvider = {
  name: 'mymemory',
  enabled: () => process.env.I18N_USE_MYMEMORY !== 'false',
  async translate(lang, texts) {
    const target = langInfo(lang)?.google || lang;
    const email = process.env.MYMEMORY_EMAIL ? `&de=${encodeURIComponent(process.env.MYMEMORY_EMAIL)}` : '';
    const out = new Array(texts.length);
    const CONC = Number(process.env.MYMEMORY_CONCURRENCY || 4);
    let next = 0;
    let stop = false; // once the quota is gone, the other workers stop too instead of burning more requests
    async function worker() {
      while (!stop && next < texts.length) {
        const i = next; next += 1;
        const q = texts[i];
        try {
          const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=en|${encodeURIComponent(target)}${email}`, { headers: { 'User-Agent': 'NexusHealthcare/1.0' } });
          const data = await res.json();
          const t = data?.responseData?.translatedText;
          // Out of quota shows up as status 429 or as a "MYMEMORY WARNING…" put where the translation should be.
          if (Number(data.responseStatus) === 429 || (typeof data.responseDetails === 'string' && /quota|free translations/i.test(data.responseDetails)) || /^MYMEMORY WARNING/i.test(t || '')) throw new Error('quota');
          // On any other failure (403 "QUERY LENGTH LIMIT EXCEEDED", invalid pair…) translatedText holds the
          // error text — never store that as the translation.
          out[i] = Number(data.responseStatus) === 200 && typeof t === 'string' && t.trim() ? t : null;
        } catch (e) {
          if (e.message === 'quota') { stop = true; throw e; }
          out[i] = null;
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONC, texts.length) }, worker));
    return out;
  },
};

function providers() {
  const order = (process.env.I18N_PROVIDERS || 'claude,google,libretranslate,mymemory').split(',').map((s) => s.trim());
  const all = { claude: claudeProvider, google: googleProvider, libretranslate: libreProvider, mymemory: mymemoryProvider };
  return order.map((n) => all[n]).filter((p) => p && p.enabled());
}

async function translateBatch(lang, texts) {
  for (const p of providers()) {
    try {
      const out = await p.translate(lang, texts);
      if (Array.isArray(out) && out.length === texts.length) return { out, origin: p.name };
      console.warn(`[i18n] ${p.name} returned ${out?.length} items for ${texts.length}`);
    } catch (e) {
      console.warn(`[i18n] ${p.name} failed for ${lang}: ${e.message}`);
    }
  }
  return null;
}

/* ---------- public API ---------- */
// When a pass leaves strings untranslated (every provider failed, quota gone, or the provider keeps returning
// unusable output for some strings), pause auto-translation for that language: the app polls the dictionary
// every 4 s while coverage is incomplete, and each poll used to start a fresh round of the same failing calls.
const BACKOFF_MS = Number(process.env.I18N_RETRY_MS || 10 * 60 * 1000);
const pausedUntil = new Map(); // lang -> timestamp
const paused = (lang) => (pausedUntil.get(lang) || 0) > Date.now();

async function fillMissing(lang, sources) {
  const dict = await getDict(lang);
  const missing = [...new Set(sources)].filter((s) => catalog.has(s) && !dict.has(s));
  const size = Number(process.env.I18N_BATCH || 60);
  let done = 0;
  for (let i = 0; i < missing.length; i += size) {
    const batch = missing.slice(i, i + size);
    const r = await translateBatch(lang, batch);
    if (!r) break;
    const pairs = batch.map((s, j) => [s, r.out[j]]).filter(([s, t]) => validPair(s, t));
    if (pairs.length) {
      await store.adapter().trPut(lang, pairs, r.origin);
      pairs.forEach(([s, t]) => dict.set(s, t));
      done += pairs.length;
      broadcast(`i18n:${lang}`);
    }
  }
  if (done < missing.length) {
    pausedUntil.set(lang, Date.now() + BACKOFF_MS);
    console.warn(`[i18n] ${missing.length - done} string(s) still untranslated in ${lang} — retrying in ${Math.round(BACKOFF_MS / 60000)} min`);
  } else pausedUntil.delete(lang);
  return done;
}

/** Make sure every catalog string exists in `lang`; runs once in the background. */
function ensureLanguage(lang) {
  if (lang === 'en' || !langInfo(lang) || !providers().length || paused(lang)) return null;
  if (jobs.has(lang)) return jobs.get(lang);
  const job = fillMissing(lang, [...catalog])
    .then((n) => { if (n) console.log(`[i18n] translated ${n} strings into ${lang}`); return n; })
    .catch((e) => console.error('[i18n] job failed', e.message))
    .finally(() => jobs.delete(lang));
  jobs.set(lang, job);
  return job;
}

async function dictionary(lang) {
  const dict = await getDict(lang);
  const total = catalog.size || 1;
  let have = 0;
  for (const s of catalog) if (dict.has(s)) have += 1;
  const coverage = Math.round((have / total) * 100);
  const pending = coverage < 100 && Boolean(ensureLanguage(lang));
  return { lang, dir: langInfo(lang)?.dir || 'ltr', coverage, pending, autoTranslate: providers().length > 0, dict: Object.fromEntries(dict) };
}

/** Translate fixed server texts on demand (e.g. chat help answers). Falls back to English. */
async function translateServerText(lang, text) {
  if (!lang || lang === 'en') return text;
  const dict = await getDict(lang);
  if (dict.has(text)) return dict.get(text);
  if (!SERVER_STRINGS.has(text) || !providers().length || paused(lang)) return text;
  await fillMissing(lang, [text]);
  return dict.get(text) || text;
}

async function setHuman(lang, source, text) {
  const dict = await getDict(lang);
  await store.adapter().trPut(lang, [[source, text]], 'human');
  dict.set(source, text);
  broadcast(`i18n:${lang}`);
}

async function stats() {
  const rows = await store.adapter().trStats();
  const by = Object.fromEntries(rows.map((r) => [r.lang, Number(r.n)]));
  return LANGUAGES.map((l) => ({ ...l, translated: l.code === 'en' ? catalog.size : by[l.code] || 0, total: catalog.size }));
}

module.exports = { init, dictionary, ensureLanguage, translateServerText, registerServerStrings, setHuman, stats, LANGUAGES, langInfo, reloadCatalog: loadCatalog };
