const crypto = require('crypto');
// Datastore: in-memory working set, persisted to SQLite/PostgreSQL on every change.
//
// Change tracking
// ---------------
// Route handlers mutate the objects returned by get() directly and then call save(). Instead of
// re-serialising the whole dataset on every flush, writes are tracked so a flush only serialises the
// records that changed:
//   * Each collection array is exposed through a Proxy. Its records stay plain objects internally, so
//     scans by predicate (filter/find/some/every/findIndex…) run over the raw records at native speed;
//     every record handed OUT (results of find/filter, arr[i], iteration, forEach/map callbacks…) is a
//     cached Proxy of that record (same raw → same proxy, so `===` keeps working).
//   * Nested objects/arrays inside records and documents are replaced, once, by Proxies stored in the
//     graph. None of the proxies has a get trap (reads stay cheap); their set/deleteProperty/
//     defineProperty traps walk up to the owning top-level record(s) and mark them dirty.
//   * Array mutators on a collection (push/unshift/splice/pop/shift/sort/index set/length…) record
//     inserts and removals. A removal or key change falls back to a full diff of that ONE collection
//     (which still reuses the baseline JSON of records known to be clean).
//   * `order:<name>` is rewritten only when membership/order changed, at most once per
//     DB_ORDER_FLUSH_MS (default 5 s) — on a crash the worst case is a slightly stale display order;
//     records themselves are always written within ~15 ms.
// Contract for route code: predicates passed to filter/find/some/every/findIndex/findLast(Index)/sort
// on a collection receive the raw record and must be pure (don't mutate or keep the argument).
//
// Safety nets: records inserted (or given new nested objects) are re-checked for ~10 s in case code
// keeps mutating its own raw reference after inserting it; a chunked full diff runs every
// DB_AUDIT_MS (default 10 min) and a synchronous one runs on close(), logging anything tracking missed.
const { keyOf, createAdapter } = require('./storage');

const SKIP = new Set(['otps']);
const ORDER_MS = Number(process.env.DB_ORDER_FLUSH_MS ?? 5000);
const AUDIT_MS = Number(process.env.DB_AUDIT_MS ?? 10 * 60 * 1000);
const PROBATION_MS = 10000;
const AP = Array.prototype;

let raw = null; // the real root object (never handed out)
let db = null; // root proxy returned by get()
let adapter = null;
const snapshot = new Map(); // collection -> Map(id -> json)   (committed baseline)
const kvSnapshot = new Map(); // key -> json                    (committed baseline)
let flushTimer = null;
let orderTimer = null;
let flushing = Promise.resolve();
let auditTimer = null;
let probationTimer = null;
let auditRunning = false;
let retryTimer = null;
let retryMs = 2000; // back-off between retries of a failed write (2 s → 60 s)
let closing = null;

// ---------------------------------------------------------------- tracking state
let cols = new Map(); // name -> collection state
let docs = new Map(); // name -> doc state
// raw object -> its proxy, kept as a non-enumerable symbol property (a WeakMap lookup per element is
// several times slower in hot loops). Invisible to JSON.stringify, Object.keys, spread and for…in.
const PX = Symbol('db.proxy');
const targetOf = new WeakMap(); // proxy -> raw object
const meta = new WeakMap(); // raw object -> { p: parent raw(s), c: collection state(s), d: doc state }
let probation = new Map(); // raw record -> { st, until }   |   doc state -> { until }
let wrappedFresh = false;

function colState(name) {
  let st = cols.get(name);
  if (!st) {
    st = { name, arr: null, proxy: null, dirty: new Set(), added: new Set(), full: false, inflight: null, committed: new WeakMap(), gen: 0, memVersion: 0, orderVersion: 0, orderAt: 0 };
    cols.set(name, st);
  }
  return st;
}
function docState(name) {
  let ds = docs.get(name);
  if (!ds) { ds = { name, dirty: false }; docs.set(name, ds); }
  return ds;
}
// Raw array behind a root value (collection proxy → its target).
const rawOf = (v) => (v !== null && typeof v === 'object' && targetOf.get(v)) || v;

const isPlain = (v) => {
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null || p === AP;
};

