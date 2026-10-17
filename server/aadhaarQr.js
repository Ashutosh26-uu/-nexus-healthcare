// UIDAI Aadhaar Secure QR — offline verification (no UIDAI API call, no Aadhaar number handled).
//
// The QR on an Aadhaar letter / e-Aadhaar / mAadhaar holds a base-10 integer. As bytes (big-endian) it is a
// GZIP stream; inflated, the fields are separated by byte 255 and the LAST 256 bytes are UIDAI's RSA-2048
// SHA256withRSA signature over everything before them. We verify that signature with UIDAI's published
// offline-verification certificates (server/certs, see README there) and read only what we keep:
// last 4 digits, year of birth, gender, and the card name (only to compare it — never stored).
//
// Layout (UIDAI "Secure QR code" user manual, 2019; V2 added in 2022):
//   [V2]  version | email_mobile_indicator | reference_id | name | dob | gender | care_of | district | landmark |
//         house | location | pincode | post_office | state | street | sub_district | vtc | last4_mobile | photo… |
//         [email_sha256(32)] [mobile_sha256(32)] | signature(256)
//   [old] same without `version` and `last4_mobile`.
// reference_id = last 4 Aadhaar digits + generation timestamp. The photo (JPEG 2000) can contain byte 255, so only
// the leading text fields are split on 255 — the signature check covers the whole payload regardless.
const crypto = require('crypto');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const MAX_DIGITS = 10000; // a version-40 QR holds 7089 digits at most
const MAX_INFLATED = 64 * 1024; // real payloads are a few KB (photo included); anything bigger is not a card
const SIG_LEN = 256;
const isProd = () => process.env.NODE_ENV === 'production';

// UIDAI certificates for Secure QR / offline e-KYC signatures. Expired ones stay: a card printed in 2019
// still carries the QR signed then, and the signature proves UIDAI made it — expiry doesn't undo that.
const CERT_DIR = path.join(__dirname, 'certs');
const UIDAI_KEYS = fs.existsSync(CERT_DIR) ? fs.readdirSync(CERT_DIR).filter((f) => f.endsWith('.cer')).sort().flatMap((f) => {
  try { return [{ id: f, key: new crypto.X509Certificate(fs.readFileSync(path.join(CERT_DIR, f))).publicKey }]; } catch { return []; }
}) : [];
if (!UIDAI_KEYS.length) console.warn('[aadhaar-qr] No UIDAI certificates found in server/certs — Secure QR verification will reject every card.');

// Tests can't use a real Aadhaar. Outside production only, AADHAAR_TEST_PUBKEY (a PEM, or a path to one) adds a
// throwaway key. isProd() is checked again at every verify, so a production process can never accept it.
function testKey() {
  const v = process.env.AADHAAR_TEST_PUBKEY;
  if (isProd() || !v) return null;
  try { return crypto.createPublicKey(v.includes('BEGIN') ? v : fs.readFileSync(v)); } catch { return null; }
}
const TEST_KEY = testKey();
if (TEST_KEY) console.warn('[aadhaar-qr] AADHAAR_TEST_PUBKEY is set — a TEST key is accepted for Aadhaar QR (development only).');

const MESSAGES = {
  empty: 'Please scan or upload the QR on the Aadhaar card.',
  too_long: 'That doesn\'t look like an Aadhaar Secure QR.',
  legacy_xml: 'This is an older Aadhaar QR that can\'t be verified. Download a new e-Aadhaar from myaadhaar.uidai.gov.in and scan its QR.',
  not_digits: 'That doesn\'t look like an Aadhaar Secure QR. Scan the big QR on the Aadhaar card or e-Aadhaar.',
  bad_payload: 'We couldn\'t read that QR as an Aadhaar Secure QR. Try a clearer photo of the whole QR.',
  bad_fields: 'This Aadhaar QR format isn\'t supported yet. Download a new e-Aadhaar from myaadhaar.uidai.gov.in and scan its QR.',
  bad_signature: 'This QR is not signed by UIDAI — it may be damaged, edited, or not a real Aadhaar QR.',
};

// Old (pre-2019) Aadhaar QRs are plain, unsigned XML: <PrintLetterBarcodeData uid="…" name="…"/>.
const looksLikeXml = (s) => /^\s*(<\?xml|<PrintLetterBarcodeData|<QPDB|<)/i.test(s) || /PrintLetterBarcodeData/i.test(s);

function inflate(buf) {
  const opts = { maxOutputLength: MAX_INFLATED };
  try { return zlib.gunzipSync(buf, opts); } catch { /* not gzip — try plain zlib */ }
  try { return zlib.inflateSync(buf, opts); } catch { return null; }
}

const GENDERS = { M: 'Male', F: 'Female', T: 'Other' };
const latin1 = (b) => Buffer.from(b).toString('latin1').trim();
const utf8 = (b) => Buffer.from(b).toString('utf8').trim(); // names in Indian scripts are UTF-8; latin1 for ASCII-only fields is equivalent

