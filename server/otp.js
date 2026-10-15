// One-time passcodes delivered for real over SMS, WhatsApp or email.
//
// Providers (set OTP_PROVIDER, or leave it as "auto" to use the first one configured):
//   twilio_verify  Twilio Verify — global SMS/WhatsApp, Twilio generates & checks the code
//   twilio         Twilio Programmable Messaging — we generate the code, Twilio delivers it
//   msg91          MSG91 OTP API — cheapest for India (needs a DLT-approved template)
//   console        Development only — the code is printed in the server log
// Email codes are sent over SMTP whenever SMTP_HOST is configured.
//
// Security: codes are random, stored only as salted SHA-256 hashes, expire after
// OTP_TTL_SECONDS, allow OTP_MAX_ATTEMPTS tries, have a resend cooldown, and are
// rate-limited per destination and per IP address.

const crypto = require('crypto');
const store = require('./db');

const TTL = Number(process.env.OTP_TTL_SECONDS || 300) * 1000;
const COOLDOWN = Number(process.env.OTP_RESEND_SECONDS || 30) * 1000;
const MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);
const MAX_SENDS_PER_HOUR = Number(process.env.OTP_MAX_PER_HOUR || 5);
const SECRET = process.env.OTP_SECRET || process.env.JWT_SECRET || 'omnicare-otp-dev-secret';

const env = (k) => (process.env[k] || '').trim();

function configured() {
  return {
    twilio_verify: Boolean(env('TWILIO_ACCOUNT_SID') && env('TWILIO_AUTH_TOKEN') && env('TWILIO_VERIFY_SERVICE_SID')),
    twilio: Boolean(env('TWILIO_ACCOUNT_SID') && env('TWILIO_AUTH_TOKEN') && (env('TWILIO_FROM') || env('TWILIO_MESSAGING_SERVICE_SID'))),
    msg91: Boolean(env('MSG91_AUTH_KEY') && env('MSG91_TEMPLATE_ID')),
    email: Boolean(env('SMTP_HOST')),
  };
}

function smsProvider() {
  const want = env('OTP_PROVIDER') || 'auto';
  const c = configured();
  if (want !== 'auto') {
    if (want === 'console') return 'console';
    if (!c[want]) throw new Error(`OTP_PROVIDER=${want} but its credentials are missing in .env`);
    return want;
  }
  if (c.twilio_verify) return 'twilio_verify';
  if (c.twilio) return 'twilio';
  if (c.msg91) return 'msg91';
  return 'console';
}

// Dev mode shows the code on screen. On by default only when no real provider exists.
function devMode() {
  if (env('OTP_DEV_MODE')) return env('OTP_DEV_MODE') === 'true';
  return smsProvider() === 'console' && process.env.NODE_ENV !== 'production';
}

/* ---------- phone numbers ---------- */
// Accepts "+44 7700 900123", "0091-98765 00001", or a national number plus a country dial code.
function normalizePhone(input, dialCode = '+91') {
  let s = String(input || '').trim();
  if (!s) return null;
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  let digits = s.replace(/[^\d+]/g, '');
  if (!digits.startsWith('+')) {
    const dc = String(dialCode || '+91').replace(/[^\d]/g, '');
    digits = digits.replace(/^0+/, '');
    if (digits.startsWith(dc) && digits.length > dc.length + 6) digits = `+${digits}`;
    else digits = `+${dc}${digits}`;
  }
  const only = digits.slice(1).replace(/\D/g, '');
  if (only.length < 7 || only.length > 15) return null;
  return `+${only}`;
}
const samePhone = (a, b) => Boolean(a && b) && normalizePhone(a) === normalizePhone(b);
const maskPhone = (e164) => `${e164.slice(0, Math.max(3, e164.length - 10))} ••••• ${e164.slice(-4)}`;
const maskEmail = (e) => e.replace(/^(.)(.*)(.@.*)$/, (_, a, b, c) => a + '•'.repeat(Math.min(6, b.length)) + c);

