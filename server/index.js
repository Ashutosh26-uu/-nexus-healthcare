require('dotenv').config({ path: require('path').join(__dirname, '.env'), quiet: true });
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const store = require('./db');
const engines = require('./engines');
const { handleChat, aiEnabled } = require('./chat');
const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');
const multer = require('multer');
const compression = require('compression');
const otp = require('./otp');
const i18n = require('./i18n');
const security = require('./security');
const innovations = require('./innovations');
const { availabilityOf, isEClinicDoctor, timingsOf, DAYS: WEEK_DAYS } = require('./availability');
const catalog = require('./catalog');
const payments = require('./payments');
const geo = require('./geo');
const automation = require('./automation');

const { OtpError, normalizePhone, samePhone } = otp;

// Zoho Catalyst AppSail tells the app which port to listen on via X_ZOHO_CATALYST_LISTEN_PORT.
const ON_CATALYST = Boolean(process.env.X_ZOHO_CATALYST_LISTEN_PORT);
// Render (and similar PaaS) disks are also wiped on every deploy/restart.
const EPHEMERAL_DISK = ON_CATALYST || Boolean(process.env.RENDER);
const PORT = process.env.X_ZOHO_CATALYST_LISTEN_PORT || process.env.PORT || 4000;
// AppSail's disk is temporary: a SQLite file would be wiped on every redeploy/restart. Refuse to run a
// production Catalyst instance without an external PostgreSQL (DATABASE_URL).
if (EPHEMERAL_DISK && process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL) {
  console.error('[boot] This host has a temporary disk and DATABASE_URL is not set — data would be lost on restart. Set DATABASE_URL to a PostgreSQL database.');
  process.exit(1);
}
security.checkSecrets();
// Production requires a strong secret (checkSecrets exits otherwise). In dev, if none is set we
// use a random per-process secret rather than a public constant — tokens can't be forged, they
// just don't survive a restart.
const JWT_SECRET = process.env.JWT_SECRET || security.randomSecret();

const app = express();
// Number of proxies in front of the app (Catalyst / Caddy / a load balancer = 1). Wrong values let clients spoof their IP past rate limits.
app.set('trust proxy', process.env.TRUST_PROXY !== undefined ? (/^\d+$/.test(process.env.TRUST_PROXY) ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY === 'true') : 1);
app.disable('x-powered-by');
app.use(security.securityHeaders);
app.use(cors(security.corsOptions()));
// gzip everything except the live event stream (compression would buffer SSE).
app.use(compression({ filter: (req, res) => (req.path === '/api/events' ? false : compression.filter(req, res)) }));
app.use(express.json({ limit: '2mb' }));
// Per-request context: who acted and whom the request touched (scopes live-update fan-out).
app.use((req, _res, next) => requestCtx.run({ affected: new Set(), userId: null }, next));

// Throttle credential and code endpoints against brute force (OTP has its own per-target limits too).
const loginLimiter = security.rateLimit({ windowMs: 15 * 60000, max: 10, key: (r) => String(r.body?.identifier ?? '').slice(0, 160).toLowerCase(), message: 'Too many sign-in attempts. Please wait a few minutes and try again.' });
const otpLimiter = security.rateLimit({ windowMs: 60 * 60000, max: 20, message: 'Too many code requests. Please wait a while and try again.' });
// Defence in depth on code checks (otp.js also caps wrong attempts per code): per ip + target / patient.
const otpVerifyLimiter = security.rateLimit({ windowMs: 15 * 60000, max: 20, key: (r) => String(r.body?.target ?? r.body?.patientId ?? '').slice(0, 160).toLowerCase(), message: 'Too many attempts. Please wait a few minutes and request a new code.' });

// ---------- helpers ----------
const db = () => store.get();
const nowIso = () => new Date().toISOString();
const APP_TZ = process.env.APP_TZ || 'Asia/Kolkata';
const istDay = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: APP_TZ }); // YYYY-MM-DD in the network's time zone
const ageOf = (dob) => (dob ? Math.floor((Date.now() - new Date(dob)) / (365.25 * 86400000)) : null);
const publicUser = ({ passwordHash, ...u }) => u;

function sign(user) {
  return jwt.sign({ sub: user.id, role: user.role, tv: user.tokenVersion || 0 }, JWT_SECRET, { expiresIn: '7d' });
}

const UNVERIFIED_DOCTOR_PATHS = ['/api/auth/', '/api/doctor/home', '/api/doctor/me', '/api/doctor/profile', '/api/doctor/medicines', '/api/files', '/api/notifications', '/api/events', '/api/i18n', '/api/drugs', '/api/geo/'];
const UNVERIFIED_PHARMACY_PATHS = ['/api/auth/', '/api/pharmacy/home', '/api/pharmacy/profile', '/api/files', '/api/notifications', '/api/events', '/api/i18n', '/api/geo/'];

// Every authenticated request looks its user up — keep an id index instead of scanning the array.
const userIndex = { arr: null, len: -1, map: new Map() };
function userById(id) {
  const users = db().users;
  const rebuild = () => { userIndex.arr = users; userIndex.len = users.length; userIndex.map = new Map(users.map((u) => [u.id, u])); };
  if (userIndex.arr !== users || userIndex.len !== users.length) rebuild();
  let u = userIndex.map.get(id);
  if (!u || u.id !== id) { rebuild(); u = userIndex.map.get(id); }
  return u || null;
}

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  // Bearer header only. EventSource (SSE) can't set headers, so it uses a single-use ticket instead
  // (see /api/events/ticket) — a JWT never travels in a URL, where proxies and access logs keep it.
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Please sign in to continue.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = userById(payload.sub);
    if (!user) return res.status(401).json({ error: 'Account not found.' });
    if (user.status === 'suspended') return res.status(403).json({ error: 'This account is suspended. Contact support.' });
    if ((payload.tv || 0) !== (user.tokenVersion || 0)) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    req.user = user;
    const ctx = requestCtx.getStore();
    if (ctx) ctx.userId = user.id;
    // A doctor who signed up but isn't verified yet can finish onboarding — nothing clinical.
    // A staff account whose doctor / facility record is missing can't use its portal (avoids crashes).
    const needsFacility = ['pharmacist', 'kiosk_operator', 'lab_tech', 'hospital_admin', 'distributor'].includes(user.role);
    if (!req.path.startsWith('/api/auth/') && !req.path.startsWith('/api/events') && !req.path.startsWith('/api/notifications') && !req.path.startsWith('/api/i18n')
      && ((user.role === 'doctor' && !doctorFor(user)) || (needsFacility && !db().facilities.some((f) => f.id === user.facilityId)))) {
      return res.status(409).json({ error: 'Your account isn\'t linked to a doctor profile or facility yet. Please contact the Nexus Healthcare team.' });
    }
    // Exact prefix match on path segments, and only uploads (not downloads) of files.
    if (user.role === 'doctor' && !doctorFor(user)?.verified) {
      const allowed = UNVERIFIED_DOCTOR_PATHS.some((p) => req.path === p.replace(/\/$/, '') || req.path.startsWith(p.endsWith('/') ? p : `${p}/`) || req.path === p);
      const fileRead = req.path.startsWith('/api/files') && req.method !== 'POST';
      if (!allowed || fileRead) return res.status(403).json({ error: 'Please complete your profile. You can see patients once our team verifies you.' });
    }
    // Same for a chemist who signed up: only the store profile until the licence is checked.
    if (user.role === 'pharmacist' && !UNVERIFIED_PHARMACY_PATHS.some((p) => req.path.startsWith(p))) {
      const f = db().facilities.find((x) => x.id === user.facilityId);
      if (f && !f.verified) return res.status(403).json({ error: 'Please complete your store profile. Orders unlock once our team verifies your licence.' });
    }
    next();
  } catch {
    res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  }
}

function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.slice(7), JWT_SECRET);
      const u = userById(payload.sub);
      if (u && u.status !== 'suspended' && (payload.tv || 0) === (u.tokenVersion || 0)) req.user = u;
    } catch { /* anonymous */ }
  }
  next();
}

const role = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'You don\'t have access to this section.' });

// Live updates — every portal subscribes and refetches when its topics change.
// At scale, telling every connected screen about every change makes thousands of clients refetch at
// once. So each request collects the people it touched (the actor + everyone it notifies); personal
// portals (patients, doctors, chemists, labs, hospitals, riders) only hear about changes that involve
// them, while small ops audiences (admins, officials, kiosks, distributors) still get every topic.
// Bursts are coalesced into one message per client every 250 ms.
const sseClients = new Set(); // { res, userId, role, pending: Set }
const sseByUser = new Map(); // userId → that person's connections (personal portals are addressed by whom a request touched)
const sseOps = new Set(); // admins, officials, kiosks, distributors… hear every topic
const sseDirty = new Set(); // connections with something to send at the next flush
const PERSONAL_ROLES = new Set(['patient', 'caregiver', 'doctor', 'pharmacist', 'lab_tech', 'hospital_admin', 'delivery']);
const PUBLIC_TOPICS = new Set(['all', 'advisories']);
const requestCtx = new AsyncLocalStorage();
let sseTimer = null;
function touch(...userIds) { const s = requestCtx.getStore(); if (s) userIds.flat().forEach((u) => u && s.affected.add(u)); }
function queueTopics(c, list) { if (!list.length) return; list.forEach((t) => c.pending.add(t)); sseDirty.add(c); }
function broadcast(...topics) {
  const ctx = requestCtx.getStore();
  const audience = ctx ? new Set([...ctx.affected, ctx.userId].filter(Boolean)) : null; // null → everyone (timers, resets)
  const pub = topics.filter((t) => PUBLIC_TOPICS.has(t));
  if (!audience || pub.length) {
    for (const c of sseClients) queueTopics(c, !audience || !PERSONAL_ROLES.has(c.role) || audience.has(c.userId) ? topics : pub);
  } else {
    // The usual case: only the people this request touched plus the ops audiences — not a walk over every connection.
    for (const c of sseOps) queueTopics(c, topics);
    for (const uid of audience) for (const c of sseByUser.get(uid) || []) queueTopics(c, topics);
  }
  if (sseDirty.size && !sseTimer) sseTimer = setTimeout(flushSse, 250);
}
function flushSse() {
  sseTimer = null;
  const at = Date.now();
  for (const c of sseDirty) {
    if (c.pending.size && !c.res.destroyed) c.res.write(`data: ${JSON.stringify({ topics: [...c.pending], at })}\n\n`);
    c.pending.clear();
  }
  sseDirty.clear();
}

function audit(user, action, patientId, recordType, reason) {
  db().audit.unshift({ id: store.id('aud'), actorId: user.id, actorName: user.name, role: user.role, action, patientId, recordType, reason, at: nowIso() });
}

// Newest-first list, so stop as soon as we have enough — no full scan of every notification.
function notificationsFor(userId, limit) {
  const out = [];
  for (const n of db().notifications) { if (n.userId === userId) { out.push(n); if (out.length >= limit) break; } }
  return out;
}

// Each person keeps their newest 200 notifications (screens show 30). Per-user counts are built lazily once
// (and again after a reset/prune); a user's list is only scanned when it passes 220, then trimmed to 200.
const NOTIF_PER_USER = 200;
const NOTIF_TRIM_AT = 220;
const notifCounts = { list: null, map: new Map() };
function notify(userId, title, body, kind) {
  if (!userId) return;
  touch(userId);
  const list = db().notifications;
  list.unshift({ id: store.id('n'), userId, title, body, kind, at: nowIso(), read: false });
  if (notifCounts.list !== list) {
    notifCounts.list = list; notifCounts.map = new Map();
    for (const n of list) notifCounts.map.set(n.userId, (notifCounts.map.get(n.userId) || 0) + 1);
  } else notifCounts.map.set(userId, (notifCounts.map.get(userId) || 0) + 1);
  if (notifCounts.map.get(userId) <= NOTIF_TRIM_AT) return;
  const drop = [];
  let seen = 0;
  for (let i = 0; i < list.length; i++) if (list[i].userId === userId && ++seen > NOTIF_PER_USER) drop.push(i);
  for (let j = drop.length - 1; j >= 0; j--) list.splice(drop[j], 1); // newest-first list → these are that user's oldest
  notifCounts.map.set(userId, Math.min(seen, NOTIF_PER_USER));
}

function patientOwnerUserIds(patient) {
  return [patient.userId, patient.guardianUserId].filter(Boolean);
}

// Who may see/act on a consult: the patient (or their guardian), the treating doctor,
// the kiosk operator running it, or an admin. Everyone else is denied.
function canAccessConsult(user, c) {
  if (!c) return false;
  if (user.role === 'super_admin') return true;
  if (user.role === 'doctor') return doctorFor(user)?.id === c.doctorId;
  if (user.role === 'kiosk_operator') return user.facilityId && c.kioskId === user.facilityId;
  const p = db().patients.find((x) => x.id === c.patientId);
  return Boolean(p && patientOwnerUserIds(p).includes(user.id));
}

// Everyone whose screen shows this consult — the doctor and the patient (or guardian). Personal portals
// only hear about people a request touched, so a message or cancellation from one side must touch the other.
function touchConsultParties(c) {
  const p = db().patients.find((x) => x.id === c.patientId);
  touch(db().doctors.find((x) => x.id === c.doctorId)?.userId, p ? patientOwnerUserIds(p) : []);
}

// Patient-side: does this user own the patient record behind a prescription / consult / lab order?
function ownsPatient(user, patientId) {
  const p = db().patients.find((x) => x.id === patientId);
  return Boolean(p && patientOwnerUserIds(p).includes(user.id));
}

function profilesFor(user) {
  return db().patients.filter((p) => p.userId === user.id || p.guardianUserId === user.id);
}

// Which patient profile is the patient-app user acting as? (family switching)
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; this.expose = true; } }
function activePatient(req, { optional = false } = {}) {
  const profiles = profilesFor(req.user);
  const wanted = req.headers['x-profile'];
  const p = profiles.find((x) => x.id === wanted) || profiles.find((x) => x.userId === req.user.id) || profiles[0];
  // Routes assume a profile exists; an account without one gets a clear 404 instead of a crash.
  if (!p && !optional) throw new HttpError(404, 'No health profile on this account yet. Please create one first.');
  return p;
}

const doctorFor = (user) => db().doctors.find((d) => d.userId === user.id);
// A clinic owner also handles bookings for doctors they listed who don't have their own login yet.
function handledDoctorIds(user) {
  const doc = doctorFor(user);
  if (!doc) return [];
  if (!doc.ownsFacilityId) return [doc.id];
  return [doc.id, ...db().doctors.filter((x) => x.facilityId === doc.ownsFacilityId && !x.userId && x.id !== doc.id).map((x) => x.id)];
}
// Doctor as shown to others: live availability attached, `online` mirrors it so older screens keep working.
function withAvail(doc) {
  const availability = availabilityOf(doc, { facilities: db().facilities });
  const aff = doc.facilityId ? db().facilities.find((f) => f.id === doc.facilityId) : null;
  return {
    ...doc, online: availability.available, availability, timings: timingsOf(doc),
    eClinicPartner: isEClinicDoctor(doc),
    affiliation: isEClinicDoctor(doc) ? 'Nexus Healthcare E-Clinics' : aff?.verified ? aff.name : null,
  };
}
// What anyone signed in may see about a doctor — an explicit allowlist, never the whole record
// (no account id, invite email/phone, home address, earnings, KYC or private medicine list).
const PUBLIC_DOCTOR_FIELDS = ['id', 'name', 'specialty', 'qualification', 'regNo', 'languages', 'verified', 'district', 'state', 'country', 'rating',
  'consultsDone', 'fee', 'maxPerHour', 'experience', 'patientsLifetime', 'facilityId', 'photoFileId', 'engagement', 'eClinicIds', 'presenceClinicId', 'virtualUntil', 'slots', 'tz'];
function publicDoctor(doc) {
  const full = withAvail(doc);
  const out = Object.fromEntries(PUBLIC_DOCTOR_FIELDS.filter((k) => full[k] !== undefined).map((k) => [k, full[k]]));
  return { ...out, online: full.online, availability: full.availability, timings: full.timings, eClinicPartner: full.eClinicPartner, affiliation: full.affiliation };
}
const facilityName = (id) => db().facilities.find((f) => f.id === id)?.name;

// `visitSecret` seeds the rotating visit-pass code — it never leaves the server.
function enrichConsult({ visitSecret: _secret, ...c }) {
  const p = db().patients.find((x) => x.id === c.patientId) || {};
  const d = db().doctors.find((x) => x.id === c.doctorId) || {};
  return {
    ...c,
    patientName: p.name, patientAge: ageOf(p.dob), patientGender: p.gender, patientLanguage: p.language,
    doctorName: d.name, doctorSpecialty: d.specialty, doctorLanguages: d.languages,
    kioskName: c.kioskId ? facilityName(c.kioskId) : null,
  };
}

function enrichRx(r) {
  const p = db().patients.find((x) => x.id === r.patientId) || {};
  const d = db().doctors.find((x) => x.id === r.doctorId) || {};
  return { ...r, patientName: p.name, patientPhone: db().users.find((u) => u.id === p.userId)?.phone, doctorName: d.name, pharmacyName: facilityName(r.pharmacyId) };
}

function enrichLab(o) {
  const p = db().patients.find((x) => x.id === o.patientId) || {};
  const d = db().doctors.find((x) => x.id === o.doctorId) || {};
  return { ...o, patientName: p.name, patientAge: ageOf(p.dob), patientGender: p.gender, doctorName: d.name, labName: facilityName(o.labId), reportFileId: o.reportFileId || null, reportFileUrl: o.reportFileId ? `/api/files/${o.reportFileId}` : null };
}

const CONSENT_SCOPES = ['history', 'prescriptions', 'labs', 'allergies', 'uploads'];
function hasConsent(patientId, granteeIds) {
  const t = Date.now();
  return db().consents.some((c) => c.patientId === patientId && granteeIds.includes(c.granteeId) && c.status === 'active' && (!c.expiry || new Date(c.expiry) > t));
}

// Runs from the 5-minute sweeper, not per request. Access checks never rely on this flag (hasConsent checks
// the expiry itself) — it only keeps the status shown on screens tidy.
function expireConsents() {
  const t = Date.now();
  let n = 0;
  for (const c of db().consents) if (c.status === 'active' && c.expiry && Date.parse(c.expiry) < t) { c.status = 'expired'; n += 1; }
  if (n) store.save();
  return n;
}

function makePassportId() {
  let id;
  do { id = `OC-${2000 + Math.floor(Math.random() * 999)}-${Math.floor(1000 + Math.random() * 8999)}`; } while (db().patients.some((p) => p.id === id));
  return id;
}

// ---------- system ----------
app.get('/api/health', (_req, res) => res.json({ ok: true, ai: aiEnabled(), time: nowIso() }));

// SSE tickets: random, single use, valid 60 s, bound to the user and their token version at issue time.
const SSE_TICKET_TTL_MS = 60000;
const SSE_TICKET_MAX = 5000;
const sseTickets = new Map(); // ticket → { userId, role, tv, profile, expiresAt }
function pruneSseTickets() {
  const now = Date.now();
  for (const [k, t] of sseTickets) if (t.expiresAt <= now) sseTickets.delete(k);
  // Still full (a burst of sign-ins, or someone hammering): drop the oldest — insertion order.
  for (const k of sseTickets.keys()) { if (sseTickets.size < SSE_TICKET_MAX) break; sseTickets.delete(k); }
}
const ticketLimiter = security.rateLimit({ windowMs: 60000, max: 60, key: (r) => r.headers.authorization || '', message: 'Reconnecting too often. Please wait a moment.' });
app.post('/api/events/ticket', auth, ticketLimiter, (req, res) => {
  pruneSseTickets();
  const ticket = crypto.randomBytes(24).toString('hex');
  sseTickets.set(ticket, { userId: req.user.id, role: req.user.role, tv: req.user.tokenVersion || 0, profile: clean(req.headers['x-profile'], 40) || null, expiresAt: Date.now() + SSE_TICKET_TTL_MS });
  res.json({ ticket, expiresIn: SSE_TICKET_TTL_MS / 1000 });
});
// The stream accepts a Bearer header (non-browser clients) or a ticket — never ?token=.
function sseAuth(req, res, next) {
  if ((req.headers.authorization || '').startsWith('Bearer ')) return auth(req, res, next);
  const key = typeof req.query.ticket === 'string' ? req.query.ticket : '';
  const t = key && sseTickets.get(key);
  if (t) sseTickets.delete(key); // single use, even if it turns out to be expired
  if (!t || t.expiresAt <= Date.now()) return res.status(401).json({ error: 'Please sign in to continue.' });
  const user = userById(t.userId);
  if (!user) return res.status(401).json({ error: 'Account not found.' });
  if (user.status === 'suspended') return res.status(403).json({ error: 'This account is suspended. Contact support.' });
  if (t.tv !== (user.tokenVersion || 0)) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  req.user = user;
  const ctx = requestCtx.getStore();
  if (ctx) ctx.userId = user.id;
  next();
}

app.get('/api/events', sseAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  res.write(`data: ${JSON.stringify({ topics: ['hello'] })}\n\n`);
  const client = { res, userId: req.user.id, role: req.user.role, pending: new Set() };
  sseClients.add(client);
  if (PERSONAL_ROLES.has(client.role)) { if (!sseByUser.has(client.userId)) sseByUser.set(client.userId, new Set()); sseByUser.get(client.userId).add(client); } else sseOps.add(client);
  const ping = setInterval(() => { if (!res.destroyed) res.write(': ping\n\n'); }, 25000);
  req.on('close', () => {
    clearInterval(ping); sseClients.delete(client); sseDirty.delete(client); sseOps.delete(client);
    const mine = sseByUser.get(client.userId); if (mine) { mine.delete(client); if (!mine.size) sseByUser.delete(client.userId); }
  });
});

const DATA_MODE = require('./seed').dataMode();
// What the client needs to know about this deployment (no secrets).
app.get('/api/public/config', (_req, res) => {
  const o = otp.publicConfig();
  res.json({ appName: 'Nexus Healthcare', demo: DATA_MODE === 'demo', smsLive: o.live, emailLive: o.emailLive, version: require('../package.json').version });
});

app.get('/api/public/stats', (_req, res) => {
  const d = db();
  if (DATA_MODE === 'live') {
    // A real network shows real numbers only.
    return res.json({
      doctorsOnline: d.doctors.filter((x) => x.verified && withAvail(x).online).length,
      kiosks: d.facilities.filter((f) => f.type === 'kiosk' && f.verified).length,
      passports: d.patients.length,
      states: new Set(d.facilities.map((f) => f.state).filter(Boolean)).size,
      languages: i18n.LANGUAGES.length,
    });
  }
  res.json({
    doctorsOnline: d.doctors.filter((x) => x.online).length + d.regions.reduce((s, r) => s + r.doctorsOnline, 0),
    kiosks: d.regions.reduce((s, r) => s + r.kiosks, 0),
    passports: 48210 + d.patients.length,
    states: d.regions.length,
    languages: i18n.LANGUAGES.length,
  });
});

// ---------- languages ----------
app.get('/api/i18n/languages', async (_req, res) => res.json(await i18n.stats()));
app.get('/api/i18n/dict/:lang', async (req, res) => {
  if (!i18n.langInfo(req.params.lang)) return res.status(404).json({ error: 'Language not supported.' });
  res.set('Cache-Control', 'no-cache');
  res.json(await i18n.dictionary(req.params.lang));
});
app.put('/api/admin/i18n/:lang', auth, role('super_admin'), async (req, res) => {
  const { source, text } = req.body || {};
  if (typeof source !== 'string' || typeof text !== 'string' || !source.trim() || !text.trim()) return res.status(400).json({ error: 'Source and translation are required.' });
  await i18n.setHuman(req.params.lang, source, text);
  audit(req.user, 'translation_edited', null, 'i18n', `${req.params.lang}: ${source.slice(0, 60)}`);
  store.save();
  res.json({ ok: true });
});

// ---------- file storage (reports, prescriptions, photos) ----------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(process.env.MAX_UPLOAD_MB || 10) * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^(image\/(png|jpe?g|webp|heic)|application\/pdf)$/.test(file.mimetype)),
});

// Verify the bytes match the claimed type (magic numbers), not just the client-sent MIME.
function sniffType(buf, mime) {
  if (!buf || buf.length < 4) return false;
  const h = buf.subarray(0, 12);
  const pdf = h[0] === 0x25 && h[1] === 0x50 && h[2] === 0x44 && h[3] === 0x46; // %PDF
  const png = h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4e && h[3] === 0x47;
  const jpg = h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff;
  const webp = h[0] === 0x52 && h[1] === 0x49 && h[2] === 0x46 && h[3] === 0x46 && h[8] === 0x57 && h[9] === 0x45 && h[10] === 0x42 && h[11] === 0x50;
  const heic = h[4] === 0x66 && h[5] === 0x74 && h[6] === 0x79 && h[7] === 0x70; // ....ftyp
  if (mime === 'application/pdf') return pdf;
  if (mime === 'image/png') return png;
  if (mime === 'image/jpeg') return jpg;
  if (mime === 'image/webp') return webp;
  if (mime === 'image/heic') return heic;
  return false;
}

function canSeeFile(user, f) {
  if (user.role === 'super_admin') return true;
  // A photo of a paper prescription attached to a digital one: the patient and the chosen chemist may see it.
  const rx = db().prescriptions.find((r) => r.paperFileId === f.id);
  if (rx && (ownsPatient(user, rx.patientId) || (user.role === 'pharmacist' && rx.pharmacyId === user.facilityId))) return true;
  // A prescription photo attached to a medicine order: the chemist handling (or offered) it may see it.
  if (user.role === 'pharmacist' && db().medOrders.some((o) => o.rxFileId === f.id && o.pharmacyId === user.facilityId)) return true;
  // The signed report PDF of a lab order: the patient, the ordering doctor and the lab that did it (same rule as GET /api/lab-orders/:id).
  const lo = db().labOrders.find((o) => o.reportFileId === f.id);
  if (lo && (ownsPatient(user, lo.patientId) || (user.role === 'doctor' && doctorFor(user)?.id === lo.doctorId) || (user.role === 'lab_tech' && lo.labId === user.facilityId))) return true;
  // A verified store's / clinic's / doctor's public photo is visible to anyone signed in.
  if (db().facilities.some((x) => x.verified && x.storePhotoFileId === f.id) || db().doctors.some((x) => x.verified && x.photoFileId === f.id)) return true;
  // A file with no patient owner (e.g. a doctor's scratch upload) is private to its uploader.
  if (!f.ownerPatientId) return f.uploadedBy === user.id;
  const p = db().patients.find((x) => x.id === f.ownerPatientId);
  if (!p) return false;
  if (patientOwnerUserIds(p).includes(user.id)) return true;
  if (f.uploadedBy === user.id) return true;
  if (user.role === 'doctor') return hasConsent(p.id, [doctorFor(user)?.id]);
  // A lab tech may see a patient's files only if that patient has an order at the tech's lab.
  if (user.role === 'lab_tech') return db().labOrders.some((o) => o.labId === user.facilityId && o.sharedRx && db().prescriptions.find((r) => r.id === o.sharedRx)?.paperFileId === f.id);
  return false;
}

app.post('/api/files', auth, role('patient', 'caregiver', 'lab_tech', 'doctor', 'pharmacist', 'hospital_admin'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Please attach a PDF or photo (PNG, JPG, WEBP) up to 10 MB.' });
  if (!sniffType(req.file.buffer, req.file.mimetype)) return res.status(415).json({ error: 'That file does not look like a real PDF or image. Please upload a valid file.' });
  let patientId = ['patient', 'caregiver'].includes(req.user.role) ? activePatient(req)?.id : null;
  const asked = req.body?.patientId;
  if (asked && req.user.role === 'doctor' && hasConsent(asked, [doctorFor(req.user)?.id])) patientId = asked;
  if (asked && req.user.role === 'lab_tech' && db().labOrders.some((o) => o.patientId === asked && o.labId === req.user.facilityId)) patientId = asked;
  const f = { id: store.id('file'), ownerPatientId: patientId, uploadedBy: req.user.id, name: req.file.originalname.slice(0, 160), mime: req.file.mimetype, size: req.file.size, data: req.file.buffer };
  await store.adapter().filePut(f);
  audit(req.user, 'uploaded_file', patientId, 'file', f.name);
  store.save();
  res.json({ id: f.id, name: f.name, mime: f.mime, size: f.size, url: `/api/files/${f.id}` });
});

app.get('/api/files/:id', auth, async (req, res) => {
  const f = await store.adapter().fileGet(req.params.id);
  if (!f) return res.status(404).json({ error: 'File not found.' });
  if (!canSeeFile(req.user, f)) return res.status(403).json({ error: 'You don\'t have access to this file.' });
  res.set('Content-Type', f.mime);
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Content-Security-Policy', "default-src 'none'; sandbox; style-src 'unsafe-inline'");
  // Images render inline; anything else downloads, so a stray file can't execute in our origin.
  res.set('Content-Disposition', `${f.mime.startsWith('image/') ? 'inline' : 'attachment'}; filename="${encodeURIComponent(f.name)}"`);
  res.send(f.data);
});

const chatLimiter = security.rateLimit({ windowMs: 10 * 60000, max: 40, message: 'You\'re sending messages very fast. Please wait a few minutes.' });
app.post('/api/chat', chatLimiter, optionalAuth, (req, res) => {
  const msgs = req.body?.messages;
  if (!Array.isArray(msgs) || !msgs.length) return res.status(400).json({ error: 'Please type a message.' });
  req.body.messages = msgs.slice(-12).map((m) => ({ role: m?.role === 'assistant' ? 'assistant' : 'user', content: String(m?.content ?? '').slice(0, 2000) }));
  let ctx = null;
  if (req.user) {
    const patient = profilesFor(req.user).find((p) => p.userId === req.user.id) || profilesFor(req.user)[0];
    ctx = { user: req.user, patient };
    if (patient) {
      ctx.upcoming = db().consults.filter((c) => c.patientId === patient.id && c.status === 'scheduled').map(enrichConsult);
      ctx.prescriptions = db().prescriptions.filter((r) => r.patientId === patient.id).slice(0, 3);
    }
  }
  handleChat(req, res, ctx);
});

app.post('/api/dev/reset', auth, role('super_admin'), async (_req, res) => {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_RESET !== 'true') return res.status(403).json({ error: 'Reset is disabled in production.' });
  await store.reset();
  broadcast('all');
  res.json({ ok: true });
});

// ---------- auth ----------
const findUserByPhone = (phone) => db().users.find((u) => u.phone && samePhone(u.phone, phone));
const findUserByEmail = (email) => db().users.find((u) => u.email && u.email.toLowerCase() === String(email).toLowerCase());

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const { identifier, password, dialCode } = req.body || {};
  const id = clean(identifier, 160);
  const user = id.includes('@') ? findUserByEmail(id) : findUserByPhone(normalizePhone(id, dialCode));
  if (!user || typeof password !== 'string' || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'That email/phone and password don\'t match. Please try again.' });
  }
  if (user.status === 'suspended') return res.status(403).json({ error: 'This account is suspended. Contact support.' });
  if (user.status === 'pending') return res.status(403).json({ error: 'Your account is awaiting verification by our team. We\'ll notify you within 24 hours.' });
  user.lastLoginAt = nowIso();
  store.save();
  res.json({ token: sign(user), user: publicUser(user) });
});

app.get('/api/auth/otp/config', (_req, res) => res.json(otp.publicConfig()));

app.post('/api/auth/otp/request', otpLimiter, async (req, res) => {
  const { phone, dialCode, email, channel = 'sms', lang } = req.body || {};
  try {
    const sent = await otp.sendCode({ phone, dialCode, email, channel, lang, ip: req.ip });
    // Deliberately do NOT reveal whether the number/email is registered (account-existence oracle).
    res.json({ ok: true, ...sent, message: `We sent a 6-digit code to ${sent.masked}` });
  } catch (e) {
    if (e instanceof OtpError) return res.status(e.status).json({ error: e.message, retryAfter: e.retryAfter });
    throw e;
  }
});

app.post('/api/auth/otp/verify', otpVerifyLimiter, async (req, res) => {
  const { target, code } = req.body || {};
  try {
    const ok = await otp.verifyCode({ target, code });
    const user = ok.channel === 'email' ? findUserByEmail(ok.target) : findUserByPhone(ok.target);
    if (user) {
      // One-time codes are a patient convenience. Staff/clinical/admin roles must use
      // email + password (and MFA in production), so a leaked phone can't become a staff login.
      if (!['patient', 'caregiver'].includes(user.role)) return res.status(403).json({ error: 'Staff accounts sign in with email and password, not a one-time code.' });
      if (user.status === 'suspended') return res.status(403).json({ error: 'This account is suspended. Contact support.' });
      if (user.phone && ok.channel !== 'email') user.phoneVerifiedAt = nowIso();
      user.lastLoginAt = nowIso();
      store.save();
      return res.json({ token: sign(user), user: publicUser(user) });
    }
    // New person — a short-lived ticket proves they own this number/email while they fill in the passport.
    const ticket = jwt.sign({ [ok.channel === 'email' ? 'email' : 'phone']: ok.target, purpose: 'signup' }, JWT_SECRET, { expiresIn: '30m' });
    res.json({ newUser: true, ticket, target: ok.target, channel: ok.channel });
  } catch (e) {
    if (e instanceof OtpError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
});

const registerLimiter = security.rateLimit({ windowMs: 60 * 60000, max: 20, message: 'Too many sign-ups from this network. Please try again later.' });
app.post('/api/auth/register', registerLimiter, async (req, res) => {
  const { ticket, name, email, password, dob, gender, language, bloodGroup, allergies, conditions, emergencyName, emergencyPhone, emergencyRelation, abha, pincode, district, state, country } = req.body || {};
  let verified;
  try {
    verified = jwt.verify(ticket, JWT_SECRET);
    if (verified.purpose !== 'signup') throw new Error();
  } catch {
    return res.status(400).json({ error: 'Your verification expired. Please verify your mobile number again.' });
  }
  const cleanName = clean(name, 80);
  const dobT = Date.parse(dob);
  if (cleanName.length < 2 || !Number.isFinite(dobT) || dobT > Date.now() || dobT < Date.parse('1900-01-01')) return res.status(400).json({ error: 'Name and date of birth are required.' });
  if (password && (typeof password !== 'string' || password.length < 8)) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  const d = db();
  const phone = verified.phone || null;
  const loginEmail = verified.email || (email ? String(email).trim().toLowerCase() : null);
  if (phone && findUserByPhone(phone)) return res.status(409).json({ error: 'An account with this number already exists.' });
  if (loginEmail && findUserByEmail(loginEmail)) return res.status(409).json({ error: 'This email is already registered.' });
  // NOTE: we deliberately do NOT auto-claim an existing unclaimed profile by name+DOB — that
  // would let anyone who knows a person's name and birth date take over their records. Linking a
  // kiosk-registered passport to an account must go through a verified claim flow (OTP to the
  // number on record), so self-service signup always creates a fresh profile.
  const dup = null;
  const ctry = /^[A-Z]{2}$/.test(String(country || '').toUpperCase()) ? String(country).toUpperCase() : 'IN';
  const user = {
    id: store.id('u'), name: cleanName, email: loginEmail || `${(phone || '').replace('+', '')}@patient.omnicare.in`, phone: phone || '', role: 'patient', status: 'active',
    passwordHash: await bcrypt.hash(password || crypto.randomBytes(24).toString('hex'), 10),
    phoneVerifiedAt: phone ? nowIso() : null, emailVerifiedAt: verified.email ? nowIso() : null,
    region: { state: clean(state, 80), district: clean(district, 80), country: ctry }, createdAt: nowIso(),
  };
  d.users.push(user);
  let patient;
  if (dup) {
    dup.userId = user.id;
    patient = dup;
  } else {
    patient = {
      id: makePassportId(), userId: user.id, name: cleanName, dob: new Date(dobT).toISOString().slice(0, 10), gender: ['Female', 'Male', 'Other'].includes(gender) ? gender : 'Prefer not to say',
      language: clean(language, 40) || 'English', bloodGroup: BLOOD_GROUPS.includes(bloodGroup) ? bloodGroup : 'Unknown',
      allergies: cleanList(allergies, 30), conditions: cleanList(conditions, 30), currentMeds: [],
      emergencyContacts: clean(emergencyName, 80) ? [{ name: clean(emergencyName, 80), relation: clean(emergencyRelation, 30) || 'Family', phone: clean(emergencyPhone, 20) }] : [],
      abha: clean(abha, 30), pincode: clean(pincode, 12), district: clean(district, 80), state: clean(state, 80), country: ctry, vaccinations: [], createdAt: nowIso(),
    };
    d.patients.push(patient);
  }
  notify(user.id, 'Welcome to Nexus Healthcare 💚', `Your Health Passport ${patient.id} is ready. Add a family member or check your symptoms any time.`);
  audit(user, 'created_passport', patient.id, 'passport', phone ? 'Mobile verified by OTP' : 'Email verified by OTP');
  automation.emit('patient.registered', { patientId: patient.id, via: 'app', district: patient.district || null }, { contact: autoContact(patient) });
  store.save();
  broadcast('patients', 'admin');
  res.json({ token: sign(user), user: publicUser(user), patient, linkedExisting: Boolean(dup) });
});

// Quick patient sign-up: just name, email and mobile. One of them is proven by the OTP ticket;
// the rest of the Health Passport is completed later from the "Complete your profile" prompt.
app.post('/api/auth/register/quick', registerLimiter, async (req, res) => {
  const { ticket, name, email, phone, dialCode, country, language } = req.body || {};
  let verified;
  try {
    verified = jwt.verify(ticket, JWT_SECRET);
    if (verified.purpose !== 'signup') throw new Error();
  } catch {
    return res.status(400).json({ error: 'Your verification expired. Please request a new code.' });
  }
  const cleanName = clean(name, 80);
  if (cleanName.length < 2) return res.status(400).json({ error: 'Please tell us your name.' });
  const loginEmail = verified.email || clean(email, 160).toLowerCase();
  const loginPhone = verified.phone || (phone ? normalizePhone(clean(phone, 20), dialCode) : null);
  if (!EMAIL_RE.test(loginEmail)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (!loginPhone || String(loginPhone).replace(/\D/g, '').length < 7) return res.status(400).json({ error: 'Please enter a valid mobile number.' });
  if (findUserByPhone(loginPhone)) return res.status(409).json({ error: 'An account with this mobile number already exists. Please sign in.' });
  if (findUserByEmail(loginEmail)) return res.status(409).json({ error: 'This email is already registered. Please sign in.' });
  const d = db();
  const user = {
    id: store.id('u'), name: cleanName, email: loginEmail, phone: loginPhone, role: 'patient', status: 'active',
    passwordHash: await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10),
    phoneVerifiedAt: verified.phone ? nowIso() : null, emailVerifiedAt: verified.email ? nowIso() : null,
    region: { state: '', district: '', country: clean(country, 2) || 'IN' }, createdAt: nowIso(),
  };
  d.users.push(user);
  const patient = {
    id: makePassportId(), userId: user.id, name: cleanName, dob: null, gender: 'Prefer not to say', language: clean(language, 40) || 'English', bloodGroup: 'Unknown',
    allergies: [], conditions: [], currentMeds: [], emergencyContacts: [], abha: '', pincode: '', district: '', state: '', country: clean(country, 2) || 'IN',
    vaccinations: [], profileComplete: false, createdAt: nowIso(),
  };
  d.patients.push(patient);
  notify(user.id, 'Welcome to Nexus Healthcare 💚', `Your Health Passport ${patient.id} is ready. Complete your profile so doctors near you can help faster.`);
  audit(user, 'created_passport', patient.id, 'passport', verified.phone ? 'Quick sign-up · mobile verified by OTP' : 'Quick sign-up · email verified by OTP');
  automation.emit('patient.registered', { patientId: patient.id, via: 'app', district: patient.district || null }, { contact: autoContact(patient) });
  store.save();
  broadcast('patients', 'admin');
  res.json({ token: sign(user), user: publicUser(user), patient });
});

app.get('/api/auth/me', auth, (req, res) => {
  const out = { user: publicUser(req.user) };
  if (req.user.facilityId) out.facility = db().facilities.find((f) => f.id === req.user.facilityId);
  if (req.user.role === 'doctor') { const doc = doctorFor(req.user); out.doctor = doc ? withAvail(doc) : null; }
  if (['patient', 'caregiver'].includes(req.user.role)) out.profiles = profilesFor(req.user);
  res.json(out);
});

app.post('/api/auth/password', auth, async (req, res) => {
  const { current, next: nextPw } = req.body || {};
  if (typeof current !== 'string' || !(await bcrypt.compare(current, req.user.passwordHash))) return res.status(400).json({ error: 'Current password is incorrect.' });
  if (typeof nextPw !== 'string' || nextPw.length < 8 || nextPw.length > 200) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  req.user.passwordHash = await bcrypt.hash(nextPw, 10);
  req.user.tokenVersion = (req.user.tokenVersion || 0) + 1; // sign out every other device
  store.save();
  res.json({ ok: true, token: sign(req.user) });
});

// ---------- join the network (public partner applications) ----------
// Two tracks: independent clinics/hospitals/labs/pharmacies list THEIR facility on the network,
// and doctors apply to consult from Nexus Healthcare-owned E-Clinics as a side income. Every application
// lands in the admin verification queue; accounts stay `pending` (cannot sign in) until approved.
const joinLimiter = security.rateLimit({ windowMs: 60 * 60000, max: 8, message: 'Too many applications from this network. Please try again later.' });
const SPECIALTIES = ['General Medicine', 'Family Medicine', 'Pediatrics', 'Obstetrics & Gynaecology', 'Cardiology', 'Dermatology', 'Orthopedics', 'ENT', 'Ophthalmology', 'Psychiatry', 'Neurology', 'Pulmonology', 'Endocrinology', 'Gastroenterology', 'Nephrology', 'Oncology', 'Dentistry', 'Physiotherapy', 'Ayurveda (AYUSH)', 'Homeopathy (AYUSH)'];
const FACILITY_KINDS = {
  hospital: { type: 'hospital', role: 'hospital_admin', label: 'Hospital' },
  clinic: { type: 'hospital', subtype: 'clinic', role: 'hospital_admin', label: 'Clinic / nursing home' },
  lab: { type: 'lab', role: 'lab_tech', label: 'Diagnostic lab' },
  pharmacy: { type: 'pharmacy', role: 'pharmacist', label: 'Pharmacy' },
};
// Only strings and numbers count as text — objects/arrays become '' (never "[object Object]").
const clean = (v, max = 120) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '').trim().slice(0, max);
const cleanList = (v, max = 20) => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : []).map((s) => clean(s, 60)).filter(Boolean).slice(0, max);
// Medicines on a prescription, as typed by the doctor — only the known fields, each bounded.
const cleanRxItems = (list) => (Array.isArray(list) ? list : []).slice(0, 25).filter((it) => it && typeof it === 'object')
  .map((it) => ({ drug: clean(it.drug, 80), dose: clean(it.dose, 40), freq: clean(it.freq, 80), days: Math.max(0, Math.min(365, parseInt(it.days, 10) || 0)), ...(it.food ? { food: clean(it.food, 30) } : {}), ...(it.note ? { note: clean(it.note, 120) } : {}) }))
  .filter((it) => it.drug);
