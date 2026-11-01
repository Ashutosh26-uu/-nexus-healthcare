// Push notifications: a fake push service on localhost receives what the server sends, checks the VAPID
// signature and decrypts the message the way a browser would (RFC 8291 / 8292).
import http from 'node:http';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { call, check, demo, done } from './lib.mjs';

// Byte-exact against the worked example in RFC 8291 section 5.
const { encrypt } = createRequire(import.meta.url)('../push.js');
const rfc = encrypt('When I grow up, I want to be a watermelon', 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', 'BTBZMqHH6r4Tts7J_aSIgg', { privateKey: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', salt: 'DGv6ra1nlYgDCS1FRnbzlw' }).toString('base64url');
check(rfc === 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN', 'encryption matches the RFC 8291 example');

const PUSH_PORT = Number(process.env.PUSH_TEST_PORT) || 4591;
const got = [];
const svc = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    got.push({ path: req.url, headers: req.headers, body: Buffer.concat(chunks) });
    res.writeHead(req.url.startsWith('/gone') ? 410 : 201).end();
  });
});
await new Promise((ok) => svc.listen(PUSH_PORT, ok));

const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
function device(path) {
  const ecdh = crypto.createECDH('prime256v1');
  const pub = ecdh.generateKeys();
  const authSecret = crypto.randomBytes(16);
  return {
    sub: { endpoint: `http://localhost:${PUSH_PORT}${path}`, keys: { p256dh: pub.toString('base64url'), auth: authSecret.toString('base64url') }, label: 'Test phone' },
    decrypt(body) {
      const salt = body.subarray(0, 16); const idlen = body[20]; const asPub = body.subarray(21, 21 + idlen); const ct = body.subarray(21 + idlen);
      const ikm = hmac(hmac(authSecret, ecdh.computeSecret(asPub)), Buffer.concat([Buffer.from('WebPush: info\0'), pub, asPub, Buffer.from([1])]));
      const prk = hmac(salt, ikm);
      const dec = crypto.createDecipheriv('aes-128-gcm', hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16), hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12));
      dec.setAuthTag(ct.subarray(ct.length - 16));
      const plain = Buffer.concat([dec.update(ct.subarray(0, ct.length - 16)), dec.final()]);
      return JSON.parse(plain.subarray(0, plain.lastIndexOf(2)).toString());
    },
  };
}
function vapidOk(header, publicKey) {
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(header || '');
  if (!m || m[2] !== publicKey) return false;
  const [h, p, s] = m[1].split('.');
  const raw = Buffer.from(publicKey, 'base64url');
  const key = crypto.createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33).toString('base64url') } });
  const claims = JSON.parse(Buffer.from(p, 'base64url'));
  return crypto.verify('sha256', Buffer.from(`${h}.${p}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'))
    && claims.aud === `http://localhost:${PUSH_PORT}` && claims.exp > Date.now() / 1000 && /^(mailto:|https?:)/.test(claims.sub);
}
const wait = async (n) => { for (let i = 0; i < 40 && got.length < n; i += 1) await new Promise((ok) => setTimeout(ok, 100)); };

const patient = await demo('patient');
const admin = await demo('admin');

let r = await call('GET', '/push', patient);
const publicKey = r.j.publicKey;
check(r.s === 200 && Buffer.from(publicKey || '', 'base64url').length === 65, 'server has a VAPID public key');
check((await call('GET', '/push', patient)).j.publicKey === publicKey, 'the key stays the same');

r = await call('POST', '/push/subscribe', patient, { endpoint: 'https://evil.example.com/x', keys: device('/x').sub.keys });
check(r.s === 400, 'unknown push service refused');
r = await call('POST', '/push/subscribe', patient, { endpoint: device('/x').sub.endpoint, keys: { p256dh: 'abc', auth: 'def' } });
check(r.s === 400, 'broken subscription keys refused');

const phone = device('/sub/patient');
r = await call('POST', '/push/subscribe', patient, phone.sub);
check(r.s === 200 && r.j.ok, 'patient’s phone subscribed');
r = await call('GET', '/push', patient);
check(r.j.devices.length === 1 && r.j.devices[0].label === 'Test phone' && r.j.detail === false, 'device listed, details off by default');
check(!JSON.stringify(r.j).includes(phone.sub.keys.auth), 'subscription secrets never sent back');

r = await call('POST', '/push/test', patient);
await wait(1);
check(r.s === 200 && r.j.sent === 1, 'test alert sent', JSON.stringify(r.j));
let p = got[0];
check(p && p.headers['content-encoding'] === 'aes128gcm' && p.headers.ttl && p.headers.urgency === 'normal', 'Web Push headers');
check(p && vapidOk(p.headers.authorization, publicKey), 'VAPID signature verifies');
let msg = p && phone.decrypt(p.body);
check(msg && msg.title === 'New update on Sehatra' && !/Test alert/.test(JSON.stringify(msg)) && msg.url === '/patient', 'private by default: no details on the lock screen', JSON.stringify(msg));

r = await call('PUT', '/push/detail', patient, { detail: true });
check(r.j.detail === true, 'patient turns on details');
r = await call('POST', '/push/test', patient);
check(r.s === 429, 'test alerts rate limited');

// A real notify(): someone shares a story → admins are told → the admin's browser gets a push.
const laptop = device('/sub/admin');
await call('POST', '/push/subscribe', admin, laptop.sub);
await call('PUT', '/push/detail', admin, { detail: true });
const before = got.length;
const ramesh = await demo('ramesh');
const story = await call('POST', '/stories', ramesh, { text: 'Push test story — the doctor called back within minutes and explained everything.', consent: true });
await wait(before + 1);
p = got.slice(before).find((x) => x.path === '/sub/admin');
msg = p && laptop.decrypt(p.body);
check(msg && /New story to review/.test(msg.title) && msg.url === '/admin', 'notify() reaches the admin’s browser with details', JSON.stringify(msg));
if (story.j?.id) await call('POST', `/stories/${story.j.id}/withdraw`, ramesh);
check(!got.slice(before).some((x) => x.path === '/sub/patient'), 'nobody else is pushed');

// Same phone, another account signs in → the phone now belongs to that account only.
await call('POST', '/push/subscribe', admin, phone.sub);
check((await call('GET', '/push', patient)).j.devices.length === 0, 'phone moves to whoever signed in on it last');
await call('POST', '/push/unsubscribe', admin, { endpoint: phone.sub.endpoint });

// The browser dropped the subscription → push service says 410 → removed.
const old = device('/gone');
await call('POST', '/push/subscribe', patient, old.sub);
await new Promise((ok) => setTimeout(ok, 15500));
r = await call('POST', '/push/test', patient);
check(r.s === 200 && r.j.failed === 1, 'expired subscription reported');
check((await call('GET', '/push', patient)).j.devices.length === 0, 'expired subscription removed');

await call('POST', '/push/unsubscribe', admin, { endpoint: laptop.sub.endpoint });
check((await call('GET', '/push', admin)).j.devices.length === 0, 'unsubscribe removes the device');
svc.close();
done();