function addParent(t, parent) {
  if (!parent) return;
  const m = meta.get(t);
  if (!m) return;
  if (!m.p) m.p = parent;
  else if (m.p === parent) return;
  else if (Array.isArray(m.p)) { if (!m.p.includes(parent)) m.p.push(parent); } else m.p = [m.p, parent];
}

function proxyFor(v) {
  let p = v[PX];
  if (p === undefined || targetOf.get(p) !== v) {
    p = new Proxy(v, handler);
    Object.defineProperty(v, PX, { value: p, enumerable: false, writable: true, configurable: true });
    targetOf.set(p, v);
  }
  return p;
}
function prepChildren(v) {
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) { const c = v[i]; if (c !== null && typeof c === 'object') { const w = wrapValue(c, v); if (w !== c) v[i] = w; } }
  } else {
    for (const k of Object.keys(v)) { const c = v[k]; if (c !== null && typeof c === 'object') { const w = wrapValue(c, v); if (w !== c) v[k] = w; } }
  }
}
// Value to store inside a record/doc: plain objects/arrays become (cached) proxies, recursively.
function wrapValue(v, parent) {
  if (v === null || typeof v !== 'object') return v;
  const t = targetOf.get(v);
  if (t) { addParent(t, parent); return v; } // already tracked (shared reference)
  if (meta.has(v)) { addParent(v, parent); return proxyFor(v); } // raw object we already know
  if (!isPlain(v)) return v; // Date, Buffer, Map… stored as-is (not tracked; caught by the audit)
  meta.set(v, { p: parent || null, c: null, d: null });
  wrappedFresh = true;
  prepChildren(v);
  return proxyFor(v);
}
// Record to store in a collection: the RAW object (children wrapped), registered with the collection.
function prepRecord(v, st) {
  if (v === null || typeof v !== 'object') return v;
  const r = targetOf.get(v) || v;
  if (!meta.has(r)) {
    if (!isPlain(r)) return r;
    meta.set(r, { p: null, c: null, d: null });
    wrappedFresh = true;
    prepChildren(r);
  }
  const m = meta.get(r);
  if (!m.c) m.c = st;
  else if (m.c !== st) { if (Array.isArray(m.c)) { if (!m.c.includes(st)) m.c.push(st); } else m.c = [m.c, st]; }
  return r;
}
// What route code gets for a stored record.
const handOut = (r) => {
  if (r === null || typeof r !== 'object') return r;
  const p = r[PX];
  return p !== undefined ? p : meta.has(r) ? proxyFor(r) : r;
};

function touch(st, r, fresh) {
  if (cols.get(st.name) !== st) return; // stale state from before a reset
  st.dirty.add(r);
  if (fresh) probation.set(r, { st, until: Date.now() + PROBATION_MS });
}
function mark(t, fresh, depth = 0) {
  const m = meta.get(t);
  if (!m || depth > 64) return;
  if (m.d && docs.get(m.d.name) === m.d) { m.d.dirty = true; if (fresh) probation.set(m.d, { until: Date.now() + PROBATION_MS }); }
  if (m.c) { if (Array.isArray(m.c)) for (const st of m.c) touch(st, t, fresh); else touch(m.c, t, fresh); }
  if (m.p) { if (Array.isArray(m.p)) for (const x of m.p) mark(x, fresh, depth + 1); else mark(m.p, fresh, depth + 1); }
}

// Shared handler for record, nested-object and document proxies.
const handler = {
  set(t, k, v) {
    // `Object.assign(record, parsedJson)` with an own "__proto__" key would swap the stored record's prototype
    // (inherited role/verified flags…). Stored records stay plain: the key is dropped.
    if (k === '__proto__') return true;
    const old = t[k];
    if (old === v && (v === null || typeof v !== 'object') && k in t) return true; // no-op write
    wrappedFresh = false;
    t[k] = wrapValue(v, t);
    mark(t, wrappedFresh);
    return true;
  },
  deleteProperty(t, k) {
    if (!Object.prototype.hasOwnProperty.call(t, k)) return true;
    delete t[k];
    mark(t, false);
    return true;
  },
  defineProperty(t, k, desc) {
    wrappedFresh = false;
    if ('value' in desc) desc = { ...desc, value: wrapValue(desc.value, t) };
    const ok = Reflect.defineProperty(t, k, desc);
    mark(t, wrappedFresh);
    return ok;
  },
};

