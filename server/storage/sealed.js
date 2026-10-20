// Encryption at rest for everything the app stores (application-level, on top of the database's own disk
// encryption): someone who copies the database — a leaked DATABASE_URL, a stolen backup, a hosting-side
// breach — gets ciphertext only. The key never goes in the database: DATA_ENCRYPTION_KEY lives in the
// server's environment.
//
//   rows (every collection) → {"$e":"v1.<kid>.<iv>.<tag>.<ciphertext>"}  AES-256-GCM, bound to collection+id
//   kv documents            → same, bound to the kv key (only the table-name list "__collections" stays plain)
//   uploaded files          → SEF1 | kid | iv | tag | ciphertext (bytes), file name encrypted too
//   one-time-code rows      → looked up by an HMAC of "purpose|email", so the email isn't stored
//
// Rotation: put the new key in DATA_ENCRYPTION_KEY and the old one(s) in DATA_ENCRYPTION_KEYS_OLD
// (comma-separated). Start-up re-encrypts every row and file still under an old key (or still plain text).
const crypto = require('crypto');

const ROW_TAG = '$e';
const FILE_MAGIC = Buffer.from('SEF1');
const NAME_PREFIX = 'enc1.';

function parseKey(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/^[0-9a-f]{64}$/i.test(s)) return Buffer.from(s, 'hex');
  if (/^[A-Za-z0-9+/_-]{43}=?$/.test(s)) { const b = Buffer.from(s, 'base64'); if (b.length === 32) return b; }
  if (s.length < 32) throw new Error('DATA_ENCRYPTION_KEY is too short — use 32 random bytes (64 hex characters).');
  return crypto.createHash('sha256').update(s).digest(); // a long passphrase
}
const kidOf = (key) => crypto.createHash('sha256').update(key).digest('hex').slice(0, 8);

function keyring() {
  const primary = parseKey(process.env.DATA_ENCRYPTION_KEY);
  if (!primary) return null;
  const all = new Map([[kidOf(primary), primary]]);
  for (const old of String(process.env.DATA_ENCRYPTION_KEYS_OLD || '').split(',')) { const k = parseKey(old); if (k) all.set(kidOf(k), k); }
  // Separate sub-keys for encryption and for the one-time-code lookup HMAC.
  const sub = (k, label) => crypto.createHmac('sha256', k).update(`sehatra-${label}-v1`).digest();
  return { kid: kidOf(primary), enc: sub(primary, 'enc'), mac: sub(primary, 'mac'), byKid: (kid) => (all.has(kid) ? sub(all.get(kid), 'enc') : null) };
}

