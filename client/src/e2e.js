// End-to-end encrypted consult chat (Web Crypto only, no libraries).
//
// Identity: every patient / doctor has one ECDH P-256 key pair. The private key never leaves the browser
// unencrypted — the server keeps only a backup locked with the person's chat passphrase (PBKDF2-SHA256,
// 600 000 rounds → AES-256-GCM), so a new device can restore it and the server can't read it.
// Messages: a fresh AES-256-GCM content key per message, sealed for each participant with an ephemeral
// ECDH exchange + HKDF (ECIES). The ciphertext is bound to the consult, so it can't be replayed elsewhere.
const subtle = globalThis.crypto?.subtle;
export const e2eSupported = () => Boolean(subtle && globalThis.indexedDB);

const ITER = 600000;
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => { const t = String(s).replace(/-/g, '+').replace(/_/g, '/'); return Uint8Array.from(atob(t + '==='.slice((t.length + 3) % 4)), (c) => c.charCodeAt(0)); };
const ECDH = { name: 'ECDH', namedCurve: 'P-256' };
const pubJwk = ({ kty, crv, x, y }) => ({ kty, crv, x, y });

// ---------- this device's cache (IndexedDB holds the non-extractable private key) ----------
const DB = 'sehatra-e2e';
function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('keys');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('keys', mode);
      const req = fn(tx.objectStore('keys'));
      tx.oncomplete = () => { open.result.close(); resolve(req?.result); };
      tx.onerror = () => { open.result.close(); reject(tx.error); };
    };
  });
}
export const cachedKey = (userId) => idb('readonly', (s) => s.get(userId)).catch(() => null);
const cacheKey = (userId, entry) => idb('readwrite', (s) => s.put(entry, userId));
// Signing out forgets every key on this device (shared phones are common); the passphrase brings it back.
export const forgetKeys = () => idb('readwrite', (s) => s.clear()).catch(() => {});

// ---------- identity ----------
async function wrapKeyFrom(passphrase, salt) {
  const base = await subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function storeLocal(userId, pkcs8, publicKey) {
  const privateKey = await subtle.importKey('pkcs8', pkcs8, ECDH, false, ['deriveBits']); // non-extractable from here on
  const entry = { privateKey, publicKey, kid: publicKey.x.slice(0, 12) };
  await cacheKey(userId, entry);
  return entry;
}

/** New key pair; returns what the server stores ({ publicKey, backup }). */
export async function createIdentity(userId, passphrase) {
  const pair = await subtle.generateKey(ECDH, true, ['deriveBits']);
  const pkcs8 = await subtle.exportKey('pkcs8', pair.privateKey);
  const publicKey = pubJwk(await subtle.exportKey('jwk', pair.publicKey));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(`sehatra-e2e-backup|${userId}`) }, await wrapKeyFrom(passphrase, salt), pkcs8);
  await storeLocal(userId, pkcs8, publicKey);
  return { publicKey, backup: { v: 1, kdf: 'PBKDF2-SHA256', iter: ITER, salt: b64(salt), iv: b64(iv), ct: b64(ct) } };
}

/** Restore on this device from the server's locked backup. Throws on a wrong passphrase. */
export async function unlockIdentity(userId, passphrase, { publicKey, backup }) {
  let pkcs8;
  try {
    pkcs8 = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(backup.iv), additionalData: enc.encode(`sehatra-e2e-backup|${userId}`) }, await wrapKeyFrom(passphrase, unb64(backup.salt)), unb64(backup.ct));
  } catch { throw new Error('That passphrase isn\'t right.'); }
  return storeLocal(userId, pkcs8, publicKey);
}

// ---------- messages ----------
async function sealFor(recipientJwk, rawKey, uid) {
  const eph = await subtle.generateKey(ECDH, true, ['deriveBits']);
  const peer = await subtle.importKey('jwk', recipientJwk, ECDH, false, []);
  const kek = await kekFrom(await subtle.deriveBits({ name: 'ECDH', public: peer }, eph.privateKey, 256), uid);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wk = await subtle.encrypt({ name: 'AES-GCM', iv }, kek, rawKey);
  return { uid, epk: pubJwk(await subtle.exportKey('jwk', eph.publicKey)), iv: b64(iv), wk: b64(wk) };
}
async function kekFrom(shared, uid) {
  const ikm = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode(uid), info: enc.encode('sehatra-e2e-msg-v1') }, ikm, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** participants: [{ userId, publicKey }] — everyone who should read it, sender included. */
export async function encryptMessage(text, consultId, participants) {
  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  const key = await subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(`consult|${consultId}`) }, key, enc.encode(text));
  const keys = await Promise.all(participants.map((p) => sealFor(p.publicKey, rawKey, p.userId)));
  return { v: 1, iv: b64(iv), ct: b64(ct), keys };
}

/** Returns the text, or null when this person's key can't open it (e.g. sent before they reset it). */
export async function decryptMessage(payload, consultId, userId, privateKey) {
  const mine = payload?.keys?.find((k) => k.uid === userId);
  if (!mine || !privateKey) return null;
  try {
    const epk = await subtle.importKey('jwk', mine.epk, ECDH, false, []);
    const kek = await kekFrom(await subtle.deriveBits({ name: 'ECDH', public: epk }, privateKey, 256), userId);
    const rawKey = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(mine.iv) }, kek, unb64(mine.wk));
    const key = await subtle.importKey('raw', rawKey, 'AES-GCM', false, ['decrypt']);
    return dec.decode(await subtle.decrypt({ name: 'AES-GCM', iv: unb64(payload.iv), additionalData: enc.encode(`consult|${consultId}`) }, key, unb64(payload.ct)));
  } catch { return null; }
}
