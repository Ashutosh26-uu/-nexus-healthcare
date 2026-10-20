// SQLite adapter using Node's built-in driver (no native build step).
// Silence only the "SQLite is experimental" notice — other warnings (deprecations, leaked listeners) must still show.
const defaultWarn = process.listeners('warning');
process.removeAllListeners('warning');
process.on('warning', (w) => { if (w.name === 'ExperimentalWarning' && /sqlite/i.test(w.message)) return; for (const l of defaultWarn) l.call(process, w); });
const { DatabaseSync } = require('node:sqlite');

const SAFE = /^[a-zA-Z][a-zA-Z0-9_]*$/;

module.exports = function sqliteAdapter(file) {
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA secure_delete = ON;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS otp_codes (
      target TEXT PRIMARY KEY, code_hash TEXT NOT NULL, channel TEXT NOT NULL, provider TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL, last_sent_at INTEGER NOT NULL,
      sends_window_start INTEGER NOT NULL, sends_in_window INTEGER NOT NULL DEFAULT 1, provider_ref TEXT
    );
    CREATE TABLE IF NOT EXISTS translations (
      lang TEXT NOT NULL, source TEXT NOT NULL, text TEXT NOT NULL, origin TEXT NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY (lang, source)
    );
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY, owner_patient_id TEXT, uploaded_by TEXT, name TEXT, mime TEXT, size INTEGER,
      data BLOB NOT NULL, created_at TEXT NOT NULL
    );
  `);
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name));

  function ensureTable(name) {
    if (!SAFE.test(name)) throw new Error(`bad collection name ${name}`);
    const t = `c_${name}`;
    if (!tables.has(t)) {
      db.exec(`CREATE TABLE IF NOT EXISTS ${t} (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL)`);
      tables.add(t);
    }
    return t;
  }

  return {
    kind: 'sqlite',
    file,
    async loadAll() {
      const out = { collections: {}, kv: {} };
      for (const t of tables) {
        if (!t.startsWith('c_')) continue;
        out.collections[t.slice(2)] = db.prepare(`SELECT id, data FROM ${t}`).all().map((r) => ({ id: r.id, data: JSON.parse(r.data) }));
      }
      for (const r of db.prepare('SELECT k, v FROM kv').all()) out.kv[r.k] = JSON.parse(r.v);
      return out;
    },
    async write({ upserts, deletes, kv }) {
      const now = new Date().toISOString();
      db.exec('BEGIN');
      try {
        for (const [col, rows] of Object.entries(upserts)) {
          const stmt = db.prepare(`INSERT INTO ${ensureTable(col)} (id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`);
          for (const [id, json] of rows) stmt.run(id, json, now);
        }
        for (const [col, ids] of Object.entries(deletes)) {
          const stmt = db.prepare(`DELETE FROM ${ensureTable(col)} WHERE id = ?`);
          for (const id of ids) stmt.run(id);
        }
        const kvStmt = db.prepare('INSERT INTO kv (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at');
        for (const [k, json] of kv) kvStmt.run(k, json, now);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    async wipe() {
      for (const t of [...tables]) if (t.startsWith('c_')) { db.exec(`DROP TABLE ${t}`); tables.delete(t); }
      db.exec('DELETE FROM kv; DELETE FROM otp_codes;');
    },

    // ----- OTP -----
    async otpGet(target) { return db.prepare('SELECT * FROM otp_codes WHERE target = ?').get(target) || null; },
    async otpPut(row) {
      db.prepare(`INSERT INTO otp_codes (target, code_hash, channel, provider, attempts, expires_at, last_sent_at, sends_window_start, sends_in_window, provider_ref)
        VALUES (@target, @code_hash, @channel, @provider, @attempts, @expires_at, @last_sent_at, @sends_window_start, @sends_in_window, @provider_ref)
        ON CONFLICT(target) DO UPDATE SET code_hash=excluded.code_hash, channel=excluded.channel, provider=excluded.provider, attempts=excluded.attempts,
        expires_at=excluded.expires_at, last_sent_at=excluded.last_sent_at, sends_window_start=excluded.sends_window_start,
        sends_in_window=excluded.sends_in_window, provider_ref=excluded.provider_ref`).run({ provider_ref: null, ...row });
    },
    // Returns the new count, or null when the code is gone.
    async otpAttempt(target) { const r = db.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE target = ? RETURNING attempts').get(target); return r ? Number(r.attempts) : null; },
    async otpDelete(target) { db.prepare('DELETE FROM otp_codes WHERE target = ?').run(target); },

    // ----- translations -----
    async trGetLang(lang) { return db.prepare('SELECT source, text FROM translations WHERE lang = ?').all(lang); },
    async trPut(lang, pairs, origin) {
      const now = new Date().toISOString();
      const stmt = db.prepare('INSERT INTO translations (lang, source, text, origin, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(lang, source) DO UPDATE SET text = excluded.text, origin = excluded.origin, updated_at = excluded.updated_at');
      db.exec('BEGIN');
      try { for (const [s, t] of pairs) stmt.run(lang, s, t, origin, now); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    async trStats() { return db.prepare('SELECT lang, COUNT(*) n FROM translations GROUP BY lang').all(); },

    // ----- files -----
    async filePut(f) {
      db.prepare('INSERT INTO files (id, owner_patient_id, uploaded_by, name, mime, size, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(f.id, f.ownerPatientId, f.uploadedBy, f.name, f.mime, f.size, f.data, new Date().toISOString());
    },
    // Account erasure: every upload that belongs to one Health Passport. Returns how many were removed.
    async fileDeleteByOwner(patientId) { return db.prepare('DELETE FROM files WHERE owner_patient_id = ?').run(patientId).changes; },
    // After a one-time re-encryption: rebuild the file so freed pages holding old plain text are dropped.
    async compact() { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); db.exec('VACUUM'); db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); },
    async fileIds() { return db.prepare('SELECT id FROM files').all().map((r) => r.id); },
    async fileReplace(id, name, data) { db.prepare('UPDATE files SET name = ?, data = ? WHERE id = ?').run(name, data, id); },
    async fileGet(id) {
      const r = db.prepare('SELECT * FROM files WHERE id = ?').get(id);
      return r ? { id: r.id, ownerPatientId: r.owner_patient_id, uploadedBy: r.uploaded_by, name: r.name, mime: r.mime, size: r.size, data: Buffer.from(r.data) } : null;
    },
    async close() { db.close(); },
  };
};