// Prototype keys ('__proto__', 'constructor'…) must never resolve against our lookup tables.
const own = (obj, key) => (typeof key === 'string' && Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const appRef = () => `OC-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;

function validateApplicant(b) {
  if (clean(b.name).length < 3) return 'Please enter the full name.';
  if (!EMAIL_RE.test(clean(b.email, 160))) return 'Please enter a valid email address.';
  if (!/^\+?[\d\s-]{7,18}$/.test(clean(b.phone, 20))) return 'Please enter a valid mobile number.';
  if (!b.password || String(b.password).length < 8) return 'Choose a password of at least 8 characters.';
  if (findUserByEmail(clean(b.email, 160))) return 'This email is already registered. Sign in instead, or use a different email.';
  if (findUserByPhone(normalizePhone(clean(b.phone, 20)))) return 'This mobile number is already registered.';
  return '';
}

app.get('/api/public/join/options', (_req, res) => {
  const d = db();
  res.json({
    specialties: SPECIALTIES,
    facilityKinds: Object.entries(FACILITY_KINDS).map(([value, k]) => ({ value, label: k.label })),
    eClinics: d.facilities.filter((f) => f.type === 'kiosk' && f.verified).map((f) => ({ id: f.id, name: f.name, district: f.district, state: f.state, status: f.status })),
    revenueShare: 0.8, // doctor keeps 80% of each consult fee at an E-Clinic
  });
});

app.post('/api/public/join/facility', joinLimiter, async (req, res) => {
  const b = req.body || {};
  const kind = own(FACILITY_KINDS, b.kind);
  if (!kind) return res.status(400).json({ error: 'Choose what kind of facility you run.' });
  if (clean(b.facilityName).length < 3) return res.status(400).json({ error: 'Please enter the facility name.' });
  if (clean(b.licenceNo, 60).length < 4) return res.status(400).json({ error: 'Please enter the registration / licence number.' });
  if (!clean(b.district) || !clean(b.state)) return res.status(400).json({ error: 'Please add the district and state.' });
  if (b.pincode && !/^[A-Za-z0-9 -]{3,12}$/.test(clean(b.pincode, 12))) return res.status(400).json({ error: 'Please check the pin / postal code.' });
  const err = validateApplicant({ ...b, name: b.ownerName });
  if (err) return res.status(400).json({ error: err });
  const d = db();
  const ref = appRef();
  const beds = Math.max(0, Math.min(5000, parseInt(b.beds, 10) || 0));
  const f = {
    id: store.id('fac'), type: kind.type, ...(kind.subtype ? { subtype: kind.subtype } : {}), name: clean(b.facilityName), verified: false,
    district: clean(b.district), state: clean(b.state), pincode: clean(b.pincode, 12), address: clean(b.address, 240), phone: clean(b.phone, 20),
    licenceNo: clean(b.licenceNo, 60), ownerName: clean(b.ownerName), hours: clean(b.hours, 40) || undefined,
    departments: kind.type === 'hospital' ? cleanList(b.departments) : undefined,
    services: cleanList(b.services), equipment: cleanList(b.equipment),
    partner: true, selfApplied: true, applicationRef: ref, appliedAt: nowIso(),
  };
  d.facilities.push(f);
  if (kind.type === 'hospital' && beds > 0) {
    const icu = Math.round(beds * 0.1);
    d.beds.push({ facilityId: f.id, type: 'general', total: beds - icu, occupied: 0, updatedAt: nowIso() });
    d.beds.push({ facilityId: f.id, type: 'icu', total: icu, occupied: 0, updatedAt: nowIso() });
  }
  const user = {
    id: store.id('u'), name: clean(b.ownerName), email: clean(b.email, 160).toLowerCase(), phone: normalizePhone(clean(b.phone, 20)) || clean(b.phone, 20),
    role: kind.role, facilityId: f.id, status: 'pending', applicationRef: ref,
    region: { district: f.district, state: f.state }, passwordHash: await bcrypt.hash(String(b.password), 10), createdAt: nowIso(),
  };
  d.users.push(user);
  audit(user, 'applied_facility', null, kind.type, `${f.name} (${kind.label})`);
  automation.emit('onboarding.submitted', { kind: kind.type, stage: 'applied', id: f.id, name: f.name, district: f.district || null });
  d.users.filter((u) => u.role === 'super_admin').forEach((a) => notify(a.id, 'New facility application', `${f.name}, ${f.district} wants to join the network. Review it in Onboarding.`));
  store.save();
  broadcast('admin', 'doctors');
  res.json({ ok: true, ref, kind: 'facility', name: f.name });
});

// Doctors sign up with just name, email, mobile and a password, land straight in the portal and
// finish their profile there. Nothing clinical unlocks until an admin verifies them (see auth()).
// A doctor listed by their clinic / hospital (no account yet) — matched by email or mobile at sign-up.
const findListedDoctor = (email, phone) => db().doctors.find((x) => !x.userId && x.listedBy && ((email && x.invite?.email === email) || (phone && samePhone(x.invite?.phone, phone))));

app.post('/api/public/join/doctor', joinLimiter, async (req, res) => {
  const b = req.body || {};
  const err = validateApplicant(b);
  if (err) return res.status(400).json({ error: err });
  const d = db();
  const ref = appRef();
  const name = clean(b.name).replace(/^(dr\.?\s*)/i, '').trim();
  const email = clean(b.email, 160).toLowerCase();
  const phone = normalizePhone(clean(b.phone, 20)) || clean(b.phone, 20);
  const country = /^[A-Z]{2}$/.test(String(b.country || '').toUpperCase()) ? String(b.country).toUpperCase() : 'IN';
  const user = {
    id: store.id('u'), name: `Dr. ${name}`, email, phone, role: 'doctor', status: 'active', applicationRef: ref,
    region: { district: '', state: '', country }, passwordHash: await bcrypt.hash(String(b.password), 10), createdAt: nowIso(),
  };
  d.users.push(user);
  // Already listed by a clinic or hospital? Email/mobile aren't proven at sign-up, so this only files a
  // claim request — the admin merges it into the listing when they verify this doctor.
  const listed = findListedDoctor(email, phone);
  const doc = {
    id: store.id('doc'), userId: user.id, name: user.name, specialty: listed?.specialty || 'General Medicine', qualification: '', regNo: '',
    languages: country === 'IN' ? ['Hindi', 'English'] : ['English'], verified: false, online: false, district: '', state: '', country,
    rating: 0, consultsDone: 0, earnings: 0, fee: 200, maxPerHour: 4, experience: 0,
    engagement: 'independent', profileComplete: false, selfApplied: true, applicationRef: ref, appliedAt: nowIso(),
    ...(listed ? { claimRequest: listed.id } : {}),
  };
  d.doctors.push(doc);
  // Runs their own clinic and wants it on Nexus too: the clinic is created with the doctor as owner.
  const clinicName = clean(b.clinicName, 120);
  if (clinicName.length >= 3 && !doc.ownsFacilityId) {
    const f = { id: store.id('fac'), type: 'hospital', subtype: 'clinic', name: clinicName, verified: false, country, district: '', state: '', ownerDoctorId: doc.id, partner: true, selfApplied: true, applicationRef: ref, appliedAt: nowIso(), departments: [], hours: '' };
    d.facilities.push(f);
    Object.assign(doc, { facilityId: f.id, ownsFacilityId: f.id, engagement: 'own_clinic' });
  }
  audit(user, 'doctor_signed_up', null, 'doctor', `${doc.name}${doc.ownsFacilityId ? ` · owns ${clinicName}` : listed ? ' · asks to claim a clinic listing' : ''}`);
  automation.emit('onboarding.submitted', { kind: 'doctor', stage: 'signed_up', id: doc.id, name: doc.name, specialty: doc.specialty || null, clinic: clinicName || null });
  store.save();
  broadcast('admin', 'doctors');
  res.json({ ok: true, ref, kind: 'doctor', name: doc.name, token: sign(user), user: publicUser(user) });
});

// Chemists sign up like doctors and patients — name, email, mobile (+ store name) — then finish the store
// profile (location, store photo, licence photo) inside the portal. Orders unlock after verification.
app.post('/api/public/join/pharmacy', joinLimiter, async (req, res) => {
  const b = req.body || {};
  const err = validateApplicant(b);
  if (err) return res.status(400).json({ error: err });
  const storeName = clean(b.storeName, 120);
  if (storeName.length < 3) return res.status(400).json({ error: 'Please enter your medical store\'s name.' });
  const d = db();
  const ref = appRef();
  const country = /^[A-Z]{2}$/.test(String(b.country || '').toUpperCase()) ? String(b.country).toUpperCase() : 'IN';
  const f = { id: store.id('fac'), type: 'pharmacy', name: storeName, verified: false, profileComplete: false, country, district: '', state: '', partner: true, selfApplied: true, applicationRef: ref, appliedAt: nowIso(), priceFactor: 1 };
  d.facilities.push(f);
  const user = {
    id: store.id('u'), name: clean(b.name), email: clean(b.email, 160).toLowerCase(), phone: normalizePhone(clean(b.phone, 20)) || clean(b.phone, 20),
    role: 'pharmacist', facilityId: f.id, status: 'active', applicationRef: ref, region: { district: '', state: '', country },
    passwordHash: await bcrypt.hash(String(b.password), 10), createdAt: nowIso(),
  };
  d.users.push(user);
  audit(user, 'pharmacy_signed_up', null, 'pharmacy', storeName);
  automation.emit('onboarding.submitted', { kind: 'pharmacy', stage: 'signed_up', id: f.id, name: storeName });
  store.save();
  broadcast('admin');
  res.json({ ok: true, ref, kind: 'pharmacy', name: storeName, token: sign(user), user: publicUser(user) });
});
const findDoctorByReg = (regNo) => db().doctors.find((x) => x.regNo && x.regNo.toUpperCase() === regNo.toUpperCase());

// Status lookup by the unguessable application reference — reveals nothing beyond that one application.
const joinStatusLimiter = security.rateLimit({ windowMs: 60 * 60000, max: 60, message: 'Too many lookups. Please try again in a while.' });
app.get('/api/public/join/status/:ref', joinStatusLimiter, (req, res) => {
  const ref = clean(req.params.ref, 20).toUpperCase();
  const d = db();
  const doc = d.doctors.find((x) => x.applicationRef === ref);
  const fac = !doc && d.facilities.find((x) => x.applicationRef === ref);
  if (!doc && !fac) return res.status(404).json({ error: 'We couldn\'t find an application with that reference. Check it and try again.' });
  const item = doc || fac;
  const status = item.verified ? 'approved' : item.verificationNote && !item.verified ? 'rejected' : 'in_review';
  res.json({ ref, kind: doc ? 'doctor' : 'facility', name: item.name, status, note: status === 'rejected' ? item.verificationNote : null, appliedAt: item.appliedAt });
});

// ---------- shared ----------
app.get('/api/notifications', auth, (req, res) => {
  res.json(notificationsFor(req.user.id, 30));
});
app.post('/api/notifications/read', auth, (req, res) => {
  const uid = req.user.id;
  db().notifications.forEach((n) => { if (n.userId === uid && !n.read) n.read = true; });
  store.save();
  res.json({ ok: true });
});

const triageLimiter = security.rateLimit({ windowMs: 10 * 60000, max: 60, message: 'Too many symptom checks. Please wait a few minutes.' });
app.post('/api/triage', triageLimiter, optionalAuth, (req, res) => {
  const result = engines.triage(req.body || {}, db().aiConfig);
  res.json(result);
});

app.get('/api/drugs', auth, (req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  const district = clean(req.query.district) || req.user.region?.district || '';
  const state = clean(req.query.state) || req.user.region?.state || '';
  const stockOf = (name) => {
    const stock = engines.findStock(db(), name, { district, state });
    const local = stock.filter((s) => s.tier <= 1 && s.facility.type === 'pharmacy');
    return { nearbyStock: local.reduce((s, r) => s + r.qty, 0), nearestTier: stock[0]?.tierName || 'unavailable' };
  };
  // The doctor's own saved medicines come first and carry their default dose & timing.
  const mine = req.user.role === 'doctor' ? (doctorFor(req.user)?.myMedicines || [])
    .filter((m) => `${m.name} ${m.strength}`.toLowerCase().includes(q)).slice(0, 6)
    .map((m) => ({ name: [m.name, m.strength].filter(Boolean).join(' '), custom: true, defaults: m, ...stockOf(m.name) })) : [];
  const taken = new Set(mine.map((m) => m.name.toLowerCase()));
  const list = db().drugMaster.filter((d) => typeof d === 'string' && d.toLowerCase().includes(q) && !taken.has(d.toLowerCase())).slice(0, 12 - mine.length).map((name) => ({ name, ...stockOf(name) }));
  res.json([...mine, ...list]);
});

app.get('/api/stock', auth, (req, res) => {
  const { drug } = req.query;
  const district = clean(req.query.district) || req.user.region?.district || '';
  const state = clean(req.query.state) || req.user.region?.state || '';
  if (!drug) return res.json([]);
  res.json(engines.findStock(db(), drug, { district, state }).map((r) => ({
    facilityId: r.facilityId, facilityName: r.facility.name, type: r.facility.type, district: r.facility.district, state: r.facility.state,
    distanceKm: r.facility.distanceKm, hours: r.facility.hours, qty: r.qty, expiry: r.expiry, tier: r.tier, tierName: r.tierName, drug: r.drug,
  })));
});

app.get('/api/doctors', auth, (req, res) => {
  const d = db();
  const queued = new Map();
  for (const c of d.consults) if (c.status === 'queued') queued.set(c.doctorId, (queued.get(c.doctorId) || 0) + 1);
  const list = d.doctors.filter((x) => x.verified).map((doc) => {
    const queue = queued.get(doc.id) || 0;
    const pub = publicDoctor(doc);
    return { ...pub, queue, waitMin: queue * 8 + 2 };
  });
  res.json(list.sort((a, b) => Number(b.online) - Number(a.online)));
});

app.get('/api/advisories', auth, (_req, res) => res.json(db().advisories.filter((a) => a.status === 'published')));

// ---------- patient app ----------
app.get('/api/patient/home', auth, role('patient', 'caregiver'), (req, res) => {
  const d = db();
  const p = activePatient(req, { optional: true });
  if (!p) return res.json({ patient: null, profiles: [] });
  const consults = d.consults.filter((c) => c.patientId === p.id).map(enrichConsult);
  const myRx = d.prescriptions.filter((r) => r.patientId === p.id);
  // One pass over deliveries for this patient's open prescription deliveries (first match wins, as before).
  const rxIds = new Set(myRx.map((r) => r.id));
  const openDeliveryOtp = new Map();
  for (const x of d.deliveries) if (x.kind === 'prescription' && rxIds.has(x.refId) && x.status !== 'delivered' && !openDeliveryOtp.has(x.refId)) openDeliveryOtp.set(x.refId, x.otp);
  res.json({
    patient: { ...p, age: ageOf(p.dob), bookingMissing: bookingMissing(p) },
    profiles: profilesFor(req.user).map((x) => ({ id: x.id, name: x.name, age: ageOf(x.dob), gender: x.gender, relation: x.relation, self: x.userId === req.user.id })),
    medicineOrders: (d.medOrders || []).filter((o) => o.patientId === p.id && !['delivered', 'collected', 'declined', 'cancelled'].includes(o.status) && o.status !== 'awaiting_payment').length,
    upcoming: consults.filter((c) => ['scheduled', 'queued', 'in_progress'].includes(c.status)),
    prescriptions: myRx.map((r) => ({ ...enrichRx(r), deliveryOtp: openDeliveryOtp.get(r.id) })).reverse(),
    alerts: d.alerts.filter((a) => a.type === 'outbreak' && a.district === p.district && a.status !== 'dismissed').slice(0, 2),
    pendingConsents: d.consents.filter((c) => c.patientId === p.id && c.status === 'pending').length,
    notifications: notificationsFor(req.user.id, 8),
    advisories: d.advisories.filter((a) => a.status === 'published').slice(0, 2),
  });
});

app.put('/api/patient/profile', auth, role('patient', 'caregiver'), (req, res) => {
  const p = activePatient(req);
  const b = req.body || {};
  if (b.name !== undefined) { const n = clean(b.name, 80); if (n.length < 2) return res.status(400).json({ error: 'Please enter a name.' }); p.name = n; if (p.userId === req.user.id) req.user.name = n; }
  if (b.language !== undefined) p.language = clean(b.language, 40);
  if (b.bloodGroup !== undefined) { if (b.bloodGroup && !BLOOD_GROUPS.includes(b.bloodGroup) && b.bloodGroup !== 'Unknown') return res.status(400).json({ error: 'Choose a blood group from the list.' }); p.bloodGroup = b.bloodGroup || 'Unknown'; }
  for (const k of ['allergies', 'conditions', 'currentMeds']) if (b[k] !== undefined) p[k] = cleanList(b[k], 30);
  if (b.abha !== undefined) p.abha = clean(b.abha, 30);
  if (b.pincode !== undefined) p.pincode = clean(b.pincode, 12);
  if (b.gender !== undefined && ['Female', 'Male', 'Other', 'Prefer not to say'].includes(b.gender)) p.gender = b.gender;
  if (b.dob !== undefined) { const t = Date.parse(b.dob); if (!Number.isFinite(t) || t > Date.now() || t < Date.parse('1900-01-01')) return res.status(400).json({ error: 'Please check the date of birth.' }); p.dob = new Date(t).toISOString().slice(0, 10); p.dobApprox = false; }
  if (b.emergencyContacts !== undefined) {
    // "Mobile" is reserved: it's the number one-time codes go to, so it can't be edited here.
    const mobile = (p.emergencyContacts || []).filter((e) => e.relation === 'Mobile');
    const list = (Array.isArray(b.emergencyContacts) ? b.emergencyContacts : []).slice(0, 5).map((e) => ({ name: clean(e?.name, 80), relation: clean(e?.relation, 30), phone: clean(e?.phone, 20) }))
      .filter((e) => e.name && e.phone && e.relation.toLowerCase() !== 'mobile');
    p.emergencyContacts = [...mobile, ...list];
  }
  audit(req.user, 'updated_profile', p.id, 'passport', 'Self-service edit');
  store.save();
  res.json(p);
});

// ---- patient: complete the profile after quick sign-up ----
const GOV_ID_TYPES = ['Ayushman Bharat (PM-JAY) card', 'ABHA health ID', 'State health scheme card', 'ESIC card', 'CGHS card', 'Voter ID', 'Ration card', 'Driving licence', 'PAN card', 'Passport', 'National ID card', 'Residence permit'];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const round3 = (n) => Math.round(Number(n) * 1000) / 1000; // ~100 m — enough to rank doctors, not to pinpoint a home
const countryOf = (x) => String(x?.country || 'IN').toUpperCase();
function patientPoint(p) {
  const c = p?.currentLocation;
  if (c && Date.now() - Date.parse(c.at) < 7 * 86400000) {
    if (geo.validCoord(c.lat, c.lng)) return { lat: c.lat, lng: c.lng };
    const d = c.district && geo.byDistrict(c.district, c.state);
    if (d) return { lat: d.lat, lng: d.lng };
  }
  return geo.pointOf(p);
}

// What a patient must have on file before booking a consultation. Sign-up needs only name, email and
// mobile; booking needs age and a permanent address. An identity document (Aadhaar / government ID /
// passport) is optional everywhere — it can be added to the profile but never blocks care.
function bookingMissing(p) {
  if (!p) return ['profile'];
  const miss = [];
  if (!p.dob) miss.push('age');
  if (!p.address || !p.district) miss.push('address');
  return miss;
}

app.put('/api/patient/profile/complete', auth, role('patient', 'caregiver'), (req, res) => {
  const p = activePatient(req);
  if (!p) return res.status(404).json({ error: 'Profile not found.' });
  const b = req.body || {};
  const country = /^[A-Z]{2}$/.test(String(b.country || '').toUpperCase()) ? String(b.country).toUpperCase() : countryOf(p);
  const india = country === 'IN';
  const age = parseInt(b.age, 10);
  if (!Number.isInteger(age) || age < 0 || age > 120) return res.status(400).json({ error: 'Please enter your age.' });
  if (clean(b.address, 240).length < 5) return res.status(400).json({ error: 'Please add your permanent address.' });
  if (!clean(b.district) || !clean(b.state)) return res.status(400).json({ error: india ? 'Please add your district/city and state (or use your location).' : 'Please add your city and state / region.' });
  if (b.pincode && !/^[A-Za-z0-9 -]{3,12}$/.test(clean(b.pincode, 12))) return res.status(400).json({ error: 'Please check the pin / postal code.' });
  if (b.bloodGroup && !BLOOD_GROUPS.includes(b.bloodGroup)) return res.status(400).json({ error: 'Choose a blood group from the list.' });
  // Aadhaar is validated (Verhoeff checksum) and only its last 4 digits are kept.
  const aadhaar = String(b.aadhaar || '').replace(/\D/g, '');
  if (aadhaar && (!/^[2-9]\d{11}$/.test(aadhaar) || !verhoeffOk(aadhaar))) return res.status(400).json({ error: 'That Aadhaar number doesn\'t look right. Please check the 12 digits.' });
  let govId = null;
  if (b.govIdType || b.govIdNumber) {
    if (!GOV_ID_TYPES.includes(b.govIdType)) return res.status(400).json({ error: 'Choose the type of government ID.' });
    const num = clean(b.govIdNumber, 30).toUpperCase();
    if (!/^[A-Z0-9 /-]{4,30}$/.test(num)) return res.status(400).json({ error: 'Please check the ID number.' });
    govId = { type: b.govIdType, number: num, addedAt: nowIso() };
  }
  // No ID is required — Aadhaar / government IDs are optional and only checked when given.
  const symptomDays = b.symptomDays === '' || b.symptomDays == null ? null : Math.max(0, Math.min(3650, parseInt(b.symptomDays, 10) || 0));
  const lat = Number(b.lat); const lng = Number(b.lng);
  Object.assign(p, {
    gender: ['Female', 'Male', 'Other', 'Prefer not to say'].includes(b.gender) ? b.gender : p.gender,
    address: clean(b.address, 240), pincode: clean(b.pincode, 12), district: clean(b.district), state: clean(b.state), country,
    ...(b.bloodGroup ? { bloodGroup: b.bloodGroup } : {}),
    ...(b.lat != null && geo.validCoord(lat, lng) ? { lat: round3(lat), lng: round3(lng), locationSource: 'device' } : {}),
    profileComplete: true, profileCompletedAt: nowIso(),
  });
  if (!p.dob || p.dobApprox) { p.dob = `${new Date().getFullYear() - age}-07-01`; p.dobApprox = true; }
  if (aadhaar) p.aadhaarLast4 = aadhaar.slice(-4);
  if (govId) p.govIds = [govId, ...(p.govIds || []).filter((g) => g.type !== govId.type)];
  if (govId?.type === 'ABHA health ID' && !p.abha) p.abha = govId.number;
  if (clean(b.symptoms, 500)) p.currentSymptoms = { text: clean(b.symptoms, 500), days: symptomDays, department: SPECIALTIES.includes(b.department) ? b.department : null, at: nowIso(), via: b.symptomsVia === 'voice' ? 'voice' : 'text' };
  if (Array.isArray(b.currentMeds)) p.currentMeds = cleanList(b.currentMeds, 20);
  if (p.userId === req.user.id) req.user.region = { ...req.user.region, district: p.district, state: p.state, country };
  audit(req.user, 'completed_profile', p.id, 'passport', 'Profile completed');
  store.save();
  broadcast('patients');
  res.json({ ...p, age: ageOf(p.dob), bookingMissing: bookingMissing(p) });
});

// "Use my location": match device coordinates to the nearest district on our own server.
app.get('/api/geo/reverse', auth, (req, res) => {
  const lat = Number(req.query.lat); const lng = Number(req.query.lng);
  if (!geo.validCoord(lat, lng)) return res.status(400).json({ error: 'Invalid location.' });
  const n = geo.nearestDistrict(lat, lng);
  res.json({ district: n.district, state: n.state, pincode: n.pin, distanceKm: n.distanceKm, approximate: n.distanceKm > 40 });
});

// Best doctors for these symptoms, nearest first — specialty from the triage engine, distance from the
// device location (if shared) or the patient's address, plus live availability, rating and language.
const DEPARTMENTS_FOR = {
  'General Medicine': ['General Medicine', 'Emergency'], 'Family Medicine': ['General Medicine'], Pediatrics: ['Pediatrics'], Cardiology: ['Cardiology'],
  'Obstetrics & Gynaecology': ['Obstetrics'], Orthopedics: ['Orthopedics'], Neurology: ['Neurology'], Oncology: ['Oncology'], Emergency: ['Emergency'],
  Pulmonology: ['General Medicine'], Dermatology: ['General Medicine'], ENT: ['ENT'], Ophthalmology: ['Ophthalmology'], Surgery: ['Surgery'],
};
// Public trust signals for a doctor card: reviews, satisfaction, patients seen, experience.
function doctorStats(doc) {
  const r = doc.reviewStats || { count: 0, sum: 0, satisfied: 0 };
  return {
    rating: r.count ? Math.round((r.sum / r.count) * 10) / 10 : (doc.rating || 0),
    reviewCount: r.count,
    satisfaction: r.count ? Math.round((r.satisfied / r.count) * 100) : null,
    patientsSeen: Math.max(doc.patientsLifetime || 0, doc.consultsDone || 0),
    experience: doc.experience || 0,
  };
}
const practiceOf = (doc, fac) => (isEClinicDoctor(doc) ? 'virtual' : fac ? (fac.subtype === 'clinic' ? (fac.ownerDoctorId === doc.id ? 'own_clinic' : 'clinic') : 'hospital') : 'independent');
const NEAR_RADIUS_KM = Number(process.env.NEAR_RADIUS_KM) || 20;

// Doctors for these symptoms (or a department the patient picked) within 20 km of the patient — hospital
// doctors, doctors running their own clinic, and Nexus virtual-clinic doctors. `scope=all` lifts the radius
// and lists every centre in the patient's country (used to change doctor / get a second opinion).
app.get('/api/doctors/recommend', auth, role('patient', 'caregiver', 'kiosk_operator'), (req, res) => {
  const d = db();
  const p = ['patient', 'caregiver'].includes(req.user.role) ? activePatient(req) : null;
  const symptoms = clean(req.query.symptoms, 500) || p?.currentSymptoms?.text || '';
  const t = engines.triage({ symptoms: symptoms || 'general check-up', age: ageOf(p?.dob) ?? undefined }, d.aiConfig);
  const department = SPECIALTIES.includes(req.query.department) ? req.query.department : null;
  const scopeAll = req.query.scope === 'all';
  const radiusKm = Math.max(2, Math.min(200, Number(req.query.radiusKm) || NEAR_RADIUS_KM));
  const country = countryOf(p);
  const lat = Number(req.query.lat); const lng = Number(req.query.lng);
  // A preferred location the patient picked (another city, a relative's town…) wins over device/home.
  const chosen = req.query.district ? geo.byDistrict(String(req.query.district), String(req.query.state || '')) : null;
  const device = !chosen && req.query.lat != null && geo.validCoord(lat, lng);
  const origin = chosen ? { lat: chosen.lat, lng: chosen.lng } : device ? { lat, lng } : patientPoint(p);
  const wanted = department || (t.specialty === 'Emergency' ? 'General Medicine' : t.specialty);
  // Index once per request instead of scanning facilities / beds / doctors for every row.
  const facMap = new Map(d.facilities.map((f) => [f.id, f]));
  const facilityById = (id) => facMap.get(id);
  const bedsByFac = new Map(); for (const b of d.beds) { if (!bedsByFac.has(b.facilityId)) bedsByFac.set(b.facilityId, []); bedsByFac.get(b.facilityId).push(b); }
  const docsByFac = new Map(); for (const x of d.doctors) if (x.verified && x.facilityId) { if (!docsByFac.has(x.facilityId)) docsByFac.set(x.facilityId, []); docsByFac.get(x.facilityId).push(x); }
  const inArea = (km) => scopeAll || km === null || km <= radiusKm;
  const exclude = String(req.query.exclude || '');
  const list = d.doctors.filter((x) => x.verified && countryOf(x) === country && x.id !== exclude).map((doc) => {
    const a = availabilityOf(doc, { facilities: d.facilities });
    const fac = doc.facilityId ? facilityById(doc.facilityId) : null;
    const practice = practiceOf(doc, fac);
    const place = fac || doc;
    const distanceKm = practice === 'virtual' ? null : geo.km(origin, geo.pointOf(place));
    const exact = doc.specialty === wanted;
    const gp = ['General Medicine', 'Family Medicine'].includes(doc.specialty);
    const speaks = p && doc.languages.includes(p.language);
    const stats = doctorStats(doc);
    let score = (exact ? 50 : gp ? 18 : 0) + (a.available ? 20 : 0) + stats.rating * 4 + (stats.satisfaction ?? 80) / 10 + (speaks ? 10 : 0);
    score -= distanceKm === null ? 6 : Math.min(distanceKm / 2, 30);
    const reasons = [exact ? `${doc.specialty} specialist` : gp ? 'General physician' : null, distanceKm !== null ? `${distanceKm} km away` : 'Video consult', a.available ? 'available now' : null, speaks ? `speaks ${p.language}` : null].filter(Boolean);
    const pub = publicDoctor(doc);
    return {
      ...pub, ...stats, distanceKm, practice, at: practice === 'virtual' ? 'Nexus virtual clinic · video' : place === doc ? [doc.district, doc.state].filter(Boolean).join(', ') : place.name,
      facility: fac ? { id: fac.id, name: fac.name, kind: fac.subtype === 'clinic' ? 'Clinic' : 'Hospital', district: fac.district } : null,
      matchScore: Math.round(score), match: exact ? 'specialist' : gp ? 'general' : 'other', reasons,
    };
  }).filter((x) => (department || !scopeAll ? x.match !== 'other' : true) && inArea(x.distanceKm))
    .sort((a, b) => b.matchScore - a.matchScore).slice(0, scopeAll ? 60 : 30);
  const eClinics = d.facilities.filter((f) => f.type === 'kiosk' && f.verified).map((f) => ({
    id: f.id, name: f.name, district: f.district, status: f.status, distanceKm: geo.km(origin, geo.pointOf(f)), comingSoon: true,
  })).sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9)).slice(0, 3);
  // Hospitals and clinics with the right department — OPD fee, beds free, hours, doctors on the network.
  const depts = DEPARTMENTS_FOR[wanted] || ['General Medicine'];
  const facilities = d.facilities.filter((f) => f.type === 'hospital' && f.verified && countryOf(f) === country).map((f) => {
    const has = (f.departments || []).filter((x) => depts.includes(x) || (t.level === 'emergency' && x === 'Emergency'));
    const beds = bedsByFac.get(f.id) || [];
    const bedsFree = beds.reduce((s2, b) => s2 + Math.max(0, b.total - b.occupied), 0);
    const docs = docsByFac.get(f.id) || [];
    const docsAvail = docs.filter((x) => availabilityOf(x, { facilities: d.facilities }).available);
    const distanceKm = geo.km(origin, geo.pointOf(f));
    const score = has.length * 30 + (bedsFree > 0 ? 10 : 0) + docsAvail.length * 8 + ((f.departments || []).includes('Emergency') && t.level !== 'self_care' ? 6 : 0) - (distanceKm === null ? 15 : Math.min(distanceKm / 6, 40));
    return {
      id: f.id, name: f.name, kind: f.subtype === 'clinic' ? 'Clinic' : 'Hospital', district: f.district, state: f.state, address: f.address || '',
      distanceKm, opdFee: f.opdFee ?? null, hours: f.hours || null, emergency: (f.departments || []).includes('Emergency'), phone: f.phone || null,
      matchedDepartments: has, departments: f.departments || [], bedsFree, doctorsOnNetwork: docs.length,
      doctors: docs.map((x) => ({ id: x.id, name: x.name, specialty: x.specialty, available: availabilityOf(x, { facilities: d.facilities }).available, ...doctorStats(x) })),
      doctorsAvailable: docsAvail.map((x) => ({ id: x.id, name: x.name, specialty: x.specialty })),
      score: Math.round(score),
    };
  }).filter((f) => (f.matchedDepartments.length || f.doctorsOnNetwork || scopeAll) && inArea(f.distanceKm)).sort((a, b) => b.score - a.score).slice(0, scopeAll ? 40 : 8);
  const near = origin ? geo.nearestDistrict(origin.lat, origin.lng) : null;
  res.json({
    triage: { level: t.level, label: t.label, specialty: wanted, suggested: t.specialty, advice: t.advice, redFlags: t.redFlags, byDepartment: !!department },
    origin: { source: chosen ? 'chosen' : device ? 'device' : origin ? 'profile' : 'none', district: chosen?.district || (country === 'IN' ? near?.district : p?.district) || null },
    scope: scopeAll ? 'all' : 'near', radiusKm, country,
    doctors: list, eClinics, facilities, departments: SPECIALTIES,
  });
});

// Reviews: a patient rates a completed visit once; the doctor's rating & satisfaction update instantly.
app.post('/api/consults/:id/review', auth, role('patient', 'caregiver'), (req, res) => {
  const d = db();
  const c = d.consults.find((x) => x.id === req.params.id);
  if (!c || !ownsPatient(req.user, c.patientId)) return res.status(404).json({ error: 'Visit not found.' });
  if (c.status !== 'completed') return res.status(409).json({ error: 'You can rate the visit once it\'s over.' });
  if (c.review) return res.status(409).json({ error: 'You\'ve already rated this visit. Thank you!' });
  const stars = parseInt(req.body?.stars, 10);
  if (!(stars >= 1 && stars <= 5)) return res.status(400).json({ error: 'Choose 1 to 5 stars.' });
  const doc = d.doctors.find((x) => x.id === c.doctorId);
  const p = d.patients.find((x) => x.id === c.patientId);
  const review = { id: store.id('rev'), doctorId: c.doctorId, consultId: c.id, patientId: c.patientId, stars, text: clean(req.body?.text, 400), name: `${(p?.name || 'Patient').split(' ')[0]} ${((p?.name || '').split(' ')[1] || '').slice(0, 1)}`.trim(), at: nowIso() };
  d.reviews.unshift(review);
  c.review = { stars, at: review.at };
  if (doc) {
    const s = doc.reviewStats || { count: 0, sum: 0, satisfied: 0 };
    doc.reviewStats = { count: s.count + 1, sum: s.sum + stars, satisfied: s.satisfied + (stars >= 4 ? 1 : 0) };
    doc.rating = Math.round((doc.reviewStats.sum / doc.reviewStats.count) * 10) / 10;
    notify(doc.userId, `New ${stars}★ review`, review.text ? `"${review.text.slice(0, 90)}"` : `${review.name} rated your consult.`);
  }
  store.save();
  broadcast('doctors', 'consults');
  res.json({ ok: true, review });
});

app.get('/api/doctors/:id/reviews', auth, (req, res) => {
  const doc = db().doctors.find((x) => x.id === req.params.id && x.verified);
  if (!doc) return res.status(404).json({ error: 'Doctor not found.' });
  res.json({ stats: doctorStats(doc), reviews: db().reviews.filter((r) => r.doctorId === doc.id).slice(0, 20).map(({ patientId, consultId, ...r }) => r) });
});

app.get('/api/patient/records', auth, role('patient', 'caregiver'), (req, res) => {
  const d = db();
  const p = activePatient(req);
  const items = [
    ...d.consults.filter((c) => c.patientId === p.id && c.status === 'completed').map((c) => ({ kind: 'visit', id: c.id, date: c.completedAt || c.createdAt, title: `${c.mode === 'video' ? 'Video' : c.mode === 'audio' ? 'Audio' : 'Chat'} consult · ${enrichConsult(c).doctorName}`, detail: c.diagnosis || c.triage?.symptoms, data: enrichConsult(c) })),
    ...d.prescriptions.filter((r) => r.patientId === p.id).map((r) => ({ kind: 'prescription', id: r.id, date: r.createdAt, title: `Prescription · ${r.items.length} medicine${r.items.length > 1 ? 's' : ''}`, detail: r.items.map((i) => i.drug).join(', '), data: enrichRx(r) })),
    ...d.labOrders.filter((o) => o.patientId === p.id).map((o) => ({ kind: 'lab', id: o.id, date: o.reportedAt || o.createdAt, title: `Lab · ${o.tests.map((t) => t.name).join(', ')}`, detail: o.status === 'reported' ? 'Report ready' : `Status: ${o.status}`, data: enrichLab(o) })),
    ...d.records.filter((r) => r.patientId === p.id).map((r) => ({ kind: 'upload', id: r.id, date: r.date, title: r.title, detail: r.summary, data: r })),
    ...(p.vaccinations || []).map((v, i) => ({ kind: 'vaccination', id: `vac_${i}`, date: v.date, title: `Vaccination · ${v.name}`, detail: 'Recorded' })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));
  res.json({ patient: p, items });
});

// Simulated OCR: extracts structured hints from the typed/filename text.
app.post('/api/patient/records/upload', auth, role('patient', 'caregiver'), async (req, res) => {
  const p = activePatient(req);
  const { title, date, fileName } = req.body || {};
  const text = clean(req.body?.text, 20000);
  let fileId = null;
  if (req.body?.fileId) {
    const f = await store.adapter().fileGet(clean(req.body.fileId, 80));
    if (!f || f.uploadedBy !== req.user.id) return res.status(400).json({ error: 'Please upload the file again.' });
    fileId = f.id;
  }
  const found = [];
  const re = /(hba1c|haemoglobin|hemoglobin|glucose|sugar|cholesterol|tsh|creatinine|platelets?)\D{0,12}(\d+(\.\d+)?)/gi;
  let m;
  while ((m = re.exec(text))) found.push(`${m[1]}: ${m[2]}`);
  const rec = { id: store.id('rec'), patientId: p.id, title: clean(title, 120) || clean(fileName, 120) || 'Uploaded report', date: /^\d{4}-\d{2}-\d{2}/.test(String(date || '')) ? String(date).slice(0, 10) : nowIso().slice(0, 10), fileName: clean(fileName, 160), summary: found.length ? `Extracted: ${found.join(', ')}` : 'Saved. A health worker will verify the details.', extracted: found, uploadedAt: nowIso(), fileId: fileId || null, fileUrl: fileId ? `/api/files/${fileId}` : null };
  db().records.push(rec);
  audit(req.user, 'uploaded_record', p.id, 'upload', rec.title);
  store.save();
  broadcast('records');
  res.json(rec);
});

const TRIAGE_LEVELS = ['emergency', 'doctor_now', 'routine', 'self_care'];
// Kiosk walk-in consults only (patients book and pay through /api/bookings). The kiosk must have
// identified or registered this patient in the last 30 minutes — it can't pick an arbitrary passport.
app.post('/api/consults', auth, role('kiosk_operator'), (req, res) => {
  const d = db();
  const b = req.body || {};
  const p = d.patients.find((x) => x.id === b.patientId);
  if (!p) return res.status(404).json({ error: 'Patient not found.' });
  const seen = p.kioskSeen;
  if (!seen || seen.kioskId !== req.user.facilityId || Date.now() - Date.parse(seen.at) > 30 * 60000) return res.status(403).json({ error: 'Identify the patient at this kiosk first.' });
  const mode = ['video', 'audio', 'chat'].includes(b.mode) ? b.mode : 'video';
  const type = b.type === 'scheduled' ? 'scheduled' : 'instant';
  const at = Date.parse(b.scheduledAt);
  if (type === 'scheduled' && (!Number.isFinite(at) || at < Date.now() - 60000 || at > Date.now() + 31 * 86400000)) return res.status(400).json({ error: 'Please pick a time within the next month.' });
  const scheduledAt = type === 'scheduled' ? new Date(at).toISOString() : null;
  const t = b.triage && typeof b.triage === 'object' ? b.triage : null;
  const triage = t ? {
    level: TRIAGE_LEVELS.includes(t.level) ? t.level : 'routine', score: Math.max(0, Math.min(100, Number(t.score) || 0)), symptoms: clean(t.symptoms, 500) || 'Not provided',
    note: clean(t.note, 500), specialty: SPECIALTIES.includes(t.specialty) || t.specialty === 'Emergency' ? t.specialty : 'General Medicine', redFlags: cleanList(t.redFlags, 10),
  } : null;
  const vitals = b.vitals && typeof b.vitals === 'object' ? Object.fromEntries(['bp', 'pulse', 'spo2', 'temp', 'weight', 'sugar'].filter((k) => b.vitals[k] != null).map((k) => [k, k === 'bp' ? clean(b.vitals[k], 12) : Number(b.vitals[k]) || null])) : null;
  const doctorId = b.doctorId;

  let doctor = doctorId && d.doctors.find((x) => x.id === doctorId && x.verified);
  let routing = null;
  if (!doctor) {
    const ranked = engines.routeDoctor(d, { specialty: triage?.specialty || 'General Medicine', language: p.language, district: p.district, state: p.state, urgency: triage?.level });
    if (!ranked.length) return res.status(503).json({ error: 'No doctors are online right now. Please book a slot instead.' });
    doctor = ranked[0].doctor;
    routing = { score: ranked[0].score, tier: ['local', 'state', 'national'][ranked[0].tier], waitMin: ranked[0].waitMin, considered: ranked.length };
  }
  const consult = {
    id: store.id('con'), patientId: p.id, doctorId: doctor.id, kioskId: req.user.role === 'kiosk_operator' ? req.user.facilityId : null,
    status: type === 'scheduled' ? 'scheduled' : 'queued', mode, type,
    triage: triage || { level: 'routine', score: 20, symptoms: 'Not provided', note: 'Patient booked without triage.', specialty: doctor.specialty },
    vitals, createdAt: nowIso(), scheduledAt, messages: [], routing,
    routedFrom: routing ? `${p.district} → ${doctor.district} (${routing.tier})` : 'Direct booking',
  };
  d.consults.push(consult);
  // Consult implies time-limited consent for the treating doctor (patient approves at booking).
  d.consents.push({ id: store.id('cst'), patientId: p.id, granteeType: 'doctor', granteeId: doctor.id, granteeName: doctor.name, scope: ['history', 'prescriptions', 'labs', 'allergies'], purpose: 'Kiosk teleconsult (patient present at kiosk)', start: nowIso(), expiry: new Date(Date.now() + 2 * 86400000).toISOString(), status: 'active' });
  notify(doctor.userId, type === 'scheduled' ? 'New booking' : 'New patient in your queue', `${p.name} · ${consult.triage.level.replace('_', ' ')} · ${consult.triage.symptoms}`);
  audit(req.user, 'booked_consult', p.id, 'consult', consult.id);
  store.save();
  broadcast('consults', 'queue');
  res.json(enrichConsult(consult));
});

app.get('/api/consults/:id', auth, (req, res) => {
  const c = db().consults.find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Consult not found.' });
  if (!canAccessConsult(req.user, c)) return res.status(403).json({ error: 'You don\'t have access to this consult.' });
  const out = enrichConsult(c);
  out.prescription = db().prescriptions.find((r) => r.consultId === c.id) || null;
  out.position = db().consults.filter((x) => x.doctorId === c.doctorId && x.status === 'queued' && x.createdAt < c.createdAt).length + 1;
  res.json(out);
});

app.post('/api/consults/:id/messages', auth, (req, res) => {
  const c = db().consults.find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Consult not found.' });
  if (!canAccessConsult(req.user, c)) return res.status(403).json({ error: 'You don\'t have access to this consult.' });
  const text = String(req.body?.text || '').slice(0, 2000).trim();
  if (!text) return res.status(400).json({ error: 'Message is empty.' });
  c.messages.push({ id: store.id('m'), from: req.user.role === 'doctor' ? 'doctor' : 'patient', name: req.user.name, text, at: nowIso() });
  touchConsultParties(c);
  store.save();
  broadcast(`consult:${c.id}`);
  res.json(c.messages);
});

app.post('/api/consults/:id/cancel', auth, (req, res) => {
  const c = db().consults.find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Consult not found.' });
  if (!canAccessConsult(req.user, c)) return res.status(403).json({ error: 'You don\'t have access to this consult.' });
  if (['completed', 'cancelled', 'expired'].includes(c.status)) return res.status(409).json({ error: 'This consult can no longer be cancelled.' });
  c.status = 'cancelled'; c.cancelledAt = nowIso();
  const pay = c.paymentId && db().payments.find((x) => x.id === c.paymentId);
  if (pay?.status === 'created') pay.status = 'void';
  else if (pay?.status === 'paid' && !c.startedAt) { pay.status = 'refund_pending'; pay.refundReason = 'Booking cancelled before the visit'; }
  touchConsultParties(c);
  store.save();
  broadcast('consults', 'queue', `consult:${c.id}`);
  res.json(enrichConsult(c));
});

app.post('/api/prescriptions/:id/order', auth, role('patient', 'caregiver'), (req, res) => {
  const r = db().prescriptions.find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'Prescription not found.' });
  if (!ownsPatient(req.user, r.patientId)) return res.status(403).json({ error: 'This prescription isn\'t on your account.' });
  if (r.status !== 'issued') return res.status(409).json({ error: 'This prescription has already been ordered.' });
  const { pharmacyId, fulfilment = 'pickup' } = req.body || {};
  // Verified stores only — an unverified store's portal shows no inbox, so the order would sit there unseen.
  if (!db().facilities.some((f) => f.id === pharmacyId && f.type === 'pharmacy' && f.verified)) return res.status(400).json({ error: 'Please choose a valid pharmacy.' });
  if (fulfilment === 'delivery') return res.status(400).json({ error: 'Home delivery is paid online first — use “Home delivery” in the app.' });
  if (fulfilment !== 'pickup') return res.status(400).json({ error: 'Choose pickup or delivery.' });
  r.pharmacyId = pharmacyId;
  r.fulfilment = 'pickup';
  r.status = 'sent';
  r.orderedAt = nowIso();
  const pharmacist = db().users.find((u) => u.facilityId === pharmacyId);
  notify(pharmacist?.id, 'New e-prescription', `${enrichRx(r).patientName} · ${r.items.length} items · ${fulfilment}`);
  store.save();
  broadcast('prescriptions', 'pharmacy');
  res.json(enrichRx(r));
});

// ---- prescription: full details (for the patient's download / print) ----
app.get('/api/prescriptions/:id', auth, (req, res) => {
  const d = db();
  const r = d.prescriptions.find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'Prescription not found.' });
  const doc = d.doctors.find((x) => x.id === r.doctorId) || {};
  const sharedWithLab = req.user.role === 'lab_tech' && d.labOrders.some((o) => o.sharedRx === r.id && o.labId === req.user.facilityId);
  const allowed = ownsPatient(req.user, r.patientId) || (req.user.role === 'doctor' && doctorFor(req.user)?.id === r.doctorId) || (req.user.role === 'pharmacist' && r.pharmacyId === req.user.facilityId) || sharedWithLab || req.user.role === 'super_admin';
  if (!allowed) return res.status(403).json({ error: 'You don\'t have access to this prescription.' });
  const p = d.patients.find((x) => x.id === r.patientId) || {};
  const c = d.consults.find((x) => x.id === r.consultId) || {};
  res.json({
    ...enrichRx(r),
    items: r.items.map((it) => { const pr = catalog.priceOf(it.drug); const units = catalog.unitsFor(it); return { ...it, units, unit: pr?.unit || 'unit', estMrp: pr ? catalog.round(pr.mrp * units) : null }; }),
    doctor: { name: doc.name, qualification: doc.qualification, specialty: doc.specialty, regNo: doc.regNo, affiliation: withAvail(doc).affiliation },
    patient: { id: p.id, name: p.name, age: ageOf(p.dob), gender: p.gender, allergies: p.allergies || [], phone: enrichRx(r).patientPhone },
    diagnosis: c.diagnosis || r.diagnosis || null, labTests: d.labOrders.filter((o) => o.rxId === r.id || (!o.rxId && o.patientId === r.patientId && o.doctorId === r.doctorId && Math.abs(new Date(o.createdAt) - new Date(r.createdAt)) < 3600000)).flatMap((o) => o.tests.map((t) => ({ ...t, labName: facilityName(o.labId) }))),
    followUp: r.followUpOn || d.consults.find((x) => x.patientId === r.patientId && x.doctorId === r.doctorId && x.status === 'scheduled' && x.createdAt >= r.createdAt)?.scheduledAt || null,
  });
});

// ---- where to buy: every nearby chemist, which of the medicines it has, and what it will cost ----
const MEDICINE_RADIUS_KM = 50;
const DELIVERY_FEE = 40;
const normDrug = (s) => String(s).toLowerCase().replace(/\s+/g, '');
// What this chemist has of the prescription, and what it costs there.
function quoteShop(d, r, f, origin) {
  const items = r.items.map((it) => {
    const units = catalog.unitsFor(it);
    const pr = catalog.priceOf(it.drug);
    const row = d.inventory.find((i) => i.facilityId === f.id && (normDrug(i.drug) === normDrug(it.drug) || normDrug(i.drug) === normDrug(pr?.name || '')));
    const free = row ? Math.max(0, row.qty - (row.safetyStock || 0)) : 0;
    const unitPrice = pr ? Math.round(pr.mrp * (f.priceFactor || 1) * 100) / 100 : null;
    return { drug: it.drug, units, unit: pr?.unit || 'unit', inStock: free >= units, partial: free > 0 && free < units, available: free, unitPrice, lineTotal: unitPrice !== null ? catalog.round(unitPrice * units) : null };
  });
  const have = items.filter((i) => i.inStock);
  return {
    id: f.id, name: f.name, district: f.district, hours: f.hours, phone: f.phone, generic: !!f.generic, delivery: !!f.delivery,
    distanceKm: geo.km(origin, geo.pointOf(f)), items, availableCount: have.length, totalItems: items.length,
    complete: have.length === items.length, total: have.reduce((s, i) => s + (i.lineTotal || 0), 0), priced: have.every((i) => i.lineTotal !== null),
  };
}
const originFor = (req, p) => {
  const lat = Number(req.query.lat ?? req.body?.lat); const lng = Number(req.query.lng ?? req.body?.lng);
  return (req.query.lat ?? req.body?.lat) != null && geo.validCoord(lat, lng) ? { lat, lng } : patientPoint(p);
};

// ---- where to buy: chemists within 50 km that have the medicines, and what each will cost ----
app.get('/api/prescriptions/:id/pharmacies', auth, role('patient', 'caregiver'), (req, res) => {
  const d = db();
  const r = d.prescriptions.find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'Prescription not found.' });
  if (!ownsPatient(req.user, r.patientId)) return res.status(403).json({ error: 'This prescription isn\'t on your account.' });
  const origin = originFor(req, d.patients.find((x) => x.id === r.patientId));
  const all = d.facilities.filter((f) => f.type === 'pharmacy' && f.verified).map((f) => quoteShop(d, r, f, origin)).filter((s) => s.availableCount > 0);
  // Within 50 km of the patient (if we know where they are); farther stores only count as "elsewhere".
  const near = all.filter((s) => s.distanceKm === null || s.distanceKm <= MEDICINE_RADIUS_KM);
  const shops = near.sort((a, b) => Number(b.complete) - Number(a.complete) || (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9)).slice(0, 8);
  const priced = shops.filter((s) => s.complete);
  const byDistance = [...shops].sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
  res.json({
    rxId: r.id, radiusKm: MEDICINE_RADIUS_KM, deliveryFee: DELIVERY_FEE,
    items: r.items.map((it) => ({ drug: it.drug, units: catalog.unitsFor(it), unit: catalog.priceOf(it.drug)?.unit || 'unit' })),
    shops, cheapestId: priced.length ? priced.reduce((m, s) => (s.total < m.total ? s : m)).id : null,
    nearestId: byDistance[0]?.id || null, fartherCount: all.length - near.length,
  });
});

// ---------- medicine orders ----------
// The patient orders either the medicines on one of their prescriptions (pick which ones and how many)
// or any other medicine by name. We show chemists within 50 km that have them, with prices. Pickup goes
// straight to the chemist; home delivery is confirmed with a 35% advance on (medicines + delivery) and
// the rest is paid on delivery. The chosen chemist gets a "new demand" pop-up and delivers itself, or a
// Nexus rider collects from the counter. With no stock nearby, the patient can ask every chemist within
// 50 km at once — the first to accept gets the order.
const ADVANCE_SHARE = 0.35;
const MED_ORDER_CLOSED = ['delivered', 'collected', 'declined', 'cancelled'];
function cleanOrderItems(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : []).slice(0, 25).map((it) => ({ drug: clean(it.drug, 80), qty: Math.max(1, Math.min(500, parseInt(it.qty, 10) || 1)) }))
    .filter((it) => it.drug.length >= 2 && !seen.has(normDrug(it.drug)) && seen.add(normDrug(it.drug)));
}
function quoteItems(d, items, f, origin) {
  const lines = items.map((it) => {
    const pr = catalog.priceOf(it.drug);
    const row = d.inventory.find((i) => i.facilityId === f.id && (normDrug(i.drug) === normDrug(it.drug) || (pr && normDrug(i.drug) === normDrug(pr.name))));
    const free = row ? Math.max(0, row.qty - (row.safetyStock || 0)) : 0;
    const unitPrice = pr ? Math.round(pr.mrp * (f.priceFactor || 1) * 100) / 100 : null;
    return { drug: it.drug, qty: it.qty, unit: pr?.unit || 'unit', inStock: free >= it.qty, partial: free > 0 && free < it.qty, available: free, unitPrice, lineTotal: unitPrice !== null ? catalog.round(unitPrice * it.qty) : null };
  });
  const have = lines.filter((l) => l.inStock);
  return {
    id: f.id, name: f.name, district: f.district, address: f.address || '', hours: f.hours, phone: f.phone, generic: !!f.generic, delivery: !!f.delivery,
    photoFileId: f.storePhotoFileId || null, distanceKm: geo.km(origin, geo.pointOf(f)), lines, availableCount: have.length, totalItems: lines.length,
    complete: have.length === lines.length, total: catalog.round(have.reduce((s, l) => s + (l.lineTotal || 0), 0)), priced: have.every((l) => l.lineTotal !== null),
  };
}
const estimateItems = (items) => catalog.round(items.reduce((s, it) => s + (catalog.priceOf(it.drug)?.mrp || 0) * it.qty, 0));
const orderTotals = (medicines, fulfilment) => {
  const deliveryFee = fulfilment === 'delivery' ? DELIVERY_FEE : 0;
  const total = catalog.round(medicines + deliveryFee);
  const advance = fulfilment === 'delivery' ? Math.ceil(total * ADVANCE_SHARE) : 0;
  return { medicines: catalog.round(medicines), deliveryFee, total, advance, balance: catalog.round(total - advance) };
};
function nearbyPharmacies(d, origin, country) {
  return d.facilities.filter((f) => f.type === 'pharmacy' && f.verified && countryOf(f) === country)
    .map((f) => ({ f, km: geo.km(origin, geo.pointOf(f)) })).filter((x) => x.km === null || x.km <= MEDICINE_RADIUS_KM);
}
function itemsFromRx(r, picks) {
  const byDrug = new Map((Array.isArray(picks) ? picks : []).map((x) => [normDrug(x.drug), x]));
  return r.items.filter((it) => !picks || byDrug.has(normDrug(it.drug)))
    .map((it) => ({ drug: it.drug, qty: byDrug.get(normDrug(it.drug))?.qty ?? catalog.unitsFor(it) }));
}
const pharmacistsOf = (d, fid) => d.users.filter((u) => u.role === 'pharmacist' && u.facilityId === fid);
function enrichMedOrder(o) {
  const d = db();
  const p = d.patients.find((x) => x.id === o.patientId) || {};
  return { ...o, pharmacyName: facilityName(o.pharmacyId) || null, patientName: p.name, rxDoctor: o.rxId ? d.doctors.find((x) => x.id === d.prescriptions.find((r) => r.id === o.rxId)?.doctorId)?.name || null : null };
}

app.post('/api/medicine-orders/quote', auth, role('patient', 'caregiver'), (req, res) => {
  const d = db();
  const p = activePatient(req);
  const b = req.body || {};
  let items;
  if (b.rxId) {
    const r = d.prescriptions.find((x) => x.id === b.rxId);
    if (!r || !ownsPatient(req.user, r.patientId)) return res.status(404).json({ error: 'Prescription not found.' });
    items = cleanOrderItems(b.items?.length ? itemsFromRx(r, b.items) : itemsFromRx(r));
  } else items = cleanOrderItems(b.items);
  if (!items.length) return res.status(400).json({ error: 'Choose at least one medicine and how many you need.' });
  const origin = originFor(req, p);
  const shops = nearbyPharmacies(d, origin, countryOf(p)).map(({ f }) => quoteItems(d, items, f, origin)).filter((s) => s.availableCount > 0)
    .sort((a, b2) => Number(b2.complete) - Number(a.complete) || b2.availableCount - a.availableCount || (a.distanceKm ?? 1e9) - (b2.distanceKm ?? 1e9)).slice(0, 10);
  const full = shops.filter((s) => s.complete && s.priced);
  res.json({
    items: items.map((it) => ({ ...it, unit: catalog.priceOf(it.drug)?.unit || 'unit', known: !!catalog.priceOf(it.drug) })), shops,
    cheapestId: full.length ? full.reduce((m, s) => (s.total < m.total ? s : m)).id : null,
    nearestId: [...shops].sort((a, b2) => (a.distanceKm ?? 1e9) - (b2.distanceKm ?? 1e9))[0]?.id || null,
    radiusKm: MEDICINE_RADIUS_KM, deliveryFee: DELIVERY_FEE, advanceShare: ADVANCE_SHARE, estimate: estimateItems(items),
    chemistsNearby: nearbyPharmacies(d, origin, countryOf(p)).length,
  });
});

app.post('/api/medicine-orders', auth, role('patient', 'caregiver'), async (req, res) => {
  const d = db();
  const p = activePatient(req);
  const b = req.body || {};
  const fulfilment = b.fulfilment === 'delivery' ? 'delivery' : 'pickup';
  let rx = null;
  let items;
  if (b.rxId) {
    rx = d.prescriptions.find((x) => x.id === b.rxId);
    if (!rx || !ownsPatient(req.user, rx.patientId)) return res.status(404).json({ error: 'Prescription not found.' });
    items = cleanOrderItems(b.items?.length ? itemsFromRx(rx, b.items) : itemsFromRx(rx));
  } else items = cleanOrderItems(b.items);
  if (!items.length) return res.status(400).json({ error: 'Choose at least one medicine and how many you need.' });
  const address = clean(b.address, 300);
  if (fulfilment === 'delivery' && address.length < 8) return res.status(400).json({ error: 'Please add the full delivery address.' });
  let rxFileId = null;
  if (b.rxFileId) {
    const f = await store.adapter().fileGet(clean(b.rxFileId, 80));
    if (!f || f.uploadedBy !== req.user.id) return res.status(400).json({ error: 'Please upload the prescription photo again.' });
    rxFileId = f.id;
  }
  const origin = originFor(req, p);
  let pharmacyId = null; let candidates = []; let lines; let medicines;
  if (b.pharmacyId === 'any') {
    // No single chemist has it — ask everyone within 50 km; the first to accept gets the order.
    candidates = nearbyPharmacies(d, origin, countryOf(p)).map(({ f }) => f.id);
    if (!candidates.length) return res.status(400).json({ error: `There's no chemist on Nexus within ${MEDICINE_RADIUS_KM} km of you yet.` });
    lines = items.map((it) => ({ ...it, unitPrice: catalog.priceOf(it.drug)?.mrp ?? null, lineTotal: catalog.priceOf(it.drug) ? catalog.round(catalog.priceOf(it.drug).mrp * it.qty) : null, estimated: true }));
    medicines = estimateItems(items);
  } else {
    const f = d.facilities.find((x) => x.id === b.pharmacyId && x.type === 'pharmacy' && x.verified);
    if (!f) return res.status(400).json({ error: 'Choose a chemist from the list.' });
    const q = quoteItems(d, items, f, origin);
    if (q.distanceKm !== null && q.distanceKm > MEDICINE_RADIUS_KM) return res.status(400).json({ error: `${f.name} is beyond ${MEDICINE_RADIUS_KM} km — choose a nearer chemist.` });
    if (!q.availableCount) return res.status(400).json({ error: `${f.name} doesn't have these medicines right now.` });
    pharmacyId = f.id;
    lines = q.lines.filter((l) => l.inStock).map(({ drug, qty, unit, unitPrice, lineTotal }) => ({ drug, qty, unit, unitPrice, lineTotal }));
    medicines = q.total;
  }
  const totals = orderTotals(medicines, fulfilment);
  const o = {
    id: store.id('mo'), orderNo: `MO-${crypto.randomInt(100000, 999999)}`, patientId: p.id, userId: req.user.id, rxId: rx?.id || null, rxFileId,
    source: rx ? 'prescription' : 'other', items: lines, pharmacyId, candidates, fulfilment, address: fulfilment === 'delivery' ? address : null,
    ...totals, advancePaid: 0, status: fulfilment === 'delivery' ? 'awaiting_payment' : 'requested', otp: String(crypto.randomInt(1000, 9999)), createdAt: nowIso(),
    note: clean(b.note, 200),
  };
  let pay = null;
  if (fulfilment === 'delivery') {
    pay = { id: store.id('pay'), purpose: 'med_order_advance', refId: o.id, amount: totals.advance, status: 'created', provider: payments.provider(), label: `35% advance · medicines ${o.orderNo}`, userId: req.user.id, patientId: p.id, createdAt: nowIso(), meta: { ...totals } };
    try {
      const order = await payments.createOrder({ amount: pay.amount, receipt: pay.id, notes: { medOrder: o.id } });
      if (order) pay.orderId = order.orderId;
    } catch (e) { return res.status(502).json({ error: e.message }); }
    o.paymentId = pay.id;
    d.payments.push(pay);
  }
  // Stored only once the gateway order exists — nothing to roll back if it doesn't (another request may have inserted meanwhile).
  d.medOrders.unshift(o);
  if (fulfilment !== 'delivery') announceMedOrder(d, o);
  audit(req.user, 'medicine_order', p.id, 'medicine', `${o.orderNo} · ${o.source} · ${fulfilment}`);
  store.save();
  broadcast('pharmacy', 'medorders');
  res.json({ order: enrichMedOrder(o), payment: pay ? payments.publicPayment(pay, { dataMode: DATA_MODE }) : null });
});

