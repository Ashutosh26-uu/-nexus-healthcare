// Phone / browser push notifications (Web Push: RFC 8030 delivery, RFC 8291 encryption, RFC 8292 VAPID).
// No outside account: the VAPID key pair is ours — VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY from the environment, or
// made once and kept in the database so it survives restarts and redeploys (a new key would orphan every phone).
// Every notify() also goes to the person's subscribed devices. By default the lock screen shows only
// "New update on Sehatra" — no names, tests or results — unless the person turns on "show details".
// A device is only pushed to while its sign-in is current: "sign out of all devices" (or account deletion)
// bumps tokenVersion, and older subscriptions go quiet until that device signs in again.
const crypto = require('crypto');

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const unb64u = (s) => Buffer.from(String(s || ''), 'base64url');

// Push services browsers actually use. Anything else is refused, so a subscription can't be pointed at an
// internal address or someone else's server.
const PUSH_HOSTS = ['fcm.googleapis.com', 'android.googleapis.com', 'updates.push.services.mozilla.com', 'push.services.mozilla.com', 'notify.windows.com', 'push.apple.com'];
const allowedEndpoint = (endpoint, extraHosts = []) => {
  let u; try { u = new URL(endpoint); } catch { return false; }
  if (extraHosts.includes(u.host)) return true; // tests only (a local fake push service)
  if (u.protocol !== 'https:' || u.port) return false;
  return PUSH_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
};

// RFC 8291 "aes128gcm": encrypt one record for the subscription's p256dh key + auth secret.
// `fixed` (ephemeral private key + salt) is only for checking against the RFC 8291 worked example.
function encrypt(payload, p256dh, authSecret, fixed = null) {
  const uaPublic = unb64u(p256dh);
  const auth = unb64u(authSecret);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4 || auth.length < 16) throw new Error('bad subscription keys');
  const ecdh = crypto.createECDH('prime256v1');
  let asPublic;
  if (fixed) { ecdh.setPrivateKey(unb64u(fixed.privateKey)); asPublic = ecdh.getPublicKey(); } else asPublic = ecdh.generateKeys();
  const shared = ecdh.computeSecret(uaPublic);
  const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
  const prkKey = hmac(auth, shared);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]));
  const salt = fixed ? unb64u(fixed.salt) : crypto.randomBytes(16);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21); salt.copy(header, 0); header.writeUInt32BE(4096, 16); header[20] = 65;
  return Buffer.concat([header, asPublic, body]);
}