function sealed(adapter) {
  const ring = keyring();
  const isProd = process.env.NODE_ENV === 'production';
  if (!ring) {
    if (isProd && process.env.ALLOW_UNENCRYPTED_DB !== 'true') {
      throw new Error('FATAL: DATA_ENCRYPTION_KEY is not set. Patient data must be encrypted at rest in production. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))" — and keep a copy somewhere safe: without it the data cannot be read.');
    }
    console.warn('[storage] DATA_ENCRYPTION_KEY not set — data is stored WITHOUT application-level encryption (development only).');
  }

  const encStr = (plain, aad) => {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', ring.enc, iv);
    c.setAAD(Buffer.from(aad));
    const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    return `v1.${ring.kid}.${iv.toString('base64url')}.${c.getAuthTag().toString('base64url')}.${ct.toString('base64url')}`;
  };
  const decStr = (token, aad) => {
    const [v, kid, iv, tag, ct] = String(token).split('.');
    const key = v === 'v1' && ring ? ring.byKid(kid) : null;
    if (!key) throw new Error(`[storage] data is encrypted with key ${kid} which this server doesn't have — set DATA_ENCRYPTION_KEY (and DATA_ENCRYPTION_KEYS_OLD) to the right key.`);
    const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    d.setAAD(Buffer.from(aad));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return { text: Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8'), stale: kid !== ring.kid };
  };
  const isSealedRow = (v) => v && typeof v === 'object' && !Array.isArray(v) && typeof v[ROW_TAG] === 'string' && Object.keys(v).length === 1;
  // Returns { value, stale } — stale = plain text or an old key (re-encrypted at start-up).
  const openValue = (v, aad) => {
    if (!isSealedRow(v)) return { value: v, stale: Boolean(ring) };
    const r = decStr(v[ROW_TAG], aad);
    return { value: JSON.parse(r.text), stale: r.stale };
  };
  const sealJson = (json, aad) => (ring ? JSON.stringify({ [ROW_TAG]: encStr(json, aad) }) : json);
  const rowAad = (col, id) => `row|${col}|${id}`;
  const kvAad = (k) => `kv|${k}`;
  const PLAIN_KV = new Set(['__collections']); // the adapter reads it to find the tables

  const encFile = (buf, id) => {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', ring.enc, iv);
    c.setAAD(Buffer.from(`file|${id}`));
    const ct = Buffer.concat([c.update(buf), c.final()]);
    return Buffer.concat([FILE_MAGIC, Buffer.from(ring.kid, 'hex'), iv, c.getAuthTag(), ct]);
  };
  const decFile = (buf, id) => {
    const b = Buffer.from(buf);
    if (b.length < 36 || !b.subarray(0, 4).equals(FILE_MAGIC)) return { data: b, stale: Boolean(ring) };
    const kid = b.subarray(4, 8).toString('hex');
    const key = ring?.byKid(kid);
    if (!key) throw new Error(`[storage] file ${id} is encrypted with key ${kid} which this server doesn't have.`);
    const d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(8, 20));
    d.setAAD(Buffer.from(`file|${id}`));
    d.setAuthTag(b.subarray(20, 36));
    return { data: Buffer.concat([d.update(b.subarray(36)), d.final()]), stale: kid !== ring.kid };
  };
  const encName = (name, id) => (ring && name != null ? NAME_PREFIX + encStr(String(name), `filename|${id}`) : name);
  const decName = (name, id) => (typeof name === 'string' && name.startsWith(NAME_PREFIX) ? decStr(name.slice(NAME_PREFIX.length), `filename|${id}`).text : name);
  // One-time codes are found by "purpose|email": store a keyed hash instead of the address.
  const otpKey = (target) => (ring ? `h1.${crypto.createHmac('sha256', ring.mac).update(String(target)).digest('base64url')}` : target);

  const compactQuietly = async () => { try { await adapter.compact?.(); console.log('[storage] old unencrypted copies removed from the database files'); } catch (e) { console.warn('[storage] compaction skipped:', e.message); } };
  const api = {
    ...adapter,
    encrypted: Boolean(ring),
    async loadAll() {
      const raw = await adapter.loadAll();
      const out = { collections: {}, kv: {} };
      const reseal = { upserts: {}, deletes: {}, kv: [] };
      let stale = 0;
      for (const [col, rows] of Object.entries(raw.collections)) {
        out.collections[col] = rows.map((r) => {
          const o = openValue(r.data, rowAad(col, r.id));
          if (o.stale && ring) { (reseal.upserts[col] ||= []).push([r.id, JSON.stringify(o.value)]); stale += 1; }
          return { id: r.id, data: o.value };
        });
      }
      for (const [k, v] of Object.entries(raw.kv)) {
        if (PLAIN_KV.has(k)) { out.kv[k] = v; continue; }
        const o = openValue(v, kvAad(k));
        if (o.stale && ring) { reseal.kv.push([k, JSON.stringify(o.value)]); stale += 1; }
        out.kv[k] = o.value;
      }
      // Rows still in plain text (or under an old key) are re-encrypted now, in one transaction, before use.
      if (stale) {
        await api.write(reseal);
        console.log(`[storage] encrypted ${stale} stored record(s) at rest (key ${ring.kid})`);
        await compactQuietly();
      }
      return out;
    },
    async write({ upserts, deletes, kv }) {
      if (!ring) return adapter.write({ upserts, deletes, kv });
      const up = {};
      for (const [col, rows] of Object.entries(upserts)) up[col] = rows.map(([id, json]) => [id, sealJson(json, rowAad(col, id))]);
      const kvOut = kv.map(([k, json]) => [k, PLAIN_KV.has(k) ? json : sealJson(json, kvAad(k))]);
      return adapter.write({ upserts: up, deletes, kv: kvOut });
    },
    async otpGet(target) { return adapter.otpGet(otpKey(target)); },
    async otpPut(row) { return adapter.otpPut({ ...row, target: otpKey(row.target) }); },
    async otpAttempt(target) { return adapter.otpAttempt(otpKey(target)); },
    async otpDelete(target) { return adapter.otpDelete(otpKey(target)); },
    async filePut(f) {
      if (!ring) return adapter.filePut(f);
      return adapter.filePut({ ...f, name: encName(f.name, f.id), data: encFile(f.data, f.id) });
    },
    async fileGet(id) {
      const f = await adapter.fileGet(id);
      if (!f) return null;
      return { ...f, name: decName(f.name, f.id), data: decFile(f.data, f.id).data };
    },
    // Uploads made before encryption was switched on (or under an old key): re-encrypted one by one.
    async resealFiles() {
      if (!ring || !adapter.fileIds) return 0;
      let n = 0;
      for (const id of await adapter.fileIds()) {
        const f = await adapter.fileGet(id);
        if (!f) continue;
        const d = decFile(f.data, id);
        const nameStale = !(typeof f.name === 'string' && f.name.startsWith(NAME_PREFIX)) || f.name.slice(NAME_PREFIX.length).split('.')[1] !== ring.kid;
        if (!d.stale && !nameStale) continue;
        await adapter.fileReplace(id, encName(decName(f.name, id), id), encFile(d.data, id));
        n += 1;
      }
      if (n) { console.log(`[storage] encrypted ${n} uploaded file(s) at rest`); await compactQuietly(); }
      return n;
    },
  };
  return api;
}

module.exports = { sealed, parseKey, kidOf };