// Bytes → fields. Returns null when the layout isn't the Secure QR one we know.
function parseBytes(data) {
  if (data.length <= SIG_LEN + 20) return null;
  const signedBytes = data.subarray(0, data.length - SIG_LEN);
  const signature = data.subarray(data.length - SIG_LEN);
  const head = latin1(signedBytes.subarray(0, 4));
  const versioned = /^V\d/.test(head);
  const fieldCount = versioned ? 18 : 16;
  const parts = [];
  let start = 0;
  for (let i = 0; i < signedBytes.length && parts.length < fieldCount; i++) {
    if (signedBytes[i] === 255) { parts.push(signedBytes.subarray(start, i)); start = i + 1; }
  }
  if (parts.length < fieldCount) return null;
  const off = versioned ? 1 : 0;
  const version = versioned ? latin1(parts[0]) : 'V1';
  const indicator = latin1(parts[off]);
  const refId = latin1(parts[off + 1]);
  const name = utf8(parts[off + 2]);
  const dob = latin1(parts[off + 3]);
  const g = latin1(parts[off + 4]).toUpperCase();
  // Sanity checks: a wrong guess about the layout must fail closed, never store a wrong year or gender.
  if (!/^[0-3]$/.test(indicator) || !/^\d{4}\d{8,}$/.test(refId) || !GENDERS[g] || !name || name.length > 120) return null;
  const y = (dob.match(/(?:^|\D)((?:19|20)\d{2})$/) || dob.match(/^((?:19|20)\d{2})(?:\D|$)/) || [])[1];
  const yob = y ? Number(y) : null;
  if (!yob || yob > new Date().getFullYear()) return null;
  return {
    version, last4: refId.slice(0, 4), referenceTs: refId.slice(4), name, yob, gender: GENDERS[g],
    state: utf8(parts[off + 12]), district: utf8(parts[off + 6]), signedBytes, signature,
  };
}

// Text from the scanner → { ok, reason, fields }. Never throws.
function parseSecureQr(text) {
  try {
    if (typeof text !== 'string' || !text.trim()) return { ok: false, reason: 'empty' };
    if (text.length > MAX_DIGITS) return { ok: false, reason: 'too_long' };
    const s = text.trim();
    if (looksLikeXml(s)) return { ok: false, reason: 'legacy_xml' };
    if (!/^\d+$/.test(s)) return { ok: false, reason: 'not_digits' };
    let hex = BigInt(s).toString(16);
    if (hex.length % 2) hex = `0${hex}`;
    const data = inflate(Buffer.from(hex, 'hex'));
    if (!data) return { ok: false, reason: 'bad_payload' };
    const fields = parseBytes(data);
    return fields ? { ok: true, fields } : { ok: false, reason: 'bad_fields' };
  } catch {
    return { ok: false, reason: 'bad_payload' };
  }
}

function verifySecureQr(text) {
  const parsed = parseSecureQr(text);
  if (!parsed.ok) return { ok: false, reason: parsed.reason, message: MESSAGES[parsed.reason] };
  const { signedBytes, signature, ...fields } = parsed.fields;
  const keys = [...UIDAI_KEYS, ...(TEST_KEY && !isProd() ? [{ id: 'TEST', key: TEST_KEY }] : [])];
  let keyId = null;
  for (const k of keys) {
    try { if (crypto.verify('RSA-SHA256', signedBytes, k.key, signature)) { keyId = k.id; break; } } catch { /* try the next key */ }
  }
  if (!keyId) return { ok: false, reason: 'bad_signature', message: MESSAGES.bad_signature };
  return { ok: true, keyId, testKey: keyId === 'TEST', fields };
}

// ---- name match: the card name vs the name on the account / profile ----
const HONORIFICS = new Set(['dr', 'mr', 'mrs', 'ms', 'miss', 'mx', 'smt', 'shri', 'sri', 'shree', 'sh', 'km', 'kum', 'late', 'prof', 'er', 'adv', 'capt', 'col', 'baby', 'master', 'ji']);
function nameTokens(s) {
  return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter((t) => t && !HONORIFICS.has(t));
}
function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 99;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
// An initial ("S") matches a word starting with it; a long word may differ by one letter (Sunita / Sunitha).
const tokenLike = (a, b) => a === b || (a.length === 1 && b.startsWith(a)) || (b.length === 1 && a.startsWith(b)) || (Math.min(a.length, b.length) >= 5 && editDistance(a, b) <= 1);
function nameMatch(cardName, accountName) {
  const a = nameTokens(cardName); const b = nameTokens(accountName);
  if (!a.length || !b.length) return 'mismatch';
  if ([...a].sort().join(' ') === [...b].sort().join(' ') || a.join('') === b.join('')) return 'exact';
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  const used = new Set();
  const allFound = short.every((t) => { const i = long.findIndex((u, k) => !used.has(k) && tokenLike(t, u)); if (i < 0) return false; used.add(i); return true; });
  if (allFound && short.some((t) => t.length > 1)) return 'close';
  const ja = a.join(''); const jb = b.join('');
  if (editDistance(ja, jb) <= Math.max(1, Math.floor(Math.max(ja.length, jb.length) * 0.15))) return 'close';
  return 'mismatch';
}

// Detects the same QR being used on a second account without keeping anything that identifies the person.
const refHash = (secret, last4, referenceTs) => crypto.createHmac('sha256', secret).update(`aadhaar-ref|${last4}|${referenceTs}`).digest('hex');

module.exports = { parseSecureQr, verifySecureQr, nameMatch, refHash, MESSAGES, MAX_DIGITS, keyIds: () => UIDAI_KEYS.map((k) => k.id) };