// The "new demand" pop-up for the chosen chemist (or every nearby chemist for an open request).
function announceMedOrder(d, o) {
  const p = d.patients.find((x) => x.id === o.patientId);
  const what = o.items.map((i) => `${i.drug} ×${i.qty}`).join(', ');
  const targets = o.pharmacyId ? [o.pharmacyId] : o.candidates;
  targets.forEach((fid) => pharmacistsOf(d, fid).forEach((u) => notify(u.id, o.pharmacyId ? 'New medicine order' : 'Medicine wanted nearby', `${p?.name || 'A patient'} · ${what} · ${o.fulfilment === 'delivery' ? `home delivery (₹${o.advance} advance paid)` : 'pickup'}`, 'demand')));
  automation.emit('medicine_order.placed', { orderId: o.id, orderNo: o.orderNo, patientId: o.patientId, pharmacyId: o.pharmacyId || null, pharmacyName: o.pharmacyId ? facilityName(o.pharmacyId) : null, openRequest: !o.pharmacyId, chemistsAsked: targets.length, fulfilment: o.fulfilment, itemsCount: o.items.length, total: o.total ?? null, advancePaid: o.advancePaid || 0 }, { contact: autoContact(p) });
}

app.get('/api/patient/medicine-orders', auth, role('patient', 'caregiver'), (req, res) => {
  const p = activePatient(req);
  res.json(db().medOrders.filter((o) => o.patientId === p.id).slice(0, 30).map(enrichMedOrder));
});

app.post('/api/medicine-orders/:id/cancel', auth, role('patient', 'caregiver'), (req, res) => {
  const d = db();
  const o = d.medOrders.find((x) => x.id === req.params.id);
  if (!o || !ownsPatient(req.user, o.patientId)) return res.status(404).json({ error: 'Order not found.' });
  if (!['awaiting_payment', 'requested'].includes(o.status)) return res.status(409).json({ error: 'The chemist has already accepted this order — please call them to cancel.' });
  o.status = 'cancelled'; o.cancelledAt = nowIso();
  if (o.advancePaid) o.refundDue = o.advancePaid;
  const opay = o.paymentId && d.payments.find((x) => x.id === o.paymentId);
  if (opay?.status === 'created') opay.status = 'void';
  (o.pharmacyId ? [o.pharmacyId] : o.candidates).forEach((fid) => pharmacistsOf(d, fid).forEach((u) => touch(u.id)));
  store.save();
  broadcast('pharmacy', 'medorders');
  res.json(enrichMedOrder(o));
});

app.post('/api/medicine-orders/:id/respond', auth, role('pharmacist'), (req, res) => {
  const d = db();
  const fid = req.user.facilityId;
  const o = d.medOrders.find((x) => x.id === req.params.id);
  if (!o || !(o.pharmacyId === fid || (!o.pharmacyId && o.candidates.includes(fid)))) return res.status(404).json({ error: 'Order not found.' });
  if (o.status !== 'requested') return res.status(409).json({ error: o.status === 'accepted' && o.pharmacyId !== fid ? 'Another chemist has already taken this order.' : 'This order has already been handled.' });
  const f = d.facilities.find((x) => x.id === fid);
  const p = d.patients.find((x) => x.id === o.patientId);
  if (req.body?.action === 'decline') {
    if (!o.pharmacyId) {
      o.candidates = o.candidates.filter((x) => x !== fid);
      if (o.candidates.length) { store.save(); broadcast('pharmacy'); return res.json({ ok: true }); }
    }
    o.status = 'declined'; o.declinedAt = nowIso(); o.declineReason = clean(req.body?.reason, 160) || 'Not available right now';
    if (o.advancePaid) o.refundDue = o.advancePaid;
    patientOwnerUserIds(p).forEach((u) => notify(u, 'Order not accepted', `${o.pharmacyId ? f.name : 'Nearby chemists'} couldn't take order ${o.orderNo}: ${o.declineReason}.${o.advancePaid ? ` Your advance of ₹${o.advancePaid} will be refunded.` : ''} Try another chemist.`));
  } else {
    if (!o.pharmacyId) {
      // First to accept an open request: re-price at this chemist's rates; the other chemists' screens drop it.
      o.candidates.forEach((cid) => { if (cid !== fid) pharmacistsOf(d, cid).forEach((u) => touch(u.id)); });
      o.pharmacyId = fid;
      const q = quoteItems(d, o.items, f, geo.pointOf(p));
      const lines = q.lines.filter((l) => l.inStock).map(({ drug, qty, unit, unitPrice, lineTotal }) => ({ drug, qty, unit, unitPrice, lineTotal }));
      if (lines.length && lines.every((l) => l.lineTotal !== null)) {
        o.items = lines;
        const t = orderTotals(lines.reduce((sum, l) => sum + (l.lineTotal || 0), 0), o.fulfilment);
        const over = catalog.round(Math.max(0, (o.advancePaid || 0) - t.total));
        Object.assign(o, { medicines: t.medicines, deliveryFee: t.deliveryFee, total: t.total, balance: catalog.round(Math.max(0, t.total - (o.advancePaid || 0))), ...(over ? { refundDue: over } : {}) });
      }
    }
    o.status = 'accepted'; o.acceptedAt = nowIso();
    if (o.fulfilment === 'delivery') o.deliveryBy = req.body?.deliveryBy === 'store' ? 'store' : 'nexus';
    const how = o.fulfilment === 'pickup' ? `Pick it up at ${f.name}${f.address ? `, ${f.address}` : ''} — show code ${o.otp} at the counter.` : o.deliveryBy === 'store' ? `${f.name} will deliver it to you.` : `A Nexus rider will collect it from ${f.name} and bring it to you.`;
    patientOwnerUserIds(p).forEach((u) => notify(u, 'Order accepted ✅', `${o.orderNo}: ${how}`));
  }
  audit(req.user, `medorder_${o.status}`, o.patientId, 'medicine', o.orderNo);
  automation.emit('medicine_order.updated', { orderId: o.id, orderNo: o.orderNo, patientId: o.patientId, status: o.status, pharmacyId: fid, pharmacyName: f?.name || null, fulfilment: o.fulfilment, deliveryBy: o.deliveryBy || null, refundDue: o.refundDue || 0 }, { contact: autoContact(p) });
  store.save();
  broadcast('pharmacy', 'medorders');
  res.json({ ...enrichMedOrder(o), otp: undefined });
});

app.post('/api/medicine-orders/:id/status', auth, role('pharmacist'), (req, res) => {
  const d = db();
  const fid = req.user.facilityId;
  const o = d.medOrders.find((x) => x.id === req.params.id && x.pharmacyId === fid);
  if (!o) return res.status(404).json({ error: 'Order not found.' });
  const next = req.body?.status;
  const flow = o.fulfilment === 'pickup' ? { accepted: ['packed'], packed: ['collected'] } : o.deliveryBy === 'store' ? { accepted: ['packed'], packed: ['out_for_delivery'], out_for_delivery: ['delivered'] } : { accepted: ['packed'] };
  if (!(flow[o.status] || []).includes(next)) return res.status(400).json({ error: 'That step isn\'t possible for this order right now.' });
  if (['collected', 'delivered'].includes(next)) {
    if ((o.otpAttempts || 0) >= 5) return res.status(429).json({ error: 'Too many wrong codes. Ask the patient to contact support.' });
    if (String(req.body?.otp || '') !== o.otp) { o.otpAttempts = (o.otpAttempts || 0) + 1; store.save(); return res.status(400).json({ error: 'The 4-digit code doesn\'t match. Ask the patient for the code in their app.' }); }
  }
  const f = d.facilities.find((x) => x.id === fid);
  const p = d.patients.find((x) => x.id === o.patientId);
  if (next === 'packed') {
    for (const it of o.items) {
      const inv = d.inventory.find((i) => i.facilityId === fid && normDrug(i.drug) === normDrug(it.drug));
      if (inv) inv.qty = Math.max(0, inv.qty - it.qty);
    }
    if (o.fulfilment === 'delivery' && o.deliveryBy === 'nexus') {
      const rider = d.users.find((u) => u.role === 'delivery' && u.status === 'active' && (!u.region?.district || u.region.district === f.district)) || d.users.find((u) => u.role === 'delivery' && u.status === 'active');
      d.deliveries.unshift({ id: store.id('del'), kind: 'med_order', refId: o.id, pickup: `${f.name}${f.address ? `, ${f.address}` : ''}`, drop: `${p.name} · ${o.address}`, courierId: rider?.id || null, status: rider ? 'assigned' : 'unassigned', coldChain: o.items.some((i) => /insulin|vaccine/i.test(i.drug)), otp: o.otp, items: o.items.map((i) => `${i.drug} ×${i.qty}`).join(', '), collect: o.balance, distanceKm: geo.km(geo.pointOf(f), geo.pointOf(p)), createdAt: nowIso() });
      if (rider) notify(rider.id, 'New pickup', `${f.name} → ${p.name}${o.balance ? ` · collect ₹${o.balance}` : ''}`);
      o.riderId = rider?.id || null;
    }
  }
  o.status = next; o[`${next}At`] = nowIso();
  if (['collected', 'delivered'].includes(next)) o.balancePaid = o.balance;
  const msg = { packed: o.fulfilment === 'pickup' ? `Packed and ready at ${f.name}. Show code ${o.otp} at the counter.` : 'Packed — on its way soon.', out_for_delivery: `On the way from ${f.name}. Share code ${o.otp} with the delivery person.`, delivered: 'Delivered. Get well soon!', collected: 'Collected. Get well soon!' }[next];
  patientOwnerUserIds(p).forEach((u) => notify(u, `Medicines · ${o.orderNo}`, msg));
  automation.emit(next === 'delivered' ? 'medicine_order.delivered' : 'medicine_order.updated', { orderId: o.id, orderNo: o.orderNo, patientId: o.patientId, status: next, pharmacyId: fid, pharmacyName: f.name, fulfilment: o.fulfilment, deliveryBy: o.deliveryBy || null, by: 'store' }, { contact: autoContact(p) });
  store.save();
  broadcast('pharmacy', 'medorders', 'dispatch');
  res.json({ ...enrichMedOrder(o), otp: undefined });
});

// ---- lab tests: my ordered tests, where each can be done, cost and how reporting works ----
function testInfo(t) {
  const c = catalog.TESTS[t.code] || {};
  return { code: t.code, name: catalog.nameOfTest(t.code, t.name), sample: c.sample || 'As advised', prep: c.prep || 'Ask the lab', tatHours: c.tatHours || 24, base: c.base || null };
}
function labQuote(lab, tests, origin) {
  const offered = tests.filter((t) => !lab.tests || lab.tests.includes(t.code));
  const lines = offered.map((t) => { const info = testInfo(t); return { ...info, price: info.base ? catalog.round(info.base * (lab.priceFactor || 1)) : null, tatHours: Math.round(info.tatHours * (lab.tatFactor || 1)) }; });
  return {
    id: lab.id, name: lab.name, district: lab.district, hours: lab.hours, phone: lab.phone, nabl: !!lab.nabl, government: !!lab.government,
    homeCollection: !!lab.homeCollection, reportVia: lab.reportVia || ['App'], distanceKm: geo.km(origin, geo.pointOf(lab)),
    lines, offersAll: offered.length === tests.length, missing: tests.filter((t) => !offered.includes(t)).map((t) => catalog.nameOfTest(t.code, t.name)),
    total: lines.reduce((s, l) => s + (l.price || 0), 0), reportInHours: lines.length ? Math.max(...lines.map((l) => l.tatHours)) : null,
  };
}
const LAB_STEPS = ['ordered', 'collected', 'received', 'processing', 'reported'];