module.exports = function push(app, { auth, db, store, nowIso, userById, contact, home = () => '/', extraHosts = [], fetchImpl = fetch }) {
  const d = () => { const x = db(); x.pushSubs ||= []; x.pushKeys ||= []; return x; };

  // The VAPID key pair: environment first, else the one saved in the database, else make and save one.
  let keys = null;
  function vapid() {
    if (keys) return keys;
    const envPub = (process.env.VAPID_PUBLIC_KEY || '').trim();
    const envPriv = (process.env.VAPID_PRIVATE_KEY || '').trim();
    let pub; let priv;
    if (envPub && envPriv) { pub = envPub; priv = envPriv; } else {
      let saved = d().pushKeys[0];
      if (!saved) {
        const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
        const jwk = publicKey.export({ format: 'jwk' });
        saved = { id: 'vapid', publicKey: b64u(Buffer.concat([Buffer.from([4]), unb64u(jwk.x), unb64u(jwk.y)])), privateKey: privateKey.export({ format: 'jwk' }).d, at: nowIso() };
        d().pushKeys.push(saved);
      }
      pub = saved.publicKey; priv = saved.privateKey;
    }
    const raw = unb64u(pub);
    const key = crypto.createPrivateKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', d: priv, x: b64u(raw.subarray(1, 33)), y: b64u(raw.subarray(33, 65)) } });
    keys = { publicKey: pub, key };
    return keys;
  }

  // RFC 8292: a short signed token per push service origin, reused for up to 11 hours.
  const jwtCache = new Map();
  function vapidHeader(endpoint) {
    const aud = new URL(endpoint).origin;
    const hit = jwtCache.get(aud);
    if (hit && hit.exp - Date.now() / 1000 > 3600) return hit.header;
    const { publicKey, key } = vapid();
    const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
    const unsigned = `${b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))}.${b64u(JSON.stringify({ aud, exp, sub: contact() }))}`;
    const sig = crypto.sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' });
    const header = `vapid t=${unsigned}.${b64u(sig)}, k=${publicKey}`;
    jwtCache.set(aud, { exp, header });
    return header;
  }

  const URGENT = new Set(['sos', 'consent']);
  async function sendOne(sub, message, urgent) {
    try {
      const res = await fetchImpl(sub.endpoint, {
        method: 'POST',
        headers: { Authorization: vapidHeader(sub.endpoint), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: urgent ? '3600' : '86400', Urgency: urgent ? 'high' : 'normal' },
        body: encrypt(JSON.stringify(message), sub.p256dh, sub.auth),
        signal: AbortSignal.timeout(10000),
      });
      if (res.status === 404 || res.status === 410) { drop(sub.endpoint); return 'gone'; } // the browser unsubscribed
      if (!res.ok) throw new Error(`push service answered ${res.status}`);
      sub.lastOkAt = nowIso(); sub.fails = 0;
      return 'ok';
    } catch (e) {
      sub.fails = (sub.fails || 0) + 1;
      if (sub.fails >= 20) drop(sub.endpoint);
      console.warn('[push]', e.message);
      return 'failed';
    }
  }
  const drop = (endpoint) => { const list = d().pushSubs; const i = list.findIndex((s) => s.endpoint === endpoint); if (i >= 0) list.splice(i, 1); };

  const liveSubs = (user) => d().pushSubs.filter((s) => s.userId === user.id && (s.tv || 0) === (user.tokenVersion || 0));

  // Called from notify(): fire and forget — a slow push service never holds up the request that caused it.
  function send(userId, title, body, kind) {
    const user = userById(userId);
    if (!user || ['deleted', 'suspended'].includes(user.status)) return Promise.resolve([]);
    const subs = liveSubs(user);
    if (!subs.length) return Promise.resolve([]);
    const urgent = URGENT.has(kind);
    const url = home(user);
    const message = user.pushDetail
      ? { title: String(title || 'Sehatra').slice(0, 120), body: String(body || '').slice(0, 300), url, tag: kind || 'update', urgent }
      : { title: urgent ? 'Urgent update on Sehatra' : 'New update on Sehatra', body: 'Open the app to see it.', url, tag: kind || 'update', urgent };
    return Promise.all(subs.map((s) => sendOne(s, message, urgent)));
  }

  app.get('/api/push', auth, (req, res) => {
    let publicKey = null;
    try { publicKey = vapid().publicKey; } catch (e) { console.error('[push] key', e.message); }
    res.json({ publicKey, detail: Boolean(req.user.pushDetail), devices: liveSubs(req.user).map((s) => ({ id: s.id, label: s.label, at: s.at, lastOkAt: s.lastOkAt || null })) });
  });

  // Save (or move to this account) a browser's subscription. One endpoint belongs to one account at a time:
  // if someone else signs in on the same phone, the phone's alerts follow the new sign-in.
  app.post('/api/push/subscribe', auth, (req, res) => {
    const { endpoint, keys: k = {}, label } = req.body || {};
    if (typeof endpoint !== 'string' || endpoint.length > 1000 || !allowedEndpoint(endpoint, extraHosts)) return res.status(400).json({ error: 'This browser\'s push service isn\'t supported.' });
    const p256dh = String(k.p256dh || ''); const authKey = String(k.auth || '');
    try { encrypt('x', p256dh, authKey); } catch { return res.status(400).json({ error: 'Invalid push subscription.' }); }
    const list = d().pushSubs;
    drop(endpoint);
    const mine = list.filter((s) => s.userId === req.user.id);
    if (mine.length >= 10) drop(mine.sort((a, b) => String(a.at).localeCompare(String(b.at)))[0].endpoint); // oldest device makes room
    const sub = { id: store.id('ps'), userId: req.user.id, endpoint, p256dh, auth: authKey, tv: req.user.tokenVersion || 0, label: String(label || 'This device').replace(/[^\w .,()·/-]/g, '').slice(0, 60) || 'This device', at: nowIso(), fails: 0 };
    list.push(sub);
    res.json({ ok: true, id: sub.id });
  });

  app.post('/api/push/unsubscribe', auth, (req, res) => {
    const { endpoint, id } = req.body || {};
    const list = d().pushSubs;
    const i = list.findIndex((s) => s.userId === req.user.id && ((endpoint && s.endpoint === endpoint) || (id && s.id === id)));
    if (i >= 0) list.splice(i, 1);
    res.json({ ok: true });
  });

  app.put('/api/push/detail', auth, (req, res) => {
    req.user.pushDetail = Boolean(req.body?.detail);
    res.json({ detail: req.user.pushDetail });
  });

  const tests = new Map();
  app.post('/api/push/test', auth, async (req, res) => {
    const last = tests.get(req.user.id) || 0;
    if (Date.now() - last < 15000) return res.status(429).json({ error: 'Wait a few seconds before sending another test.' });
    tests.set(req.user.id, Date.now());
    const results = await send(req.user.id, 'Test alert ✅', 'Alerts from Sehatra will appear like this, even when the app is closed.', 'test');
    if (!results.length) return res.status(400).json({ error: 'No device is set up for alerts yet.' });
    res.json({ sent: results.filter((r) => r === 'ok').length, failed: results.filter((r) => r !== 'ok').length });
  });

  return { send, encrypt };
};
module.exports.encrypt = encrypt;
