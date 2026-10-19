// PostgreSQL adapter (used when DATABASE_URL is set). Requires: npm i pg
const SAFE = /^[a-zA-Z][a-zA-Z0-9_]*$/;

module.exports = function postgresAdapter(url) {
  let Pool;
  try { ({ Pool } = require('pg')); } catch {
    throw new Error('DATABASE_URL is set but the "pg" package is missing. Run: npm install pg --prefix server');
  }
  // Managed Postgres (Neon, Supabase, RDS…) has valid certificates — verify them. An explicit sslmode in the
  // URL is left to pg. Set PG_SSL_NO_VERIFY=true only for a self-hosted server with a self-signed cert.
  const managed = /neon\.tech|supabase|render\.com|amazonaws|azure|cloud\.google/.test(url);
  const ssl = /sslmode=/.test(url) ? undefined : managed ? { rejectUnauthorized: process.env.PG_SSL_NO_VERIFY !== 'true' } : undefined;
  const pool = new Pool({ connectionString: url, ssl, max: Number(process.env.PG_POOL_MAX) || 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 15000 });
  pool.on('error', (e) => console.error('[pg] idle client error:', e.message)); // a dropped idle connection must not crash the server
  const tables = new Set();
  let ready = null;

  async function init() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS otp_codes (
        target TEXT PRIMARY KEY, code_hash TEXT NOT NULL, channel TEXT NOT NULL, provider TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0, expires_at BIGINT NOT NULL, last_sent_at BIGINT NOT NULL,
        sends_window_start BIGINT NOT NULL, sends_in_window INTEGER NOT NULL DEFAULT 1, provider_ref TEXT
      );
      CREATE TABLE IF NOT EXISTS translations (
        lang TEXT NOT NULL, source TEXT NOT NULL, text TEXT NOT NULL, origin TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (lang, source)
      );
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY, owner_patient_id TEXT, uploaded_by TEXT, name TEXT, mime TEXT, size INTEGER,
        data BYTEA NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    const r = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name LIKE 'c\\_%'");
    r.rows.forEach((x) => tables.add(x.table_name));
  }
  const q = async (...a) => { await (ready ||= init()); return pool.query(...a); };

  // `created` collects tables made inside the current transaction: DDL is transactional in Postgres, so a
  // ROLLBACK undoes the CREATE and the name must be forgotten too (or every later INSERT fails).
  async function ensureTable(client, name, created) {
    if (!SAFE.test(name)) throw new Error(`bad collection name ${name}`);
    const t = `c_${name.toLowerCase()}`;
    if (!tables.has(t)) {
      await client.query(`CREATE TABLE IF NOT EXISTS ${t} (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
      tables.add(t);
      created?.push(t);
    }
    return t;
  }

  // JSONB cannot hold "\u0000" or lone surrogates; one such character in any user-typed field would make
  // every write (one transaction) fail for ever. Cheap test first; the rare offender is re-serialised clean.
  const BAD = /\\u(?:0000|d[89ab])/i;
  const safeJson = (json) => (BAD.test(json) ? JSON.stringify(JSON.parse(json), (_k, v) => (typeof v === 'string' ? v.replace(/\u0000/g, '').toWellFormed() : v)) : json);

  // Collection names are camelCase in code; Postgres folds them, so keep a name map in kv.
  return {
    kind: 'postgres',
    async loadAll() {
      await (ready ||= init());
      const out = { collections: {}, kv: {} };
      const kvRows = (await pool.query('SELECT k, v FROM kv')).rows;
      for (const r of kvRows) out.kv[r.k] = r.v;
      const names = (out.kv.__collections || []).filter((name) => SAFE.test(name) && tables.has(`c_${name.toLowerCase()}`));
      // All collections in parallel (pool-bounded) — sequential round trips to a remote region made start-up slow.
      const loaded = await Promise.all(names.map((name) => pool.query(`SELECT id, data FROM c_${name.toLowerCase()}`)));
      names.forEach((name, i) => { out.collections[name] = loaded[i].rows.map((r) => ({ id: r.id, data: r.data })); });
      return out;
    },
    async write({ upserts, deletes, kv }) {
      await (ready ||= init());
      const client = await pool.connect();
      const created = [];
      // A connection dropping between two queries of this transaction is emitted as an 'error' event on the
      // checked-out client; with no listener that is an uncaught exception that kills the server.
      let broken = null;
      const onError = (e) => { broken = e; console.error('[pg] connection error during write:', e.message); };
      client.on('error', onError);
      try {
        await client.query('BEGIN');
        // One round trip per collection (not per row) — matters with a database in another region.
        for (const [col, rows] of Object.entries(upserts)) {
          const t = await ensureTable(client, col, created);
          for (let i = 0; i < rows.length; i += 2000) {
            const chunk = rows.slice(i, i + 2000);
            await client.query(`INSERT INTO ${t} (id, data, updated_at) SELECT x.id, x.data::jsonb, now() FROM unnest($1::text[], $2::text[]) AS x(id, data)
              ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [chunk.map((r) => r[0]), chunk.map((r) => safeJson(r[1]))]);
          }
        }
        for (const [col, ids] of Object.entries(deletes)) {
          const t = await ensureTable(client, col, created);
          if (ids.length) await client.query(`DELETE FROM ${t} WHERE id = ANY($1)`, [ids]);
        }
        if (kv.length) await client.query(`INSERT INTO kv (k, v, updated_at) SELECT x.k, x.v::jsonb, now() FROM unnest($1::text[], $2::text[]) AS x(k, v)
          ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, updated_at = now()`, [kv.map((r) => r[0]), kv.map((r) => safeJson(r[1]))]);
        await client.query('COMMIT');
      } catch (e) {
        for (const t of created) tables.delete(t);
        await client.query('ROLLBACK').catch((re) => { broken ||= re; }); // the connection itself may be gone
        throw e;
      } finally {
        client.off('error', onError);
        // A dead connection must not go back into the pool, or the retry (and the next request) gets it again.
        client.release(broken || undefined);
      }
    },
    async wipe() {
      await (ready ||= init());
      for (const t of [...tables]) { await pool.query(`DROP TABLE IF EXISTS ${t}`); tables.delete(t); }
      await pool.query('DELETE FROM kv; DELETE FROM otp_codes;');
    },
    async otpGet(target) { return (await q('SELECT * FROM otp_codes WHERE target = $1', [target])).rows[0] || null; },
    async otpPut(r) {
      await q(`INSERT INTO otp_codes (target, code_hash, channel, provider, attempts, expires_at, last_sent_at, sends_window_start, sends_in_window, provider_ref)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (target) DO UPDATE SET code_hash=EXCLUDED.code_hash, channel=EXCLUDED.channel, provider=EXCLUDED.provider,
        attempts=EXCLUDED.attempts, expires_at=EXCLUDED.expires_at, last_sent_at=EXCLUDED.last_sent_at, sends_window_start=EXCLUDED.sends_window_start,
        sends_in_window=EXCLUDED.sends_in_window, provider_ref=EXCLUDED.provider_ref`,
      [r.target, r.code_hash, r.channel, r.provider, r.attempts, r.expires_at, r.last_sent_at, r.sends_window_start, r.sends_in_window, r.provider_ref || null]);
    },
    // Returns the new count (atomic), or null when the code is gone.
    async otpAttempt(target) { const r = await q('UPDATE otp_codes SET attempts = attempts + 1 WHERE target = $1 RETURNING attempts', [target]); return r.rows[0] ? Number(r.rows[0].attempts) : null; },
    async otpDelete(target) { await q('DELETE FROM otp_codes WHERE target = $1', [target]); },
    async trGetLang(lang) { return (await q('SELECT source, text FROM translations WHERE lang = $1', [lang])).rows; },
    async trPut(lang, pairs, origin) {
      if (pairs.length) await q(`INSERT INTO translations (lang, source, text, origin, updated_at) SELECT $1, x.s, x.t, $4, now() FROM unnest($2::text[], $3::text[]) AS x(s, t)
        ON CONFLICT (lang, source) DO UPDATE SET text=EXCLUDED.text, origin=EXCLUDED.origin, updated_at=now()`, [lang, pairs.map((x) => x[0]), pairs.map((x) => x[1]), origin]);
    },
    async trStats() { return (await q('SELECT lang, COUNT(*)::int n FROM translations GROUP BY lang')).rows; },
    async filePut(f) { await q('INSERT INTO files (id, owner_patient_id, uploaded_by, name, mime, size, data) VALUES ($1,$2,$3,$4,$5,$6,$7)', [f.id, f.ownerPatientId, f.uploadedBy, f.name, f.mime, f.size, f.data]); },
    // Account erasure: every upload that belongs to one Health Passport. Returns how many were removed.
    async fileDeleteByOwner(patientId) { return (await q('DELETE FROM files WHERE owner_patient_id = $1', [patientId])).rowCount || 0; },
    async fileGet(id) {
      const r = (await q('SELECT * FROM files WHERE id = $1', [id])).rows[0];
      return r ? { id: r.id, ownerPatientId: r.owner_patient_id, uploadedBy: r.uploaded_by, name: r.name, mime: r.mime, size: r.size, data: r.data } : null;
    },
    async close() { await pool.end(); },
  };
};