// ---------------------------------------------------------------- collections
const isIndex = (k) => { const c = k.charCodeAt(0); return c >= 48 && c <= 57 && String(k >>> 0) === k; };

function collectionProxy(st, t) {
  const live = () => cols.get(st.name) === st && st.arr === t;
  const insert = (items) => {
    for (let i = 0; i < items.length; i++) {
      wrappedFresh = false;
      const r = prepRecord(items[i], st);
      items[i] = r;
      if (live()) {
        st.added.add(r); st.dirty.add(r);
        if (wrappedFresh && r !== null && typeof r === 'object') probation.set(r, { st, until: Date.now() + PROBATION_MS });
      }
    }
    return items;
  };
  const changed = (removal) => { if (live()) { st.memVersion += 1; if (removal) st.full = true; } };
  let proxy;
  const m = Object.create(null);
  m.push = (...items) => { insert(items); changed(false); return AP.push.apply(t, items); };
  m.unshift = (...items) => { insert(items); changed(false); return AP.unshift.apply(t, items); };
  m.splice = (...args) => {
    if (args.length > 2) { const items = insert(args.slice(2)); args = [args[0], args[1], ...items]; }
    const removed = AP.splice.apply(t, args);
    if (removed.length || args.length > 2) changed(removed.length > 0);
    return removed.map(handOut);
  };
  m.pop = () => { const n = t.length; const r = t.pop(); if (t.length !== n) changed(true); return handOut(r); };
  m.shift = () => { const n = t.length; const r = t.shift(); if (t.length !== n) changed(true); return handOut(r); };
  m.sort = (cmp) => { AP.sort.call(t, cmp); changed(false); return proxy; }; // order only — records unchanged
  m.reverse = () => { t.reverse(); changed(false); return proxy; };
  m.fill = (value, ...rest) => { const [r] = insert([value]); AP.fill.call(t, r, ...rest); changed(true); return proxy; };
  m.copyWithin = (...a) => { AP.copyWithin.apply(t, a); changed(true); return proxy; };
  // Predicate scans run over the raw records (fast); results are handed out as proxies.
  m.filter = (f, self) => {
    const out = [];
    if (self === undefined) { for (let i = 0; i < t.length; i++) { const r = t[i]; if (f(r, i, proxy)) out.push(handOut(r)); } } else { for (let i = 0; i < t.length; i++) { const r = t[i]; if (f.call(self, r, i, proxy)) out.push(handOut(r)); } }
    return out;
  };
  m.find = (f, self) => { for (let i = 0; i < t.length; i++) { const r = t[i]; if (self === undefined ? f(r, i, proxy) : f.call(self, r, i, proxy)) return handOut(r); } return undefined; };
  m.findLast = (f, self) => { for (let i = t.length - 1; i >= 0; i--) { const r = t[i]; if (f.call(self, r, i, proxy)) return handOut(r); } return undefined; };
  m.findIndex = (f, self) => { for (let i = 0; i < t.length; i++) if (f.call(self, t[i], i, proxy)) return i; return -1; };
  m.findLastIndex = (f, self) => { for (let i = t.length - 1; i >= 0; i--) if (f.call(self, t[i], i, proxy)) return i; return -1; };
  m.some = (f, self) => { for (let i = 0; i < t.length; i++) if (f.call(self, t[i], i, proxy)) return true; return false; };
  m.every = (f, self) => { for (let i = 0; i < t.length; i++) if (!f.call(self, t[i], i, proxy)) return false; return true; };
  m.indexOf = (x, ...rest) => AP.indexOf.call(t, rawOf(x), ...rest);
  m.lastIndexOf = (x, ...rest) => (rest.length ? AP.lastIndexOf.call(t, rawOf(x), ...rest) : AP.lastIndexOf.call(t, rawOf(x)));
  m.includes = (x, ...rest) => AP.includes.call(t, rawOf(x), ...rest);
  // Callbacks that may mutate get proxies.
  m.forEach = (f, self) => { for (let i = 0; i < t.length; i++) { const p = handOut(t[i]); if (self === undefined) f(p, i, proxy); else f.call(self, p, i, proxy); } };
  m.map = (f, self) => { const out = new Array(t.length); for (let i = 0; i < t.length; i++) out[i] = f.call(self, handOut(t[i]), i, proxy); return out; };
  m.slice = (a, b) => { const s = t.slice(a, b); for (let i = 0; i < s.length; i++) s[i] = handOut(s[i]); return s; };
  m.at = (i) => handOut(t.at(i));
  m.values = function* values() { for (let i = 0; i < t.length; i++) yield handOut(t[i]); };
  m.entries = function* entries() { for (let i = 0; i < t.length; i++) yield [i, handOut(t[i])]; };
  m[Symbol.iterator] = m.values;

  proxy = new Proxy(t, {
    get(target, k, recv) {
      if (typeof k === 'string') {
        if (isIndex(k)) return handOut(target[k]);
        const f = m[k];
        if (f !== undefined) return f;
      } else if (k === Symbol.iterator) return m.values;
      return Reflect.get(target, k, recv);
    },
    set(target, k, v) {
      if (typeof k === 'string' && isIndex(k)) {
        const i = Number(k);
        const replace = i < target.length;
        const [r] = insert([v]);
        target[k] = r;
        changed(replace);
        return true;
      }
      if (k === 'length') {
        const shrink = v < target.length;
        target.length = v;
        if (shrink) changed(true);
        return true;
      }
      target[k] = v;
      return true;
    },
    deleteProperty(target, k) {
      if (typeof k === 'string' && isIndex(k) && k in target) changed(true);
      delete target[k];
      return true;
    },
    defineProperty(target, k, desc) {
      if (typeof k === 'string' && isIndex(k) && 'value' in desc) { proxy[k] = desc.value; return true; }
      return Reflect.defineProperty(target, k, desc);
    },
  });
  targetOf.set(proxy, t);
  return proxy;
}