app.get('/api/patient/tests', auth, role('patient', 'caregiver'), (req, res) => {
  const d = db();
  const p = activePatient(req);
  const lat = Number(req.query.lat); const lng = Number(req.query.lng);
  const origin = req.query.lat != null && geo.validCoord(lat, lng) ? { lat, lng } : patientPoint(p);
  const orders = d.labOrders.filter((o) => o.patientId === p.id).map((o) => {
    const lab = d.facilities.find((f) => f.id === o.labId);
    return {
      ...enrichLab(o), tests: o.tests.map(testInfo), stepIndex: LAB_STEPS.indexOf(o.status),
      insights: o.status === 'reported' ? (o.insights || catalog.interpret(o.results || [])) : [],
      nextSteps: o.status === 'reported' ? (o.nextSteps || catalog.nextSteps(o.results || [], { doctorName: d.doctors.find((x) => x.id === o.doctorId)?.name })) : [],
      quote: lab ? labQuote(lab, o.tests, origin) : null, canChangeLab: o.status === 'ordered' && !o.booking?.paidAt,
      bookingState: o.status !== 'ordered' ? 'in_lab' : o.booking?.paidAt ? 'paid' : o.booking ? 'awaiting_payment' : 'to_book',
      paymentId: o.booking && !o.booking.paidAt ? o.booking.paymentId : null, reviewed: !!o.review,
    };
  }).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  res.json({ orders, steps: LAB_STEPS });
});

// Lab trust signals: rating & reviews, and how many tests it has completed on Nexus (popularity).
const LAB_ADVANCE_SHARE = 0.2; // paid online to confirm a lab booking (cuts fake bookings); the rest at the lab
function labStats(lab, doneCount) {
  const r = lab.reviewStats || { count: 0, sum: 0 };
  return { rating: r.count ? Math.round((r.sum / r.count) * 10) / 10 : (lab.rating || 0), reviewCount: r.count, testsDone: (lab.testsDoneBase || 0) + (doneCount || 0) };
}
// Where the patient saw the doctor who ordered the test: that consult's clinic, else the doctor's clinic / area.
function doctorPlaceFor(d, o) {
  const rx = o.rxId && d.prescriptions.find((r) => r.id === o.rxId);
  const c = rx?.consultId && d.consults.find((x) => x.id === rx.consultId);
  const doc = d.doctors.find((x) => x.id === o.doctorId);
  const fac = (c?.location?.facilityId && d.facilities.find((f) => f.id === c.location.facilityId))
    || (rx?.facilityId && d.facilities.find((f) => f.id === rx.facilityId))
    || (doc?.facilityId && d.facilities.find((f) => f.id === doc.facilityId));
  const point = geo.pointOf(fac || doc);
  return point ? { point, label: fac ? fac.name : `${doc?.name || 'your doctor'}'s area${doc?.district ? ` (${doc.district})` : ''}` } : null;
}

app.get('/api/lab-orders/:id/labs', auth, role('patient', 'caregiver'), (req, res) => {
  const d = db();
  const o = d.labOrders.find((x) => x.id === req.params.id);
  if (!o) return res.status(404).json({ error: 'Test order not found.' });
  if (!ownsPatient(req.user, o.patientId)) return res.status(403).json({ error: 'This test isn\'t on your account.' });
  const p = d.patients.find((x) => x.id === o.patientId);
  const lat = Number(req.query.lat); const lng = Number(req.query.lng);
  const docPlace = doctorPlaceFor(d, o);
  const homePoint = geo.pointOf(p); // permanent address
  const nowPoint = req.query.lat != null && geo.validCoord(lat, lng) ? { lat, lng } : patientPoint(p);
  const near = ['doctor', 'home', 'current'].includes(req.query.near) ? req.query.near : (docPlace ? 'doctor' : 'home');
  const origin = near === 'doctor' ? docPlace?.point : near === 'current' ? nowPoint : homePoint;
  const done = new Map();
  for (const x of d.labOrders) if (x.status === 'reported') done.set(x.labId, (done.get(x.labId) || 0) + 1);
  // Only centres that do every test on the prescription.
  let labs = d.facilities.filter((f) => f.type === 'lab' && f.verified && countryOf(f) === countryOf(p))
    .map((f) => ({ ...labQuote(f, o.tests, origin), ...labStats(f, done.get(f.id)) })).filter((l) => l.offersAll);
  const sort = ['distance', 'cost', 'rating', 'popularity'].includes(req.query.sort) ? req.query.sort : 'distance';
  const by = {
    distance: (x, y) => (x.distanceKm ?? 1e9) - (y.distanceKm ?? 1e9),
    cost: (x, y) => x.total - y.total || (x.distanceKm ?? 1e9) - (y.distanceKm ?? 1e9),
    rating: (x, y) => y.rating - x.rating || y.reviewCount - x.reviewCount,
    popularity: (x, y) => y.testsDone - x.testsDone,
  }[sort];
  labs = labs.sort(by);
  res.json({
    tests: o.tests.map(testInfo), labs, currentLabId: o.labId, near, sort, advanceShare: LAB_ADVANCE_SHARE,
    places: {
      doctor: docPlace ? { label: docPlace.label } : null,
      home: homePoint ? { label: [p.address, p.district].filter(Boolean).join(', ') || 'Your address' } : null,
      current: { label: p.currentLocation?.source === 'live' ? 'Your live location' : p.currentLocation?.district ? p.currentLocation.district : 'Where you are now' },
    },
    cheapestId: labs.length ? labs.reduce((m, l) => (l.total < m.total ? l : m)).id : null,
    fastestId: labs.length ? labs.reduce((m, l) => (l.reportInHours < m.reportInHours ? l : m)).id : null,
    topRatedId: labs.length ? labs.reduce((m, l) => (l.rating > m.rating ? l : m)).id : null,
  });
});

app.post('/api/lab-orders/:id/book', auth, role('patient', 'caregiver'), async (req, res) => {
  const d = db();
  const o = d.labOrders.find((x) => x.id === req.params.id);
  if (!o) return res.status(404).json({ error: 'Test order not found.' });
  if (!ownsPatient(req.user, o.patientId)) return res.status(403).json({ error: 'This test isn\'t on your account.' });
  if (o.status !== 'ordered') return res.status(409).json({ error: 'The sample has already been collected — the lab can\'t be changed now.' });
  if (o.booking?.paidAt) return res.status(409).json({ error: 'This test is already booked and paid. Call the lab to change the time.' });
  const lab = d.facilities.find((f) => f.id === req.body?.labId && f.type === 'lab' && f.verified);
  if (!lab) return res.status(400).json({ error: 'Choose a lab from the list.' });
  const q = labQuote(lab, o.tests, null);
  if (!q.offersAll) return res.status(400).json({ error: `${lab.name} doesn't do ${q.missing.join(', ')}. Choose another lab.` });
  const home = Boolean(req.body?.homeCollection) && lab.homeCollection;
  const slot = req.body?.slot && !Number.isNaN(Date.parse(req.body.slot)) ? new Date(req.body.slot).toISOString() : null;
  const price = catalog.round(q.total + (home ? 50 : 0));
  const advance = Math.max(1, Math.ceil(price * LAB_ADVANCE_SHARE));
  const p = d.patients.find((x) => x.id === o.patientId);
  d.payments.filter((x) => x.purpose === 'lab_advance' && x.refId === o.id && x.status === 'created').forEach((x) => { x.status = 'void'; });
  const pay = { id: store.id('pay'), purpose: 'lab_advance', refId: o.id, amount: advance, status: 'created', provider: payments.provider(), label: `20% advance · ${o.tests.map((t) => t.name).join(', ')} at ${lab.name}`, userId: req.user.id, patientId: o.patientId, createdAt: nowIso(), meta: { labId: lab.id, price } };
  try {
    const order = await payments.createOrder({ amount: pay.amount, receipt: pay.id, notes: { labOrder: o.id } });
    if (order) pay.orderId = order.orderId;
  } catch (e) { return res.status(502).json({ error: e.message }); }
  d.payments.push(pay);
  o.labId = lab.id;
  o.booking = { homeCollection: home, slot, price, advance, balance: catalog.round(price - advance), reportInHours: q.reportInHours, bookedAt: nowIso(), paymentId: pay.id, paidAt: null, nearBy: ['doctor', 'home', 'current'].includes(req.body?.near) ? req.body.near : null };
  if (req.body?.shareRx !== false) {
    // The prescription this test came from (or the ordering doctor's latest one for this patient).
    const rx = (o.rxId && d.prescriptions.find((r) => r.id === o.rxId)) || [...d.prescriptions].reverse().find((r) => r.patientId === o.patientId && r.doctorId === o.doctorId);
    if (rx) { o.sharedRx = rx.id; o.sharedBy = 'patient'; }
  } else { o.sharedRx = null; o.sharedBy = null; }
  audit(req.user, 'booked_lab', o.patientId, 'lab', `${lab.name} · ${o.id} · advance ₹${advance}`);
  store.save();
  broadcast('lab', 'records'); // the patient's other tabs/devices; the lab hears about it once the advance is paid
  res.json({ ok: true, labName: lab.name, booking: o.booking, sharedRx: !!o.sharedRx, payment: payments.publicPayment(pay, { dataMode: DATA_MODE }), patientName: p?.name });
});

// ---------- bookings, payments, visit passes ----------
// Patient picks a doctor → chooses video / at the doctor's own hospital or clinic / at a Nexus E-Clinic →
// pays → the consult unlocks, the doctor gets a pop-up, and in-person visits get a rotating QR pass.
const PASS_WINDOW_S = 30;
const passWindow = () => Math.floor(Date.now() / 1000 / PASS_WINDOW_S);
const passCode = (c, w) => String(parseInt(crypto.createHmac('sha256', JWT_SECRET).update(`${c.id}:${c.visitSecret}:${w}`).digest('hex').slice(0, 8), 16) % 1000000).padStart(6, '0');
const checkInLimiter = security.rateLimit({ windowMs: 60000, max: 20, key: (r) => r.headers.authorization || '', message: 'Too many check-in attempts. Wait a minute and try again.' });

// Nexus E-Clinics (in person) are "coming soon": shown, not bookable, until ECLINICS_LIVE=true.
const ECLINICS_LIVE = process.env.ECLINICS_LIVE === 'true';
// A flat booking amount keeps fake / no-show bookings away. In-person visits pay the doctor's own
// consultation fee at the clinic; video consults are paid in full online (never less than the booking fee).
const BOOKING_FEE = Math.max(1, Number(process.env.BOOKING_FEE) || 100);
const bookingAmount = (doc, visitType) => (visitType === 'video' ? Math.max(BOOKING_FEE, doc.fee || 0) : BOOKING_FEE);
function makeBookingNo(d) {
  let no;
  do { no = `NX-${crypto.randomInt(10000000, 99999999)}`; } while (d.consults.some((c) => c.bookingNo === no));
  return no;
}

function bookingOptions(d, doc) {
  const fac = doc.facilityId ? d.facilities.find((f) => f.id === doc.facilityId && f.verified) : null;
  const clinics = isEClinicDoctor(doc) ? d.facilities.filter((f) => f.type === 'kiosk' && f.verified && (!(doc.eClinicIds || []).length || doc.eClinicIds.includes(f.id))) : [];
  return {
    video: true,
    clinic: fac ? { facilityId: fac.id, name: fac.name, address: fac.address || '', district: fac.district, hours: fac.hours || null, subtype: fac.subtype || 'hospital', opdFee: fac.opdFee ?? null } : null,
    eclinics: clinics.map((f) => ({ facilityId: f.id, name: f.name, district: f.district, address: f.address || '', status: f.status })),
    eclinicsComingSoon: !ECLINICS_LIVE,
    fees: { bookingFee: BOOKING_FEE, video: bookingAmount(doc, 'video'), inPerson: BOOKING_FEE, payAtClinic: doc.fee || 0 },
  };
}

app.get('/api/doctors/:id/booking-options', auth, role('patient', 'caregiver'), (req, res) => {
  const d = db();
  const doc = d.doctors.find((x) => x.id === req.params.id && x.verified);
  if (!doc) return res.status(404).json({ error: 'Doctor not found.' });
  const pub = publicDoctor(doc);
  res.json({ doctor: pub, options: bookingOptions(d, doc), payment: { provider: payments.provider(), demoConfirmAllowed: payments.provider() === 'demo' && payments.demoAllowed(DATA_MODE) } });
});

app.post('/api/bookings', auth, role('patient', 'caregiver'), async (req, res) => {
  const d = db();
  const b = req.body || {};
  const p = activePatient(req);
  if (!p) return res.status(404).json({ error: 'Profile not found.' });
  const missing = bookingMissing(p);
  if (missing.length) return res.status(428).json({ error: 'Please complete your profile to book — we need your age and permanent address.', code: 'PROFILE_INCOMPLETE', missing });
  const doc = d.doctors.find((x) => x.id === b.doctorId && x.verified);
  if (!doc) return res.status(404).json({ error: 'Doctor not found.' });
  const opts = bookingOptions(d, doc);
  const visitType = ['video', 'clinic', 'eclinic'].includes(b.visitType) ? b.visitType : 'video';
  let location = null;
  if (visitType === 'clinic') {
    if (!opts.clinic) return res.status(400).json({ error: 'This doctor doesn\'t see patients at a clinic on Nexus. Choose a video consult.' });
    location = { kind: 'clinic', ...opts.clinic };
  } else if (visitType === 'eclinic') {
    if (!ECLINICS_LIVE) return res.status(400).json({ error: 'Nexus E-Clinics are coming soon. Please book a video consult or visit the doctor\'s clinic.' });
    const ec = opts.eclinics.find((x) => x.facilityId === b.eClinicId);
    if (!ec) return res.status(400).json({ error: 'Choose one of this doctor\'s E-Clinics.' });
    location = { kind: 'eclinic', ...ec };
  }
  const now = b.when === 'now';
  if (now && (visitType !== 'video' || !availabilityOf(doc, { facilities: d.facilities }).available)) return res.status(400).json({ error: 'The doctor isn\'t available right now — please pick a time.' });
  let scheduledAt = null;
  if (!now) {
    const t = Date.parse(b.scheduledAt);
    if (!Number.isFinite(t) || t < Date.now() - 60000 || t > Date.now() + 31 * 86400000) return res.status(400).json({ error: 'Please pick a time within the next month.' });
    scheduledAt = new Date(t).toISOString();
  }
  const symptoms = clean(b.symptoms, 500) || p.currentSymptoms?.text || '';
  if (symptoms.length < 3) return res.status(400).json({ error: 'Please tell the doctor what is bothering you — type it or tap the mic and speak.' });
  const symptomDays = b.symptomDays === '' || b.symptomDays == null ? (p.currentSymptoms?.days ?? null) : Math.max(0, Math.min(3650, parseInt(b.symptomDays, 10) || 0));
  const t = engines.triage({ symptoms, age: ageOf(p.dob) ?? undefined }, d.aiConfig);
  const amount = bookingAmount(doc, visitType);
  p.currentSymptoms = { ...(p.currentSymptoms || {}), text: symptoms, days: symptomDays, at: nowIso() };
  const consult = {
    id: store.id('con'), bookingNo: makeBookingNo(d), patientId: p.id, doctorId: doc.id, kioskId: null, status: 'awaiting_payment', type: now ? 'instant' : 'scheduled',
    mode: visitType === 'video' ? (['video', 'audio', 'chat'].includes(b.mode) ? b.mode : 'video') : 'in_person', visitType, location,
    triage: { level: t.level, score: t.score, symptoms, symptomDays, note: t.note, specialty: doc.specialty, redFlags: t.redFlags }, vitals: null,
    createdAt: nowIso(), scheduledAt, messages: [], routing: null, routedFrom: 'Booked by patient', fee: amount,
    payAtClinic: visitType === 'video' ? 0 : (doc.fee || 0),
  };
  const pay = { id: store.id('pay'), purpose: 'consult', refId: consult.id, amount, status: 'created', provider: payments.provider(), label: visitType === 'video' ? `Video consult · ${doc.name}` : `Booking fee · ${doc.name}`, userId: req.user.id, patientId: p.id, createdAt: nowIso() };
  try {
    const order = await payments.createOrder({ amount: pay.amount, receipt: pay.id, notes: { consult: consult.id } });
    if (order) pay.orderId = order.orderId;
  } catch (e) { return res.status(502).json({ error: e.message }); }
  consult.paymentId = pay.id;
  d.consults.push(consult);
  d.payments.push(pay);
  store.save();
  res.json({ consult: enrichConsult(consult), payment: payments.publicPayment(pay, { dataMode: DATA_MODE }), emergency: t.level === 'emergency' ? t.advice : null });
});

// Home delivery of a prescription: pay medicines + delivery fee, then the order goes to the chemist.
app.post('/api/prescriptions/:id/delivery-payment', auth, role('patient', 'caregiver'), async (req, res) => {
  const d = db();
  const r = d.prescriptions.find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'Prescription not found.' });
  if (!ownsPatient(req.user, r.patientId)) return res.status(403).json({ error: 'This prescription isn\'t on your account.' });
  if (r.status !== 'issued') return res.status(409).json({ error: 'This prescription has already been ordered.' });
  const f = d.facilities.find((x) => x.id === req.body?.pharmacyId && x.type === 'pharmacy' && x.verified);
  if (!f) return res.status(400).json({ error: 'Choose a chemist from the list.' });
  const address = clean(req.body?.address, 300);
  if (address.length < 8) return res.status(400).json({ error: 'Please add the full delivery address.' });
  d.payments.filter((x) => x.purpose === 'delivery' && x.refId === r.id && x.status === 'created').forEach((x) => { x.status = 'void'; });
  const q = quoteShop(d, r, f, originFor(req, d.patients.find((x) => x.id === r.patientId)));
  if (!q.availableCount) return res.status(400).json({ error: `${f.name} doesn't have these medicines right now.` });
  if (q.distanceKm !== null && q.distanceKm > MEDICINE_RADIUS_KM) return res.status(400).json({ error: `${f.name} is beyond ${MEDICINE_RADIUS_KM} km — choose a nearer chemist.` });
  const pay = {
    id: store.id('pay'), purpose: 'delivery', refId: r.id, amount: q.total + DELIVERY_FEE, status: 'created', provider: payments.provider(),
    label: `Medicines + delivery · ${f.name}`, userId: req.user.id, patientId: r.patientId, createdAt: nowIso(),
    meta: { pharmacyId: f.id, address, medicines: q.total, deliveryFee: DELIVERY_FEE, items: q.items.filter((i) => i.inStock).map((i) => ({ drug: i.drug, units: i.units, lineTotal: i.lineTotal })) },
  };
  try {
    const order = await payments.createOrder({ amount: pay.amount, receipt: pay.id, notes: { prescription: r.id } });
    if (order) pay.orderId = order.orderId;
  } catch (e) { return res.status(502).json({ error: e.message }); }
  d.payments.push(pay);
  store.save();
  res.json({ payment: payments.publicPayment(pay, { dataMode: DATA_MODE }), breakdown: pay.meta });
});

app.get('/api/payments/:id', auth, (req, res) => {
  const pay = db().payments.find((x) => x.id === req.params.id);
  if (!pay || pay.userId !== req.user.id) return res.status(404).json({ error: 'Payment not found.' });
  res.json(payments.publicPayment(pay, { dataMode: DATA_MODE }));
});

// Who hears about a booking: the doctor; for a doctor listed by a clinic without their own account yet,
// the clinic owner / hospital admins instead.
function doctorInbox(d, doc) {
  if (doc.userId) return [doc.userId];
  const f = doc.facilityId && d.facilities.find((x) => x.id === doc.facilityId);
  if (!f) return [];
  const owner = f.ownerDoctorId && d.doctors.find((x) => x.id === f.ownerDoctorId)?.userId;
  return [owner, ...d.users.filter((u) => u.role === 'hospital_admin' && u.facilityId === f.id).map((u) => u.id)].filter(Boolean);
}

// The nearest active rider (same district first); null if none — the job then waits as "unassigned".
function pickRider(d, district) {
  const riders = d.users.filter((u) => u.role === 'delivery' && u.status === 'active');
  return riders.find((u) => district && u.region?.district === district) || riders[0] || null;
}