/* ---------- message text ---------- */
const MESSAGES = {
  en: (c, m) => `${c} is your Nexus Healthcare verification code. It expires in ${m} minutes. Never share it with anyone.`,
  hi: (c, m) => `${c} आपका Nexus Healthcare सत्यापन कोड है। यह ${m} मिनट में समाप्त होगा। इसे किसी से साझा न करें।`,
  bn: (c, m) => `${c} আপনার Nexus Healthcare যাচাইকরণ কোড। এটি ${m} মিনিটে শেষ হবে। কাউকে জানাবেন না।`,
  ta: (c, m) => `${c} உங்கள் Nexus Healthcare சரிபார்ப்புக் குறியீடு. ${m} நிமிடங்களில் காலாவதியாகும். யாருடனும் பகிர வேண்டாம்.`,
  te: (c, m) => `${c} మీ Nexus Healthcare ధృవీకరణ కోడ్. ఇది ${m} నిమిషాల్లో ముగుస్తుంది. ఎవరితోనూ పంచుకోకండి.`,
  mr: (c, m) => `${c} हा तुमचा Nexus Healthcare पडताळणी कोड आहे. तो ${m} मिनिटांत संपेल. कोणालाही सांगू नका.`,
  ur: (c, m) => `${c} آپ کا Nexus Healthcare تصدیقی کوڈ ہے۔ یہ ${m} منٹ میں ختم ہو جائے گا۔ کسی کو نہ بتائیں۔`,
  es: (c, m) => `${c} es tu código de verificación de Nexus Healthcare. Caduca en ${m} minutos. No lo compartas.`,
  fr: (c, m) => `${c} est votre code de vérification Nexus Healthcare. Il expire dans ${m} minutes. Ne le partagez jamais.`,
  ar: (c, m) => `${c} هو رمز التحقق الخاص بك من Nexus Healthcare. تنتهي صلاحيته خلال ${m} دقائق. لا تشاركه مع أحد.`,
  pt: (c, m) => `${c} é o seu código de verificação Nexus Healthcare. Expira em ${m} minutos. Não o partilhe.`,
};
const messageFor = (code, lang, purpose = 'login') => (purpose === 'consent'
  ? `${code} is your Nexus Healthcare approval code. Share it only with the doctor in front of you to let them see your records and write a prescription. It cannot be used to sign in. Valid ${Math.round(TTL / 60000)} min.`
  : (MESSAGES[(lang || 'en').split('-')[0]] || MESSAGES.en)(code, Math.round(TTL / 60000)));
// Codes are stored per purpose, so a code sent for one thing (e.g. a patient approving a doctor) can
// never be redeemed for another (e.g. signing in as that patient).
const PURPOSES = new Set(['login', 'consent']);
const keyFor = (purpose, target) => (purpose === 'login' ? target : `${purpose}|${target}`);