function installCollection(name, value) {
  const st = colState(name);
  const t = targetOf.get(value) || value;
  for (let i = 0; i < t.length; i++) { const r = t[i]; const w = prepRecord(r, st); if (w !== r) t[i] = w; }
  st.arr = t;
  st.proxy = collectionProxy(st, t);
  return st;
}

function installDoc(name, v) {
  const ds = docState(name);
  const w = wrapValue(v, null);
  const t = targetOf.get(w);
  if (t) meta.get(t).d = ds;
  return w;
}

const rootHandler = {
  set(t, k, v) {
    if (typeof k !== 'string' || SKIP.has(k)) { t[k] = v; return true; }
    const old = t[k];
    if (old === v) return true; // same value already installed (e.g. `db.wallets = db.wallets || {}`) — not a change
    if (Array.isArray(v)) {
      const st = installCollection(k, v);
      st.full = true; st.memVersion += 1;
      t[k] = st.proxy;
    } else {
      const ds = docState(k);
      t[k] = installDoc(k, v);
      ds.dirty = true;
    }
    return true;
  },
  deleteProperty(t, k) { delete t[k]; return true; },
  defineProperty(t, k, desc) {
    if ('value' in desc && desc.enumerable !== false) { rootHandler.set(t, k, desc.value); return true; }
    return Reflect.defineProperty(t, k, desc);
  },
};

// Wrap a freshly loaded/seeded root. Collections already in `snapshot` register their records as
// committed; anything not matching the baseline forces a full diff of that collection.
function install(root) {
  cols = new Map();
  docs = new Map();
  probation = new Map();
  for (const [name, v] of Object.entries(root)) {
    if (SKIP.has(name)) continue;
    if (Array.isArray(v)) {
      const st = installCollection(name, v);
      root[name] = st.proxy;
      const snap = snapshot.get(name);
      if (!snap) { st.full = true; continue; }
      for (const r of st.arr) {
        if (r === null || typeof r !== 'object') continue;
        const k = keyOf(name, r);
        if (snap.has(k)) st.committed.set(r, { k, g: st.gen }); else st.full = true;
      }
      if (snap.size !== st.arr.length) st.full = true;
    } else {
      root[name] = installDoc(name, v);
      if (!kvSnapshot.has(`doc:${name}`)) docState(name).dirty = true;
    }
  }
  raw = root;
  db = new Proxy(root, rootHandler);
  startTimers();
  return db;
}