function finalizePayment(d, pay, user) {
  if (pay.purpose === 'consult') {
    const c = d.consults.find((x) => x.id === pay.refId);
    const doc = c && d.doctors.find((x) => x.id === c.doctorId);
    const p = c && d.patients.find((x) => x.id === c.patientId);
    if (!c || !doc || !p) return;
    c.status = c.type === 'instant' ? 'queued' : 'scheduled';
    c.paidAt = nowIso();
    if (c.mode === 'in_person') c.visitSecret = crypto.randomBytes(16).toString('hex');
    // Booking a doctor implies a time-limited consent for that doctor to see the history.
    d.consents.push({ id: store.id('cst'), patientId: p.id, granteeType: 'doctor', granteeId: doc.id, granteeName: doc.name, scope: ['history', 'prescriptions', 'labs', 'allergies'], purpose: 'Booked consultation', start: nowIso(), expiry: new Date(Math.max(Date.now(), Date.parse(c.scheduledAt || 0)) + 3 * 86400000).toISOString(), status: 'active' });
    const where = c.mode === 'in_person' ? ` · in person at ${c.location?.name}` : ` · ${c.mode} consult`;
    doctorInbox(d, doc).forEach((uid) => notify(uid, 'New paid booking', `${doc.userId ? '' : `For ${doc.name}: `}${p.name} · ${c.triage.symptoms.slice(0, 80)}${where}${c.scheduledAt ? ` · ${new Date(c.scheduledAt).toLocaleString('en-IN', { timeZone: APP_TZ })}` : ' · now'}`));
    patientOwnerUserIds(p).forEach((u) => notify(u, 'Booking confirmed', `${doc.name}${where}. ${c.mode === 'in_person' ? 'Show your visit QR at the reception.' : 'We\'ll alert you when the doctor joins.'}`));
    audit(user, 'paid_booking', p.id, 'consult', `${c.id} · ₹${pay.amount}`);
    automation.emit('booking.confirmed', { consultId: c.id, patientId: p.id, doctorId: doc.id, doctorName: doc.name, mode: c.mode, location: c.location?.name || null, scheduledAt: c.scheduledAt || null, amount: pay.amount }, { contact: autoContact(p) });
  } else if (pay.purpose === 'lab_advance') {
    const o = d.labOrders.find((x) => x.id === pay.refId);
    if (!o || o.booking?.paymentId !== pay.id) return;
    Object.assign(o.booking, { paidAt: nowIso(), advancePaid: pay.amount });
    o.needsBooking = false;
    const p = d.patients.find((x) => x.id === o.patientId);
    const when = o.booking.slot ? ` · ${new Date(o.booking.slot).toLocaleString('en-IN', { timeZone: APP_TZ, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : '';
    d.users.filter((u) => u.role === 'lab_tech' && u.facilityId === o.labId).forEach((u) => notify(u.id, 'New paid test booking', `${p?.name} · ${o.tests.map((t) => t.name).join(', ')} · ${o.booking.homeCollection ? 'home collection' : 'walk-in'}${when} · ₹${pay.amount} advance paid, collect ₹${o.booking.balance}`));
    patientOwnerUserIds(p).forEach((u) => notify(u, 'Test booked ✅', `${facilityName(o.labId)}${when}. ₹${pay.amount} paid — pay ₹${o.booking.balance} at the lab. Report in about ${o.booking.reportInHours} hours after the sample.`));
    audit(user, 'paid_lab_advance', o.patientId, 'lab', `${o.id} · ₹${pay.amount}`);
    automation.emit('lab.booked', { labOrderId: o.id, patientId: o.patientId, labId: o.labId, labName: facilityName(o.labId), testsCount: o.tests.length, homeCollection: !!o.booking.homeCollection, slot: o.booking.slot || null, advancePaid: pay.amount, balance: o.booking.balance, reportInHours: o.booking.reportInHours }, { contact: autoContact(p) });
  } else if (pay.purpose === 'med_order_advance') {
    const o = d.medOrders.find((x) => x.id === pay.refId);
    if (!o || o.status !== 'awaiting_payment') return;
    o.advancePaid = pay.amount; o.status = 'requested'; o.paidAt = nowIso();
    announceMedOrder(d, o);
    audit(user, 'paid_medicine_advance', o.patientId, 'medicine', `${o.orderNo} · ₹${pay.amount}`);
  } else if (pay.purpose === 'delivery') {
    const r = d.prescriptions.find((x) => x.id === pay.refId);
    if (!r || r.status !== 'issued') return;
    Object.assign(r, { pharmacyId: pay.meta.pharmacyId, fulfilment: 'delivery', address: pay.meta.address, status: 'sent', orderedAt: nowIso(), paid: { amount: pay.amount, deliveryFee: pay.meta.deliveryFee, paymentId: pay.id } });
    d.users.filter((u) => u.role === 'pharmacist' && u.facilityId === r.pharmacyId).forEach((u) => notify(u.id, 'New paid delivery order', `${enrichRx(r).patientName} · ${r.items.length} items · prepaid ₹${pay.amount}`));
    audit(user, 'paid_delivery', r.patientId, 'prescription', `${r.id} · ₹${pay.amount}`);
  }
}

// Is the thing being paid for still waiting for this payment? (Not cancelled, expired or already paid.)
function payableProblem(d, pay) {
  if (pay.status === 'void') return 'This payment was cancelled.';
  if (pay.purpose === 'consult') {
    const c = d.consults.find((x) => x.id === pay.refId);
    if (!c || c.status !== 'awaiting_payment') return 'This booking was cancelled or has expired. Please book again.';
    if (c.scheduledAt && Date.parse(c.scheduledAt) < Date.now() - 15 * 60000) return 'This appointment time has passed. Please book a new time.';
  } else if (pay.purpose === 'lab_advance') {
    const o = d.labOrders.find((x) => x.id === pay.refId);
    if (!o || o.status !== 'ordered' || o.booking?.paymentId !== pay.id) return 'This test booking changed or was cancelled. Please book again.';
  } else if (pay.purpose === 'med_order_advance') {
    const o = d.medOrders.find((x) => x.id === pay.refId);
    if (!o || o.status !== 'awaiting_payment') return 'This order was cancelled or has expired. Please order again.';
  } else if (pay.purpose === 'delivery') {
    const r = d.prescriptions.find((x) => x.id === pay.refId);
    if (!r || r.status !== 'issued') return 'This prescription has already been ordered.';
    if (d.payments.some((x) => x.id !== pay.id && x.purpose === 'delivery' && x.refId === pay.refId && x.status === 'paid')) return 'This delivery is already paid.';
  }
  return null;
}

app.post('/api/payments/:id/confirm', auth, (req, res) => {
  const d = db();
  const pay = d.payments.find((x) => x.id === req.params.id);
  if (!pay || pay.userId !== req.user.id) return res.status(404).json({ error: 'Payment not found.' });
  if (pay.status === 'paid') return res.json(payments.publicPayment(pay, { dataMode: DATA_MODE }));
  if (pay.status === 'refund_pending') return res.status(409).json({ error: 'This payment is being refunded.' });
  const problem = payableProblem(d, pay);
  if (problem && pay.provider !== 'razorpay') return res.status(409).json({ error: problem });
  if (pay.provider === 'razorpay') {
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body || {};
    if (orderId !== pay.orderId || !payments.verifySignature({ orderId, paymentId, signature })) return res.status(400).json({ error: 'We couldn\'t verify this payment. If money was deducted, it will be refunded automatically.' });
    pay.method = 'razorpay'; pay.gatewayPaymentId = paymentId;
  } else {
    if (!payments.demoAllowed(DATA_MODE)) return res.status(403).json({ error: 'Online payments aren\'t switched on yet. Please contact support.' });
    pay.method = 'demo';
  }
  if (problem) {
    // Real money was captured for something that's no longer payable: record it for refund.
    pay.status = 'refund_pending'; pay.paidAt = nowIso(); pay.refundReason = problem;
    audit(req.user, 'payment_refund_due', pay.patientId, 'payment', `${pay.id} · ₹${pay.amount} · ${problem}`);
    automation.emit('payment.refund_due', { paymentId: pay.id, purpose: pay.purpose, amount: pay.amount, method: pay.method, gatewayPaymentId: pay.gatewayPaymentId || null, reason: problem, patientId: pay.patientId || null });
    store.save();
    return res.status(409).json({ error: `${problem} Your ₹${pay.amount} will be refunded automatically.` });
  }
  pay.status = 'paid'; pay.paidAt = nowIso();
  finalizePayment(d, pay, req.user);
  store.save();
  broadcast('consults', 'queue', 'prescriptions', 'pharmacy', 'payments', 'lab', 'medorders');
  res.json(payments.publicPayment(pay, { dataMode: DATA_MODE }));
});

// The patient's visit pass: a code that changes every 30 seconds, so a screenshot can't be reused.
app.get('/api/consults/:id/pass', auth, role('patient', 'caregiver'), (req, res) => {
  const d = db();
  const c = d.consults.find((x) => x.id === req.params.id);
  if (!c || !ownsPatient(req.user, c.patientId)) return res.status(404).json({ error: 'Visit not found.' });
  if (c.mode !== 'in_person' || !c.paidAt || !c.visitSecret) return res.status(400).json({ error: 'This booking has no visit pass.' });
  const w = passWindow();
  const code = passCode(c, w);
  res.json({
    code, payload: `NEXUS-VISIT:${c.id}:${code}`, bookingNo: c.bookingNo || null, payAtClinic: c.payAtClinic || 0, expiresIn: PASS_WINDOW_S - (Math.floor(Date.now() / 1000) % PASS_WINDOW_S),
    status: c.status, checkedInAt: c.checkedInAt || null, location: c.location, scheduledAt: c.scheduledAt, doctorName: enrichConsult(c).doctorName,
  });
});

app.post('/api/visits/check-in', auth, role('doctor', 'hospital_admin', 'kiosk_operator'), checkInLimiter, (req, res) => {
  const d = db();
  let candidates = d.consults.filter((c) => c.mode === 'in_person' && c.paidAt && c.visitSecret && ['scheduled', 'queued'].includes(c.status) && !c.checkedInAt);
  if (req.user.role === 'doctor') { const ids = handledDoctorIds(req.user); candidates = candidates.filter((c) => ids.includes(c.doctorId)); }
  else candidates = candidates.filter((c) => c.location?.facilityId === req.user.facilityId);
  let code = String(req.body?.code || '').replace(/\D/g, '');
  const m = String(req.body?.payload || '').match(/^NEXUS-VISIT:([\w-]+):(\d{6})$/);
  if (m) { candidates = candidates.filter((c) => c.id === m[1]); code = m[2]; }
  const bookingNo = clean(req.body?.bookingNo, 14).toUpperCase();
  if (bookingNo) candidates = candidates.filter((c) => c.bookingNo === bookingNo);
  if (code.length !== 6) return res.status(400).json({ error: 'Scan the patient\'s QR or type the 6-digit code under it.' });
  const w = passWindow();
  const c = candidates.find((x) => [w, w - 1].some((win) => passCode(x, win) === code));
  if (!c) return res.status(400).json({ error: 'That pass isn\'t valid here or has expired — ask the patient to refresh their QR.' });
  c.checkedInAt = nowIso();
  c.status = 'queued';
  const p = d.patients.find((x) => x.id === c.patientId);
  patientOwnerUserIds(p).forEach((u) => notify(u, 'You\'re checked in', `Please wait — ${enrichConsult(c).doctorName} will call you shortly.`));
  audit(req.user, 'visit_check_in', p.id, 'consult', c.id);
  store.save();
  broadcast('consults', 'queue', `consult:${c.id}`);
  res.json(enrichConsult(c));
});

app.post('/api/consults/:id/ack', auth, role('doctor'), (req, res) => {
  const c = db().consults.find((x) => x.id === req.params.id);
  if (!c || !handledDoctorIds(req.user).includes(c.doctorId)) return res.status(404).json({ error: 'Consult not found.' });
  c.doctorSeenAt = nowIso();
  store.save();
  res.json({ ok: true });
});

// One lab report — for the patient's download page, the ordering doctor, and the lab that did it.
app.get('/api/lab-orders/:id', auth, (req, res) => {
  const d = db();
  const o = d.labOrders.find((x) => x.id === req.params.id);
  if (!o) return res.status(404).json({ error: 'Report not found.' });
  const allowed = ownsPatient(req.user, o.patientId) || (req.user.role === 'doctor' && doctorFor(req.user)?.id === o.doctorId) || (req.user.role === 'lab_tech' && o.labId === req.user.facilityId) || req.user.role === 'super_admin';
  if (!allowed) return res.status(403).json({ error: 'You don\'t have access to this report.' });
  const lab = d.facilities.find((f) => f.id === o.labId) || {};
  const p = d.patients.find((x) => x.id === o.patientId) || {};
  res.json({
    ...enrichLab(o), insights: o.insights || catalog.interpret(o.results || []), nextSteps: o.status === 'reported' ? (o.nextSteps || catalog.nextSteps(o.results || [], { doctorName: db().doctors.find((x) => x.id === o.doctorId)?.name })) : [],
    lab: { name: lab.name, address: lab.address || '', district: lab.district, phone: lab.phone, nabl: !!lab.nabl },
    patient: { id: p.id, name: p.name, age: ageOf(p.dob), gender: p.gender },
  });
});

// The patient rates the lab once the report is in — feeds the lab's rating shown to others.
app.post('/api/lab-orders/:id/review', auth, role('patient', 'caregiver'), (req, res) => {
  const d = db();
  const o = d.labOrders.find((x) => x.id === req.params.id);
  if (!o || !ownsPatient(req.user, o.patientId)) return res.status(404).json({ error: 'Test not found.' });
  if (o.status !== 'reported') return res.status(409).json({ error: 'You can rate the lab once your report is ready.' });
  if (o.review) return res.status(409).json({ error: 'You\'ve already rated this lab. Thank you!' });
  const stars = parseInt(req.body?.stars, 10);
  if (!(stars >= 1 && stars <= 5)) return res.status(400).json({ error: 'Choose 1 to 5 stars.' });
  o.review = { stars, text: clean(req.body?.text, 300), at: nowIso() };
  const lab = d.facilities.find((f) => f.id === o.labId);
  if (lab) { const r = lab.reviewStats || { count: 0, sum: 0 }; lab.reviewStats = { count: r.count + 1, sum: r.sum + stars }; }
  store.save();
  res.json({ ok: true });
});

// The ordering doctor adds advice on a report — the patient sees it next to the results.
app.post('/api/lab-orders/:id/doctor-note', auth, role('doctor'), (req, res) => {
  const d = db();
  const o = d.labOrders.find((x) => x.id === req.params.id);
  const doc = doctorFor(req.user);
  if (!o || o.doctorId !== doc?.id) return res.status(404).json({ error: 'Report not found.' });
  if (o.status !== 'reported') return res.status(409).json({ error: 'The report isn\'t ready yet.' });
  const text = clean(req.body?.text, 800);
  if (text.length < 3) return res.status(400).json({ error: 'Please write your advice for the patient.' });
  o.doctorNote = { text, by: doc.name, at: nowIso() };
  const days = parseInt(req.body?.followUpDays, 10);
  const p = d.patients.find((x) => x.id === o.patientId);
  if (days > 0) createFollowUp(d, { p, doc, days, diagnosis: `review of ${o.tests.map((t) => t.name).join(', ')}` });
  patientOwnerUserIds(p).forEach((u) => notify(u, 'Your doctor reviewed your report', `${doc.name}: "${text.slice(0, 90)}${text.length > 90 ? '…' : ''}"`));
  audit(req.user, 'report_advice', p.id, 'lab', o.id);
  store.save();
  broadcast('lab', 'records', 'consults');
  res.json({ ok: true, doctorNote: o.doctorNote });
});

// Follow-ups & upcoming appointments: when the patient has to see a doctor next.
app.get('/api/patient/follow-ups', auth, role('patient', 'caregiver'), (req, res) => {
  const d = db();
  const p = activePatient(req);
  const mine = d.consults.filter((c) => c.patientId === p.id);
  const upcoming = mine.filter((c) => ['scheduled', 'queued', 'in_progress', 'awaiting_payment'].includes(c.status))
    .map(enrichConsult).sort((a, b) => ((a.scheduledAt || a.createdAt) < (b.scheduledAt || b.createdAt) ? -1 : 1));
  const past = mine.filter((c) => c.status === 'completed').map(enrichConsult)
    .sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1)).slice(0, 6)
    .map((c) => ({ ...c, prescriptionId: d.prescriptions.find((r) => r.consultId === c.id)?.id || null, nextFollowUp: upcoming.find((u) => u.followUpOf === c.id)?.scheduledAt || null }));
  // Reports a doctor asked to review that are ready.
  const reportsReady = d.labOrders.filter((o) => o.patientId === p.id && o.status === 'reported' && Date.now() - Date.parse(o.reportedAt) < 30 * 86400000)
    .map((o) => ({ id: o.id, tests: o.tests.map((t) => t.name), reportedAt: o.reportedAt, doctorNote: o.doctorNote || null, flagged: (o.results || []).some((r) => r.flag && !['normal', 'negative'].includes(r.flag)) }));
  res.json({ upcoming, past, reportsReady });
});

// ---------- change doctor: the patient moves their care, and a full copy of their records goes along ----------
// Only the patient starts this. The new doctor (and their hospital / clinic) get a standing consent to the
// whole record. The previous doctor keeps a read-only copy of everything up to the moment of transfer —
// nothing recorded afterwards is visible to them.
app.get('/api/patient/transfers', auth, role('patient', 'caregiver'), (req, res) => {
  const d = db();
  const p = activePatient(req);
  const seen = new Map();
  d.consults.filter((c) => c.patientId === p.id && ['completed', 'scheduled', 'queued'].includes(c.status)).forEach((c) => {
    const doc = d.doctors.find((x) => x.id === c.doctorId);
    if (doc && !seen.has(doc.id)) seen.set(doc.id, { id: doc.id, name: doc.name, specialty: doc.specialty, facility: facilityName(doc.facilityId) || null, lastVisit: c.completedAt || c.scheduledAt || c.createdAt });
  });
  res.json({
    currentDoctors: [...seen.values()],
    transfers: d.careTransfers.filter((t) => t.patientId === p.id).map((t) => ({ ...t, toName: d.doctors.find((x) => x.id === t.toDoctorId)?.name })),
    counts: { visits: d.consults.filter((c) => c.patientId === p.id && c.status === 'completed').length, prescriptions: d.prescriptions.filter((r) => r.patientId === p.id).length, reports: d.labOrders.filter((o) => o.patientId === p.id && o.status === 'reported').length + d.records.filter((r) => r.patientId === p.id).length },
  });
});

app.post('/api/patient/transfers', auth, role('patient', 'caregiver'), (req, res) => {
  const d = db();
  const p = activePatient(req);
  const to = d.doctors.find((x) => x.id === req.body?.toDoctorId && x.verified);
  if (!to) return res.status(404).json({ error: 'Choose the doctor you want to move to.' });
  const from = req.body?.fromDoctorId ? d.doctors.find((x) => x.id === req.body.fromDoctorId) : null;
  if (from && from.id === to.id) return res.status(400).json({ error: 'That is the same doctor.' });
  const toFac = to.facilityId ? d.facilities.find((f) => f.id === to.facilityId) : null;
  const at = nowIso();
  const copied = {
    visits: d.consults.filter((c) => c.patientId === p.id && c.status === 'completed').length,
    prescriptions: d.prescriptions.filter((r) => r.patientId === p.id).length,
    reports: d.labOrders.filter((o) => o.patientId === p.id && o.status === 'reported').length + d.records.filter((r) => r.patientId === p.id).length,
  };
  const t = { id: store.id('ct'), patientId: p.id, fromDoctorId: from?.id || null, fromName: from?.name || null, toDoctorId: to.id, toFacilityId: toFac?.id || null, reason: clean(req.body?.reason, 200), at, copied, initiatedBy: req.user.id };
  d.careTransfers.unshift(t);
  const scope = ['history', 'prescriptions', 'labs', 'allergies', 'uploads'];
  const yearOn = new Date(Date.now() + 365 * 86400000).toISOString();
  d.consents.push({ id: store.id('cst'), patientId: p.id, granteeType: 'doctor', granteeId: to.id, granteeName: to.name, scope, purpose: 'Care transferred by the patient (full record copy)', start: at, expiry: yearOn, status: 'active', transferId: t.id });
  if (toFac) d.consents.push({ id: store.id('cst'), patientId: p.id, granteeType: 'hospital', granteeId: toFac.id, granteeName: toFac.name, scope, purpose: `Care transferred to ${to.name}`, start: at, expiry: yearOn, status: 'active', transferId: t.id });
  // The previous doctor's live access ends now; they keep the copy up to this moment.
  if (from) d.consents.filter((c) => c.patientId === p.id && c.granteeId === from.id && c.status === 'active').forEach((c) => { c.status = 'archived'; c.archivedAt = at; c.copyUntil = at; });
  notify(to.userId, 'A patient moved their care to you', `${p.name} transferred their records to you${from ? ` from ${from.name}` : ''} — ${copied.visits} visits, ${copied.prescriptions} prescriptions, ${copied.reports} reports.`);
  if (from) notify(from.userId, 'Patient moved their care', `${p.name} has moved to another doctor. You keep a read-only copy of their records up to today.`);
  patientOwnerUserIds(p).forEach((u) => notify(u, 'Records transferred', `A copy of your full record is now with ${to.name}${toFac ? ` (${toFac.name})` : ''}.`));
  audit(req.user, 'care_transfer', p.id, 'consent', `${from?.name || '—'} → ${to.name}`);
  automation.emit('care.transferred', { transferId: t.id, patientId: p.id, fromDoctorId: from?.id || null, fromDoctorName: from?.name || null, toDoctorId: to.id, toDoctorName: to.name, toFacility: toFac?.name || null });
  store.save();
  broadcast('consents', 'doctors', 'consults');
  res.json({ ok: true, transfer: t, doctor: { id: to.id, name: to.name, facility: toFac?.name || null } });
});

app.post('/api/doctor/transfers/:id/seen', auth, role('doctor'), (req, res) => {
  const t = db().careTransfers.find((x) => x.id === req.params.id && x.toDoctorId === doctorFor(req.user)?.id);
  if (!t) return res.status(404).json({ error: 'Not found.' });
  t.seenByNew = nowIso();
  store.save();
  res.json({ ok: true });
});

const locationLimiter = security.rateLimit({ windowMs: 10 * 60000, max: 60, key: (r) => r.headers.authorization || r.ip, message: 'Too many location updates.' });
app.post('/api/patient/location', auth, role('patient', 'caregiver'), locationLimiter, (req, res) => {
  const self = profilesFor(req.user).find((x) => x.userId === req.user.id);
  if (!self) return res.json({ ok: true, saved: false });
  const b = req.body || {};
  const lat = Number(b.lat); const lng = Number(b.lng);
  if (b.lat != null && geo.validCoord(lat, lng)) {
    self.currentLocation = { lat: round3(lat), lng: round3(lng), accuracy: Math.max(0, Math.min(100000, parseInt(b.accuracy, 10) || 0)), source: 'live', at: nowIso() };
  } else if (clean(b.district).length >= 2) {
    self.currentLocation = { district: clean(b.district, 80), state: clean(b.state, 80), country: /^[A-Z]{2}$/.test(String(b.country || '')) ? b.country : countryOf(self), pincode: clean(b.pincode, 12), source: 'manual', at: nowIso() };
  } else return res.status(400).json({ error: 'Share your location or type your city.' });
  store.save();
  res.json({ ok: true, saved: true, source: self.currentLocation.source });
});

// ---- patient privacy: research sharing, kiosk OTP, and account deletion requests (reviewed by an admin) ----
app.put('/api/patient/privacy', auth, role('patient', 'caregiver'), (req, res) => {
  const p = activePatient(req);
  const b = req.body || {};
  const cur = p.privacy || { research: false, kioskOtp: true };
  p.privacy = { research: b.research === undefined ? Boolean(cur.research) : Boolean(b.research), kioskOtp: b.kioskOtp === undefined ? cur.kioskOtp !== false : Boolean(b.kioskOtp), updatedAt: nowIso() };
  audit(req.user, 'privacy_updated', p.id, 'patient', `research=${p.privacy.research},kioskOtp=${p.privacy.kioskOtp}`);
  store.save();
  broadcast('patients');
  res.json(p.privacy);
});

app.post('/api/patient/deletion-request', auth, role('patient', 'caregiver'), (req, res) => {
  const p = activePatient(req);
  if (p.deletionRequest?.status === 'requested') return res.status(409).json({ error: 'A deletion request is already pending. Our team will contact you.' });
  const reason = clean(req.body?.reason, 200);
  p.deletionRequest = { at: nowIso(), reason, status: 'requested', by: req.user.id };
  db().users.filter((u) => u.role === 'super_admin').forEach((a) => notify(a.id, 'Account deletion requested', `${p.name} (${p.id})${reason ? ` — ${reason}` : ''}. Review it in Users.`));
  audit(req.user, 'deletion_requested', p.id, 'patient', reason);
  store.save();
  broadcast('patients', 'admin');
  res.json(p.deletionRequest);
});

app.delete('/api/patient/deletion-request', auth, role('patient', 'caregiver'), (req, res) => {
  const p = activePatient(req);
  if (p.deletionRequest?.status !== 'requested') return res.status(404).json({ error: 'There is no pending deletion request.' });
  p.deletionRequest = { ...p.deletionRequest, status: 'cancelled', cancelledAt: nowIso() };
  audit(req.user, 'deletion_cancelled', p.id, 'patient', p.deletionRequest.reason || '');
  store.save();
  broadcast('patients', 'admin');
  res.json({ ok: true });
});

app.get('/api/geo/districts', (_req, res) => res.json(geo.DISTRICTS.map(({ district, state }) => ({ district, state }))));

app.get('/api/consents', auth, role('patient', 'caregiver'), (req, res) => {
  const p = activePatient(req);
  // Newest-first log, latest 100 entries — no scan of the whole audit trail per page load.
  const log = [];
  for (const a of db().audit) { if (a.patientId === p.id) { log.push(a); if (log.length >= 100) break; } }
  res.json({
    consents: db().consents.filter((c) => c.patientId === p.id).sort((a, b) => ((a.requestedAt || a.start || '') < (b.requestedAt || b.start || '') ? 1 : -1)),
    log,
  });
});

app.post('/api/consents/:id/:action', auth, role('patient', 'caregiver'), (req, res) => {
  const c = db().consents.find((x) => x.id === req.params.id);
  const p = activePatient(req);
  if (!c || c.patientId !== p.id) return res.status(404).json({ error: 'Request not found.' });
  const { action } = req.params;
  if (action === 'approve') {
    const days = Number(req.body?.days) || 30;
    if (!Number.isFinite(days) || days < 1 || days > 365) return res.status(400).json({ error: 'Choose between 1 and 365 days.' });
    c.status = 'active'; c.start = nowIso(); c.expiry = new Date(Date.now() + days * 86400000).toISOString();
    const scope = cleanList(req.body?.scope, 10).filter((x) => CONSENT_SCOPES.includes(x));
    if (scope.length) c.scope = scope;
  } else if (action === 'deny') c.status = 'denied';
  else if (action === 'revoke') { c.status = 'revoked'; c.revokedAt = nowIso(); }
  else return res.status(400).json({ error: 'Unknown action.' });
  audit(req.user, `consent_${action}`, p.id, 'consent', `${c.granteeName}: ${c.scope.join(', ')}`);
  const grantee = c.granteeType === 'doctor' ? db().doctors.find((d) => d.id === c.granteeId) : null;
  if (grantee) notify(grantee.userId, `Consent ${action === 'approve' ? 'granted' : action === 'deny' ? 'denied' : 'revoked'}`, `${p.name} ${action === 'approve' ? 'approved' : action === 'deny' ? 'denied' : 'revoked'} access to ${c.scope.join(', ')}.`);
  store.save();
  broadcast('consents');
  res.json(c);
});

app.post('/api/family', auth, role('patient', 'caregiver'), (req, res) => {
  const b = req.body || {};
  const name = clean(b.name, 80);
  const dobT = Date.parse(b.dob);
  if (name.length < 2 || !Number.isFinite(dobT) || dobT > Date.now() || dobT < Date.parse('1900-01-01')) return res.status(400).json({ error: 'Name and date of birth are required.' });
  if (profilesFor(req.user).length >= 20) return res.status(400).json({ error: 'You can keep up to 20 family profiles on one account.' });
  const self = profilesFor(req.user).find((p) => p.userId === req.user.id);
  const relation = clean(b.relation, 30);
  const p = {
    id: makePassportId(), userId: null, guardianUserId: req.user.id, relation, name, dob: new Date(dobT).toISOString().slice(0, 10), gender: ['Female', 'Male', 'Other'].includes(b.gender) ? b.gender : 'Prefer not to say', language: self?.language || 'Hindi',
    bloodGroup: BLOOD_GROUPS.includes(b.bloodGroup) ? b.bloodGroup : 'Unknown', allergies: cleanList(b.allergies, 30), conditions: cleanList(b.conditions, 30), currentMeds: [],
    emergencyContacts: [{ name: req.user.name, relation: 'Guardian', phone: req.user.phone }], abha: '', pincode: self?.pincode || '', district: self?.district || '', state: self?.state || '', country: self?.country || 'IN', vaccinations: [], createdAt: nowIso(),
  };
  db().patients.push(p);
  audit(req.user, 'added_family_profile', p.id, 'passport', relation || 'Family');
  store.save();
  broadcast('patients', 'family');
  res.json(p);
});

// ---------- doctor portal ----------
// The doctor's last 7 local days (APP_TZ), oldest first: consults completed and what patients actually paid —
// the same rule the completion handler adds to earnings (kiosk visits count the doctor's fee, others c.fee).
function doctorWeek(consults, doc) {
  const today = istDay(nowIso());
  // Calendar arithmetic on the date string (not "now − 24 h"), so a DST zone can't skip or repeat a day.
  const days = Array.from({ length: 7 }, (_, i) => new Date(Date.parse(`${today}T12:00:00Z`) - (6 - i) * 86400000).toISOString().slice(0, 10));
  const byDay = new Map(days.map((date) => [date, { date, consults: 0, earnings: 0 }]));
  for (const c of consults) {
    if (c.status !== 'completed' || !c.completedAt) continue;
    const row = byDay.get(istDay(c.completedAt));
    if (!row) continue;
    row.consults += 1;
    row.earnings += c.kioskId ? (Number(doc.fee) || 0) : Math.max(0, Number(c.fee) || 0);
  }
  return days.map((date) => { const r = byDay.get(date); return { ...r, earnings: catalog.round(r.earnings) }; });
}

app.get('/api/doctor/home', auth, role('doctor'), (req, res) => {
  const d = db();
  const doc = doctorFor(req.user);
  if (!doc) return res.status(404).json({ error: 'Doctor profile not found. Please contact support.' });
  // Not verified yet: onboarding only — no patients, bookings or records of any kind.
  if (!doc.verified) {
    return res.json({ doctor: withAvail(doc), eClinics: [], queue: [], scheduled: [], reportsToReview: [], newBookings: [], transfersIn: [], clinicVisits: [], completed: [],
      clinic: null, stats: { today: 0, waiting: 0, overflow: 0, rating: 0 }, stats2: doctorStats(doc), week: doctorWeek([], doc), notifications: notificationsFor(req.user.id, 10), onboarding: true });
  }
  const mine = d.consults.filter((c) => c.doctorId === doc.id);
  const handled = handledDoctorIds(req.user);
  const clinicVisits = handled.length > 1 ? d.consults.filter((c) => c.doctorId !== doc.id && handled.includes(c.doctorId) && ['scheduled', 'queued'].includes(c.status)).map(enrichConsult).sort((a, b) => ((a.scheduledAt || a.createdAt) < (b.scheduledAt || b.createdAt) ? -1 : 1)) : [];
  const order = { emergency: 0, doctor_now: 1, routine: 2, self_care: 3 };
  const queue = mine.filter((c) => c.status === 'queued' || c.status === 'in_progress').map(enrichConsult)
    .sort((a, b) => (a.status === 'in_progress' ? -1 : b.status === 'in_progress' ? 1 : 0) || order[a.triage.level] - order[b.triage.level] || (a.createdAt < b.createdAt ? -1 : 1));
  const today = istDay(nowIso());
  res.json({
    doctor: withAvail(doc),
    eClinics: isEClinicDoctor(doc) ? d.facilities.filter((f) => f.type === 'kiosk' && f.verified && (!(doc.eClinicIds || []).length || doc.eClinicIds.includes(f.id))).map((f) => ({ id: f.id, name: f.name, district: f.district, status: f.status })) : [],
    queue,
    scheduled: mine.filter((c) => c.status === 'scheduled').map(enrichConsult).sort((a, b) => (a.scheduledAt < b.scheduledAt ? -1 : 1)),
    reportsToReview: d.labOrders.filter((o) => o.doctorId === doc.id && o.status === 'reported' && !o.doctorNote && Date.now() - Date.parse(o.reportedAt) < 30 * 86400000)
      .map((o) => ({ ...enrichLab(o), insights: o.insights || catalog.interpret(o.results || []) })).slice(0, 8),
    // Paid bookings the doctor hasn't acknowledged yet → the "new patient" pop-up.
    newBookings: d.consults.filter((c) => handled.includes(c.doctorId) && c.paidAt && !c.doctorSeenAt && ['scheduled', 'queued'].includes(c.status)).map((c) => {
      const pt = d.patients.find((x) => x.id === c.patientId) || {};
      return {
      ...enrichConsult(c), forDoctor: c.doctorId !== doc.id ? d.doctors.find((x) => x.id === c.doctorId)?.name : null,
      patient: { bloodGroup: pt.bloodGroup && pt.bloodGroup !== 'Unknown' ? pt.bloodGroup : null, allergies: pt.allergies || [], conditions: pt.conditions || [], currentMeds: pt.currentMeds || [], district: pt.district, country: countryOf(pt) },
      // Has this patient been seen before — by this doctor or anyone on Nexus?
      previousVisits: d.consults.filter((x) => x.patientId === c.patientId && x.status === 'completed').sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1)).slice(0, 5)
        .map((x) => ({ date: x.completedAt, doctorName: d.doctors.find((y) => y.id === x.doctorId)?.name, withYou: x.doctorId === doc.id, diagnosis: x.diagnosis || x.triage?.symptoms })),
      pastPrescriptions: d.prescriptions.filter((r) => r.patientId === c.patientId).slice(-3).reverse().map((r) => ({ date: r.createdAt, doctorName: d.doctors.find((y) => y.id === r.doctorId)?.name, items: r.items.map((i) => i.drug) })),
      pastReports: [
        ...d.records.filter((r) => r.patientId === c.patientId).map((r) => ({ title: r.title, date: r.date, fileId: r.fileId || null, kind: 'upload' })),
        ...d.labOrders.filter((o) => o.patientId === c.patientId && o.status === 'reported').map((o) => ({ title: o.tests.map((t) => t.name).join(', '), date: o.reportedAt, kind: 'lab', flagged: (o.results || []).some((r) => r.flag && r.flag !== 'normal') })),
      ].slice(0, 8),
      };
    }),
    // Patients who moved their care to this doctor (records copied in).
    transfersIn: d.careTransfers.filter((t) => t.toDoctorId === doc.id && !t.seenByNew).map((t) => ({ id: t.id, patientId: t.patientId, patientName: d.patients.find((x) => x.id === t.patientId)?.name, fromName: t.fromName, reason: t.reason, at: t.at, copied: t.copied })),
    clinic: doc.ownsFacilityId ? (() => { const f = d.facilities.find((x) => x.id === doc.ownsFacilityId); return f ? { id: f.id, name: f.name, verified: !!f.verified, doctors: d.doctors.filter((x) => x.facilityId === f.id && x.id !== doc.id).length } : null; })() : null,
    stats2: doctorStats(doc),
    clinicVisits, // upcoming visits for doctors listed at my clinic who have no login yet
    completed: mine.filter((c) => c.status === 'completed').map(enrichConsult).sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1)).slice(0, 20),
    week: doctorWeek(mine, doc), // [{ date: 'YYYY-MM-DD', consults, earnings }] × 7, oldest first, today last
    stats: {
      today: mine.filter((c) => c.status === 'completed' && c.completedAt && istDay(c.completedAt) === today).length,
      waiting: queue.filter((c) => c.status === 'queued').length,
      overflow: queue.filter((c) => (c.routedFrom || '').toLowerCase().includes('overflow')).length,
      rating: doc.rating,
    },
    notifications: notificationsFor(req.user.id, 10),
  });
});

app.put('/api/doctor/me', auth, role('doctor'), (req, res) => {
  const doc = doctorFor(req.user);
  // `fee` is intentionally NOT self-editable (earnings integrity) — only an admin sets it.
  const d = db();
  if (!req.body || typeof req.body !== 'object') req.body = {};
  // Doctors abroad keep their hours in their own zone; availabilityOf/timingsOf read doc.tz (default APP_TZ).
  if (req.body.tz !== undefined) {
    const tz = clean(req.body.tz, 64);
    if (tz) {
      try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch { return res.status(400).json({ error: 'Choose a valid time zone (e.g. Asia/Dubai).' }); }
      doc.tz = tz;
    } else doc.tz = null;
  }
  if (req.body.languages !== undefined) doc.languages = cleanList(req.body.languages, 12);
  if (req.body.slots !== undefined) {
    const s = req.body.slots;
    if (!s || typeof s !== 'object' || Array.isArray(s)) return res.status(400).json({ error: 'Invalid schedule.' });
    doc.slots = Object.fromEntries(WEEK_DAYS.map((day) => [day, [...new Set((Array.isArray(s[day]) ? s[day] : []).map(Number).filter((h) => Number.isInteger(h) && h >= 0 && h <= 23))].sort((a, b) => a - b)]));
  }
  // "I'm free now" — every verified doctor can open themselves to video consults for a while.
  if (req.body.virtualFor !== undefined) {
    const mins = Number(req.body.virtualFor);
    if (![0, 30, 60, 120, 240].includes(mins)) return res.status(400).json({ error: 'Choose 30 minutes, 1, 2 or 4 hours.' });
    if (mins && !doc.verified) return res.status(403).json({ error: 'You can take consults once you are verified.' });
    doc.virtualUntil = mins ? new Date(Date.now() + mins * 60000).toISOString() : null;
    audit(req.user, mins ? 'virtual_on' : 'virtual_off', null, 'doctor', mins ? `${mins} min` : 'stopped');
  }
  // Only E-Clinic partners switch themselves on/off at a clinic. Hospital & clinic doctors follow their hours.
  const presenceChange = req.body.online !== undefined && (Boolean(req.body.online) !== Boolean(doc.online) || (req.body.online && (req.body.presenceClinicId || null) !== (doc.presenceClinicId || null)));
  if (presenceChange) {
    if (!isEClinicDoctor(doc)) return res.status(403).json({ error: 'Your availability follows the hours you set in your schedule.' });
    const kiosks = d.facilities.filter((f) => f.type === 'kiosk' && f.verified);
    if (req.body.online) {
      const clinicId = req.body.presenceClinicId || null;
      if (clinicId && !kiosks.some((k) => k.id === clinicId && (!(doc.eClinicIds || []).length || doc.eClinicIds.includes(k.id)))) return res.status(400).json({ error: 'Choose one of your E-Clinics.' });
      doc.online = true; doc.presenceClinicId = clinicId; doc.presenceSince = nowIso();
      if (clinicId) d.users.filter((u) => u.role === 'kiosk_operator' && u.facilityId === clinicId).forEach((u) => notify(u.id, `${doc.name} is available`, `${doc.name} (${doc.specialty}) has arrived at this E-Clinic and is taking patients.`));
    } else {
      doc.online = false; doc.presenceClinicId = null; doc.presenceSince = null;
    }
    audit(req.user, doc.online ? 'eclinic_check_in' : 'eclinic_check_out', null, 'doctor', doc.presenceClinicId || 'video');
  }
  if (req.body.maxPerHour !== undefined) {
    const n = Number(req.body.maxPerHour);
    if (!Number.isFinite(n) || n < 1 || n > 60) return res.status(400).json({ error: 'Max patients per hour must be between 1 and 60.' });
    doc.maxPerHour = Math.round(n);
  }
  store.save();
  broadcast('doctors', 'kiosks', 'queue');
  res.json(withAvail(doc));
});

// ---- doctor onboarding: complete the profile after the quick sign-up ----
// Verhoeff checksum — every real Aadhaar number passes it, so typos are caught before review.
const VH_D = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
const VH_P = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
const verhoeffOk = (num) => { let c = 0; [...num].reverse().forEach((ch, i) => { c = VH_D[c][VH_P[i % 8][Number(ch)]]; }); return c === 0; };

app.put('/api/doctor/profile', auth, role('doctor'), async (req, res) => {
  const d = db();
  const doc = doctorFor(req.user);
  if (doc.verified) return res.status(409).json({ error: 'Your profile is verified. To change credentials, contact the Nexus Healthcare team.' });
  const b = req.body || {};
  const age = parseInt(b.age, 10);
  if (!Number.isInteger(age) || age < 22 || age > 90) return res.status(400).json({ error: 'Please enter your age (22–90).' });
  // Aadhaar is optional (doctors outside India don't have one) — checked if given, only the last 4 kept.
  const aadhaar = String(b.aadhaar || '').replace(/\D/g, '');
  if (aadhaar && (!/^[2-9]\d{11}$/.test(aadhaar) || !verhoeffOk(aadhaar))) return res.status(400).json({ error: 'That Aadhaar number doesn\'t look right. Please check the 12 digits.' });
  if (clean(b.address, 240).length < 5) return res.status(400).json({ error: 'Please add your address (clinic or residence).' });
  if (!clean(b.district)) return res.status(400).json({ error: 'Please add your city / district.' });
  if (!SPECIALTIES.includes(b.specialty)) return res.status(400).json({ error: 'Choose your specialty.' });
  if (clean(b.qualification).length < 2) return res.status(400).json({ error: 'Please add your qualification (e.g. MBBS, MD).' });
  if (clean(b.latestDegree).length < 2) return res.status(400).json({ error: 'Your latest degree is required — e.g. MD Medicine, KGMU (2017).' });
  if (!clean(b.degreeNumber, 40) && !b.degreeFileId) return res.status(400).json({ error: 'Add your latest degree certificate — a photo or its number.' });
  if (!/^[A-Za-z0-9][A-Za-z0-9 /-]{2,29}$/.test(clean(b.regNo, 30))) return res.status(400).json({ error: 'Please add your medical council / licence registration number (e.g. UPMC-48211).' });
  const regDup = d.doctors.find((x) => x.id !== doc.id && x.id !== doc.claimRequest && x.regNo && x.regNo.toUpperCase() === clean(b.regNo, 30).toUpperCase());
  if (regDup) return res.status(409).json({ error: 'This registration number is already linked to another doctor.' });
  if (!b.photoFileId) return res.status(400).json({ error: 'Please add a professional photo (with your stethoscope).' });
  // Files must be this doctor's own uploads, and images where we expect images.
  b.degreeFileId = clean(b.degreeFileId, 80) || null; b.photoFileId = clean(b.photoFileId, 80) || null;
  for (const [key, fid, mustBeImage] of [['degree', b.degreeFileId, false], ['photo', b.photoFileId, true]]) {
    if (!fid) continue;
    const f = await store.adapter().fileGet(fid);
    if (!f || f.uploadedBy !== req.user.id) return res.status(400).json({ error: `Please upload the ${key} again.` });
    if (mustBeImage && !String(f.mime).startsWith('image/')) return res.status(400).json({ error: 'Your profile photo must be an image (JPG, PNG or WEBP).' });
  }
  const experience = parseInt(b.experience, 10);
  if (!Number.isInteger(experience) || experience < 0 || experience > age - 20) return res.status(400).json({ error: 'Please check your years of experience.' });
  const patientsLifetime = Math.max(0, Math.min(2000000, parseInt(String(b.patientsLifetime).replace(/\D/g, ''), 10) || 0));

  Object.assign(doc, {
    specialty: b.specialty, qualification: clean(b.qualification), regNo: clean(b.regNo, 30).toUpperCase(), experience, patientsLifetime,
    languages: cleanList(b.languages, 12).length ? cleanList(b.languages, 12) : doc.languages,
    district: clean(b.district) || doc.district, state: clean(b.state) || doc.state, address: clean(b.address, 240),
    country: /^[A-Z]{2}$/.test(String(b.country || '').toUpperCase()) ? String(b.country).toUpperCase() : countryOf(doc),
    photoFileId: b.photoFileId,
    profileComplete: true, profileSubmittedAt: nowIso(), verificationNote: null,
  });
  // Fee is the doctor's to propose while they're under review; after verification only an admin changes it.
  if (!doc.verified) doc.fee = Math.max(100, Math.min(5000, parseInt(b.fee, 10) || doc.fee || 200));
  // Identity: we keep only the last 4 Aadhaar digits (full number is never stored).
  doc.kyc = { age, aadhaarLast4: aadhaar ? aadhaar.slice(-4) : (doc.kyc?.aadhaarLast4 || null), aadhaarChecksumOk: Boolean(aadhaar || doc.kyc?.aadhaarLast4), latestDegree: clean(b.latestDegree), degreeNumber: clean(b.degreeNumber, 40), degreeFileId: b.degreeFileId || null, photoFileId: b.photoFileId };
  audit(req.user, 'doctor_profile_submitted', null, 'doctor', `${doc.name} · ${doc.specialty}`);
  automation.emit('onboarding.submitted', { kind: 'doctor', stage: 'ready_for_review', id: doc.id, name: doc.name, specialty: doc.specialty || null });
  d.users.filter((u) => u.role === 'super_admin').forEach((a) => notify(a.id, 'Doctor profile ready for review', `${doc.name} (${doc.specialty}) completed onboarding.`));
  store.save();
  broadcast('admin', 'doctors');
  res.json(withAvail(doc));
});

// ---- doctor's own medicine list: add once with dose & timing, reuse in every prescription ----
const TIMING_KEYS = ['morning', 'afternoon', 'evening', 'night'];
const FOOD = ['before food', 'after food', 'with food', 'empty stomach', 'any time'];
function cleanMedicine(b) {
  const name = clean(b.name, 80);
  if (name.length < 2) return { error: 'Please enter the medicine name.' };
  const timing = Object.fromEntries(TIMING_KEYS.map((k) => [k, Math.max(0, Math.min(4, Number(b.timing?.[k]) || 0))]));
  const sos = Boolean(b.sos);
  if (!sos && !TIMING_KEYS.some((k) => timing[k] > 0)) return { error: 'Pick when the medicine is taken (morning, afternoon, evening or night), or mark it SOS.' };
  return {
    med: {
      name, form: clean(b.form, 20) || 'Tablet', strength: clean(b.strength, 20), dose: clean(b.dose, 30) || '1 tablet',
      timing, food: FOOD.includes(b.food) ? b.food : 'after food', sos,
      days: Math.max(1, Math.min(365, parseInt(b.days, 10) || 5)), note: clean(b.note, 120),
    },
  };
}
app.get('/api/doctor/medicines', auth, role('doctor'), (req, res) => res.json(doctorFor(req.user).myMedicines || []));
app.post('/api/doctor/medicines', auth, role('doctor'), (req, res) => {
  const doc = doctorFor(req.user);
  const { med, error } = cleanMedicine(req.body || {});
  if (error) return res.status(400).json({ error });
  doc.myMedicines = doc.myMedicines || [];
  const fullName = [med.name, med.strength].filter(Boolean).join(' ');
  const existing = doc.myMedicines.find((m) => [m.name, m.strength].filter(Boolean).join(' ').toLowerCase() === fullName.toLowerCase());
  if (existing) Object.assign(existing, med, { updatedAt: nowIso() });
  else {
    if (doc.myMedicines.length >= 300) return res.status(400).json({ error: 'Your list is full (300). Remove some first.' });
    doc.myMedicines.unshift({ id: store.id('med'), ...med, createdAt: nowIso() });
  }
  store.save();
  res.json(existing || doc.myMedicines[0]);
});
app.delete('/api/doctor/medicines/:id', auth, role('doctor'), (req, res) => {
  const doc = doctorFor(req.user);
  doc.myMedicines = (doc.myMedicines || []).filter((m) => m.id !== req.params.id);
  store.save();
  res.json({ ok: true });
});

// ---- clinics & hospitals list their doctors ----
// A doctor who owns a clinic (or a hospital admin) lists every doctor who practises there. Listed doctors
// appear to patients once the clinic is verified; if one of them signs up later with the same email or
// mobile, the listing becomes their own account (after verification).
function listDoctorAt(d, f, b, by) {
  const name = clean(b.name, 80).replace(/^(dr\.?\s*)/i, '').trim();
  if (name.length < 2) return { error: 'Please enter the doctor\'s name.' };
  if (!SPECIALTIES.includes(b.specialty)) return { error: 'Choose the doctor\'s specialty.' };
  const email = clean(b.email, 160).toLowerCase();
  if (email && !EMAIL_RE.test(email)) return { error: 'Please check the email address.' };
  const phone = b.phone ? normalizePhone(clean(b.phone, 20)) : null;
  if (!email && !phone) return { error: 'Add the doctor\'s email or mobile so they can claim their profile.' };
  const regNo = clean(b.regNo, 30).toUpperCase();
  if (regNo && d.doctors.some((x) => x.regNo && x.regNo.toUpperCase() === regNo)) return { error: 'A doctor with this registration number is already on Nexus.' };
  const existing = d.users.find((u) => u.role === 'doctor' && ((email && u.email === email) || (phone && samePhone(u.phone, phone))));
  // Already on Nexus with their own account: we never attach a doctor to a clinic without their consent.
  if (existing) return { error: `${existing.name} already has a Nexus account. Ask them to add ${f.name} from their own portal.` };
  const doc = {
    id: store.id('doc'), userId: null, name: `Dr. ${name}`, specialty: b.specialty, qualification: clean(b.qualification, 80), regNo,
    languages: cleanList(b.languages, 8).length ? cleanList(b.languages, 8) : ['Hindi', 'English'], verified: false, online: false,
    district: f.district, state: f.state, country: countryOf(f), rating: 0, consultsDone: 0, earnings: 0, fee: Math.max(0, Math.min(5000, parseInt(b.fee, 10) || f.opdFee || 300)), maxPerHour: 4,
    experience: Math.max(0, Math.min(60, parseInt(b.experience, 10) || 0)), patientsLifetime: 0, facilityId: f.id, engagement: 'clinic',
    listedBy: by, listedAt: nowIso(), invite: { email: email || null, phone }, profileComplete: true,
    slots: b.slots && typeof b.slots === 'object' ? Object.fromEntries(WEEK_DAYS.map((day) => [day, (Array.isArray(b.slots[day]) ? b.slots[day] : []).map(Number).filter((h) => Number.isInteger(h) && h >= 0 && h <= 23)])) : undefined,
  };
  d.doctors.push(doc);
  return { doc };
}
const clinicDoctorsOf = (d, fid, exceptId) => d.doctors.filter((x) => x.facilityId === fid && x.id !== exceptId).map((x) => ({
  id: x.id, name: x.name, specialty: x.specialty, qualification: x.qualification, experience: x.experience, fee: x.fee, verified: !!x.verified,
  hasAccount: !!x.userId, invite: x.invite || null, timings: timingsOf(x), available: availabilityOf(x, { facilities: d.facilities }).available,
}));
const ownedClinic = (user) => { const doc = doctorFor(user); return doc?.ownsFacilityId ? db().facilities.find((f) => f.id === doc.ownsFacilityId) : null; };

app.get('/api/doctor/clinic', auth, role('doctor'), (req, res) => {
  const f = ownedClinic(req.user);
  if (!f) return res.json({ clinic: null });
  res.json({ clinic: f, doctors: clinicDoctorsOf(db(), f.id, doctorFor(req.user).id), specialties: SPECIALTIES });
});

app.post('/api/doctor/clinic', auth, role('doctor'), (req, res) => {
  const d = db();
  const doc = doctorFor(req.user);
  if (doc.ownsFacilityId) return res.status(409).json({ error: 'You already have a clinic on Nexus.' });
  const name = clean(req.body?.name, 120);
  if (name.length < 3) return res.status(400).json({ error: 'Please enter the clinic name.' });
  const f = { id: store.id('fac'), type: 'hospital', subtype: 'clinic', name, verified: false, country: countryOf(doc), district: doc.district || '', state: doc.state || '', ownerDoctorId: doc.id, partner: true, selfApplied: true, appliedAt: nowIso(), departments: [], hours: '' };
  d.facilities.push(f);
  Object.assign(doc, { ownsFacilityId: f.id, facilityId: doc.facilityId || f.id, engagement: doc.facilityId ? doc.engagement : 'own_clinic' });
  store.save();
  res.json({ clinic: f, doctors: [] });
});

app.put('/api/doctor/clinic', auth, role('doctor'), (req, res) => {
  const f = ownedClinic(req.user);
  if (!f) return res.status(404).json({ error: 'You don\'t have a clinic on Nexus yet.' });
  const b = req.body || {};
  // After verification the clinic's name, registration and address are locked (contact support to change).
  if (!f.verified && b.name !== undefined && clean(b.name, 120).length >= 3) f.name = clean(b.name, 120);
  const editable = f.verified ? [['hours', 60], ['phone', 20]] : [['address', 240], ['district', 80], ['state', 80], ['pincode', 12], ['hours', 60], ['phone', 20], ['licenceNo', 60]];
  for (const [k, max] of editable) if (b[k] !== undefined) f[k] = clean(b[k], max);
  if (b.opdFee !== undefined) f.opdFee = Math.max(0, Math.min(5000, parseInt(b.opdFee, 10) || 0));
  if (b.departments !== undefined) f.departments = cleanList(b.departments, 20);
  const lat = Number(b.lat); const lng = Number(b.lng);
  if (b.lat != null && geo.validCoord(lat, lng)) { f.lat = round3(lat); f.lng = round3(lng); }
  store.save();
  broadcast('doctors', 'admin');
  res.json({ clinic: f });
});

app.post('/api/doctor/clinic/doctors', auth, role('doctor'), (req, res) => {
  const d = db();
  const f = ownedClinic(req.user);
  if (!f) return res.status(404).json({ error: 'Add your clinic first.' });
  if (d.doctors.filter((x) => x.facilityId === f.id).length >= 100) return res.status(400).json({ error: 'A clinic can list up to 100 doctors.' });
  const r = listDoctorAt(d, f, req.body || {}, req.user.id);
  if (r.error) return res.status(400).json({ error: r.error });
  audit(req.user, 'listed_doctor', null, 'doctor', `${r.doc.name} at ${f.name}`);
  store.save();
  broadcast('doctors', 'admin');
  res.json({ ok: true, linked: !!r.linked, doctors: clinicDoctorsOf(d, f.id, doctorFor(req.user).id) });
});

app.delete('/api/doctor/clinic/doctors/:id', auth, role('doctor'), (req, res) => {
  const d = db();
  const f = ownedClinic(req.user);
  const x = f && d.doctors.find((y) => y.id === req.params.id && y.facilityId === f.id && y.id !== doctorFor(req.user).id);
  if (!x) return res.status(404).json({ error: 'Doctor not found at your clinic.' });
  if (x.userId) { x.facilityId = null; x.engagement = 'independent'; notify(x.userId, 'Clinic listing removed', `${f.name} removed you from its doctors on Nexus.`); } else d.doctors.splice(d.doctors.indexOf(x), 1);
  store.save();
  broadcast('doctors');
  res.json({ ok: true, doctors: clinicDoctorsOf(d, f.id, doctorFor(req.user).id) });
});

app.get('/api/doctor/patient/:id', auth, role('doctor'), (req, res) => {
  const d = db();
  const doc = doctorFor(req.user);
  const p = d.patients.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Patient not found.' });
  const consented = hasConsent(p.id, [doc.id]);
  const bg = d.audit.find((a) => a.action === 'break_glass' && a.actorId === req.user.id && a.patientId === p.id && Date.now() - new Date(a.at) < 60 * 60000);
  // The patient moved to another doctor: this doctor keeps a read-only copy up to the transfer.
  const copy = !consented && !bg && d.consents.filter((c) => c.patientId === p.id && c.granteeId === doc.id && c.status === 'archived' && c.copyUntil).sort((a, b) => (a.copyUntil < b.copyUntil ? 1 : -1))[0];
  if (copy) {
    const upTo = copy.copyUntil;
    audit(req.user, 'viewed_records_copy', p.id, 'history', 'Read-only copy after care transfer');
    store.save();
    return res.json({
      copyOnly: true, copyUntil: upTo,
      // Clinical summary only — no address, IDs, location or contacts after the patient has moved on.
      patient: { id: p.id, name: p.name, age: ageOf(p.dob), gender: p.gender, bloodGroup: p.bloodGroup, allergies: p.allergies || [], conditions: p.conditions || [], currentMeds: p.currentMeds || [] },
      visits: d.consults.filter((c) => c.patientId === p.id && c.status === 'completed' && (c.completedAt || '') <= upTo).map(enrichConsult),
      prescriptions: d.prescriptions.filter((r) => r.patientId === p.id && r.createdAt <= upTo).map(enrichRx),
      labs: d.labOrders.filter((o) => o.patientId === p.id && o.createdAt <= upTo).map((o) => (o.reportedAt && o.reportedAt > upTo ? { ...enrichLab(o), status: 'processing', results: [], insights: [], doctorNote: null } : enrichLab(o))),
      uploads: d.records.filter((r) => r.patientId === p.id && (r.date || '') <= upTo),
    });
  }
  if (!consented && !bg) {
    return res.json({ restricted: true, patient: { id: p.id, name: p.name, age: ageOf(p.dob), gender: p.gender }, pendingRequest: d.consents.some((c) => c.patientId === p.id && c.granteeId === doc.id && c.status === 'pending') });
  }
  audit(req.user, consented ? 'viewed_records' : 'viewed_records_emergency', p.id, 'history', consented ? 'Consent' : 'Break-glass');
  store.save();
  if (!consented && bg) {
    // Break-glass: critical data only, time-limited.
    return res.json({ emergency: true, expiresAt: new Date(new Date(bg.at).getTime() + 60 * 60000).toISOString(), patient: { id: p.id, name: p.name, age: ageOf(p.dob), gender: p.gender, bloodGroup: p.bloodGroup, allergies: p.allergies, conditions: p.conditions, currentMeds: p.currentMeds, emergencyContacts: p.emergencyContacts } });
  }
  // Account-level settings (privacy choices, deletion requests, kiosk session) are the patient's own — not part of the clinical record.
  const { privacy: _priv, deletionRequest: _del, kioskSeen: _ks, ...clinical } = p;
  res.json({
    patient: { ...clinical, age: ageOf(p.dob) },
    visits: d.consults.filter((c) => c.patientId === p.id && c.status === 'completed').map(enrichConsult),
    prescriptions: d.prescriptions.filter((r) => r.patientId === p.id).map(enrichRx),
    labs: d.labOrders.filter((o) => o.patientId === p.id).map(enrichLab),
    uploads: d.records.filter((r) => r.patientId === p.id),
  });
});

const lookupLimiter = security.rateLimit({ windowMs: 60 * 60000, max: 120, key: (r) => r.headers.authorization || r.ip, message: 'Too many patient searches. Please wait a while.' });
app.get('/api/doctor/lookup', auth, role('doctor'), lookupLimiter, (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (q.length < 4) return res.json([]); // require a near-complete id/phone/name, not broad enumeration
  const asPhone = /\d{6,}/.test(q.replace(/\D/g, '')) ? normalizePhone(q) : null;
  const phoneOwner = asPhone ? db().users.find((u) => u.role === 'patient' && samePhone(u.phone, asPhone)) : null;
  const doc = doctorFor(req.user);
  const mine = new Set([...db().consults.filter((c) => c.doctorId === doc.id).map((c) => c.patientId), ...db().consents.filter((c) => c.granteeId === doc.id).map((c) => c.patientId)]);
  res.json(db().patients.filter((p) => p.id.toLowerCase() === q || (phoneOwner && p.userId === phoneOwner.id)
    || (asPhone && p.emergencyContacts?.some((e) => e.relation === 'Mobile' && samePhone(e.phone, asPhone))) || (mine.has(p.id) && p.name.toLowerCase().includes(q)))
    .slice(0, 8).map((p) => ({ id: p.id, name: p.name, age: ageOf(p.dob), gender: p.gender, district: p.district })));
});

app.post('/api/doctor/consent-request', auth, role('doctor'), (req, res) => {
  const doc = doctorFor(req.user);
  const SCOPES = ['history', 'prescriptions', 'labs', 'allergies', 'uploads'];
  const patientId = req.body?.patientId;
  const scope = (Array.isArray(req.body?.scope) ? req.body.scope : ['history', 'prescriptions', 'labs']).filter((x) => SCOPES.includes(x));
  const purpose = clean(req.body?.purpose, 120) || 'Clinical care';
  if (!scope.length) return res.status(400).json({ error: 'Choose what you need to see.' });
  const p = db().patients.find((x) => x.id === patientId);
  if (!p) return res.status(404).json({ error: 'Patient not found.' });
  const c = { id: store.id('cst'), patientId, granteeType: 'doctor', granteeId: doc.id, granteeName: doc.name, scope, purpose, start: null, expiry: null, status: 'pending', requestedAt: nowIso() };
  db().consents.push(c);
  patientOwnerUserIds(p).forEach((u) => notify(u, 'Record access request', `${doc.name} wants to see your ${scope.join(', ')} for "${purpose}".`, 'consent'));
  store.save();
  broadcast('consents');
  res.json(c);
});

// ---- in-clinic / walk-in prescriptions -------------------------------------------------------
// Any verified doctor — Nexus E-Clinic partner, or a doctor at a registered hospital/clinic seeing a
// patient in person — can issue a digital prescription. The patient approves with a one-time code
// sent to their own phone/email (proof they are present), then the prescription lands in their app
// and can be shared with a chemist and a lab / diagnostic centre in one go.
// Where can we send the patient a code? Demo addresses (@omnicare.in, @nexushealthcare.in) are
// never real inboxes, so they're skipped — we must not mail codes to a domain we don't control.
const DEMO_EMAIL = /@([a-z0-9-]+\.)*(omnicare|nexushealthcare)\.in$/i;
const smsLive = () => otp.publicConfig().live;
const emailLive = () => otp.publicConfig().emailLive;
function contactOf(p) {
  const u = db().users.find((x) => x.id === p.userId);
  const mobile = u?.phone || p.emergencyContacts?.find((e) => e.relation === 'Mobile')?.phone || null;
  const email = u?.email && !DEMO_EMAIL.test(u.email) ? u.email : null;
  return { mobile, email };
}
// Contact details for automation reminders — only when the operator switched on N8N_SHARE_CONTACT.
function autoContact(p) {
  if (!p || !automation.shareContact()) return undefined;
  const { mobile, email } = contactOf(p);
  return { firstName: String(p.name || '').split(' ')[0], mobile, email, language: p.language || 'English' };
}
// Can an approval (consent) code go out as a plain SMS? A Twilio-Verify-only setup can't: otp.js refuses,
// because a Verify code is checked per phone number and would double as a login code.
const consentSmsOk = () => otp.publicConfig().provider !== 'twilio_verify' || Boolean(process.env.TWILIO_FROM || process.env.TWILIO_MESSAGING_SERVICE_SID);
// Prefer whatever actually reaches the patient: real SMS if a gateway can send it, else email over SMTP.
// null → no usable channel; the route asks the patient to approve from their app instead.
function pickChannel(c, wanted) {
  const mobile = Boolean(c.mobile) && consentSmsOk();
  if (wanted === 'email' && c.email) return 'email';
  if (wanted === 'sms' && mobile) return 'sms';
  if (mobile && smsLive()) return 'sms';
  if (c.email && emailLive()) return 'email';
  return mobile ? 'sms' : c.email ? 'email' : null;
}
const targetFor = (c, channel) => (channel === 'email' ? c.email : normalizePhone(c.mobile));

const accessLimiter = security.rateLimit({ windowMs: 60 * 60000, max: 30, key: (r) => r.headers.authorization || r.ip, message: 'Too many approval codes sent. Please wait a while.' });
// Which channel each doctor's last code for a patient went to, so verify checks the same target even when
// the client doesn't repeat `channel`. Lives a little longer than the code itself; small and pruned on use.
const accessChannels = new Map(); // `${doctorUserId}:${patientId}` → { channel, expiresAt }
const ACCESS_CHANNEL_MS = 15 * 60000;
function rememberAccessChannel(key, channel) {
  const now = Date.now();
  for (const [k, v] of accessChannels) if (v.expiresAt <= now) accessChannels.delete(k);
  for (const k of accessChannels.keys()) { if (accessChannels.size < 5000) break; accessChannels.delete(k); }
  accessChannels.set(key, { channel, expiresAt: now + ACCESS_CHANNEL_MS });
}
app.post('/api/doctor/patient-access', auth, role('doctor'), accessLimiter, async (req, res) => {
  const p = db().patients.find((x) => x.id === req.body?.patientId);
  if (!p) return res.status(404).json({ error: 'Patient not found.' });
  const c = contactOf(p);
  const channel = pickChannel(c, req.body?.channel);
  if (!channel) return res.status(400).json({ error: 'This passport has no mobile number or email. Ask the patient to approve from their app instead.' });
  try {
    const sent = await otp.sendCode(channel === 'email' ? { channel: 'email', email: c.email, lang: 'en', ip: req.ip, purpose: 'consent' } : { channel: 'sms', phone: c.mobile, lang: 'en', ip: req.ip, purpose: 'consent' });
    rememberAccessChannel(`${req.user.id}:${p.id}`, channel);
    res.json({
      ok: true, masked: sent.masked, channel, devCode: sent.devCode, emailPreview: sent.emailPreview,
      // Let the doctor switch if the patient can't see this one.
      alternatives: [c.mobile && consentSmsOk() && channel !== 'sms' ? 'sms' : null, c.email && channel !== 'email' ? 'email' : null].filter(Boolean),
    });
  } catch (e) {
    if (e instanceof OtpError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
});

app.post('/api/doctor/patient-access/verify', auth, role('doctor'), otpVerifyLimiter, async (req, res) => {
  const d = db();
  const doc = doctorFor(req.user);
  const p = d.patients.find((x) => x.id === req.body?.patientId);
  if (!p) return res.status(404).json({ error: 'Patient not found.' });
  const c = contactOf(p);
  const memoKey = `${req.user.id}:${p.id}`;
  const memo = accessChannels.get(memoKey);
  const wanted = ['email', 'sms'].includes(req.body?.channel) ? req.body.channel : memo && memo.expiresAt > Date.now() ? memo.channel : null;
  const smsOk = Boolean(c.mobile) && consentSmsOk();
  const channel = wanted === 'email' && c.email ? 'email' : wanted === 'sms' && smsOk ? 'sms' : smsOk ? 'sms' : 'email';
  try {
    const ok = await otp.verifyCode({ target: targetFor(c, channel), code: String(req.body?.code || ''), purpose: 'consent' });
    if (!ok) throw new OtpError('That code is not right.', 400);
    accessChannels.delete(memoKey);
  } catch (e) {
    if (e instanceof OtpError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
  d.consents.push({ id: store.id('cst'), patientId: p.id, granteeType: 'doctor', granteeId: doc.id, granteeName: doc.name, scope: ['history', 'prescriptions', 'labs', 'allergies'], purpose: 'In-clinic visit (patient approved by OTP)', start: nowIso(), expiry: new Date(Date.now() + 24 * 3600000).toISOString(), status: 'active' });
  audit(req.user, 'walkin_access', p.id, 'consent', 'Patient approved by one-time code');
  patientOwnerUserIds(p).forEach((u) => notify(u, 'You approved a doctor', `${doc.name} can see your record and write prescriptions for the next 24 hours.`, 'consent'));
  store.save();
  broadcast('consents');
  res.json({ ok: true, patient: { id: p.id, name: p.name, age: ageOf(p.dob), gender: p.gender, allergies: p.allergies || [], conditions: p.conditions || [], currentMeds: p.currentMeds || [] } });
});

// Not on the network yet? The doctor creates a passport for the person in front of them.
app.post('/api/doctor/walkin-patient', auth, role('doctor'), (req, res) => {
  const d = db();
  const doc = doctorFor(req.user);
  const b = req.body || {};
  const name = clean(b.name, 80);
  const age = parseInt(b.age, 10);
  if (name.length < 2) return res.status(400).json({ error: 'Please enter the patient\'s name.' });
  if (!Number.isInteger(age) || age < 0 || age > 120) return res.status(400).json({ error: 'Please enter the patient\'s age.' });
  const phone = b.phone ? normalizePhone(clean(b.phone, 20)) : null;
  if (phone && (findUserByPhone(phone) || d.patients.some((x) => x.emergencyContacts?.some((e) => e.relation === 'Mobile' && samePhone(e.phone, phone))))) {
    return res.status(409).json({ error: 'This mobile number already has a Health Passport — search for it instead.' });
  }
  const p = {
    id: makePassportId(), userId: null, name, dob: `${new Date().getFullYear() - age}-07-01`, dobApprox: true,
    gender: ['Female', 'Male', 'Other'].includes(b.gender) ? b.gender : 'Prefer not to say', language: clean(b.language, 40) || 'Hindi', bloodGroup: 'Unknown',
    allergies: cleanList(b.allergies), conditions: [], currentMeds: [], emergencyContacts: phone ? [{ name, relation: 'Mobile', phone }] : [],
    abha: '', pincode: '', district: doc.district || '', state: doc.state || '', vaccinations: [], createdAt: nowIso(), createdBy: `${doc.name} (in clinic)`,
  };
  d.patients.push(p);
  // Created face-to-face by the treating doctor: they get the same 24-hour window as an OTP approval.
  d.consents.push({ id: store.id('cst'), patientId: p.id, granteeType: 'doctor', granteeId: doc.id, granteeName: doc.name, scope: ['history', 'prescriptions', 'labs', 'allergies'], purpose: 'In-clinic visit (registered by doctor)', start: nowIso(), expiry: new Date(Date.now() + 24 * 3600000).toISOString(), status: 'active' });
  audit(req.user, 'walkin_registered', p.id, 'passport', 'Registered in clinic');
  store.save();
  broadcast('patients');
  res.json({ id: p.id, name: p.name, age, gender: p.gender, allergies: p.allergies, conditions: [], currentMeds: [] });
});

// Pharmacies and labs / diagnostic centres to share with — nearest to the patient (or the doctor).
app.get('/api/doctor/share-targets', auth, role('doctor'), (req, res) => {
  const d = db();
  const doc = doctorFor(req.user);
  const p = d.patients.find((x) => x.id === req.query.patientId);
  const origin = geo.pointOf(p?.district ? p : (doc.facilityId ? d.facilities.find((f) => f.id === doc.facilityId) : doc)) || geo.pointOf(doc);
  const drugs = String(req.query.drugs || '').split('|').map((s) => s.trim().toLowerCase().replace(/\s+/g, '')).filter(Boolean);
  const codes = String(req.query.tests || '').split(',').filter(Boolean);
  const pharmacies = d.facilities.filter((f) => f.type === 'pharmacy' && f.verified).map((f) => ({
    id: f.id, name: f.name, district: f.district, hours: f.hours, distanceKm: geo.km(origin, geo.pointOf(f)),
    inStock: drugs.filter((dr) => d.inventory.some((i) => i.facilityId === f.id && i.drug.toLowerCase().replace(/\s+/g, '') === dr && i.qty > (i.safetyStock || 0))).length, of: drugs.length,
  })).sort((a, b) => b.inStock - a.inStock || (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9)).slice(0, 8);
  const labs = d.facilities.filter((f) => f.type === 'lab' && f.verified).map((f) => ({
    id: f.id, name: f.name, kind: f.subtype === 'diagnostic' ? 'Diagnostic centre' : f.government ? 'Government lab' : 'Pathology lab', district: f.district, hours: f.hours,
    distanceKm: geo.km(origin, geo.pointOf(f)), offers: codes.filter((c) => !f.tests || f.tests.includes(c)).length, of: codes.length, homeCollection: !!f.homeCollection,
  })).sort((a, b) => b.offers - a.offers || (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9)).slice(0, 8);
  res.json({ pharmacies, labs });
});


// ---- shared: send tests to centres (chosen, or nearest that does each test) and share the prescription ----
function createLabOrders(d, { p, doc, labTests, lab, rx, shareRx }) {
  const orders = [];
  if (!labTests.length) return orders;
  const byLab = new Map();
  for (const t of labTests) {
    const target = (lab && (!lab.tests || lab.tests.includes(t.code)) ? lab : null) || d.facilities.filter((f) => f.type === 'lab' && f.verified && (!f.tests || f.tests.includes(t.code)))
      .sort((x, y) => (geo.km(geo.pointOf(p), geo.pointOf(x)) ?? 1e9) - (geo.km(geo.pointOf(p), geo.pointOf(y)) ?? 1e9))[0];
    if (!target) continue;
    if (!byLab.has(target.id)) byLab.set(target.id, []);
    byLab.get(target.id).push(t);
  }
  for (const [labId, tests] of byLab) {
    const o = {
      id: store.id('lab'), patientId: p.id, doctorId: doc.id, labId, tests, status: 'ordered', pincode: p.pincode, createdAt: nowIso(), critical: false, results: [],
      rxId: rx?.id || null, referredByDoctor: !!lab, sharedRx: shareRx && rx ? rx.id : null, sharedBy: shareRx && rx ? 'doctor' : null,
      needsBooking: true, // the patient picks the centre and pays the 20% advance before the lab gets it
    };
    d.labOrders.unshift(o);
    orders.push({ id: o.id, labName: facilityName(labId), tests: tests.map((t) => t.name), sharedRx: !!o.sharedRx });
    patientOwnerUserIds(p).forEach((u) => notify(u, 'Tests advised — book a lab', `${doc.name} advised ${tests.map((t) => t.name).join(', ')}. Choose a lab near the clinic or your home in Tests & reports.`));
  }
  return orders;
}

// ---- shared: a follow-up becomes a real appointment the patient sees with date & time ----
function istAt(daysAhead, hour = 10) {
  const ymd = new Date(Date.now() + daysAhead * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  return new Date(`${ymd}T${String(hour).padStart(2, '0')}:00:00+05:30`).toISOString();
}
function createFollowUp(d, { p, doc, days, diagnosis, from }) {
  const opts = bookingOptions(d, doc);
  const visitType = from?.visitType || (from?.mode === 'in_person' ? 'clinic' : from ? 'video' : opts.clinic ? 'clinic' : 'video');
  const location = from?.location || (visitType === 'clinic' && opts.clinic ? { kind: 'clinic', ...opts.clinic } : null);
  const inPerson = visitType !== 'video' && location;
  const c = {
    id: store.id('con'), patientId: p.id, doctorId: doc.id, status: 'scheduled', type: 'scheduled', followUp: true, followUpOf: from?.id || null,
    mode: inPerson ? 'in_person' : (from?.mode && from.mode !== 'in_person' ? from.mode : 'video'), visitType: inPerson ? visitType : 'video', location: inPerson ? location : null,
    triage: { level: 'routine', score: 20, symptoms: `Follow-up: ${diagnosis || 'review'}`, note: 'Follow-up booked by the doctor.', specialty: doc.specialty },
    vitals: null, createdAt: nowIso(), scheduledAt: istAt(days), messages: [], fee: 0, paidAt: nowIso(),
    doctorSeenAt: nowIso(), // booked by the doctor themselves — no "new patient" pop-up for it
    ...(inPerson ? { visitSecret: crypto.randomBytes(16).toString('hex') } : {}),
  };
  d.consults.push(c);
  d.consents.push({ id: store.id('cst'), patientId: p.id, granteeType: 'doctor', granteeId: doc.id, granteeName: doc.name, scope: ['history', 'prescriptions', 'labs', 'allergies'], purpose: 'Follow-up visit', start: nowIso(), expiry: new Date(Date.parse(c.scheduledAt) + 3 * 86400000).toISOString(), status: 'active' });
  const when = new Date(c.scheduledAt).toLocaleString('en-IN', { timeZone: APP_TZ, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  patientOwnerUserIds(p).forEach((u) => notify(u, 'Follow-up booked', `${doc.name} wants to see you again on ${when}${inPerson ? ` at ${location.name}` : ' (video)'}.`));
  automation.emit('followup.scheduled', { consultId: c.id, followUpOf: c.followUpOf, patientId: p.id, doctorId: doc.id, doctorName: doc.name, mode: c.mode, location: c.location?.name || null, scheduledAt: c.scheduledAt }, { contact: autoContact(p) });
  return c;
}

app.post('/api/doctor/prescriptions', auth, role('doctor'), async (req, res) => {
  const d = db();
  const doc = doctorFor(req.user);
  const b = req.body || {};
  const p = d.patients.find((x) => x.id === b.patientId);
  if (!p) return res.status(404).json({ error: 'Patient not found.' });
  if (!hasConsent(p.id, [doc.id])) return res.status(403).json({ error: 'The patient hasn\'t approved this visit yet. Send them the one-time code first.' });
  const items = cleanRxItems(b.items);
  const labTests = (Array.isArray(b.labTests) ? b.labTests : []).slice(0, 15).filter((t) => t && own(catalog.TESTS, t.code)).map((t) => ({ code: t.code, name: catalog.TESTS[t.code].name }));
  let paperFileId = null;
  if (b.paperFileId) {
    const f = await store.adapter().fileGet(clean(b.paperFileId, 80));
    if (!f || f.uploadedBy !== req.user.id) return res.status(400).json({ error: 'Please upload the prescription photo again.' });
    paperFileId = f.id;
  }
  if (!items.length && !labTests.length && !paperFileId) return res.status(400).json({ error: 'Add at least one medicine or test — or upload the written prescription.' });
  const pharmacy = b.pharmacyId ? d.facilities.find((f) => f.id === b.pharmacyId && f.type === 'pharmacy' && f.verified) : null;
  if (b.pharmacyId && !pharmacy) return res.status(400).json({ error: 'Choose a chemist from the list.' });
  const lab = b.labId ? d.facilities.find((f) => f.id === b.labId && f.type === 'lab' && f.verified) : null;
  if (b.labId && !lab) return res.status(400).json({ error: 'Choose a lab from the list.' });
  if (lab && labTests.some((t) => lab.tests && !lab.tests.includes(t.code))) return res.status(400).json({ error: `${lab.name} doesn't do all of these tests. Pick another centre or split the order.` });
  const fac = doc.facilityId ? d.facilities.find((f) => f.id === doc.facilityId) : null;
  const rx = {
    id: store.id('rx'), consultId: null, patientId: p.id, doctorId: doc.id, items, advice: clean(b.advice, 600), diagnosis: clean(b.diagnosis, 200),
    complaint: clean(b.complaint, 300) || null, dos: cleanList(b.dos, 12), donts: cleanList(b.donts, 12),
    status: pharmacy ? 'sent' : 'issued', pharmacyId: pharmacy?.id || null, fulfilment: pharmacy ? 'pickup' : undefined, sentAt: pharmacy ? nowIso() : undefined,
    createdAt: nowIso(), signature: `${doc.name} · ${doc.regNo}`, warnings: items.length ? engines.checkPrescription(p, items) : [],
    source: isEClinicDoctor(doc) ? 'eclinic' : 'clinic', facilityId: fac?.id || null, facilityName: fac?.name || (isEClinicDoctor(doc) ? 'Nexus Healthcare E-Clinic' : null), paperFileId,
  };
  const rxSaved = Boolean(items.length || paperFileId);
  if (rxSaved) d.prescriptions.push(rx);
  const followUpDays = parseInt(b.followUpDays, 10);
  let followUp = null;
  if (followUpDays > 0) { followUp = createFollowUp(d, { p, doc, days: followUpDays, diagnosis: rx.diagnosis }); rx.followUpOn = followUp.scheduledAt; }
  // Tests: one order at the chosen centre, or split automatically between the nearest centres that do them.
  const orders = createLabOrders(d, { p, doc, labTests, lab, rx: rxSaved ? rx : null, shareRx: b.shareRxWithLab !== false });
  if (pharmacy) d.users.filter((u) => u.role === 'pharmacist' && u.facilityId === pharmacy.id).forEach((u) => notify(u.id, 'New e-prescription', `${p.name} · ${items.length} medicine${items.length === 1 ? '' : 's'} · from ${doc.name}`));
  patientOwnerUserIds(p).forEach((u) => notify(u, 'New prescription from your doctor', `${doc.name} sent you a digital prescription${pharmacy ? ` (shared with ${pharmacy.name})` : ''}${orders.length ? ` and ${labTests.length} test${labTests.length > 1 ? 's' : ''}` : ''}.`));
  audit(req.user, 'issued_prescription', p.id, 'prescription', `${rxSaved ? rx.id : 'tests only'} · ${rx.source}${pharmacy ? ` → ${pharmacy.name}` : ''}${orders.length ? ` · ${orders.length} lab order(s)` : ''}`);
  automation.emit('prescription.issued', { prescriptionId: rxSaved ? rx.id : null, patientId: p.id, doctorId: doc.id, doctorName: doc.name, itemsCount: items.length, labOrders: orders.length, pharmacy: pharmacy?.name || null, followUpOn: rx.followUpOn || null }, { contact: autoContact(p) });
  store.save();
  broadcast('prescriptions', 'pharmacy', 'lab', 'records');
  res.json({ prescription: rxSaved ? enrichRx(rx) : null, labOrders: orders, followUp: followUp ? { scheduledAt: followUp.scheduledAt, where: followUp.location?.name || 'Video' } : null, sharedWith: { patient: true, pharmacy: pharmacy?.name || null, labs: orders.map((o) => o.labName) } });
});

