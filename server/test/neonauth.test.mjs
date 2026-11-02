// Continue with Google via Neon Auth: a fake Neon Auth (JWKS on localhost) signs EdDSA tokens like the real one.
import http from 'node:http';
import crypto from 'node:crypto';
import { call, check, done } from './lib.mjs';

const PORT = Number(process.env.NEON_TEST_PORT) || 4592;
const ORIGIN = `http://localhost:${PORT}`;
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const other = crypto.generateKeyPairSync('ed25519');
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'EdDSA', use: 'sig' };
const svc = http.createServer((req, res) => {
  if (req.url.endsWith('/.well-known/jwks.json')) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ keys: [jwk] })); return; }
  res.writeHead(404).end();
});
await new Promise((ok) => svc.listen(PORT, ok));

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function token(claims = {}, { key = privateKey, header = {} } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: 'EdDSA', kid: 'k1', ...header });
  const p = b64({ sub: 'u1', email: 'patient@omnicare.in', emailVerified: true, iss: ORIGIN, aud: ORIGIN, iat: now, exp: now + 900, ...claims });
  return `${h}.${p}.${crypto.sign(null, Buffer.from(`${h}.${p}`), key).toString('base64url')}`;
}

let r = await call('GET', '/public/config');
check(r.j.neonAuthUrl && r.j.neonAuthUrl.startsWith(ORIGIN), 'public config tells the app where Neon Auth is', r.j.neonAuthUrl);

const good = token();
r = await call('POST', '/auth/neon', null, { token: good });
check(r.s === 200 && r.j.token && r.j.user?.email === 'patient@omnicare.in' && r.j.user.role === 'patient', 'verified Google email signs into the existing account');
r = await call('GET', '/auth/me', r.j.token);
check(r.s === 200 && r.j.user?.email === 'patient@omnicare.in', 'the Sehatra session works');
r = await call('POST', '/auth/neon', null, { token: good });
check(r.s === 401, 'the same token can\'t be used twice');

r = await call('POST', '/auth/neon', null, { token: token({ email: 'PATIENT@omnicare.in' }) });
check(r.s === 200, 'email matched without regard to case');
r = await call('POST', '/auth/neon', null, { token: token({ emailVerified: false }) });
check(r.s === 403, 'unverified email refused');
r = await call('POST', '/auth/neon', null, { token: token({}, { key: other.privateKey }) });
check(r.s === 401, 'token signed by someone else refused');
r = await call('POST', '/auth/neon', null, { token: token({ iss: 'https://evil.example.com' }) });
check(r.s === 401, 'token from another issuer refused');
r = await call('POST', '/auth/neon', null, { token: token({ aud: 'https://evil.example.com' }) });
check(r.s === 401, 'token for another audience refused');
r = await call('POST', '/auth/neon', null, { token: token({ exp: Math.floor(Date.now() / 1000) - 5 }) });
check(r.s === 401, 'expired token refused');
const [h, p] = good.split('.');
r = await call('POST', '/auth/neon', null, { token: `${b64({ alg: 'none' })}.${p}.` });
check(r.s === 401, 'unsigned (alg none) token refused');
r = await call('POST', '/auth/neon', null, { token: `${h}.${b64({ ...JSON.parse(Buffer.from(p, 'base64url')), email: 'admin@omnicare.in' })}.${good.split('.')[2]}` });
check(r.s === 401, 'tampered email refused');
r = await call('POST', '/auth/neon', null, { token: token({ email: 'nobody-here@example.org' }) });
check(r.s === 404 && r.j.code === 'NO_ACCOUNT', 'no account for that email → told to sign up');
r = await call('POST', '/auth/neon', null, { token: 'garbage' });
check(r.s === 401, 'garbage refused');

svc.close();
done();
