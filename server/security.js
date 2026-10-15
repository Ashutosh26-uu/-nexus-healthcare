// Security hardening: boot checks, CORS allow-list, headers, and brute-force throttling.
const crypto = require('crypto');

const isProd = () => process.env.NODE_ENV === 'production';

// Refuse to start in production with weak/default secrets.
function checkSecrets() {
  const secret = process.env.JWT_SECRET || '';
  const weak = !secret || /change|example|secret-here|your-?secret/i.test(secret) || secret.length < 32 || new Set(secret).size < 10;
  if (weak) {
    if (isProd()) {
      console.error('FATAL: set a strong JWT_SECRET (24+ random chars) before running in production.');
      process.exit(1);
    }
    console.warn('[security] Using a development JWT secret. Set JWT_SECRET before deploying.');
  }
  // Demo data ships with public demo passwords (incl. a super-admin) and allows "mark as paid".
  if (isProd() && (process.env.DATA_MODE || 'live').toLowerCase() === 'demo' && process.env.ALLOW_DEMO_IN_PRODUCTION !== 'true') {
    console.error('FATAL: DATA_MODE=demo is not allowed in production (demo accounts use a public password). Use DATA_MODE=live, or set ALLOW_DEMO_IN_PRODUCTION=true for a private investor demo.');
    process.exit(1);
  }
  if (isProd() && process.env.OTP_DEV_MODE === 'true') {
    console.error('FATAL: OTP_DEV_MODE must not be true in production (it reveals codes).');
    process.exit(1);
  }
}

// CORS: same-origin in production unless CORS_ORIGIN lists allowed origins; open in dev.
function corsOptions() {
  const configured = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  return {
    origin(origin, cb) {
      if (!origin) return cb(null, true); // same-origin / curl / mobile apps
      if (!isProd() || configured.length === 0) return cb(null, true);
      return cb(null, configured.includes(origin));
    },
    credentials: false,
    maxAge: 86400,
  };
}

// Conservative security headers (no external dep). The SPA and API share an origin in production.
function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(self)');
  if (isProd()) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

// Sliding-window limiter keyed by ip+bucket. Returns a middleware.
function rateLimit({ windowMs, max, key, message }) {
  const hits = new Map();
  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [k, times] of hits) {
      const kept = times.filter((t) => t > cutoff);
      if (kept.length) hits.set(k, kept); else hits.delete(k);
    }
  }, windowMs).unref?.();
  return (req, res, next) => {
    const k = `${req.ip}|${key ? key(req) : ''}`;
    const now = Date.now();
    const times = (hits.get(k) || []).filter((t) => now - t < windowMs);
    if (times.length >= max) {
      const retry = Math.ceil((windowMs - (now - times[0])) / 1000);
      res.setHeader('Retry-After', String(retry));
      return res.status(429).json({ error: message || 'Too many attempts. Please wait a little and try again.', retryAfter: retry });
    }
    times.push(now);
    hits.set(k, times);
    next();
  };
}

const randomSecret = () => crypto.randomBytes(48).toString('hex');

module.exports = { checkSecrets, corsOptions, securityHeaders, rateLimit, randomSecret, isProd };