/* ---------- providers ---------- */
async function twilioRequest(url, params) {
  const auth = Buffer.from(`${env('TWILIO_ACCOUNT_SID')}:${env('TWILIO_AUTH_TOKEN')}`).toString('base64');
  const res = await fetch(url, { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Twilio: ${data.message || res.status}`);
  return data;
}

// A free on-the-fly test mailbox (nodemailer/Ethereal) used when no real SMTP is configured, so
// email OTP works for demos without any account. It really sends; the message is viewable at a
// preview URL instead of landing in a real inbox. Created once and reused.
let etherealTransport = null;
async function getEtherealTransport(nodemailer) {
  if (etherealTransport) return etherealTransport;
  const acct = await nodemailer.createTestAccount();
  etherealTransport = nodemailer.createTransport({ host: acct.smtp.host, port: acct.smtp.port, secure: acct.smtp.secure, auth: { user: acct.user, pass: acct.pass } });
  console.log('[otp] email: using a nodemailer test mailbox (Ethereal) — set SMTP_* in .env to deliver to real inboxes.');
  return etherealTransport;
}

async function sendViaProvider(provider, { target, channel, code, lang, purpose }) {
  if (channel === 'email') {
    let nodemailer;
    try { nodemailer = require('nodemailer'); } catch { throw new Error('Email OTP needs the "nodemailer" package.'); }
    const realSmtp = Boolean(env('SMTP_HOST'));
    const transport = realSmtp
      ? nodemailer.createTransport({ host: env('SMTP_HOST'), port: Number(env('SMTP_PORT') || 587), secure: env('SMTP_SECURE') === 'true', auth: env('SMTP_USER') ? { user: env('SMTP_USER'), pass: env('SMTP_PASS') } : undefined })
      : await getEtherealTransport(nodemailer);
    const text = messageFor(code, lang, purpose);
    const info = await transport.sendMail({
      from: env('SMTP_FROM') || 'Nexus Healthcare <no-reply@nexushealthcare.in>', to: target, subject: purpose === 'consent' ? `${code} — approve your doctor (Nexus Healthcare)` : `${code} — your Nexus Healthcare code`, text,
      html: `<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;border:1px solid #e6dfd3;border-radius:14px"><h2 style="color:#0f5c4d;margin:0 0 8px">Nexus Healthcare</h2><p>${text.replace(code, '')}</p><p style="font-size:32px;letter-spacing:8px;font-weight:bold;color:#1d2b2a;margin:16px 0">${code}</p><p style="color:#6f7c78;font-size:12px">If you didn't ask for this, you can ignore this email.</p></div>`,
    });
    return { ref: info.messageId, previewUrl: realSmtp ? null : nodemailer.getTestMessageUrl(info) };
  }
  if (provider === 'twilio_verify') {
    const r = await twilioRequest(`https://verify.twilio.com/v2/Services/${env('TWILIO_VERIFY_SERVICE_SID')}/Verifications`, { To: target, Channel: channel === 'whatsapp' ? 'whatsapp' : 'sms', Locale: (lang || 'en').split('-')[0] });
    return { ref: r.sid };
  }
  if (provider === 'twilio') {
    const params = { To: channel === 'whatsapp' ? `whatsapp:${target}` : target, Body: messageFor(code, lang, purpose) };
    if (channel === 'whatsapp') params.From = `whatsapp:${env('TWILIO_WHATSAPP_FROM') || env('TWILIO_FROM')}`;
    else if (env('TWILIO_MESSAGING_SERVICE_SID')) params.MessagingServiceSid = env('TWILIO_MESSAGING_SERVICE_SID');
    else params.From = env('TWILIO_FROM');
    const r = await twilioRequest(`https://api.twilio.com/2010-04-01/Accounts/${env('TWILIO_ACCOUNT_SID')}/Messages.json`, params);
    return { ref: r.sid };
  }
  if (provider === 'msg91') {
    const url = new URL('https://control.msg91.com/api/v5/otp');
    url.searchParams.set('template_id', env('MSG91_TEMPLATE_ID'));
    url.searchParams.set('mobile', target.replace('+', ''));
    url.searchParams.set('otp', code);
    url.searchParams.set('otp_expiry', String(Math.round(TTL / 60000)));
    const res = await fetch(url, { method: 'POST', headers: { authkey: env('MSG91_AUTH_KEY'), 'Content-Type': 'application/json' }, body: '{}' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.type === 'error') throw new Error(`MSG91: ${data.message || res.status}`);
    return { ref: data.request_id || null };
  }
  console.log(`\n[otp] ${channel.toUpperCase()} to ${target}: ${code}  (console provider — configure Twilio/MSG91/SMTP to deliver for real)\n`);
  return { ref: null };
}

/* ---------- rate limiting by IP ---------- */
const ipHits = new Map();
function ipAllowed(ip) {
  const now = Date.now();
  const list = (ipHits.get(ip) || []).filter((t) => now - t < 10 * 60000);
  if (list.length >= 20) return false;
  list.push(now);
  ipHits.set(ip, list);
  return true;
}

const hash = (target, code) => crypto.createHash('sha256').update(`${SECRET}|${target}|${code}`).digest('hex');

class OtpError extends Error {
  constructor(message, status = 400, extra = {}) { super(message); this.status = status; Object.assign(this, extra); }
}

/**
 * Send a code. destination: { phone, dialCode } or { email }, channel: sms | whatsapp | email
 */