// ---------------------------------------------------------------- init / load
async function init() {
  adapter = createAdapter();
  const stored = await adapter.loadAll();
  const hasData = Object.keys(stored.collections).length > 0;
  if (!hasData) {
    install(require('./seed')());
    await persistAll(true);
    console.log(`[db] seeded a fresh ${adapter.kind} database${adapter.file ? ` at ${adapter.file}` : ''}`);
    return db;
  }
  const root = {};
  for (const [name, rows] of Object.entries(stored.collections)) {
    const order = stored.kv[`order:${name}`];
    const byId = new Map(rows.map((r) => [r.id, r.data]));
    const ordered = [];
    if (Array.isArray(order)) for (const id of order) if (byId.has(id)) { ordered.push(byId.get(id)); byId.delete(id); }
    ordered.push(...byId.values());
    root[name] = ordered;
    snapshot.set(name, new Map(rows.map((r) => [r.id, JSON.stringify(r.data)])));
  }
  for (const [k, v] of Object.entries(stored.kv)) {
    kvSnapshot.set(k, JSON.stringify(v));
    if (k.startsWith('doc:')) root[k.slice(4)] = v;
  }
  // Collections added to the seed after this database was created.
  const fresh = require('./seed').shape();
  for (const [k, v] of Object.entries(fresh)) if (root[k] === undefined && !SKIP.has(k)) root[k] = v;
  install(root);
  console.log(`[db] loaded ${adapter.kind} database${adapter.file ? ` (${adapter.file})` : ''}`);
  return db;
}

// ---------------------------------------------------------------- diffing
// Full diff of one collection. Records registered as committed (same key, not dirty) reuse their
// baseline JSON instead of being re-serialised.
function scanCollection(name, st, arr, dirty, upserts, deletes) {
  const prev = snapshot.get(name) || new Map();
  const next = new Map();
  const order = [];
  const recs = [];
  for (const rec of arr) {
    const k = keyOf(name, rec);
    let json;
    if (rec !== null && typeof rec === 'object' && !dirty.has(rec)) {
      const c = st.committed.get(rec);
      if (c && c.g === st.gen && c.k === k && prev.has(k)) json = prev.get(k);
    }
    if (json === undefined) json = JSON.stringify(rec);
    next.set(k, json);
    order.push(k);
    if (rec !== null && typeof rec === 'object') recs.push(rec, k);
    if (prev.get(k) !== json) (upserts[name] ||= []).push([k, json]);
  }
  for (const id of prev.keys()) if (!next.has(id)) (deletes[name] ||= []).push(id);
  return { next, order, recs };
}