app.get('/api/doctor/prescriptions', auth, role('doctor'), (req, res) => {
  const d = db();
  const doc = doctorFor(req.user);
  res.json(d.prescriptions.filter((r) => r.doctorId === doc.id).slice(-40).reverse().map((r) => ({
    ...enrichRx(r), labs: d.labOrders.filter((o) => o.rxId === r.id).map((o) => ({ labName: facilityName(o.labId), tests: o.tests.map((t) => t.name), status: o.status })),
  })));
});

app.post('/api/break-glass', auth, role('doctor'), (req, res) => {
  const patientId = clean(req.body?.patientId, 40);
  const reason = clean(req.body?.reason, 500);
  const p = db().patients.find((x) => x.id === patientId);
  if (!p) return res.status(404).json({ error: 'Patient not found.' });
  if (reason.length < 10) return res.status(400).json({ error: 'Please describe the emergency (at least 10 characters). This is reviewed by an admin.' });
  db().audit.unshift({ id: store.id('aud'), actorId: req.user.id, actorName: req.user.name, role: req.user.role, action: 'break_glass', patientId, recordType: 'critical', reason, at: nowIso(), reviewed: false });
  patientOwnerUserIds(p).forEach((u) => notify(u, '⚠️ Emergency access to your records', `${req.user.name} opened your critical health data in an emergency. Reason: "${reason}". This is logged and reviewed.`, 'alert'));
  store.save();
  broadcast('audit', 'admin');
  res.json({ ok: true, expiresInMin: 60 });
});

app.post('/api/consults/:id/start', auth, role('doctor'), (req, res) => {
  const c = db().consults.find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Consult not found.' });
  if (doctorFor(req.user)?.id !== c.doctorId) return res.status(403).json({ error: 'This patient isn\'t in your queue.' });
  if (!['queued', 'scheduled', 'in_progress'].includes(c.status)) return res.status(409).json({ error: c.status === 'awaiting_payment' ? 'The patient hasn\'t paid for this booking yet.' : 'This consult can\'t be started.' });
  c.status = 'in_progress';
  c.startedAt = c.startedAt || nowIso();
  const p = db().patients.find((x) => x.id === c.patientId);
  patientOwnerUserIds(p).forEach((u) => notify(u, 'Your doctor is ready', `${req.user.name} has started your consult. Join now.`));
  store.save();
  broadcast('consults', 'queue', `consult:${c.id}`);
  res.json(enrichConsult(c));
});

app.post('/api/prescriptions/check', auth, role('doctor'), (req, res) => {
  const p = db().patients.find((x) => x.id === req.body?.patientId);
  if (!p) return res.status(404).json({ error: 'Patient not found.' });
  res.json(engines.checkPrescription(p, cleanRxItems(req.body.items)));
});

app.post('/api/consults/:id/complete', auth, role('doctor'), (req, res) => {
  const d = db();
  const doc = doctorFor(req.user);
  const c = d.consults.find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Consult not found.' });
  if (doc?.id !== c.doctorId) return res.status(403).json({ error: 'This patient isn\'t in your queue.' });
  if (c.status === 'completed') return res.status(409).json({ error: 'This consult is already completed.' });
  if (!['queued', 'scheduled', 'in_progress'].includes(c.status)) return res.status(409).json({ error: c.status === 'awaiting_payment' ? 'The patient hasn\'t paid for this booking yet.' : 'This consult can no longer be completed.' });
  if (req.body?.items !== undefined && !Array.isArray(req.body.items)) return res.status(400).json({ error: 'Invalid medicines list.' });
  if (req.body?.labTests !== undefined && !Array.isArray(req.body.labTests)) return res.status(400).json({ error: 'Invalid tests list.' });
  if (req.body?.triageOverride && !TRIAGE_LEVELS.includes(req.body.triageOverride)) return res.status(400).json({ error: 'Invalid triage level.' });
  const { notes, diagnosis, items = [], advice, labTests = [], referral, followUpDays, triageOverride } = req.body || {};
  const p = d.patients.find((x) => x.id === c.patientId);
  c.status = 'completed';
  c.completedAt = nowIso();
  c.notes = clean(notes, 4000);
  c.diagnosis = clean(diagnosis, 200);
  if (triageOverride && triageOverride !== c.triage.level) {
    c.triage.override = { from: c.triage.level, to: triageOverride, by: doc.name };
    c.triage.level = triageOverride;
  }
  doc.consultsDone += 1;
  doc.earnings += c.kioskId ? doc.fee : Math.max(0, Number(c.fee) || 0); // what the patient actually paid online

  let rx = null;
  const validItems = cleanRxItems(items);
  if (validItems.length) {
    const warnings = engines.checkPrescription(p, validItems);
    rx = {
      id: store.id('rx'), consultId: c.id, patientId: p.id, doctorId: doc.id, items: validItems, advice: clean(advice, 600), warnings, status: 'issued', pharmacyId: null, fulfilment: null, createdAt: nowIso(), signature: `${doc.name} · ${doc.regNo}`,
      complaint: c.triage?.symptoms || null, diagnosis: clean(diagnosis, 200) || null, dos: cleanList(req.body?.dos, 12), donts: cleanList(req.body?.donts, 12),
    };
    // Kiosk visits send the prescription straight to the attached/nearest pharmacy.
    if (c.kioskId) {
      const stocked = engines.findStock(d, validItems[0].drug, { district: p.district, state: p.state }).find((s) => s.facility.type === 'pharmacy');
      if (stocked) { rx.pharmacyId = stocked.facilityId; rx.fulfilment = 'pickup'; rx.status = 'sent'; }
    }
    d.prescriptions.push(rx);
    audit(req.user, 'created_prescription', p.id, 'prescription', rx.id);
    automation.emit('prescription.issued', { prescriptionId: rx.id, consultId: c.id, patientId: p.id, doctorId: doc.id, doctorName: doc.name, itemsCount: validItems.length, pharmacyId: rx.pharmacyId || null }, { contact: autoContact(p) });
    // Flow D: anything not stockable nearby triggers an inter-region transfer request.
    for (const it of validItems) {
      const stock = engines.findStock(d, it.drug, { district: p.district, state: p.state });
      const local = stock.find((s) => s.tier <= 1 && s.facility.type === 'pharmacy');
      if (!local && stock.length && rx.pharmacyId) {
        const src = stock[0];
        d.transfers.unshift({ id: store.id('tr'), drug: src.drug, qty: 10, fromId: src.facilityId, toId: rx.pharmacyId, status: 'requested', reason: `Not stocked locally for ${p.name}'s prescription ${rx.id}`, createdAt: nowIso() });
      }
    }
  }
  // Tests: the doctor may refer them to a specific centre (and share the prescription with it); otherwise
  // each goes to the nearest centre that does it, and the patient can compare prices and switch.
  const refLab = req.body?.labId ? d.facilities.find((f) => f.id === req.body.labId && f.type === 'lab' && f.verified) : null;
  const cleanTests = labTests.slice(0, 15).filter((t) => t && clean(t.code, 40)).map((t) => ({ code: clean(t.code, 40), name: own(catalog.TESTS, t.code)?.name || clean(t.name, 80) })).filter((t) => t.name);
  createLabOrders(d, { p, doc, labTests: cleanTests, lab: refLab, rx, shareRx: Boolean(refLab) && req.body?.shareRxWithLab !== false });
  // A referral goes only to a verified hospital on the network, for a bed type it actually has.
  const refTo = referral && typeof referral === 'object' ? d.facilities.find((f) => f.id === referral.facilityId && f.type === 'hospital' && f.verified) : null;
  if (refTo) {
    const bedType = clean(referral.bedType, 20);
    d.referrals.unshift({ id: store.id('ref'), patientId: p.id, patientName: p.name, age: ageOf(p.dob), fromDoctorId: doc.id, fromName: `${doc.name} (teleconsult)`, toFacilityId: refTo.id, bedType: bedType && d.beds.some((x) => x.facilityId === refTo.id && x.type === bedType) ? bedType : 'general', reason: clean(referral.reason, 300) || c.diagnosis, urgency: c.triage.level, status: 'pending', eta: '45 min', createdAt: nowIso() });
    d.users.filter((u) => u.role === 'hospital_admin' && u.facilityId === refTo.id).forEach((u) => touch(u.id));
  }
  if (Number(followUpDays) > 0) {
    const fu = createFollowUp(d, { p, doc, days: Number(followUpDays), diagnosis, from: c });
    if (rx) rx.followUpOn = fu.scheduledAt;
  }
  patientOwnerUserIds(p).forEach((u) => notify(u, 'Consult summary ready', `${doc.name} has completed your consult${rx ? ' and sent an e-prescription' : ''}.`));
  audit(req.user, 'completed_consult', p.id, 'consult', c.id);
  automation.emit('consult.completed', { consultId: c.id, patientId: p.id, doctorId: doc.id, doctorName: doc.name, prescriptionId: rx?.id || null }, { contact: autoContact(p) });
  store.save();
  broadcast('consults', 'queue', 'prescriptions', 'pharmacy', 'lab', 'referrals', 'supply', `consult:${c.id}`);
  res.json({ consult: enrichConsult(c), prescription: rx ? { ...rx, pharmacyName: facilityName(rx.pharmacyId) || null } : null });
});

app.get('/api/referral-options', auth, role('doctor', 'kiosk_operator'), (req, res) => {
  const d = db();
  const bedType = req.query.bedType || 'general';
  const hospitals = d.facilities.filter((f) => f.type === 'hospital' && f.verified).map((f) => {
    const b = d.beds.find((x) => x.facilityId === f.id && x.type === bedType);
    return { id: f.id, name: f.name, district: f.district, state: f.state, free: b ? b.total - b.occupied : 0 };
  }).filter((h) => h.free > 0).sort((a, b) => (a.district === 'Barabanki' ? -1 : 1) - (b.district === 'Barabanki' ? -1 : 1) || b.free - a.free);
  res.json(hospitals);
});

// ---------- kiosk ----------
app.get('/api/kiosk/home', auth, role('kiosk_operator'), (req, res) => {
  const d = db();
  const kiosk = d.facilities.find((f) => f.id === req.user.facilityId);
  const today = istDay(nowIso());
  res.json({
    kiosk,
    queue: d.consults.filter((c) => c.kioskId === kiosk.id && istDay(c.createdAt) === today).map(enrichConsult).reverse(),
    pharmacies: d.facilities.filter((f) => f.type === 'pharmacy' && f.district === kiosk.district),
    // E-Clinic partner doctors who serve this clinic (or all clinics) — available ones first.
    doctors: d.doctors.filter((x) => x.verified && isEClinicDoctor(x) && (!(x.eClinicIds || []).length || x.eClinicIds.includes(kiosk.id) || x.presenceClinicId === kiosk.id))
      .map((x) => ({ ...publicDoctor(x), here: x.online && x.presenceClinicId === kiosk.id }))
      .sort((a, b) => Number(b.here) - Number(a.here) || Number(b.online) - Number(a.online)),
  });
});

// A kiosk login could otherwise walk through phone numbers / passport ids to enumerate patients.
const identifyLimiter = security.rateLimit({ windowMs: 60 * 60000, max: 120, key: (r) => r.headers.authorization || r.ip, message: 'Too many patient look-ups from this kiosk. Please wait a while.' });
app.post('/api/kiosk/identify', auth, role('kiosk_operator'), identifyLimiter, (req, res) => {
  const q = String(req.body?.query || '').trim();
  const users = db().users;
  const asPhone = q.replace(/\D/g, '').length >= 6 ? normalizePhone(q, req.body?.dialCode) : null;
  const p = db().patients.find((x) => x.id.toLowerCase() === q.toLowerCase()
    || (asPhone && samePhone(users.find((u) => u.id === x.userId)?.phone, asPhone))
    || (asPhone && x.emergencyContacts?.some((e) => e.relation === 'Mobile' && samePhone(e.phone, asPhone))));
  if (!p) return res.status(404).json({ error: 'No Health Passport found. You can register this patient now.' });
  p.kioskSeen = { kioskId: req.user.facilityId, at: nowIso() };
  audit(req.user, 'identified_patient', p.id, 'passport', 'Kiosk check-in');
  store.save();
  // Only what the kiosk needs for triage — no government IDs, address or contacts.
  res.json({ id: p.id, name: p.name, age: ageOf(p.dob), dob: p.dob, gender: p.gender, language: p.language, bloodGroup: p.bloodGroup, allergies: p.allergies || [], conditions: p.conditions || [], currentMeds: p.currentMeds || [], district: p.district });
});

app.post('/api/kiosk/register', auth, role('kiosk_operator'), (req, res) => {
  const b = req.body || {};
  const name = clean(b.name, 80);
  const dobT = Date.parse(b.dob);
  if (name.length < 2 || !Number.isFinite(dobT) || dobT > Date.now() || dobT < Date.parse('1900-01-01')) return res.status(400).json({ error: 'Name and date of birth are required.' });
  const kiosk = db().facilities.find((f) => f.id === req.user.facilityId);
  const phone = b.phone ? normalizePhone(clean(b.phone, 20), b.dialCode) || clean(b.phone, 20) : '';
  const p = {
    id: makePassportId(), userId: null, name, dob: new Date(dobT).toISOString().slice(0, 10), gender: ['Female', 'Male', 'Other'].includes(b.gender) ? b.gender : 'Prefer not to say', language: clean(b.language, 40) || 'Hindi',
    bloodGroup: BLOOD_GROUPS.includes(b.bloodGroup) ? b.bloodGroup : 'Unknown', allergies: cleanList(b.allergies, 30), conditions: cleanList(b.conditions, 30), currentMeds: [],
    emergencyContacts: phone ? [{ name: 'Self', relation: 'Mobile', phone }] : [], abha: '', pincode: kiosk.pincode, district: kiosk.district, state: kiosk.state, vaccinations: [], registeredAt: kiosk.name, createdAt: nowIso(),
    kioskSeen: { kioskId: kiosk.id, at: nowIso() },
  };
  db().patients.push(p);
  audit(req.user, 'registered_patient', p.id, 'passport', `Walk-in at ${kiosk.name}`);
  automation.emit('patient.registered', { patientId: p.id, via: 'kiosk', kiosk: kiosk.name, district: p.district || null }, { contact: autoContact(p) });
  store.save();
  broadcast('patients', 'admin');
  res.json({ ...p, age: ageOf(p.dob) });
});

