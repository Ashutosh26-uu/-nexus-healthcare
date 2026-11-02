// "Continue with Google" through Neon Auth (Managed Better Auth). Neon Auth only proves who the person is:
// the browser signs in with Google there, gets a short-lived Neon JWT (EdDSA, 15 min) and hands it to us once.
// We check it against Neon's public keys and sign the person into their EXISTING Sehatra account with the same
// verified email — roles, two-step login, suspension and every other rule of our own login still apply.
// Off unless NEON_AUTH_BASE_URL is set (the branch's Auth URL from the Neon console, not a secret).
const crypto = require('crypto');

module.exports = function neonAuth(app, { findUserByEmail, finishLogin, audit, limiter, fetchImpl = fetch }) {
  const base = () => String(process.env.NEON_AUTH_BASE_URL || '').trim().replace(/\/+$/, '');
  const enabled = () => /^https?:\/\//.test(base());

  // Neon's public signing keys, cached; refetched (at most once a minute) when a token names a key we don't have.
  let jwks = { keys: new Map(), at: 0 };
  async function keyFor(kid) {
    const fresh = Date.now() - jwks.at < 10 * 60000;
    if (jwks.keys.has(kid) && fresh) return jwks.keys.get(kid);
    if (Date.now() - jwks.at < 60000 && !jwks.keys.has(kid)) return null;
    const r = await fetchImpl(`${base()}/.well-known/jwks.json`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`JWKS ${r.status}`);
    const body = await r.json();
    const keys = new Map();
    for (const k of body.keys || []) {
      if (k.kty !== 'OKP' || k.crv !== 'Ed25519' || !k.x) continue;
      try { keys.set(k.kid || '', crypto.createPublicKey({ format: 'jwk', key: { kty: 'OKP', crv: 'Ed25519', x: k.x } })); } catch { /* skip a bad key */ }
    }
    jwks = { keys, at: Date.now() };
    return keys.get(kid) || (keys.size === 1 && !kid ? [...keys.values()][0] : null);
  }

  // A token is accepted once (it is good for 15 minutes; a copy can't sign in again).
  const used = new Map();
  async function verify(token) {
    const parts = String(token || '').split('.');
    if (parts.length !== 3 || token.length > 8000) return null;
    let header; let claims;
    try { header = JSON.parse(Buffer.from(parts[0], 'base64url')); claims = JSON.parse(Buffer.from(parts[1], 'base64url')); } catch { return null; }
    if (header.alg !== 'EdDSA') return null;
    const key = await keyFor(header.kid || '');
    if (!key || !crypto.verify(null, Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'))) return null;
    const origin = new URL(base()).origin;
    const now = Date.now() / 1000;
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (claims.iss !== origin || !aud.includes(origin)) return null;
    if (!(claims.exp > now) || (claims.iat && claims.iat > now + 60)) return null;
    const h = crypto.createHash('sha256').update(token).digest('hex');
    for (const [k, exp] of used) if (exp < now) used.delete(k);
    if (used.has(h)) return null;
    used.set(h, claims.exp);
    return claims;
  }

  app.post('/api/auth/neon', limiter, async (req, res) => {
    if (!enabled()) return res.status(404).json({ error: 'Google sign-in isn\'t set up on this network.' });
    let claims = null;
    try { claims = await verify(req.body?.token); } catch (e) { console.error('[neon-auth]', e.message); return res.status(502).json({ error: 'Google sign-in is unavailable right now. Please use your email instead.' }); }
    if (!claims) return res.status(401).json({ error: 'That Google sign-in didn\'t work. Please try again.' });
    const email = String(claims.email || '').trim().toLowerCase();
    // Only an email Google (or Neon) has verified may open an account — anyone can type an unverified one.
    if (!email.includes('@') || claims.emailVerified !== true) return res.status(403).json({ error: 'Your Google email isn\'t verified, so we can\'t use it to sign you in. Please use your email code instead.' });
    if (claims.banned) return res.status(403).json({ error: 'This Google account can\'t be used to sign in.' });
    const user = findUserByEmail(email);
    if (!user || user.status === 'deleted') return res.status(404).json({ code: 'NO_ACCOUNT', email, error: `There is no Sehatra account for ${email} yet. Create your free Health Passport first — it takes a minute.` });
    if (user.status === 'suspended') return res.status(403).json({ error: 'This account is suspended. Contact support.' });
    if (user.status === 'pending') return res.status(403).json({ error: 'Your account is awaiting verification by our team. You can sign in as soon as it is approved.' });
    audit({ id: user.id, name: user.name, role: user.role }, 'login_google', null, 'auth', 'Signed in with Google (Neon Auth)');
    finishLogin(res, user);
  });

  return { enabled, url: () => (enabled() ? base() : null), verify };
};