// Compute the DB changes since the last *committed* baseline WITHOUT advancing it. Returns the changes
// plus commit() (call only after the write succeeded) and rollback() (re-queues the dirty state so a
// failed write is retried on the next flush).
function diff(forceOrder = false) {
  const upserts = {};
  const deletes = {};
  const kv = [];
  const collections = [];
  const commits = [];
  const rollbacks = [];
  const now = Date.now();
  let orderPendingIn = Infinity;
  const kvSet = (k, json) => { if (kvSnapshot.get(k) !== json) { kv.push([k, json]); commits.push(() => kvSnapshot.set(k, json)); } };

  for (const name of Object.keys(raw)) {
    if (SKIP.has(name)) continue;
    const value = rawOf(raw[name]);
    if (Array.isArray(value)) {
      collections.push(name);
      const st = colState(name);
      const orderDue = st.memVersion !== st.orderVersion;
      if (!st.full && !st.dirty.size && !orderDue) continue;
      // Take the pending dirty state; it is restored if the write fails.
      const dirty = st.dirty; const added = st.added; const wasFull = st.full;
      st.dirty = new Set(); st.added = new Set(); st.full = false; st.inflight = dirty;
      rollbacks.push(() => { for (const r of dirty) st.dirty.add(r); for (const r of added) st.added.add(r); if (wasFull) st.full = true; st.inflight = null; });
      const memVersion = st.memVersion;
      const snap = snapshot.get(name) || new Map();
      let full = wasFull || !snapshot.has(name);
      const changed = []; // [rec, key, json]
      if (!full) {
        const seen = new Set();
        for (const rec of dirty) {
          const isObj = rec !== null && typeof rec === 'object';
          const c = isObj ? st.committed.get(rec) : undefined;
          if (c && c.g === st.gen) {
            const k = keyOf(name, rec);
            if (k !== c.k || seen.has(k)) { full = true; break; }
            seen.add(k);
            const json = JSON.stringify(rec);
            if (snap.get(k) !== json) (upserts[name] ||= []).push([k, json]);
            changed.push(rec, k, json);
          } else if (added.has(rec)) {
            const k = keyOf(name, rec);
            if (snap.has(k) || seen.has(k)) { full = true; break; } // duplicate key → let the full diff decide
            seen.add(k);
            const json = JSON.stringify(rec);
            (upserts[name] ||= []).push([k, json]);
            changed.push(rec, k, json);
          } // else: no longer (or never) a member of this collection — ignore
        }
      }
      if (full) {
        delete upserts[name];
        const res = scanCollection(name, st, value, dirty, upserts, deletes);
        kvSet(`order:${name}`, JSON.stringify(res.order));
        commits.push(() => {
          snapshot.set(name, res.next);
          st.gen += 1;
          for (let i = 0; i < res.recs.length; i += 2) st.committed.set(res.recs[i], { k: res.recs[i + 1], g: st.gen });
          st.orderVersion = memVersion; st.orderAt = now; st.inflight = null;
        });
      } else {
        commits.push(() => {
          for (let i = 0; i < changed.length; i += 3) {
            const rec = changed[i];
            snap.set(changed[i + 1], changed[i + 2]);
            if (rec !== null && typeof rec === 'object') st.committed.set(rec, { k: changed[i + 1], g: st.gen });
          }
          if (!snapshot.has(name)) snapshot.set(name, snap);
          st.inflight = null;
        });
        if (orderDue) {
          if (forceOrder || now - st.orderAt >= ORDER_MS) {
            const ids = new Array(value.length);
            for (let i = 0; i < value.length; i++) ids[i] = keyOf(name, value[i]);
            const json = JSON.stringify(ids);
            if (kvSnapshot.get(`order:${name}`) !== json) kv.push([`order:${name}`, json]);
            commits.push(() => { kvSnapshot.set(`order:${name}`, json); st.orderVersion = memVersion; st.orderAt = now; });
          } else orderPendingIn = Math.min(orderPendingIn, st.orderAt + ORDER_MS - now);
        }
      }
    } else {
      const ds = docState(name);
      if (!ds.dirty && kvSnapshot.has(`doc:${name}`)) continue;
      ds.dirty = false;
      rollbacks.push(() => { ds.dirty = true; });
      kvSet(`doc:${name}`, JSON.stringify(value));
    }
  }
  kvSet('__collections', JSON.stringify(collections.sort()));
  const count = Object.values(upserts).reduce((s, r) => s + r.length, 0) + Object.values(deletes).reduce((s, r) => s + r.length, 0) + kv.length;
  return {
    upserts, deletes, kv, count, orderPendingIn,
    commit: () => { for (const f of commits) f(); },
    rollback: () => { for (const f of rollbacks) f(); },
  };
}

// The original O(total records) diff: serialises everything and compares with the baseline.
// Used as a safety net on close(). Returns the same shape as diff().
function fullDiff() {
  const upserts = {};
  const deletes = {};
  const kv = [];
  const collections = [];
  const nextSnapshots = new Map();
  const nextKv = new Map();
  for (const [name, value] of Object.entries(raw)) {
    if (SKIP.has(name)) continue;
    if (Array.isArray(value)) {
      collections.push(name);
      const prev = snapshot.get(name) || new Map();
      const next = new Map();
      const order = [];
      for (const rec of rawOf(value)) {
        const id = keyOf(name, rec);
        const json = JSON.stringify(rec);
        next.set(id, json);
        order.push(id);
        if (prev.get(id) !== json) (upserts[name] ||= []).push([id, json]);
      }
      for (const id of prev.keys()) if (!next.has(id)) (deletes[name] ||= []).push(id);
      nextSnapshots.set(name, next);
      const orderJson = JSON.stringify(order);
      if (kvSnapshot.get(`order:${name}`) !== orderJson) { kv.push([`order:${name}`, orderJson]); nextKv.set(`order:${name}`, orderJson); }
    } else {
      const json = JSON.stringify(value);
      if (kvSnapshot.get(`doc:${name}`) !== json) { kv.push([`doc:${name}`, json]); nextKv.set(`doc:${name}`, json); }
    }
  }
  const colJson = JSON.stringify(collections.sort());
  if (kvSnapshot.get('__collections') !== colJson) { kv.push(['__collections', colJson]); nextKv.set('__collections', colJson); }
  const count = Object.values(upserts).reduce((s, r) => s + r.length, 0) + Object.values(deletes).reduce((s, r) => s + r.length, 0) + kv.length;
  const commit = () => {
    for (const [name, map] of nextSnapshots) snapshot.set(name, map);
    for (const [k, v] of nextKv) kvSnapshot.set(k, v);
    // Re-register everything so tracking resumes from the new baseline.
    for (const name of nextSnapshots.keys()) { const st = colState(name); st.full = true; }
  };
  return { upserts, deletes, kv, count, commit, rollback: () => {} };
}

