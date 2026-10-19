// Two-step login with an authenticator app (Google Authenticator, Microsoft Authenticator, Authy, 1Password…):
// RFC 6238 time-based codes (HMAC-SHA1, 30 s, 6 digits) — no third-party service, nothing sent anywhere.
// The secret is stored encrypted (AES-256-GCM, key from MFA_KEY or derived from JWT_SECRET); backup codes are
// stored only as SHA-256 hashes and each works once.
const crypto = require('crypto');

const STEP = 30;
const DIGITS = 6;
const ISSUER = 'Nexus Healthcare';
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0; let value = 0; let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(str) {
  const s = String(str).toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0; let value = 0; const out = [];
  for (const ch of s) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error('bad base32');
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

function hotp(secretB32, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac('sha1', base32Decode(secretB32)).update(buf).digest();
  const off = mac[mac.length - 1] & 15;
  const bin = ((mac[off] & 0x7f) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3];
  return String(bin % 10 ** DIGITS).padStart(DIGITS, '0');
}
const counterAt = (ms = Date.now()) => Math.floor(ms / 1000 / STEP);
const totp = (secretB32, ms = Date.now()) => hotp(secretB32, counterAt(ms));

// Accept the current 30-second window and one on either side (phone clocks drift). Returns the matched
// counter so the caller can refuse the same code twice (replay), or null.
function verifyTotp(secretB32, code, { lastCounter = -1, ms = Date.now() } = {}) {
  const c = String(code || '').replace(/\D/g, '');
  if (c.length !== DIGITS) return null;
  const now = counterAt(ms);
  for (const k of [now, now - 1, now + 1]) {
    if (k <= lastCounter) continue;
    const want = Buffer.from(hotp(secretB32, k)); const got = Buffer.from(c);
    if (crypto.timingSafeEqual(want, got)) return k;
  }
  return null;
}

const newSecret = () => base32Encode(crypto.randomBytes(20));
const otpauthUrl = (secretB32, account) => `otpauth://totp/${encodeURIComponent(`${ISSUER}:${account}`)}?secret=${secretB32}&issuer=${encodeURIComponent(ISSUER)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP}`;

// ---- secret at rest ----
const keyOf = () => crypto.createHash('sha256').update(process.env.MFA_KEY || `${process.env.JWT_SECRET || ''}|nexus-mfa-v1`).digest();
function seal(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', keyOf(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `v1.${iv.toString('base64url')}.${c.getAuthTag().toString('base64url')}.${enc.toString('base64url')}`;
}
function open(sealed) {
  const [v, iv, tag, enc] = String(sealed || '').split('.');
  if (v !== 'v1') throw new Error('unknown secret format');
  const d = crypto.createDecipheriv('aes-256-gcm', keyOf(), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(enc, 'base64url')), d.final()]).toString('utf8');
}

// ---- backup codes: 10 × "xxxx-xxxx", shown once, stored hashed ----
const hashCode = (code) => crypto.createHash('sha256').update(String(code).toLowerCase().replace(/[^a-z0-9]/g, '')).digest('hex');
function newRecoveryCodes(n = 10) {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'; // no look-alikes (0/o, 1/l/i)
  const one = () => Array.from({ length: 8 }, () => alphabet[crypto.randomInt(alphabet.length)]).join('').replace(/^(.{4})/, '$1-');
  const codes = Array.from({ length: n }, one);
  return { codes, hashes: codes.map(hashCode) };
}
// Use one backup code: returns the remaining hashes, or null if it didn't match.
function useRecoveryCode(hashes, code) {
  const h = hashCode(code);
  const i = (hashes || []).findIndex((x) => crypto.timingSafeEqual(Buffer.from(x), Buffer.from(h)));
  return i < 0 ? null : hashes.filter((_, j) => j !== i);
}

module.exports = { STEP, DIGITS, ISSUER, base32Encode, base32Decode, hotp, totp, counterAt, verifyTotp, newSecret, otpauthUrl, seal, open, newRecoveryCodes, useRecoveryCode, hashCode };