async function sendCode({ phone, dialCode, email, channel = 'sms', lang, ip, purpose = 'login' }) {
  if (!PURPOSES.has(purpose)) throw new OtpError('Invalid code purpose.');
  const adapter = store.adapter();
  let target;
  if (channel === 'email') {
    if (!configured().email && !devMode()) throw new OtpError('Email codes aren\'t set up on this server yet. Please use your mobile number.');
    target = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) throw new OtpError('Please enter a valid email address.');
  } else {
    target = normalizePhone(phone, dialCode);
    if (!target) throw new OtpError('Please enter a valid mobile number, including the country code.');
    if (channel === 'whatsapp' && !['twilio_verify', 'twilio', 'console'].includes(smsProvider())) throw new OtpError('WhatsApp codes need Twilio. Please choose SMS.');
  }
  if (ip && !ipAllowed(ip)) throw new OtpError('Too many requests from your network. Please wait a few minutes.', 429);

  const now = Date.now();
  const key = keyFor(purpose, target);
  const existing = await adapter.otpGet(key);
  if (existing && now - Number(existing.last_sent_at) < COOLDOWN) {
    const wait = Math.ceil((COOLDOWN - (now - Number(existing.last_sent_at))) / 1000);
    throw new OtpError(`Please wait ${wait} seconds before asking for a new code.`, 429, { retryAfter: wait });
  }
  let windowStart = existing ? Number(existing.sends_window_start) : now;
  let sends = existing ? Number(existing.sends_in_window) : 0;
  if (now - windowStart > 3600000) { windowStart = now; sends = 0; }
  if (sends >= MAX_SENDS_PER_HOUR) throw new OtpError('You\'ve asked for too many codes. Please try again in an hour.', 429);

  // Email always runs through the email sender (real SMTP if SMTP_HOST is set, else the Ethereal
  // test mailbox). Phone channels use the configured SMS provider.
  let provider = channel === 'email' ? (configured().email ? 'smtp' : 'ethereal') : smsProvider();
  // Twilio Verify checks codes remotely per phone number (no purpose), so non-login codes go as plain SMS.
  if (provider === 'twilio_verify' && purpose !== 'login') {
    if (!configured().twilio) throw new OtpError('Approval codes need SMS sending (TWILIO_FROM) or email. Ask the patient to approve from their app.');
    provider = 'twilio';
  }
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  let result = {};
  try {
    result = await sendViaProvider(channel === 'email' ? 'email' : provider, { target, channel, code, lang, purpose });
  } catch (e) {
    console.error('[otp] delivery failed:', e.message);
    throw new OtpError('We couldn\'t send the code just now. Please check the number and try again.', 502);
  }
  await adapter.otpPut({
    target: key, code_hash: provider === 'twilio_verify' ? 'remote' : hash(key, code), channel, provider, attempts: 0,
    expires_at: now + TTL, last_sent_at: now, sends_window_start: windowStart, sends_in_window: sends + 1, provider_ref: result.ref || null,
  });
  return {
    target, channel, provider,
    masked: channel === 'email' ? maskEmail(target) : maskPhone(target),
    expiresIn: Math.round(TTL / 1000), resendIn: Math.round(COOLDOWN / 1000),
    // SMS/console dev shows the code; the Ethereal test mailbox shows a link to view the real email.
    devCode: devMode() && provider !== 'twilio_verify' && provider !== 'ethereal' && provider !== 'smtp' ? code : undefined,
    emailPreview: result.previewUrl || undefined,
  };
}

async function verifyCode({ target: plainTarget, code, purpose = 'login' }) {
  const adapter = store.adapter();
  if (!PURPOSES.has(purpose)) throw new OtpError('Invalid code purpose.');
  const target = plainTarget ? keyFor(purpose, String(plainTarget)) : null;
  const row = target ? await adapter.otpGet(target) : null;
  const clean = String(code || '').replace(/\D/g, '');
  if (!row) throw new OtpError('Please request a new code.');
  if (Date.now() > Number(row.expires_at)) { await adapter.otpDelete(target); throw new OtpError('This code has expired. Please request a new one.'); }
  if (Number(row.attempts) >= MAX_ATTEMPTS) { await adapter.otpDelete(target); throw new OtpError('Too many wrong attempts. Please request a new code.', 429); }
  await adapter.otpAttempt(target);

  let ok = false;
  if (row.provider === 'twilio_verify') {
    try {
      const r = await twilioRequest(`https://verify.twilio.com/v2/Services/${env('TWILIO_VERIFY_SERVICE_SID')}/VerificationCheck`, { To: plainTarget, Code: clean });
      ok = r.status === 'approved';
    } catch (e) { console.error('[otp] verify check failed:', e.message); }
  } else {
    const a = Buffer.from(hash(target, clean));
    const b = Buffer.from(row.code_hash);
    ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  if (!ok) {
    const left = MAX_ATTEMPTS - Number(row.attempts) - 1;
    throw new OtpError(left > 0 ? `That code isn't right. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Too many wrong attempts. Please request a new code.');
  }
  await adapter.otpDelete(target);
  return { target: String(plainTarget), channel: row.channel };
}

function publicConfig() {
  const c = configured();
  const sms = smsProvider();
  return {
    channels: ['sms', ...(['twilio_verify', 'twilio', 'console'].includes(sms) ? ['whatsapp'] : []), ...(c.email || devMode() ? ['email'] : [])],
    provider: sms,
    live: sms !== 'console',
    emailLive: c.email,
    devMode: devMode(),
    codeLength: 6,
    ttlSeconds: Math.round(TTL / 1000),
    resendSeconds: Math.round(COOLDOWN / 1000),
  };
}

module.exports = { sendCode, verifyCode, normalizePhone, samePhone, publicConfig, OtpError };