// Simulated connected devices.
app.post('/api/kiosk/vitals/read', auth, role('kiosk_operator'), (req, res) => {
  const r = (a, b, dec = 0) => +(a + Math.random() * (b - a)).toFixed(dec);
  const kiosk = db().facilities.find((f) => f.id === req.user.facilityId);
  const devices = kiosk.devices || {};
  res.json({
    bp: `${r(112, 146)}/${r(72, 92)}`, pulse: r(68, 104), spo2: r(93, 99), temp: r(97.6, 101.2, 1), weight: r(48, 78, 1),
    sugar: (devices.glucometer || 'ok') === 'ok' ? r(92, 220) : null,
    deviceWarnings: Object.entries(devices).filter(([, s]) => s !== 'ok').map(([k, s]) => `${k}: ${String(s).replace('_', ' ')}`),
  });
});

app.put('/api/kiosk/status', auth, role('kiosk_operator'), (req, res) => {
  const kiosk = db().facilities.find((f) => f.id === req.user.facilityId);
  const status = req.body?.status;
  if (!['online', 'offline'].includes(status)) return res.status(400).json({ error: 'Status must be online or offline.' });
  kiosk.status = status;
  store.save();
  broadcast('kiosks', 'admin');
  res.json(kiosk);
});

// ---------- hospital ----------
app.get('/api/hospital/home', auth, role('hospital_admin'), (req, res) => {
  const d = db();
  const fid = req.user.facilityId;
  const referrals = d.referrals.filter((r) => r.toFacilityId === fid);
  res.json({
    facility: d.facilities.find((f) => f.id === fid),
    beds: d.beds.filter((b) => b.facilityId === fid),
    roster: d.roster.filter((r) => r.facilityId === fid),
    doctors: d.doctors.filter((x) => x.verified && x.facilityId === fid).map((x) => publicDoctor(x)),
    referrals,
    opd: d.opdSlots.filter((o) => o.facilityId === fid),
    analytics: DATA_MODE === 'demo' ? {
      occupancyTrend: [71, 74, 78, 76, 81, 84, 80, 83, 86, 82, 79, 81, 85, 80],
      referralsWeek: [4, 6, 3, 8, 7, 5, 9],
      avgTurnaroundMin: 34,
      accepted: referrals.filter((r) => r.status === 'accepted').length,
      rejected: referrals.filter((r) => r.status === 'rejected').length,
    } : hospitalAnalytics(d, fid, referrals),
  });
});

// Live hospitals see only what the data supports. Bed history isn't stored, so the occupancy "trend" is
// today's figure as a 1-point series (null with no beds); referrals are counted per 7-day week, oldest
// first (this week last); turnaround = mean minutes from referral to decision (null until one is decided).
function hospitalAnalytics(d, fid, referrals) {
  const WEEK = 7 * 86400000;
  const beds = d.beds.filter((b) => b.facilityId === fid);
  const total = beds.reduce((s, b) => s + (Number(b.total) || 0), 0);
  const occupied = beds.reduce((s, b) => s + (Number(b.occupied) || 0), 0);
  const now = Date.now();
  const referralsWeek = new Array(7).fill(0);
  let tSum = 0; let tN = 0;
  for (const r of referrals) {
    const w = 6 - Math.floor((now - Date.parse(r.createdAt)) / WEEK);
    if (w >= 0 && w <= 6) referralsWeek[w] += 1;
    const ms = Date.parse(r.decidedAt) - Date.parse(r.createdAt);
    if (ms >= 0) { tSum += ms; tN += 1; }
  }
  return {
    occupancyTrend: total ? [Math.round((occupied / total) * 100)] : null,
    referralsWeek,
    avgTurnaroundMin: tN ? Math.round(tSum / tN / 60000) : null,
    accepted: referrals.filter((r) => r.status === 'accepted').length,
    rejected: referrals.filter((r) => r.status === 'rejected').length,
  };
}

app.put('/api/hospital/beds', auth, role('hospital_admin'), (req, res) => {
  const { type, total, occupied } = req.body || {};
  const b = db().beds.find((x) => x.facilityId === req.user.facilityId && x.type === type);
  if (!b) return res.status(404).json({ error: 'Bed type not found.' });
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
  if (total !== undefined) { const n = num(total); if (n === null || n < 0 || n > 100000) return res.status(400).json({ error: 'Enter a valid bed count.' }); b.total = Math.round(n); }
  if (occupied !== undefined) { const n = num(occupied); if (n === null || n < 0) return res.status(400).json({ error: 'Enter a valid occupied count.' }); b.occupied = Math.min(b.total, Math.round(n)); }
  b.updatedAt = nowIso();
  store.save();
  broadcast('beds', 'gov');
  res.json(b);
});

app.put('/api/hospital/roster/:id', auth, role('hospital_admin'), (req, res) => {
  const r = db().roster.find((x) => x.id === req.params.id && x.facilityId === req.user.facilityId);
  if (!r) return res.status(404).json({ error: 'Staff member not found.' });
  const b = req.body || {};
  for (const k of ['onDuty', 'teleconsult']) if (b[k] !== undefined) r[k] = Boolean(b[k]);
  if (b.shift !== undefined) r.shift = clean(b.shift, 40);
  store.save();
  broadcast('hospital', 'roster');
  res.json(r);
});

app.post('/api/hospital/roster', auth, role('hospital_admin'), (req, res) => {
  const b = req.body || {};
  const name = clean(b.name, 80); const department = clean(b.department, 60);
  if (!name || !department) return res.status(400).json({ error: 'Name and department are required.' });
  const r = { id: store.id('ros'), facilityId: req.user.facilityId, name, department, shift: clean(b.shift, 40) || '09:00 – 17:00', onDuty: true, teleconsult: false };
  db().roster.push(r);
  store.save();
  broadcast('hospital', 'roster');
  res.json(r);
});

// Hospitals list their doctors on Nexus (bookable by patients once the hospital is verified).
app.get('/api/hospital/doctors', auth, role('hospital_admin'), (req, res) => {
  res.json({ doctors: clinicDoctorsOf(db(), req.user.facilityId), specialties: SPECIALTIES });
});
app.post('/api/hospital/doctors', auth, role('hospital_admin'), (req, res) => {
  const d = db();
  const f = d.facilities.find((x) => x.id === req.user.facilityId);
  if (!f) return res.status(404).json({ error: 'Hospital not found.' });
  const r = listDoctorAt(d, f, req.body || {}, req.user.id);
  if (r.error) return res.status(400).json({ error: r.error });
  audit(req.user, 'listed_doctor', null, 'doctor', `${r.doc.name} at ${f.name}`);
  store.save();
  broadcast('doctors', 'hospital');
  res.json({ ok: true, linked: !!r.linked, doctors: clinicDoctorsOf(d, f.id) });
});
app.delete('/api/hospital/doctors/:id', auth, role('hospital_admin'), (req, res) => {
  const d = db();
  const x = d.doctors.find((y) => y.id === req.params.id && y.facilityId === req.user.facilityId);
  if (!x) return res.status(404).json({ error: 'Doctor not found at your hospital.' });
  if (x.userId) { x.facilityId = null; x.engagement = 'independent'; } else d.doctors.splice(d.doctors.indexOf(x), 1);
  store.save();
  broadcast('doctors', 'hospital');
  res.json({ ok: true, doctors: clinicDoctorsOf(d, req.user.facilityId) });
});

// Chemist completes the store profile after quick sign-up: location, store photo, licence photo.
app.put('/api/pharmacy/profile', auth, role('pharmacist'), async (req, res) => {
  const d = db();
  const f = d.facilities.find((x) => x.id === req.user.facilityId);
  if (!f) return res.status(404).json({ error: 'Store not found.' });
  const b = req.body || {};
  if (f.verified) {
    // After verification only day-to-day details are self-service.
    for (const [k, max] of [['hours', 60], ['phone', 20]]) if (b[k] !== undefined) f[k] = clean(b[k], max);
    if (b.delivery !== undefined) f.delivery = Boolean(b.delivery);
    store.save();
    return res.json(f);
  }
  if (clean(b.storeName, 120).length >= 3) f.name = clean(b.storeName, 120);
  if (clean(b.address, 240).length < 5) return res.status(400).json({ error: 'Please add the store address.' });
  if (!clean(b.district) || !clean(b.state)) return res.status(400).json({ error: 'Please add the city / district and state.' });
  if (clean(b.licenceNo, 60).length < 4) return res.status(400).json({ error: 'Please enter the drug licence number.' });
  const lat = Number(b.lat); const lng = Number(b.lng);
  if (!(b.lat != null && geo.validCoord(lat, lng)) && !geo.byDistrict(b.district, b.state) && !geo.validCoord(f.lat, f.lng)) {
    return res.status(400).json({ error: 'Tap "Use my location" at the store so patients nearby can find you.' });
  }
  for (const [key, fid, label] of [['storePhotoFileId', clean(b.storePhotoFileId, 80), 'store photo'], ['licenceFileId', clean(b.licenceFileId, 80), 'licence photo']]) {
    if (!fid) return res.status(400).json({ error: `Please add a ${label}.` });
    const file = await store.adapter().fileGet(fid);
    if (!file || file.uploadedBy !== req.user.id) return res.status(400).json({ error: `Please upload the ${label} again.` });
    if (key === 'storePhotoFileId' && !String(file.mime).startsWith('image/')) return res.status(400).json({ error: 'The store photo must be an image (JPG, PNG or WEBP).' });
    f[key] = fid;
  }
  Object.assign(f, {
    address: clean(b.address, 240), district: clean(b.district), state: clean(b.state), pincode: clean(b.pincode, 12), licenceNo: clean(b.licenceNo, 60),
    hours: clean(b.hours, 60) || f.hours || '', phone: clean(b.phone, 20) || req.user.phone, delivery: Boolean(b.delivery), generic: Boolean(b.generic),
    country: /^[A-Z]{2}$/.test(String(b.country || '').toUpperCase()) ? String(b.country).toUpperCase() : countryOf(f),
    ...(b.lat != null && geo.validCoord(lat, lng) ? { lat: round3(lat), lng: round3(lng) } : {}),
    profileComplete: true, profileSubmittedAt: nowIso(), verificationNote: null,
  });
  req.user.region = { ...req.user.region, district: f.district, state: f.state };
  audit(req.user, 'pharmacy_profile_submitted', null, 'pharmacy', f.name);
  automation.emit('onboarding.submitted', { kind: 'pharmacy', stage: 'ready_for_review', id: f.id, name: f.name, district: f.district || null });
  d.users.filter((u) => u.role === 'super_admin').forEach((a) => notify(a.id, 'Medical store ready for review', `${f.name}, ${f.district} completed its profile.`));
  store.save();
  broadcast('admin');
  res.json(f);
});

app.post('/api/referrals/:id/:action', auth, role('hospital_admin'), (req, res) => {
  const d = db();
  const r = d.referrals.find((x) => x.id === req.params.id && x.toFacilityId === req.user.facilityId);
  if (!r) return res.status(404).json({ error: 'Referral not found.' });
  const { action } = req.params;
  if (!['accept', 'reject'].includes(action)) return res.status(400).json({ error: 'Unknown action.' });
  r.status = action === 'accept' ? 'accepted' : 'rejected';
  r.decidedAt = nowIso();
  r.note = clean(req.body?.note, 300) || undefined;
  if (action === 'accept') {
    const b = d.beds.find((x) => x.facilityId === r.toFacilityId && x.type === r.bedType);
    if (b && b.occupied < b.total) { b.occupied += 1; b.updatedAt = nowIso(); }
  }
  const doc = d.doctors.find((x) => x.id === r.fromDoctorId);
  notify(doc?.userId, `Referral ${r.status}`, `${facilityName(r.toFacilityId)} ${r.status} ${r.patientName}.`);
  store.save();
  broadcast('referrals', 'beds', 'gov');
  res.json(r);
});

app.put('/api/hospital/opd/:id', auth, role('hospital_admin'), (req, res) => {
  const o = db().opdSlots.find((x) => x.id === req.params.id && x.facilityId === req.user.facilityId);
  if (!o) return res.status(404).json({ error: 'Slot not found.' });
  if (req.body?.capacity !== undefined) {
    const n = Number(req.body.capacity);
    if (!Number.isFinite(n) || n < 0 || n > 10000) return res.status(400).json({ error: 'Enter a valid capacity.' });
    o.capacity = Math.round(n);
  }
  store.save();
  broadcast('hospital', 'roster');
  res.json(o);
});

app.post('/api/hospital/opd', auth, role('hospital_admin'), (req, res) => {
  const b = req.body || {};
  const department = clean(b.department, 60); const date = clean(b.date, 20); const time = clean(b.time, 30);
  if (!department || !date || !time) return res.status(400).json({ error: 'Department, date and time are required.' });
  const o = { id: store.id('opd'), facilityId: req.user.facilityId, department, date, time, capacity: Math.max(1, Math.min(10000, parseInt(b.capacity, 10) || 20)), booked: 0 };
  db().opdSlots.push(o);
  store.save();
  broadcast('hospital', 'roster');
  res.json(o);
});

// ---------- lab ----------
app.get('/api/lab/home', auth, role('lab_tech'), (req, res) => {
  const d = db();
  res.json({
    lab: d.facilities.find((f) => f.id === req.user.facilityId),
    orders: d.labOrders.filter((o) => o.labId === req.user.facilityId && (!o.needsBooking || o.booking?.paidAt)).map(enrichLab),
  });
});

app.put('/api/lab-orders/:id/status', auth, role('lab_tech'), (req, res) => {
  const o = db().labOrders.find((x) => x.id === req.params.id && x.labId === req.user.facilityId);
  if (!o) return res.status(404).json({ error: 'Order not found.' });
  const steps = ['ordered', 'collected', 'received', 'processing'];
  if (!steps.includes(req.body?.status)) return res.status(400).json({ error: 'Invalid status. Upload the report to mark it reported.' });
  if (o.status === 'reported' || steps.indexOf(req.body.status) <= steps.indexOf(o.status)) return res.status(409).json({ error: 'Lab steps only move forward.' });
  if (o.needsBooking && !o.booking?.paidAt) return res.status(409).json({ error: 'The patient hasn\'t confirmed this booking yet.' });
  if (!o.reportDueAt && ['collected', 'received', 'processing'].includes(req.body.status)) {
    const lab = db().facilities.find((f) => f.id === o.labId);
    const tat = o.booking?.reportInHours || labQuote(lab || {}, o.tests, null).reportInHours || 24;
    o.reportDueAt = new Date(Date.now() + tat * 3600000).toISOString();
    const p = db().patients.find((x) => x.id === o.patientId);
    const by = new Date(o.reportDueAt).toLocaleString('en-IN', { timeZone: APP_TZ, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
    patientOwnerUserIds(p).forEach((u) => notify(u, 'Your test is done ✅', `${o.tests.map((t) => t.name).join(', ')} at ${facilityName(o.labId)}. Your report will be ready by ${by} — we'll notify you.`));
    automation.emit('lab.sample_collected', { labOrderId: o.id, patientId: o.patientId, labId: o.labId, labName: facilityName(o.labId), reportDueAt: o.reportDueAt }, { contact: autoContact(p) });
  }
  o.status = req.body.status;
  o[`${req.body.status}At`] = nowIso();
  store.save();
  broadcast('lab', 'records');
  res.json(enrichLab(o));
});

app.post('/api/lab-orders/:id/report', auth, role('lab_tech'), async (req, res) => {
  const d = db();
  const o = d.labOrders.find((x) => x.id === req.params.id && x.labId === req.user.facilityId);
  if (!o) return res.status(404).json({ error: 'Order not found.' });
  if (o.status === 'reported') return res.status(409).json({ error: 'This report has already been uploaded.' });
  // Optional signed report (PDF/photo) uploaded through /api/files by this same lab user.
  let reportFileId = null;
  if (req.body?.reportFileId) {
    const f = await store.adapter().fileGet(clean(req.body.reportFileId, 40));
    if (!f || f.uploadedBy !== req.user.id) return res.status(400).json({ error: 'Please attach the signed report again.' });
    reportFileId = f.id;
  }
  // Only the fields a result has (name, value, unit, range, flag), each bounded — never arbitrary objects.
  const results = (Array.isArray(req.body?.results) ? req.body.results : []).slice(0, 60).filter((r) => r && typeof r === 'object')
    .map((r) => ({ name: clean(r.name, 80), value: clean(r.value, 40), unit: clean(r.unit, 20), range: clean(r.range, 40), flag: clean(r.flag, 20) }))
    .filter((r) => r.name && r.value !== '');
  if (!results.length) return res.status(400).json({ error: 'Add at least one result value.' });
  o.results = results;
  if (reportFileId) o.reportFileId = reportFileId;
  o.status = 'reported';
  o.reportedAt = nowIso();
  o.critical = results.some((r) => r.flag === 'critical');
  o.insights = catalog.interpret(results);
  const p = d.patients.find((x) => x.id === o.patientId);
  const doc = d.doctors.find((x) => x.id === o.doctorId);
  o.nextSteps = catalog.nextSteps(results, { doctorName: doc?.name });
  if (o.critical) {
    notify(doc?.userId, '🚨 Critical lab value', `${p.name}: ${results.filter((r) => r.flag === 'critical').map((r) => `${r.name} ${r.value} ${r.unit || ''}`).join(', ')}`, 'alert');
    patientOwnerUserIds(p).forEach((u) => notify(u, 'Important lab result', 'One of your results needs attention. Your doctor has been informed and will contact you shortly.', 'alert'));
  } else {
    patientOwnerUserIds(p).forEach((u) => notify(u, 'Lab report ready 📄', `Your ${o.tests.map((t) => t.name).join(', ')} report is ready in Tests & reports — view it online or download the PDF, with suggestions on what to do next.`));
    notify(doc?.userId, 'Lab report ready', `${p.name}: ${o.tests.map((t) => t.name).join(', ')}`);
  }
  // Anonymised feed → outbreak engine (test, result, pin, date only).
  const newAlerts = engines.outbreakCheck(d, o);
  audit(req.user, 'uploaded_report', p.id, 'lab', o.id);
  automation.emit('lab.report_ready', { labOrderId: o.id, patientId: p.id, labId: o.labId, labName: facilityName(o.labId), doctorId: o.doctorId, doctorName: doc?.name || null, critical: !!o.critical }, { contact: autoContact(p) });
  store.save();
  broadcast('lab', 'records', 'alerts', 'gov');
  res.json({ order: enrichLab(o), newAlerts });
});

// ---------- pharmacy & supply ----------
app.get('/api/pharmacy/home', auth, role('pharmacist'), (req, res) => {
  const d = db();
  const fid = req.user.facilityId;
  const fac = d.facilities.find((f) => f.id === fid);
  const inventory = d.inventory.filter((i) => i.facilityId === fid);
  const soon = Date.now() + 60 * 86400000;
  if (!fac.verified) return res.json({ pharmacy: fac, onboarding: true, inbox: [], inventory: [], lowStock: [], expiring: [], transfersIn: [], transfersOut: [], advisories: [], orders: [] });
  res.json({
    pharmacy: fac,
    // Medicine orders: this chemist's own, plus open "anyone nearby?" requests it can take.
    orders: d.medOrders.filter((o) => o.status !== 'awaiting_payment' && (o.pharmacyId === fid || (!o.pharmacyId && o.status === 'requested' && o.candidates.includes(fid))))
      .slice(0, 60).map((o) => { const e = enrichMedOrder(o); const mineNow = o.pharmacyId === fid; return { ...e, otp: undefined, address: mineNow ? e.address : null, open: !o.pharmacyId, rxFileId: mineNow ? o.rxFileId : null, hasRxPhoto: !!o.rxFileId, patientPhone: mineNow ? userById(o.userId)?.phone : null }; }),
    inbox: d.prescriptions.filter((r) => r.pharmacyId === fid).map(enrichRx).reverse(),
    inventory,
    lowStock: inventory.filter((i) => i.qty <= i.safetyStock),
    expiring: inventory.filter((i) => new Date(i.expiry) < soon),
    transfersIn: d.transfers.filter((t) => t.toId === fid).map((t) => ({ ...t, fromName: facilityName(t.fromId) })),
    transfersOut: d.transfers.filter((t) => t.fromId === fid).map((t) => ({ ...t, toName: facilityName(t.toId) })),
    advisories: d.alerts.filter((a) => a.type === 'outbreak' && a.district === fac.district && a.status !== 'dismissed').map((a) => ({
      id: a.id, disease: a.disease, status: a.status,
      message: `${a.disease} rising in your area (${a.multiplier}× normal). Suggested: stock up on ${a.disease === 'Dengue' ? 'ORS, Paracetamol, Dengue NS1 kits and platelet kits' : 'ORS, Paracetamol and Cetirizine'}.`,
    })),
  });
});

app.post('/api/prescriptions/:id/dispense', auth, role('pharmacist'), (req, res) => {
  const d = db();
  const r = d.prescriptions.find((x) => x.id === req.params.id && x.pharmacyId === req.user.facilityId);
  if (!r) return res.status(404).json({ error: 'Prescription not found.' });
  const { status, partial } = req.body || {};
  // sent → dispensed → collected (pickup) | out_for_delivery → (rider confirms delivery with the patient's code)
  const NEXT = { sent: ['dispensed'], dispensed: r.fulfilment === 'delivery' ? ['out_for_delivery'] : ['collected'] };
  if (!(NEXT[r.status] || []).includes(status)) return res.status(409).json({ error: status === 'delivered' ? 'Delivery is confirmed by the rider with the patient\'s code.' : 'That step isn\'t possible for this prescription right now.' });
  if (status === 'dispensed') {
    for (const it of r.items) {
      const inv = d.inventory.find((i) => i.facilityId === req.user.facilityId && i.drug.toLowerCase() === it.drug.toLowerCase());
      if (inv) inv.qty = Math.max(0, inv.qty - catalog.unitsFor(it));
    }
    r.partial = Boolean(partial);
  }
  r.status = status;
  r[`${status}At`] = nowIso();
  const p = d.patients.find((x) => x.id === r.patientId);
  if (status === 'out_for_delivery') {
    const shop = d.facilities.find((f) => f.id === r.pharmacyId);
    const rider = pickRider(d, shop?.district);
    d.deliveries.unshift({ id: store.id('del'), kind: 'prescription', refId: r.id, pickup: facilityName(r.pharmacyId), drop: `${p.name} · ${r.address || p.district}`, courierId: rider?.id || null, status: rider ? 'assigned' : 'unassigned', coldChain: r.items.some((i) => /insulin|vaccine/i.test(i.drug)), otp: String(crypto.randomInt(1000, 10000)), items: r.items.map((i) => i.drug).join(', '), distanceKm: geo.km(geo.pointOf(shop), geo.pointOf(p)), createdAt: nowIso() });
    if (rider) notify(rider.id, 'New pickup', `${facilityName(r.pharmacyId)} → ${p.name}`);
  }
  const msg = { dispensed: 'Your medicines are packed and ready.', collected: 'Medicines collected. Get well soon!', out_for_delivery: 'Your medicines are on the way.', delivered: 'Your medicines have been delivered.' }[status];
  patientOwnerUserIds(p).forEach((u) => notify(u, 'Medicine update', msg));
  store.save();
  broadcast('prescriptions', 'pharmacy', 'dispatch');
  res.json(enrichRx(r));
});

app.put('/api/inventory/:id', auth, role('pharmacist', 'distributor'), (req, res) => {
  const i = db().inventory.find((x) => x.id === req.params.id && x.facilityId === req.user.facilityId);
  if (!i) return res.status(404).json({ error: 'Item not found.' });
  const b = req.body || {};
  for (const k of ['qty', 'safetyStock']) if (b[k] !== undefined) {
    const n = Number(b[k]);
    if (!Number.isFinite(n) || n < 0 || n > 1e7) return res.status(400).json({ error: `Enter a valid ${k === 'qty' ? 'quantity' : 'safety stock'}.` });
    i[k] = Math.round(n);
  }
  i.updatedAt = nowIso();
  store.save();
  broadcast('pharmacy', 'supply');
  res.json(i);
});

app.post('/api/inventory', auth, role('pharmacist', 'distributor'), (req, res) => {
  const b = req.body || {};
  const drug = clean(b.drug, 80);
  const qty = parseInt(b.qty, 10);
  if (drug.length < 2 || b.qty === undefined) return res.status(400).json({ error: 'Drug and quantity are required.' });
  if (!Number.isInteger(qty) || qty < 0 || qty > 10000000) return res.status(400).json({ error: 'Enter a valid quantity.' });
  const expiry = /^\d{4}-\d{2}-\d{2}$/.test(String(b.expiry || '')) ? b.expiry : new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
  const i = { id: store.id('inv'), facilityId: req.user.facilityId, drug, batch: clean(b.batch, 30) || `B${crypto.randomInt(1000, 10000)}`, expiry, qty, safetyStock: Math.max(0, Math.min(1e6, parseInt(b.safetyStock, 10) || 10)), updatedAt: nowIso() };
  db().inventory.push(i);
  if (!db().drugMaster.includes(drug)) db().drugMaster.push(drug);
  store.save();
  broadcast('pharmacy', 'supply');
  res.json(i);
});

app.post('/api/transfers/request', auth, role('pharmacist'), (req, res) => {
  const d = db();
  const drug = clean(req.body?.drug, 80);
  const qty = parseInt(req.body?.qty ?? 20, 10);
  if (drug.length < 2) return res.status(400).json({ error: 'Choose a medicine.' });
  if (!Number.isInteger(qty) || qty < 1 || qty > 100000) return res.status(400).json({ error: 'Enter a quantity between 1 and 100000.' });
  const fac = d.facilities.find((f) => f.id === req.user.facilityId);
  if (!fac) return res.status(404).json({ error: 'Store not found.' });
  const src = engines.findStock(d, drug, { district: fac.district, state: fac.state }, qty).find((s) => s.facilityId !== fac.id);
  if (!src) return res.status(404).json({ error: `No source with spare stock of ${drug} found nationally.` });
  const t = { id: store.id('tr'), drug: src.drug, qty, fromId: src.facilityId, toId: fac.id, status: 'requested', reason: 'Low stock — requested by pharmacist', createdAt: nowIso() };
  d.transfers.unshift(t);
  // Shortage flag: many open requests for the same drug in a district.
  const open = d.transfers.filter((x) => x.drug === t.drug && ['requested'].includes(x.status)).length;
  if (open >= 3 && !d.alerts.some((a) => a.type === 'shortage' && a.drug === t.drug && a.status === 'open')) {
    d.alerts.unshift({ id: store.id('al'), type: 'shortage', drug: t.drug, district: fac.district, state: fac.state, pincode: fac.pincode, confidence: 0.8, status: 'open', message: `${open} open transfer requests for ${t.drug} — possible regional shortage.`, createdAt: nowIso(), actions: [] });
  }
  store.save();
  broadcast('supply', 'pharmacy', 'gov');
  res.json({ ...t, fromName: src.facility.name, tierName: src.tierName });
});

app.post('/api/transfers/:id/:action', auth, role('pharmacist', 'distributor'), (req, res) => {
  const d = db();
  const t = d.transfers.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Transfer not found.' });
  const { action } = req.params;
  if (t.fromId !== req.user.facilityId && action !== 'receive') return res.status(403).json({ error: 'Only the source facility can act on this.' });
  const FROM = { accept: ['requested'], decline: ['requested', 'accepted'], dispatch: ['accepted'], receive: ['dispatched', 'in_transit', 'delivered'] };
  if (!own(FROM, action)) return res.status(400).json({ error: 'Unknown action.' });
  if (!FROM[action].includes(t.status)) return res.status(409).json({ error: `This transfer is ${t.status} — that step isn't possible.` });
  if (action === 'accept') t.status = 'accepted';
  else if (action === 'decline') t.status = 'declined';
  else if (action === 'dispatch') {
    const inv = d.inventory.find((i) => i.facilityId === t.fromId && i.drug === t.drug);
    if (inv) {
      if (inv.qty - t.qty < (inv.safetyStock || 0)) return res.status(400).json({ error: 'This would take you below safety stock. Reduce the quantity or decline.' });
      inv.qty -= t.qty;
    }
    t.status = 'dispatched';
    const from = d.facilities.find((f) => f.id === t.fromId);
    const to = d.facilities.find((f) => f.id === t.toId);
    const rider = pickRider(d, from?.district);
    t.courierId = rider?.id || null;
    d.deliveries.unshift({ id: store.id('del'), kind: 'transfer', refId: t.id, pickup: facilityName(t.fromId), drop: facilityName(t.toId), courierId: rider?.id || null, status: rider ? 'assigned' : 'unassigned', coldChain: /insulin|vaccine/i.test(t.drug), otp: String(crypto.randomInt(1000, 10000)), items: `${t.drug} ×${t.qty}`, distanceKm: geo.km(geo.pointOf(from), geo.pointOf(to)), createdAt: nowIso() });
    if (rider) notify(rider.id, 'New transfer pickup', `${facilityName(t.fromId)} → ${facilityName(t.toId)}`);
  } else if (action === 'receive') {
    if (t.toId !== req.user.facilityId) return res.status(403).json({ error: 'Only the receiving facility can confirm.' });
    if (t.status === 'delivered') return res.json(t);
    t.status = 'delivered';
    const del = d.deliveries.find((x) => x.kind === 'transfer' && x.refId === t.id);
    if (del) { del.status = 'delivered'; del.deliveredAt = nowIso(); }
    const inv = d.inventory.find((i) => i.facilityId === t.toId && i.drug === t.drug);
    if (inv) inv.qty += t.qty;
    else d.inventory.push({ id: store.id('inv'), facilityId: t.toId, drug: t.drug, batch: 'TRF', expiry: new Date(Date.now() + 300 * 86400000).toISOString().slice(0, 10), qty: t.qty, safetyStock: 10, updatedAt: nowIso() });
  } else return res.status(400).json({ error: 'Unknown action.' });
  t.updatedAt = nowIso();
  store.save();
  broadcast('supply', 'pharmacy', 'dispatch', 'gov');
  res.json(t);
});

app.get('/api/distributor/home', auth, role('distributor'), (req, res) => {
  const d = db();
  const fid = req.user.facilityId;
  const inventory = d.inventory.filter((i) => i.facilityId === fid);
  res.json({
    warehouse: d.facilities.find((f) => f.id === fid),
    inventory,
    transfers: d.transfers.filter((t) => t.fromId === fid).map((t) => ({ ...t, toName: facilityName(t.toId), fromName: facilityName(t.fromId) })),
    forecast: DATA_MODE === 'demo' ? [
      { drug: 'ORS sachet', district: 'Barabanki', next14d: 4200, trend: +38, reason: 'Dengue & heat' },
      { drug: 'Dengue NS1 rapid kit', district: 'Barabanki', next14d: 640, trend: +210, reason: 'Outbreak alert al_1' },
      { drug: 'Paracetamol 500mg', district: 'Barabanki', next14d: 9800, trend: +24, reason: 'Fever cases rising' },
      { drug: 'Budesonide inhaler 200mcg', district: 'Barabanki', next14d: 180, trend: +12, reason: 'Repeat shortage' },
      { drug: 'Metformin 500mg', district: 'Lucknow', next14d: 12000, trend: +2, reason: 'Stable chronic demand' },
    ] : distributorForecast(d, fid),
    regionalShortages: d.alerts.filter((a) => a.type === 'shortage' && a.status === 'open'),
  });
});

// Live warehouses: the next 14 days projected from what chemists actually asked this warehouse for in the
// last 14 (per medicine and destination district); trend = % change vs the 14 days before (null with no
// earlier requests). null when there's nothing to project from.
function distributorForecast(d, fid) {
  const DAY = 86400000;
  const now = Date.now();
  const facs = new Map(d.facilities.map((f) => [f.id, f]));
  const rows = new Map();
  for (const t of d.transfers) {
    if (t.fromId !== fid || t.status === 'declined') continue;
    const age = now - Date.parse(t.createdAt);
    if (!(age >= 0 && age < 28 * DAY)) continue;
    const district = facs.get(t.toId)?.district || '—';
    const key = `${t.drug}|${district}`;
    const r = rows.get(key) || { drug: t.drug, district, last: 0, prev: 0 };
    if (age < 14 * DAY) r.last += Number(t.qty) || 0; else r.prev += Number(t.qty) || 0;
    rows.set(key, r);
  }
  const out = [...rows.values()].filter((r) => r.last > 0)
    .map((r) => ({ drug: r.drug, district: r.district, next14d: r.last, trend: r.prev ? Math.round(((r.last - r.prev) / r.prev) * 100) : null, reason: 'Transfer requests from chemists in the last 14 days' }))
    .sort((a, b) => b.next14d - a.next14d).slice(0, 20);
  return out.length ? out : null;
}

// ---------- dispatch ----------
app.get('/api/dispatch/jobs', auth, role('delivery'), (req, res) => {
  res.json(db().deliveries.filter((x) => x.courierId === req.user.id).map(({ otp, ...job }) => job));
});

app.post('/api/deliveries/:id/status', auth, role('delivery'), (req, res) => {
  const d = db();
  const del = d.deliveries.find((x) => x.id === req.params.id && x.courierId === req.user.id);
  if (!del) return res.status(404).json({ error: 'Job not found.' });
  const { status, otp } = req.body || {};
  const NEXT = { assigned: ['picked'], unassigned: ['picked'], picked: ['in_transit', 'delivered'], in_transit: ['delivered'], dispatched: ['in_transit', 'delivered'] };
  if (!(NEXT[del.status] || []).includes(status)) return res.status(400).json({ error: del.status === 'delivered' ? 'This delivery is already complete.' : 'That step isn\'t possible right now.' });
  if (status === 'delivered') {
    if ((del.otpAttempts || 0) >= 5) return res.status(429).json({ error: 'Too many wrong codes. Call support to complete this delivery.' });
    if (String(otp) !== del.otp) { del.otpAttempts = (del.otpAttempts || 0) + 1; store.save(); return res.status(400).json({ error: 'OTP doesn\'t match. Ask the recipient for the 4-digit code.' }); }
  }
  del.status = status;
  del[`${status}At`] = nowIso();
  if (del.kind === 'med_order') {
    const o = d.medOrders.find((x) => x.id === del.refId);
    const p = o && d.patients.find((x) => x.id === o.patientId);
    if (o && status === 'picked' && o.status === 'packed') { o.status = 'out_for_delivery'; o.out_for_deliveryAt = nowIso(); patientOwnerUserIds(p).forEach((u) => notify(u, `Medicines · ${o.orderNo}`, `On the way with ${req.user.name}. Share code ${o.otp} when it arrives${o.balance ? ` and pay ₹${o.balance}` : ''}.`)); }
    if (o && status === 'delivered') { o.status = 'delivered'; o.deliveredAt = nowIso(); o.balancePaid = o.balance; patientOwnerUserIds(p).forEach((u) => notify(u, 'Delivered ✅', 'Your medicines have been delivered. Get well soon!')); pharmacistsOf(d, o.pharmacyId).forEach((u) => notify(u.id, 'Order delivered', `${o.orderNo} delivered by ${req.user.name}.`)); automation.emit('medicine_order.delivered', { orderId: o.id, orderNo: o.orderNo, patientId: o.patientId, status: 'delivered', pharmacyId: o.pharmacyId, pharmacyName: facilityName(o.pharmacyId), by: 'nexus_rider', collected: o.balance || 0 }, { contact: autoContact(p) }); }
  }
  if (status === 'delivered') {
    if (del.kind === 'med_order') { /* handled above */ } else if (del.kind === 'prescription') {
      const r = d.prescriptions.find((x) => x.id === del.refId);
      if (r) {
        r.status = 'delivered';
        const p = d.patients.find((x) => x.id === r.patientId);
        patientOwnerUserIds(p).forEach((u) => notify(u, 'Delivered ✅', 'Your medicines have been delivered. Get well soon!'));
      }
    } else {
      const t = d.transfers.find((x) => x.id === del.refId);
      if (t && t.status !== 'delivered') {
        t.status = 'delivered';
        const inv = d.inventory.find((i) => i.facilityId === t.toId && i.drug === t.drug);
        if (inv) inv.qty += t.qty;
      }
    }
  }
  store.save();
  broadcast('dispatch', 'prescriptions', 'pharmacy', 'supply');
  const { otp: _code, ...job } = del;
  res.json(job);
});

// ---------- government command center ----------
app.get('/api/gov/overview', auth, role('official'), (req, res) => {
  const d = db();
  const scoped = req.user.scope !== 'national';
  const inScope = (x) => !scoped || x.district === req.user.region.district;
  const hospitals = d.facilities.filter((f) => f.type === 'hospital').filter(inScope);
  const capacity = hospitals.map((h) => {
    const beds = d.beds.filter((b) => b.facilityId === h.id);
    const sum = (t, k) => beds.filter((b) => !t || b.type === t).reduce((s, b) => s + b[k], 0);
    return { id: h.id, name: h.name, district: h.district, state: h.state, totalBeds: sum(null, 'total'), freeBeds: sum(null, 'total') - sum(null, 'occupied'), icuTotal: sum('icu', 'total'), icuFree: sum('icu', 'total') - sum('icu', 'occupied'), oxygenFree: sum('oxygen', 'total') - sum('oxygen', 'occupied') };
  });
  const pharmaciesInScope = new Set(d.facilities.filter((f) => f.type === 'pharmacy' && inScope(f)).map((f) => f.id));
  const stockDays = d.inventory.filter((i) => pharmaciesInScope.has(i.facilityId)).map((i) => ({ drug: i.drug, facility: facilityName(i.facilityId), qty: i.qty, daysLeft: Math.round(i.qty / Math.max(1, i.safetyStock / 7)) })).filter((s) => s.daysLeft < 14).sort((a, b) => a.daysLeft - b.daysLeft);
  res.json({
    scope: scoped ? { level: 'district', district: req.user.region.district, state: req.user.region.state } : { level: 'national' },
    totals: {
      freeBeds: capacity.reduce((s, c) => s + c.freeBeds, 0),
      icuFree: capacity.reduce((s, c) => s + c.icuFree, 0),
      doctorsOnline: DATA_MODE !== 'demo' ? d.doctors.filter((x) => x.verified && availabilityOf(x, { facilities: d.facilities }).available && (!scoped || x.state === req.user.region.state)).length
        : scoped ? d.doctors.filter((x) => x.online && x.state === req.user.region.state).length + 38 : d.regions.reduce((s, r) => s + r.doctorsOnline, 0),
      kiosksOnline: d.facilities.filter((f) => f.type === 'kiosk' && f.status === 'online' && inScope(f)).length + (DATA_MODE !== 'demo' || scoped ? 0 : Math.max(0, d.regions.reduce((s, r) => s + r.kiosks, 0) - 4)),
      consultsToday: DATA_MODE !== 'demo' ? d.consults.filter((c) => istDay(c.createdAt) === istDay(nowIso()) && (!scoped || inScope(d.patients.find((x) => x.id === c.patientId) || {}))).length : scoped ? 412 : 18640,
      openAlerts: d.alerts.filter((a) => a.status === 'open' && inScope(a)).length,
    },
    regions: scoped ? null : d.regions,
    capacity,
    alerts: d.alerts.filter(inScope),
    corridors: d.corridors,
    shortages: stockDays,
    transfersInTransit: d.transfers.filter((t) => ['accepted', 'dispatched'].includes(t.status)).map((t) => ({ ...t, fromName: facilityName(t.fromId), toName: facilityName(t.toId) })),
    outbreakTrend: outbreakTrend(),
    advisories: d.advisories,
  });
});

// Seven-week positives curve: an illustration for the demo network only. A live network gets null
// (the Outbreaks page shows "No outbreak signals yet") instead of invented figures.
const outbreakTrend = () => (DATA_MODE === 'demo'
  ? { labels: ['W-6', 'W-5', 'W-4', 'W-3', 'W-2', 'W-1', 'This wk'], dengue: [9, 11, 10, 14, 19, 28, 41], baseline: [10, 11, 12, 12, 12, 12, 12], ili: [40, 38, 45, 52, 61, 74, 88] }
  : null);

app.post('/api/alerts/:id/:action', auth, role('official'), (req, res) => {
  const d = db();
  const a = d.alerts.find((x) => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'Alert not found.' });
  if (req.user.scope === 'district' && a.district && a.district !== req.user.region?.district) return res.status(403).json({ error: 'This alert is outside your district.' });
  if (req.user.scope === 'state' && a.state && a.state !== req.user.region?.state) return res.status(403).json({ error: 'This alert is outside your state.' });
  const { action } = req.params;
  const map = { confirm: 'confirmed', dismiss: 'dismissed', resolve: 'resolved', acknowledge: 'acknowledged' };
  if (!own(map, action)) return res.status(400).json({ error: 'Unknown action.' });
  a.status = map[action];
  const note = { confirm: 'Confirmed — pharmacies advised, stock pre-positioning started, doctors notified', dismiss: 'Dismissed as false signal', resolve: 'Marked resolved', acknowledge: 'Acknowledged, under review' }[action];
  a.actions = a.actions || [];
  a.actions.push({ at: nowIso(), by: req.user.name, action: clean(req.body?.note, 300) || note });
  if (action === 'confirm' && a.type === 'outbreak') {
    // Flow E step 5: stock advisory + pre-position + clinical heads-up.
    // Only clinicians and chemists in the affected district — not the whole country.
    d.doctors.filter((doc) => doc.district === a.district).forEach((doc) => notify(doc.userId, `Clinical heads-up: ${a.disease}`, `${a.disease} confirmed in ${a.district} (pin ${a.pincode}). Consider testing patients with matching symptoms.`, 'alert'));
    const localPharmacies = d.facilities.filter((f) => f.type === 'pharmacy' && f.verified && f.district === a.district);
    d.users.filter((u) => u.role === 'pharmacist' && localPharmacies.some((f) => f.id === u.facilityId)).forEach((u) => notify(u.id, 'Stock advisory', `${a.disease} confirmed in ${a.district}. Please review stock of related medicines.`, 'alert'));
    const wh = d.facilities.find((f) => f.type === 'warehouse' && f.state === a.state);
    const target = localPharmacies.find((f) => f.generic) || localPharmacies[0];
    if (wh && target && a.disease === 'Dengue') d.transfers.unshift({ id: store.id('tr'), drug: 'Dengue NS1 rapid kit', qty: 150, fromId: wh.id, toId: target.id, status: 'requested', reason: `Pre-positioning for confirmed alert ${a.id}`, createdAt: nowIso() });
  }
  store.save();
  broadcast('alerts', 'gov', 'supply');
  res.json(a);
});

app.post('/api/corridors', auth, role('official'), (req, res) => {
  const b = req.body || {};
  const from = clean(b.from, 80); const to = clean(b.to, 80);
  if (!from || !to) return res.status(400).json({ error: 'Choose both regions.' });
  const c = { id: store.id('cor'), from, to, reason: clean(b.reason, 200) || 'Overflow load balancing', status: 'active', patientsRouted: 0, createdAt: nowIso(), openedBy: req.user.name };
  db().corridors.unshift(c);
  store.save();
  broadcast('gov');
  res.json(c);
});

app.post('/api/corridors/:id/close', auth, role('official'), (req, res) => {
  const c = db().corridors.find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Corridor not found.' });
  c.status = 'closed';
  c.closedAt = nowIso();
  store.save();
  broadcast('gov');
  res.json(c);
});

app.post('/api/advisories', auth, role('official', 'super_admin'), (req, res) => {
  const b = req.body || {};
  const title = clean(b.title, 120); const body = clean(b.body, 2000); const publish = Boolean(b.publish);
  if (!title || !body) return res.status(400).json({ error: 'Title and message are required.' });
  const a = { id: store.id('adv'), title, body, region: clean(b.region, 80) || 'All', languages: b.languages === undefined ? ['Hindi', 'English'] : cleanList(b.languages, 12), status: publish ? 'published' : 'draft', createdAt: nowIso(), by: req.user.name };
  db().advisories.unshift(a);
  if (publish) db().users.filter((u) => u.role === 'patient').forEach((u) => notify(u.id, `Health advisory: ${title}`, body, 'alert'));
  store.save();
  broadcast('gov', 'admin', 'advisories');
  res.json(a);
});

app.put('/api/advisories/:id', auth, role('official', 'super_admin'), (req, res) => {
  const a = db().advisories.find((x) => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'Advisory not found.' });
  const b = req.body || {};
  if (b.title !== undefined && clean(b.title, 120)) a.title = clean(b.title, 120);
  if (b.body !== undefined && clean(b.body, 2000)) a.body = clean(b.body, 2000);
  if (b.languages !== undefined) a.languages = cleanList(b.languages, 12);
  const wasPublished = a.status === 'published';
  if (b.status !== undefined) {
    if (!['draft', 'published', 'archived'].includes(b.status)) return res.status(400).json({ error: 'Status must be draft, published or archived.' });
    a.status = b.status;
  }
  // Patients are told when it goes live — not again every time an already-published advisory is edited.
  if (a.status === 'published' && !wasPublished) { a.publishedAt = nowIso(); db().users.filter((u) => u.role === 'patient').forEach((u) => notify(u.id, `Health advisory: ${a.title}`, a.body, 'alert')); }
  store.save();
  broadcast('gov', 'admin', 'advisories');
  res.json(a);
});