async function persistAll() {
  const changes = diff(true);
  try { await adapter.write(changes); } catch (e) { changes.rollback(); throw e; }
  changes.commit();
}

function flush(forceOrder = false) {
  clearTimeout(flushTimer);
  flushTimer = null;
  flushing = flushing.then(async () => {
    if (!raw) return;
    const changes = diff(forceOrder === true);
    if (changes.orderPendingIn !== Infinity && !orderTimer) {
      orderTimer = setTimeout(() => { orderTimer = null; flush(); }, Math.max(1, changes.orderPendingIn));
      orderTimer.unref?.();
    }
    if (!changes.count) { changes.commit(); return; }
    try {
      await adapter.write(changes); // if this throws, the baseline is NOT advanced → retried next flush
    } catch (e) { changes.rollback(); throw e; }
    changes.commit();
    retryMs = 2000;
  }).catch((e) => {
    // A transient database error must not leave changes sitting in memory until the next request
    // happens to call save() — retry on our own, backing off.
    console.error(`[db] write failed (retrying in ${retryMs / 1000} s):`, e.message);
    if (!retryTimer && !closing) {
      retryTimer = setTimeout(() => { retryTimer = null; save(); }, retryMs);
      retryTimer.unref?.();
      retryMs = Math.min(retryMs * 2, 60000);
    }
  });
  return flushing;
}

// Called after every mutation. Batches writes made in the same tick into one transaction.
function save() {
  if (!flushTimer) flushTimer = setTimeout(flush, 15);
}

// ---------------------------------------------------------------- safety nets
// Records inserted with fresh objects may still be mutated through the caller's raw reference
// (e.g. `const c = {...}; d.consults.push(c); await x; c.status = 'y'`). Re-check them for a while.
function checkProbation() {
  if (!raw || !probation.size) return;
  const now = Date.now();
  let found = 0;
  for (const [key, e] of probation) {
    if (e.until < now) probation.delete(key);
    if (e.st === undefined) { // doc
      const ds = key;
      if (ds.dirty || docs.get(ds.name) !== ds || raw[ds.name] === undefined) continue;
      if (kvSnapshot.get(`doc:${ds.name}`) !== JSON.stringify(raw[ds.name])) { ds.dirty = true; found += 1; }
      continue;
    }
    const st = e.st;
    if (cols.get(st.name) !== st || st.dirty.has(key) || st.inflight?.has(key)) continue;
    const c = st.committed.get(key);
    if (!c || c.g !== st.gen) continue;
    if (snapshot.get(st.name)?.get(c.k) !== JSON.stringify(key)) { st.dirty.add(key); found += 1; }
  }
  if (found) save();
}

