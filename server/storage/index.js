// Persistence layer.
//   - SQLite (default): a real database file at server/data/omnicare.db, zero setup.
//   - PostgreSQL: set DATABASE_URL=postgres://… (e.g. Supabase, Neon, RDS).
//
// Every collection is a table of (id, data JSON). The API works on an in-memory
// write-through cache; each save() diffs the cache against what's on disk and writes
// only the changed rows inside one transaction, so data is durable within milliseconds.

const path = require('path');
const fs = require('fs');
const { sealed } = require('./sealed');

function keyOf(collection, rec) {
  if (rec === null || typeof rec !== 'object') return String(rec);
  if (rec.id !== undefined) return String(rec.id);
  if (collection === 'beds') return `${rec.facilityId}:${rec.type}`;
  if (rec.key !== undefined) return String(rec.key);
  if (rec.code !== undefined) return String(rec.code);
  return JSON.stringify(rec).slice(0, 200);
}

// Every adapter is wrapped so rows, documents, files and code lookups are encrypted at rest (see sealed.js).
function createAdapter() {
  return sealed(rawAdapter());
}
function rawAdapter() {
  if (process.env.DATABASE_URL) return require('./postgres')(process.env.DATABASE_URL);
  const file = process.env.SQLITE_FILE
    ? path.resolve(process.env.SQLITE_FILE)
    : process.env.DB_FILE
      ? path.resolve(process.env.DB_FILE).replace(/\.json$/, '.db')
      : path.join(__dirname, '..', 'data', 'omnicare.db');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return require('./sqlite')(file);
}

module.exports = { keyOf, createAdapter };