// ---------- super admin ----------
app.get('/api/admin/home', auth, role('super_admin'), (_req, res) => {
  const d = db();
  const kiosks = d.facilities.filter((f) => f.type === 'kiosk');
  res.json({
    counts: {
      users: d.users.length, patients: d.patients.length, doctors: d.doctors.length, facilities: d.facilities.length,
      kiosksOnline: kiosks.filter((k) => k.status === 'online').length, kiosksTotal: kiosks.length,
      pendingVerification: d.doctors.filter((x) => !x.verified).length + d.facilities.filter((f) => !f.verified).length,
      breakGlassUnreviewed: d.audit.filter((a) => a.action === 'break_glass' && !a.reviewed).length,
    },
    // Demo shows illustrative monitoring; a live network shows only what the server actually knows.
    monitoring: DATA_MODE === 'demo'
      ? { uptime: 99.94, apiErrorRate: 0.21, p95LatencyMs: 312, videoQuality: 4.4, activeCalls: d.consults.filter((c) => c.status === 'in_progress').length + 37, uptimeSeries: [99.9, 99.95, 100, 99.8, 99.97, 99.99, 99.94] }
      : { uptime: null, apiErrorRate: null, p95LatencyMs: null, videoQuality: null, activeCalls: d.consults.filter((c) => c.status === 'in_progress').length, uptimeSeries: [], processUptimeHours: Math.round(process.uptime() / 360) / 10 },
  });
});

app.get('/api/admin/onboarding', auth, role('super_admin'), (_req, res) => {
  const d = db();
  res.json({
    doctors: d.doctors.map((x) => ({
      ...x, email: d.users.find((u) => u.id === x.userId)?.email,
      eClinicNames: (x.eClinicIds || []).map((id) => d.facilities.find((f) => f.id === id)?.name).filter(Boolean),
    })),
    facilities: d.facilities,
  });
});

app.post('/api/admin/verify/:kind/:id', auth, role('super_admin'), (req, res) => {
  const d = db();
  const approve = req.body?.approve !== false;
  if (req.params.kind === 'doctor') {
    const doc = d.doctors.find((x) => x.id === req.params.id);
    if (!doc) return res.status(404).json({ error: 'Doctor not found.' });
    if (approve && doc.profileComplete === false) return res.status(400).json({ error: 'This doctor has not completed their profile yet.' });
    // A sign-up that matched a clinic's listing: on approval the account takes over that listing.
    const listing = approve && doc.claimRequest ? d.doctors.find((x) => x.id === doc.claimRequest && !x.userId) : null;
    if (listing) {
      const { id: _drop, claimRequest, facilityId, engagement, ...profile } = doc;
      Object.assign(listing, profile, { invite: null, claimedAt: nowIso() });
      d.doctors.splice(d.doctors.indexOf(doc), 1);
      listing.verified = true;
      listing.verificationNote = `Registration ${listing.regNo} matched with medical council registry · claimed clinic listing`;
      notify(listing.userId, 'You\'re verified — welcome aboard 🎉', `Your account is linked to your listing at ${facilityName(listing.facilityId) || 'your clinic'}.`);
      audit(req.user, 'verified', null, 'doctor', `${listing.id} (claimed by ${doc.id})`);
      store.save();
      broadcast('admin', 'doctors');
      return res.json({ ok: true, merged: listing.id });
    }
    doc.verified = approve;
    const u = d.users.find((x) => x.id === doc.userId);
    // Self-signed-up doctors keep access so they can fix their profile and resubmit.
    if (u) u.status = approve || doc.selfApplied ? 'active' : 'suspended';
    doc.verificationNote = approve ? `Registration ${doc.regNo} matched with medical council registry` : clean(req.body?.note, 300) || 'Rejected';
    if (u) notify(u.id, approve ? 'You\'re verified — welcome aboard 🎉' : 'Application update', approve ? (doc.engagement === 'eclinic_partner' ? 'Your E-Clinic partner account is active. Go online whenever you\'re free to start taking consults.' : 'Your account is active.') : doc.verificationNote);
  } else {
    const f = d.facilities.find((x) => x.id === req.params.id);
    if (!f) return res.status(404).json({ error: 'Facility not found.' });
    if (approve && f.type === 'pharmacy' && f.profileComplete === false) return res.status(400).json({ error: 'This store hasn\'t completed its profile (location, store photo, licence) yet.' });
    f.verified = approve;
    f.verificationNote = approve ? 'Licence and details checked' : clean(req.body?.note, 300) || 'Rejected';
    // Doctors the clinic / hospital listed (without their own account yet) go live with it.
    if (!approve) d.doctors.filter((x) => x.facilityId === f.id && !x.userId && x.listedBy).forEach((x) => { x.verified = false; });
    if (f.ownerDoctorId) { const owner = d.doctors.find((x) => x.id === f.ownerDoctorId); if (owner?.userId) notify(owner.userId, approve ? `${f.name} is verified 🎉` : 'Clinic application update',       approve ? 'Your clinic is verified. Each listed doctor goes live once our team checks their registration.' : f.verificationNote); }
    // Self-applied facilities come with an owner account that unlocks only once the facility is verified.
    d.users.filter((x) => x.facilityId === f.id && x.applicationRef && x.status !== 'suspended').forEach((x) => {
      x.status = approve ? 'active' : 'pending';
      notify(x.id, approve ? `${f.name} is live on Nexus Healthcare 🎉` : 'Application update', approve ? 'Your facility is verified and visible to the network. Sign in to set it up.' : f.verificationNote);
    });
  }
  audit(req.user, approve ? 'verified' : 'rejected', null, req.params.kind, req.params.id);
  store.save();
  broadcast('admin', 'doctors');
  res.json({ ok: true });
});

app.get('/api/admin/users', auth, role('super_admin'), (_req, res) => res.json(db().users.map(publicUser)));

app.post('/api/admin/users', auth, role('super_admin'), async (req, res) => {
  const { role: r, facilityId, scope, district, state, password } = req.body || {};
  const name = clean(req.body?.name, 80); const email = clean(req.body?.email, 160).toLowerCase(); const phone = clean(req.body?.phone, 20);
  if (!name || !email || !r) return res.status(400).json({ error: 'Name, email and role are required.' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  const ROLES = ['patient', 'caregiver', 'kiosk_operator', 'doctor', 'hospital_admin', 'lab_tech', 'pharmacist', 'distributor', 'delivery', 'official', 'super_admin'];
  if (!ROLES.includes(r)) return res.status(400).json({ error: 'Unknown role.' });
  if (findUserByEmail(email)) return res.status(409).json({ error: 'Email already in use.' });
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) return res.status(400).json({ error: 'Set a password of at least 8 characters for the new user.' });
  if (['pharmacist', 'kiosk_operator', 'lab_tech', 'hospital_admin', 'distributor'].includes(r) && !db().facilities.some((f) => f.id === facilityId)) return res.status(400).json({ error: 'Choose the facility this person works at.' });
  const u = { id: store.id('u'), name, email, phone, role: r, facilityId: clean(facilityId, 60) || undefined, scope: ['national', 'state', 'district'].includes(scope) ? scope : undefined, status: 'active', region: { district: clean(district), state: clean(state) }, passwordHash: await bcrypt.hash(password, 10), createdAt: nowIso() };
  db().users.push(u);
  audit(req.user, 'created_user', null, 'user', `${name} (${r})`);
  store.save();
  res.json(publicUser(u));
});

app.put('/api/admin/users/:id/status', auth, role('super_admin'), (req, res) => {
  const u = db().users.find((x) => x.id === req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found.' });
  if (u.id === req.user.id) return res.status(400).json({ error: 'You can\'t suspend your own account.' });
  const status = req.body?.status;
  if (!['active', 'suspended', 'pending'].includes(status)) return res.status(400).json({ error: 'Status must be active, suspended or pending.' });
  u.status = status;
  if (status === 'suspended') u.tokenVersion = (u.tokenVersion || 0) + 1; // ends their open sessions on every device
  audit(req.user, `user_${status}`, null, 'user', u.name);
  store.save();
  res.json(publicUser(u));
});

app.get('/api/admin/ai-config', auth, role('super_admin'), (_req, res) => res.json(db().aiConfig));

app.put('/api/admin/ai-config', auth, role('super_admin'), (req, res) => {
  const c = db().aiConfig;
  const { triage, routing, outbreak, note } = req.body || {};
  c.history.push({ version: c.version, at: nowIso(), by: req.user.name, note: `Snapshot before v${c.version + 1}`, snapshot: { triage: c.triage, routing: c.routing, outbreak: c.outbreak }, hidden: true });
  if (triage) c.triage = { ...c.triage, ...triage };
  if (routing) c.routing = { ...c.routing, ...routing };
  if (outbreak) c.outbreak = { ...c.outbreak, ...outbreak };
  c.version += 1;
  c.history.push({ version: c.version, at: nowIso(), by: req.user.name, note: note || 'Updated configuration', snapshot: { triage: c.triage, routing: c.routing, outbreak: c.outbreak } });
  audit(req.user, 'ai_config_changed', null, 'config', `v${c.version}`);
  store.save();
  res.json(c);
});

app.post('/api/admin/ai-config/rollback/:version', auth, role('super_admin'), (req, res) => {
  const c = db().aiConfig;
  const v = Number(req.params.version);
  const snap = [...c.history].reverse().find((h) => h.version === v && h.snapshot);
  if (!snap) return res.status(404).json({ error: 'No snapshot for that version (seeded versions have notes only).' });
  Object.assign(c, snap.snapshot);
  c.version += 1;
  c.history.push({ version: c.version, at: nowIso(), by: req.user.name, note: `Rolled back to v${v}`, snapshot: snap.snapshot });
  audit(req.user, 'ai_config_rollback', null, 'config', `v${v}`);
  store.save();
  res.json(c);
});

app.get('/api/admin/kiosks', auth, role('super_admin'), (_req, res) => res.json(db().facilities.filter((f) => f.type === 'kiosk')));

// Add a Nexus-owned E-Clinic (or any facility) directly — needed to stand up a fresh live network.
app.post('/api/admin/facilities', auth, role('super_admin'), (req, res) => {
  const d = db();
  const b = req.body || {};
  const type = ['kiosk', 'hospital', 'lab', 'pharmacy'].includes(b.type) ? b.type : 'kiosk';
  const name = clean(b.name, 120);
  if (name.length < 3) return res.status(400).json({ error: 'Please enter a name.' });
  if (!clean(b.district) || !clean(b.state)) return res.status(400).json({ error: 'Please add the district and state.' });
  const lat = Number(b.lat); const lng = Number(b.lng);
  const f = {
    id: store.id(type === 'kiosk' ? 'fac_k' : 'fac'), type, name: type === 'kiosk' && !/^E-Clinic/i.test(name) ? `E-Clinic · ${name}` : name, verified: true,
    district: clean(b.district), state: clean(b.state), pincode: clean(b.pincode, 12), address: clean(b.address, 240), phone: clean(b.phone, 20),
    ...(geo.validCoord(lat, lng) && b.lat != null ? { lat, lng } : {}),
    ...(type === 'kiosk' ? { status: 'offline', uptime: 100, version: '1.4.2', visitsToday: 0, devices: { bp: 'ok', spo2: 'ok', thermometer: 'ok', scale: 'ok', glucometer: 'ok', printer: 'ok', camera: 'ok' } } : {}),
    createdAt: nowIso(),
  };
  d.facilities.push(f);
  audit(req.user, 'created_facility', null, type, f.name);
  store.save();
  broadcast('kiosks', 'admin');
  res.json(f);
});

app.post('/api/admin/kiosks/:id/:action', auth, role('super_admin'), (req, res) => {
  const k = db().facilities.find((f) => f.id === req.params.id && f.type === 'kiosk');
  if (!k) return res.status(404).json({ error: 'Kiosk not found.' });
  if (req.params.action === 'update') k.version = '1.4.3';
  else if (req.params.action === 'restart') { k.status = 'online'; k.devices = Object.fromEntries(Object.keys(k.devices || {}).map((x) => [x, 'ok'])); }
  else return res.status(400).json({ error: 'Unknown action.' });
  store.save();
  broadcast('kiosks', 'admin');
  res.json(k);
});

app.get('/api/admin/audit', auth, role('super_admin'), (req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  const action = req.query.action;
  res.json(db().audit.filter((a) => (!action || a.action === action) && (!q || JSON.stringify(a).toLowerCase().includes(q))).slice(0, 200));
});

app.post('/api/admin/audit/:id/review', auth, role('super_admin'), (req, res) => {
  const a = db().audit.find((x) => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'Entry not found.' });
  a.reviewed = true;
  a.reviewNote = clean(req.body?.note, 300) || 'Reviewed — justified';
  a.reviewedBy = req.user.name;
  store.save();
  res.json(a);
});

app.get('/api/admin/content', auth, role('super_admin'), (_req, res) => res.json({ translations: db().translations, advisories: db().advisories }));

app.put('/api/admin/translations/:key', auth, role('super_admin'), (req, res) => {
  const key = clean(req.params.key, 80);
  // Language → text only (strings, bounded); never arbitrary keys like __proto__ or the record's own key.
  const patch = Object.fromEntries(Object.entries(req.body && typeof req.body === 'object' ? req.body : {})
    .filter(([k, v]) => k !== 'key' && /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(k) && typeof v === 'string').map(([k, v]) => [k, v.slice(0, 2000)]));
  if (!key || !Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to save.' });
  const t = db().translations.find((x) => x.key === key);
  if (t) Object.assign(t, patch);
  else db().translations.push({ key, ...patch });
  store.save();
  res.json(db().translations);
});

// ---------- ★ innovative features (spec §11) ----------

// 1 ★ Swasthya Twin — personal health digital twin.
app.get('/api/patient/twin', auth, role('patient', 'caregiver'), (req, res) => {
  const p = activePatient(req);
  if (!p) return res.status(404).json({ error: 'No profile found.' });
  res.json(innovations.twin(db(), p));
});

// 4 ★ Consent Wallet + Data Dividend.
app.get('/api/patient/wallet', auth, role('patient', 'caregiver'), (req, res) => {
  const p = activePatient(req);
  const w = innovations.walletFor(db(), p);
  store.save();
  res.json({ credits: w.credits, donations: w.donations, ledger: [...w.ledger].reverse(), verified: innovations.verifyLedger(w), studies: innovations.STUDIES, rewards: innovations.REWARDS });
});

app.post('/api/patient/wallet/donate', auth, role('patient', 'caregiver'), (req, res) => {
  const p = activePatient(req);
  const w = innovations.walletFor(db(), p);
  const study = innovations.STUDIES.find((s) => s.id === req.body?.studyId);
  if (!study) return res.status(404).json({ error: 'Study not found.' });
  if (w.donations.includes(study.id)) return res.status(409).json({ error: 'You have already joined this study.' });
  w.donations.push(study.id);
  innovations.addLedger(w, 'donation', study.credits, `Joined research: ${study.title}`);
  audit(req.user, 'data_donation', p.id, 'consent', study.title);
  store.save();
  res.json({ credits: w.credits, donations: w.donations, ledger: [...w.ledger].reverse() });
});

app.post('/api/patient/wallet/redeem', auth, role('patient', 'caregiver'), (req, res) => {
  const p = activePatient(req);
  const w = innovations.walletFor(db(), p);
  const reward = innovations.REWARDS.find((r) => r.id === req.body?.rewardId);
  if (!reward) return res.status(404).json({ error: 'Reward not found.' });
  if (w.credits < reward.cost) return res.status(400).json({ error: 'Not enough health credits yet.' });
  innovations.addLedger(w, 'redeem', -reward.cost, `Redeemed: ${reward.title}`);
  const code = `OC-RW-${Math.floor(1000 + Math.random() * 8999)}`;
  notify(req.user.id, 'Reward unlocked 🎁', `${reward.title}. Show code ${code} at any Nexus Healthcare kiosk or pharmacy.`);
  store.save();
  res.json({ credits: w.credits, ledger: [...w.ledger].reverse(), voucher: { title: reward.title, code } });
});

// 2 ★ Offline Emergency Capsule.
app.get('/api/patient/capsule', auth, role('patient', 'caregiver'), (req, res) => {
  const p = activePatient(req);
  const cap = innovations.buildCapsule(p);
  const opens = db().audit.filter((a) => a.action === 'capsule_open' && a.patientId === p.id).slice(0, 10);
  res.json({ ...cap, opens });
});

// A verified doctor opens a scanned capsule with its key (emergency, offline-capable). Logged.
app.post('/api/capsule/open', auth, role('doctor', 'hospital_admin'), (req, res) => {
  const { capsuleId, key, blob } = req.body || {};
  const p = db().patients.find((x) => x.id === capsuleId);
  if (!p) return res.status(404).json({ error: 'No patient for that capsule.' });
  const data = innovations.openCapsule(p, blob || innovations.buildCapsule(p).blob, String(key || '').toUpperCase());
  if (!data) return res.status(403).json({ error: 'Capsule key invalid or expired. Ask the patient to show a fresh QR.' });
  db().audit.unshift({ id: store.id('aud'), actorId: req.user.id, actorName: req.user.name, role: req.user.role, action: 'capsule_open', patientId: p.id, recordType: 'critical', reason: req.body?.reason || 'Emergency capsule opened', at: nowIso(), reviewed: false });
  patientOwnerUserIds(p).forEach((u) => notify(u, '🔓 Emergency capsule opened', `${req.user.name} opened your offline emergency capsule. This is logged for your review.`, 'alert'));
  store.save();
  broadcast('audit', 'admin');
  res.json({ patient: data });
});

// 12 ★ Health Weather Forecast (officials).
app.get('/api/gov/forecast', auth, role('official'), (req, res) => {
  const scopeDistrict = req.user.scope !== 'national' ? req.user.region.district : null;
  res.json({ scope: scopeDistrict || 'national', generatedAt: nowIso(), forecasts: innovations.forecast(db(), { scopeDistrict }) });
});

// 8 ★ Kiosk Diagnostic Suite.
app.get('/api/kiosk/screenings', auth, role('kiosk_operator'), (_req, res) => res.json(innovations.SCREENINGS));
app.post('/api/kiosk/screening', auth, role('kiosk_operator'), (req, res) => {
  const { key, patientId } = req.body || {};
  if (!innovations.SCREENINGS.some((s) => s.key === key)) return res.status(400).json({ error: 'Unknown screening.' });
  const p = db().patients.find((x) => x.id === patientId);
  const result = innovations.runScreening(key, p);
  if (!result) return res.status(400).json({ error: 'Could not run that screening.' });
  res.json(result);
});

// 14 ★ Claims-ready records.
// A hospital sees claims only for visits with its own doctors or at its own premises.
const consultAtFacility = (c, fid) => Boolean(fid) && (c.location?.facilityId === fid || db().doctors.find((x) => x.id === c.doctorId)?.facilityId === fid);
app.get('/api/consults/:id/claim', auth, role('hospital_admin', 'doctor', 'super_admin'), (req, res) => {
  const c = db().consults.find((x) => x.id === req.params.id);
  if (!c || c.status !== 'completed') return res.status(404).json({ error: 'No completed visit for that id.' });
  if (req.user.role === 'doctor' && doctorFor(req.user)?.id !== c.doctorId) return res.status(403).json({ error: 'Not your consult.' });
  if (req.user.role === 'hospital_admin' && !consultAtFacility(c, req.user.facilityId)) return res.status(403).json({ error: 'This visit wasn\'t at your hospital.' });
  res.json(innovations.buildClaim(db(), c));
});
app.get('/api/hospital/claims', auth, role('hospital_admin', 'super_admin'), (req, res) => {
  const completed = db().consults.filter((c) => c.status === 'completed' && (req.user.role === 'super_admin' || consultAtFacility(c, req.user.facilityId))).slice(-20).reverse();
  res.json(completed.map((c) => innovations.buildClaim(db(), c)));
});

// 5 Family Health Graph.
app.get('/api/patient/family-graph', auth, role('patient', 'caregiver'), (req, res) => {
  const members = profilesFor(req.user).map((p) => ({ id: p.id, name: p.name, relation: p.relation, self: p.userId === req.user.id, age: ageOf(p.dob), conditions: p.conditions }));
  res.json(innovations.familyGraph(db(), req.user.id, members));
});

// 11 Outcome-verified doctor score.
app.get('/api/doctor/score', auth, role('doctor'), (req, res) => res.json(innovations.doctorScore(db(), doctorFor(req.user))));

// 6 Medicine Authenticity Scan.
app.post('/api/medicine/scan', auth, (req, res) => res.json(innovations.authenticityScan(db(), req.body?.code)));

// 13 Federated Learning network (admin).
app.get('/api/admin/federated', auth, role('super_admin'), (_req, res) => res.json(innovations.federatedStatus(db())));

// 9 AI ambient scribe (doctor).
app.post('/api/consults/:id/scribe', auth, role('doctor'), (req, res) => {
  const c = db().consults.find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Consult not found.' });
  if (doctorFor(req.user)?.id !== c.doctorId) return res.status(403).json({ error: 'Not your consult.' });
  res.json(innovations.scribeDraft(db(), c));
});

// ---------- static client (production) ----------
const dist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, {
    index: false,
    setHeaders(res, file) {
      // Vite fingerprints /assets/* — cache forever. The shell, manifest and service worker must always revalidate.
      if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      else res.setHeader('Cache-Control', 'no-cache');
      if (file.endsWith('sw.js')) res.setHeader('Service-Worker-Allowed', '/');
    },
  }));
  app.get(/^\/(?!api).*/, (_req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.sendFile(path.join(dist, 'index.html')); });
}
// Unknown API routes get a JSON 404 (not the HTML shell).
// ---- n8n automations: a narrow API for workflows, guarded by N8N_API_KEY (see automation.js) ----
const automationLimiter = security.rateLimit({ windowMs: 60000, max: 120, key: () => 'automation', message: 'Too many automation calls — slow the workflow down.' });
const autoApi = [automationLimiter, automation.apiAuth];
const istWhen = (iso) => new Date(iso).toLocaleString('en-IN', { timeZone: APP_TZ, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

app.get('/api/automation/ping', autoApi, (_req, res) => res.json({ ok: true, mode: DATA_MODE, time: nowIso(), timezone: APP_TZ, shareContact: automation.shareContact(), events: Object.keys(automation.EVENTS) }));

// One day's numbers for a daily report. ?date=YYYY-MM-DD | today (default: yesterday, in APP_TZ).
app.get('/api/automation/summary', autoApi, (req, res) => {
  const d = db();
  const q = String(req.query.date || '');
  const day = /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : istDay(Date.now() - (q === 'today' ? 0 : 86400000));
  const on = (iso) => Boolean(iso) && istDay(iso) === day;
  const paid = d.payments.filter((x) => x.status === 'paid' && on(x.paidAt));
  const byPurpose = {};
  for (const x of paid) byPurpose[x.purpose] = (byPurpose[x.purpose] || 0) + (Number(x.amount) || 0);
  const reported = d.labOrders.filter((o) => on(o.reportedAt));
  res.json({
    date: day, timezone: APP_TZ, mode: DATA_MODE,
    patients: { new: d.patients.filter((x) => on(x.createdAt)).length, total: d.patients.length },
    consults: { booked: d.consults.filter((c) => !c.followUp && on(c.paidAt)).length, completed: d.consults.filter((c) => c.status === 'completed' && on(c.completedAt)).length, followUpsBooked: d.consults.filter((c) => c.followUp && on(c.createdAt)).length },
    prescriptions: d.prescriptions.filter((r) => on(r.createdAt)).length,
    labs: { advised: d.labOrders.filter((o) => on(o.createdAt)).length, booked: d.labOrders.filter((o) => on(o.booking?.paidAt)).length, reported: reported.length, critical: reported.filter((o) => o.critical).length },
    medicineOrders: { placed: d.medOrders.filter((o) => on(o.createdAt)).length, delivered: d.medOrders.filter((o) => on(o.deliveredAt) || on(o.collectedAt)).length, declined: d.medOrders.filter((o) => on(o.declinedAt)).length, cancelled: d.medOrders.filter((o) => on(o.cancelledAt)).length },
    payments: { count: paid.length, amount: paid.reduce((t, x) => t + (Number(x.amount) || 0), 0), byPurpose },
    refundsPending: d.payments.filter((x) => x.status === 'refund_pending').length,
    awaitingVerification: { doctors: d.doctors.filter((x) => !x.verified).length, facilities: d.facilities.filter((f) => f.verified === false).length },
  });
});

// Appointments and lab slots coming up — for reminder workflows. ?hours=24 (1–168) &include=all
app.get('/api/automation/upcoming', autoApi, (req, res) => {
  const d = db();
  const hours = Math.min(168, Math.max(1, Number(req.query.hours) || 24));
  const from = Date.now(); const to = from + hours * 3600000;
  const all = req.query.include === 'all';
  const inWindow = (iso) => { const t = Date.parse(iso); return t >= from && t <= to; };
  const patientOf = (id) => d.patients.find((x) => x.id === id);
  const consults = d.consults.filter((c) => c.status === 'scheduled' && c.scheduledAt && inWindow(c.scheduledAt) && (all || !c.reminderSentAt)).map((c) => ({
    kind: 'consult', id: c.id, patientId: c.patientId, doctorName: d.doctors.find((x) => x.id === c.doctorId)?.name || null, mode: c.mode,
    location: c.location?.name || null, address: c.location?.address || null, followUp: Boolean(c.followUp), scheduledAt: c.scheduledAt, when: istWhen(c.scheduledAt),
    reminderSentAt: c.reminderSentAt || null, contact: autoContact(patientOf(c.patientId)),
  }));
  const labs = d.labOrders.filter((o) => o.status === 'ordered' && o.booking?.paidAt && o.booking.slot && inWindow(o.booking.slot) && (all || !o.reminderSentAt)).map((o) => ({
    kind: 'lab', id: o.id, patientId: o.patientId, labName: facilityName(o.labId), homeCollection: Boolean(o.booking.homeCollection), balance: o.booking.balance,
    fastingNeeded: o.tests.some((t) => /fasting/i.test(testInfo(t).prep || '') && !/no fasting/i.test(testInfo(t).prep || '')),
    scheduledAt: o.booking.slot, when: istWhen(o.booking.slot), reminderSentAt: o.reminderSentAt || null, contact: autoContact(patientOf(o.patientId)),
  }));
  const items = [...consults, ...labs].sort((a, b) => (a.scheduledAt < b.scheduledAt ? -1 : 1));
  res.json({ hours, mode: DATA_MODE, count: items.length, contactShared: automation.shareContact(), items });
});

// Mark a reminder as sent so the next run doesn't send it again. Body: { kind: 'consult'|'lab', id, channel? }
app.post('/api/automation/reminded', autoApi, (req, res) => {
  const d = db();
  const { kind, id } = req.body || {};
  const item = kind === 'lab' ? d.labOrders.find((o) => o.id === id) : kind === 'consult' ? d.consults.find((c) => c.id === id) : null;
  if (!item) return res.status(404).json({ error: 'Not found.' });
  item.reminderSentAt = nowIso();
  item.reminderChannel = clean(req.body?.channel, 30) || null;
  store.save();
  res.json({ ok: true, id, reminderSentAt: item.reminderSentAt });
});

// Verified chemists running low on stock (and stock expiring within 30 days).
app.get('/api/automation/low-stock', autoApi, (_req, res) => {
  const d = db();
  const soon = Date.now() + 30 * 86400000;
  const stores = d.facilities.filter((f) => f.type === 'pharmacy' && f.verified !== false).map((f) => {
    const inv = d.inventory.filter((i) => i.facilityId === f.id);
    return {
      facilityId: f.id, name: f.name, district: f.district || null, phone: f.phone || null,
      low: inv.filter((i) => i.qty <= i.safetyStock).map((i) => ({ drug: i.drug, qty: i.qty, safetyStock: i.safetyStock })),
      expiringSoon: inv.filter((i) => i.expiry && Date.parse(i.expiry) <= soon).map((i) => ({ drug: i.drug, qty: i.qty, expiry: i.expiry, batch: i.batch })),
    };
  }).filter((x) => x.low.length || x.expiringSoon.length);
  res.json({ mode: DATA_MODE, count: stores.length, stores });
});

// Post an in-app notification (e.g. after sending a WhatsApp reminder). Body: { patientId | userId, title, body }
app.post('/api/automation/notify', autoApi, (req, res) => {
  const d = db();
  const b = req.body || {};
  const title = clean(b.title, 80); const text = clean(b.body, 300);
  if (!title || !text) return res.status(400).json({ error: 'title and body are required.' });
  const p = b.patientId ? d.patients.find((x) => x.id === b.patientId) : null;
  const ids = p ? patientOwnerUserIds(p) : b.userId && d.users.some((u) => u.id === b.userId) ? [b.userId] : [];
  if (!ids.length) return res.status(404).json({ error: 'No such patient or user.' });
  ids.forEach((u) => notify(u, title, text, 'automation'));
  audit(req.user, 'automation_notice', p?.id || null, 'notification', title);
  store.save();
  broadcast('notifications');
  res.json({ ok: true, delivered: ids.length });
});

app.get('/api/admin/automation', auth, role('super_admin'), (_req, res) => res.json(automation.status()));
app.post('/api/admin/automation/test', auth, role('super_admin'), async (req, res) => {
  const r = await automation.sendTest(req.user.name);
  audit(req.user, 'automation_test', null, 'automation', r.ok ? 'test event delivered' : `test failed: ${r.error}`);
  res.status(r.ok ? 200 : 502).json(r);
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

app.use((err, _req, res, _next) => {
  if (err?.expose && err.status) return res.status(err.status).json({ error: err.message });
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'That file is too big. Please keep uploads under 10 MB.' });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
});

// Unpaid bookings and delivery orders hold nothing for ever: they expire after 30 minutes.
function expireUnpaid() {
  const d = db();
  const cutoff = Date.now() - 30 * 60000;
  let changed = false;
  for (const c of d.consults) {
    if (c.status === 'awaiting_payment' && Date.parse(c.createdAt) < cutoff) { c.status = 'expired'; changed = true; }
  }
  for (const o of d.medOrders || []) {
    if (o.status === 'awaiting_payment' && Date.parse(o.createdAt) < cutoff) { o.status = 'cancelled'; o.cancelledAt = nowIso(); o.cancelReason = 'Advance not paid in time'; changed = true; }
  }
  for (const p of d.payments) {
    if (p.status === 'created' && Date.parse(p.createdAt) < cutoff) { p.status = 'void'; changed = true; }
  }
  if (changed) store.save();
}

// Notifications only ever grow (every patient gets each advisory). Screens show the latest 30, so once the
// list is large, entries older than 180 days are dropped — newest-first order means they sit at the end.
const NOTIFICATION_KEEP = 5000;
const NOTIFICATION_DAYS = 180;
function pruneNotifications() {
  const list = db().notifications;
  if (list.length <= NOTIFICATION_KEEP) return;
  const cutoff = new Date(Date.now() - NOTIFICATION_DAYS * 86400000).toISOString();
  let keep = list.length;
  while (keep > NOTIFICATION_KEEP && (list[keep - 1].at || '') < cutoff) keep -= 1;
  if (keep === list.length) return;
  list.length = keep;
  notifCounts.list = null; // per-user counts are rebuilt on the next notify()
  store.save();
}

(async () => {
  await store.init();
  automation.init({ dataMode: DATA_MODE });
  expireUnpaid();
  expireConsents();
  setInterval(() => { expireUnpaid(); expireConsents(); }, 5 * 60000).unref();
  pruneNotifications();
  setInterval(pruneNotifications, 6 * 3600000).unref();
  await i18n.init({ broadcast });
  const server = app.listen(PORT, () => {
    const o = otp.publicConfig();
    console.log(`Nexus Healthcare API on http://localhost:${PORT}`);
    console.log(`  database: ${store.adapter().kind} · OTP: ${o.provider}${o.devMode ? ' (dev mode — codes shown on screen)' : ''}${o.emailLive ? ' + email' : ''} · Claude chat: ${aiEnabled() ? 'on' : 'offline fallback'}`);
  });
  const shutdown = async () => {
    server.close();
    await store.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
})().catch((e) => {
  console.error('Failed to start:', e);
  process.exit(1);
});