// Chunked full comparison against the baseline so it never blocks the event loop for long.
async function audit() {
  if (auditRunning || !raw) return;
  auditRunning = true;
  const t0 = Date.now();
  const missed = [];
  try {
    await flushing;
    const tick = () => new Promise((r) => setImmediate(r));
    for (const name of Object.keys(raw)) {
      if (SKIP.has(name) || !raw) continue;
      const value = rawOf(raw[name]);
      if (!Array.isArray(value)) {
        const ds = docs.get(name);
        if (ds && !ds.dirty && kvSnapshot.has(`doc:${name}`) && kvSnapshot.get(`doc:${name}`) !== JSON.stringify(value)) { ds.dirty = true; missed.push(`doc:${name}`); }
        continue;
      }
      const st = cols.get(name);
      if (!st) continue;
      const startVersion = st.memVersion;
      const startGen = st.gen;
      const seen = new Set();
      let bad = 0;
      for (let i = 0; i < value.length; i += 2000) {
        if (st.full || st.inflight || cols.get(name) !== st) break;
        const snap = snapshot.get(name);
        if (!snap) break;
        const end = Math.min(value.length, i + 2000);
        for (let j = i; j < end; j++) {
          const rec = value[j];
          const k = keyOf(name, rec);
          seen.add(k);
          if (st.dirty.has(rec) || st.added.has(rec)) continue;
          if (snap.get(k) !== JSON.stringify(rec)) {
            bad += 1;
            const c = rec !== null && typeof rec === 'object' ? st.committed.get(rec) : undefined;
            if (c && c.g === st.gen && c.k === k) st.dirty.add(rec); else st.full = true;
          }
        }
        await tick();
      }
      const snap = snapshot.get(name);
      if (snap && st.memVersion === startVersion && st.gen === startGen && !st.full && !st.inflight && cols.get(name) === st) {
        if (seen.size !== snap.size) { st.full = true; bad += Math.abs(snap.size - seen.size) || 1; }
      }
      if (bad) missed.push(`${name}(${bad})`);
    }
  } catch (e) {
    console.error('[db] audit failed:', e.message);
  } finally {
    auditRunning = false;
  }
  if (missed.length) {
    console.warn(`[db] safety-net audit: change tracking missed changes in ${missed.join(', ')} — re-queued for write (${Date.now() - t0} ms)`);
    save();
  }
  return missed;
}

function startTimers() {
  if (!probationTimer) { probationTimer = setInterval(checkProbation, 1000); probationTimer.unref?.(); }
  if (!auditTimer && AUDIT_MS > 0) { auditTimer = setInterval(() => { audit(); }, AUDIT_MS); auditTimer.unref?.(); }
}
function stopTimers() {
  clearInterval(probationTimer); probationTimer = null;
  clearInterval(auditTimer); auditTimer = null;
  clearTimeout(orderTimer); orderTimer = null;
  clearTimeout(retryTimer); retryTimer = null;
}

// Runs as one step on the write chain: a request that saves during a reset must queue behind it, not
// race the DROP/CREATE TABLEs (that surfaced as "relation does not exist" / duplicate pg_type errors).
async function reset() {
  clearTimeout(retryTimer); retryTimer = null;
  const step = flushing.then(async () => {
    await adapter.wipe();
    snapshot.clear();
    kvSnapshot.clear();
    install(require('./seed')());
    await persistAll();
  });
  flushing = step.catch(() => {}); // later flushes still run if the reset failed
  await step;
  return db;
}

// Monotonic counter (never resets below the last value) + random suffix → effectively no collisions.
let counter = Date.now();
function id(prefix) {
  counter += 1;
  return `${prefix}_${counter.toString(36)}${crypto.randomBytes(3).toString('hex')}`;
}

function get() {
  if (!db) throw new Error('Database not initialised yet');
  return db;
}

// Idempotent: SIGINT and SIGTERM can both arrive, and pool.end() throws if called twice.
function close() {
  return (closing ||= (async () => {
    stopTimers();
    await flush(true);
    if (raw && adapter) {
      // Final safety net: the original full diff. Anything it finds is a change tracking missed.
      try {
        const changes = fullDiff();
        if (changes.count) {
          const where = [...Object.keys(changes.upserts), ...Object.keys(changes.deletes), ...changes.kv.map(([k]) => k)];
          console.warn(`[db] safety net on close: change tracking missed ${changes.count} change(s) in ${[...new Set(where)].join(', ')} — writing them now`);
          await adapter.write(changes);
          changes.commit();
        }
      } catch (e) {
        console.error('[db] final write failed:', e.message);
      }
    }
    await adapter?.close();
  })());
}

module.exports = { init, save, flush, reset, get, id, close, adapter: () => adapter };
