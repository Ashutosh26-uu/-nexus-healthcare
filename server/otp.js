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

let warnedProvider = '';
function smsProvider() {
  const want = env('OTP_PROVIDER') || 'auto';
  const c = configured();
  if (want !== 'auto') {
    if (want === 'console') return 'console';
    if (c[want]) return want;
    // A typo in OTP_PROVIDER must not take the whole site down — SMS is simply off (users are offered email).
    if (warnedProvider !== want) { warnedProvider = want; console.error(`[otp] OTP_PROVIDER=${want} but its credentials are missing — SMS codes are OFF until this is fixed.`); }
    return 'console';
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
// One-time codes go by email only (product decision). Set OTP_EMAIL_ONLY=false to bring SMS/WhatsApp back
// once a gateway is connected — the provider code below is kept for that.
const emailOnly = () => env('OTP_EMAIL_ONLY') !== 'false';
// The console "provider" only prints the code in the server log — that is a real channel in dev mode
// (the code is shown on screen) and no channel at all otherwise.
const smsOn = (sms = smsProvider()) => !emailOnly() && (sms !== 'console' || devMode());
// WhatsApp needs Twilio Verify, or Twilio Messaging with a WhatsApp-enabled sender.
const whatsappOn = (sms = smsProvider()) => !emailOnly() && (sms === 'twilio_verify' ? true : sms === 'twilio' ? Boolean(env('TWILIO_WHATSAPP_FROM') || env('TWILIO_FROM')) : sms === 'console' && devMode());
// Locales Twilio Verify renders its own message in; anything else must fall back to English, not fail the send.
const VERIFY_LOCALES = new Set(['af', 'ar', 'ca', 'cs', 'da', 'de', 'el', 'en', 'es', 'fi', 'fr', 'he', 'hi', 'hu', 'id', 'it', 'ja', 'ko', 'ms', 'nb', 'nl', 'pl', 'pt', 'ro', 'ru', 'sv', 'th', 'tl', 'tr', 'vi', 'zh']);
const verifyLocale = (lang) => { const l = String(lang || 'en').toLowerCase().split('-')[0]; return VERIFY_LOCALES.has(l) ? l : 'en'; };

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
    // "919876543210" is +91 already written out — but Indian mobiles are exactly 10 digits and some start
    // with 91 (e.g. 9198765432), so a 10-digit number under +91 is national, never "+91" + 8 digits.
    if (digits.startsWith(dc) && digits.length > dc.length + 6 && !(dc === '91' && digits.length === 10)) digits = `+${digits}`;
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
  en: (c, m) => `${c} is your Sehatra verification code. It expires in ${m} minutes. Never share it with anyone.`,
  hi: (c, m) => `${c} आपका Sehatra सत्यापन कोड है। यह ${m} मिनट में समाप्त होगा। इसे किसी से साझा न करें।`,
  bn: (c, m) => `${c} আপনার Sehatra যাচাইকরণ কোড। এটি ${m} মিনিটে শেষ হবে। কাউকে জানাবেন না।`,
  ta: (c, m) => `${c} உங்கள் Sehatra சரிபார்ப்புக் குறியீடு. ${m} நிமிடங்களில் காலாவதியாகும். யாருடனும் பகிர வேண்டாம்.`,
  te: (c, m) => `${c} మీ Sehatra ధృవీకరణ కోడ్. ఇది ${m} నిమిషాల్లో ముగుస్తుంది. ఎవరితోనూ పంచుకోకండి.`,
  mr: (c, m) => `${c} हा तुमचा Sehatra पडताळणी कोड आहे. तो ${m} मिनिटांत संपेल. कोणालाही सांगू नका.`,
  ur: (c, m) => `${c} آپ کا Sehatra تصدیقی کوڈ ہے۔ یہ ${m} منٹ میں ختم ہو جائے گا۔ کسی کو نہ بتائیں۔`,
  es: (c, m) => `${c} es tu código de verificación de Sehatra. Caduca en ${m} minutos. No lo compartas.`,
  fr: (c, m) => `${c} est votre code de vérification Sehatra. Il expire dans ${m} minutes. Ne le partagez jamais.`,
  ar: (c, m) => `${c} هو رمز التحقق الخاص بك من Sehatra. تنتهي صلاحيته خلال ${m} دقائق. لا تشاركه مع أحد.`,
  pt: (c, m) => `${c} é o seu código de verificação Sehatra. Expira em ${m} minutos. Não o partilhe.`,
};
const messageFor = (code, lang, purpose = 'login') => (purpose === 'consent'
  ? `${code} is your Sehatra approval code. Share it only with the doctor in front of you to let them see your records and write a prescription. It cannot be used to sign in. Valid ${Math.round(TTL / 60000)} min.`
  : purpose === 'kiosk'
    ? `${code} is your Sehatra kiosk check-in code. Tell it to the kiosk operator only if you are at the kiosk right now — it opens your Health Passport there. Valid ${Math.round(TTL / 60000)} min. Not you? Ignore this email; nothing is shared without the code.`
  : purpose === 'reset'
    ? `${code} is your Sehatra code to set a new password. It expires in ${Math.round(TTL / 60000)} minutes. If you didn't ask to change your password, ignore this email — your password stays the same.`
    : (MESSAGES[String(lang || 'en').split('-')[0]] || MESSAGES.en)(code, Math.round(TTL / 60000)));
const SUBJECTS = { kiosk: (c) => `${c} — check in at the kiosk (Sehatra)`, consent: (c) => `${c} — approve your doctor (Sehatra)`, reset: (c) => `${c} — set a new password (Sehatra)`, login: (c) => `${c} — your Sehatra code` };
// Codes are stored per purpose, so a code sent for one thing (e.g. a patient approving a doctor, or
// changing a password) can never be redeemed for another (e.g. signing in as that patient).
const PURPOSES = new Set(['login', 'consent', 'reset', 'kiosk']);
// Addresses that are not real inboxes: demo accounts (and phone-only patients' "…@patient.omnicare.in")
// plus the reserved example/test domains. A real mail server must never send codes there.
const DEMO_EMAIL = /@(([a-z0-9-]+\.)*omnicare\.in|example\.(com|org|net)|[a-z0-9.-]+\.(test|invalid|example|localhost))$/i;
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // only ever run on input of ≤ 254 chars (RFC 5321 limit)
const keyFor = (purpose, target) => {
  if (String(target).includes('|')) throw new OtpError('Please enter a valid email address.');
  return purpose === 'login' ? target : `${purpose}|${target}`;
};

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

const smtpTransport = (nodemailer) => nodemailer.createTransport({ host: env('SMTP_HOST'), port: Number(env('SMTP_PORT') || 587), secure: env('SMTP_SECURE') === 'true', auth: env('SMTP_USER') ? { user: env('SMTP_USER'), pass: env('SMTP_PASS') } : undefined });
const MAIL_FROM = () => env('SMTP_FROM') || 'Sehatra <no-reply@nexushealthcare.in>';

async function sendViaProvider(provider, { target, channel, code, lang, purpose }) {
  if (channel === 'email') {
    let nodemailer;
    try { nodemailer = require('nodemailer'); } catch { throw new Error('Email OTP needs the "nodemailer" package.'); }
    const realSmtp = Boolean(env('SMTP_HOST'));
    const transport = realSmtp ? smtpTransport(nodemailer) : await getEtherealTransport(nodemailer);
    const text = messageFor(code, lang, purpose);
    const info = await transport.sendMail({
      from: MAIL_FROM(), to: target, subject: (SUBJECTS[purpose] || SUBJECTS.login)(code), text,
      html: `<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;border:1px solid #e6dfd3;border-radius:14px"><h2 style="color:#0f5c4d;margin:0 0 8px">Sehatra</h2><p>${text.replace(code, '')}</p><p style="font-size:32px;letter-spacing:8px;font-weight:bold;color:#1d2b2a;margin:16px 0">${code}</p><p style="color:#6f7c78;font-size:12px">If you didn't ask for this, you can ignore this email.</p></div>`,
    });
    return { ref: info.messageId, previewUrl: realSmtp ? null : nodemailer.getTestMessageUrl(info) };
  }
  if (provider === 'twilio_verify') {
    const r = await twilioRequest(`https://verify.twilio.com/v2/Services/${env('TWILIO_VERIFY_SERVICE_SID')}/Verifications`, { To: target, Channel: channel === 'whatsapp' ? 'whatsapp' : 'sms', Locale: verifyLocale(lang) });
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
  // Never print a live code in production logs (AppSail keeps them) — dev only.
  if (process.env.NODE_ENV === 'production') { console.warn('[otp] console provider used in production — no gateway configured; code not shown.'); return { ref: null }; }
  console.log(`\n[otp] ${channel.toUpperCase()} to ${target}: ${code}  (console provider — configure Twilio/MSG91/SMTP to deliver for real)\n`);
  return { ref: null };
}

/* ---------- rate limiting by IP ---------- */
const IP_WINDOW = 10 * 60000;
const ipHits = new Map();
function ipAllowed(ip) {
  const now = Date.now();
  const list = (ipHits.get(ip) || []).filter((t) => now - t < IP_WINDOW);
  if (list.length >= 20) return false;
  list.push(now);
  ipHits.set(ip, list);
  return true;
}
// Forget addresses that fell silent, or the map grows with every IP that ever asked for a code.
setInterval(() => { const cutoff = Date.now() - IP_WINDOW; for (const [ip, list] of ipHits) if (!list.some((t) => t > cutoff)) ipHits.delete(ip); }, IP_WINDOW).unref?.();

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
  let placeholder = false;
  if (channel !== 'email' && emailOnly()) throw new OtpError('We send one-time codes by email only. Please enter your email address.');
  if (channel === 'email') {
    if (!configured().email && !devMode()) throw new OtpError('Email codes aren\'t set up on this server yet. Please contact support.', 503);
    target = String(email || '').trim().toLowerCase();
    // Length first: the pattern below is quadratic on long dot-heavy input (a 2 MB body would block the event loop).
    if (target.length > 254 || !EMAIL_OK.test(target)) throw new OtpError('Please enter a valid email address.');
    // Placeholder addresses are never mailed. In dev mode the code is shown on screen instead (demo accounts
    // keep working locally); on a live server they are refused.
    placeholder = DEMO_EMAIL.test(target);
    if (placeholder && !devMode()) throw new OtpError('That address can\'t receive email. Please use your own email address.');
  } else {
    // Without a gateway the code would only be printed in the server log and the user would wait for a
    // text that never comes. Refuse before anything is counted or stored.
    if (!smsOn()) throw new OtpError('Text-message codes aren\'t switched on yet — please use your email address instead.', 503);
    if (channel === 'whatsapp' && !whatsappOn()) throw new OtpError('WhatsApp codes aren\'t available here yet. Please choose SMS or email.');
    target = normalizePhone(phone, dialCode);
    if (!target) throw new OtpError('Please enter a valid mobile number, including the country code.');
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
  let provider = channel === 'email' ? (placeholder ? 'dev' : configured().email ? 'smtp' : 'ethereal') : smsProvider();
  // The Ethereal test mailbox hands a preview link (containing the code) back to whoever asked — never in production.
  if (provider === 'ethereal' && process.env.NODE_ENV === 'production') throw new OtpError('Email codes aren\'t set up on this server yet. Please contact support.', 503);
  // Twilio Verify checks codes remotely per phone number (no purpose), so non-login codes go as plain SMS.
  if (provider === 'twilio_verify' && purpose !== 'login') {
    if (!configured().twilio) throw new OtpError('Approval codes need SMS sending (TWILIO_FROM) or email. Ask the patient to approve from their app.');
    provider = 'twilio';
  }
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  let result = {};
  try {
    if (provider !== 'dev') result = await sendViaProvider(channel === 'email' ? 'email' : provider, { target, channel, code, lang, purpose });
  } catch (e) {
    console.error('[otp] delivery failed:', e.message);
    throw new OtpError(channel === 'email' ? 'We couldn\'t send the email just now. Please check the address and try again.' : 'We couldn\'t send the code just now. Please check the number and try again.', 502);
  }
  await adapter.otpPut({
    target: key, code_hash: provider === 'twilio_verify' ? 'remote' : hash(key, code), channel, provider, attempts: 0,
    expires_at: now + TTL, last_sent_at: now, sends_window_start: windowStart, sends_in_window: sends + 1, provider_ref: result.ref || null,
  });
  return {
    target, channel, provider,
    masked: channel === 'email' ? maskEmail(target) : maskPhone(target),
    expiresIn: Math.round(TTL / 1000), resendIn: Math.round(COOLDOWN / 1000),
    // Dev mode shows the code when nothing was really delivered (placeholder address, console SMS); the
    // Ethereal test mailbox shows a link to view the real email instead.
    devCode: devMode() && (provider === 'dev' || provider === 'console') ? code : undefined,
    emailPreview: process.env.NODE_ENV === 'production' ? undefined : result.previewUrl || undefined,
  };
}

// Keep the row (send counter, cooldown window) but make the code unusable.
async function burn(adapter, target, row) {
  await adapter.otpPut({
    target, code_hash: 'burned', channel: row.channel, provider: row.provider, attempts: MAX_ATTEMPTS, expires_at: 0,
    last_sent_at: Number(row.last_sent_at) || 0, sends_window_start: Number(row.sends_window_start) || Date.now(), sends_in_window: Number(row.sends_in_window) || 0, provider_ref: row.provider_ref || null,
  });
}

// A hard daily ceiling on wrong guesses per address, across every code and purpose. The per-code limit
// (MAX_ATTEMPTS) plus the resend cap already bound an hour; this stops someone requesting code after code
// all day to grind through the space (for a patient the code is the only factor). Resets on a correct code
// and at the UTC day boundary; in memory, which is enough — a restart only makes it stricter.
const DAILY_FAIL_MAX = Number(process.env.OTP_DAILY_FAIL_MAX || 25);
const dailyFails = new Map(); // plainTarget → { day, n }
const dayNow = () => Math.floor(Date.now() / 86400000);
function dailyGuard(plainTarget) {
  const e = dailyFails.get(plainTarget);
  if (e && e.day === dayNow() && e.n >= DAILY_FAIL_MAX) throw new OtpError('Too many incorrect codes today. Please try again tomorrow, or contact support.', 429);
}
function dailyFail(plainTarget) {
  const d = dayNow();
  const e = dailyFails.get(plainTarget);
  dailyFails.set(plainTarget, e && e.day === d ? { day: d, n: e.n + 1 } : { day: d, n: 1 });
  if (dailyFails.size > 50000) dailyFails.delete(dailyFails.keys().next().value);
}

async function verifyCode({ target: given, code, purpose = 'login' }) {
  const adapter = store.adapter();
  if (!PURPOSES.has(purpose)) throw new OtpError('Invalid code purpose.');
  // Codes were stored under the normalised destination (lower-case email / E.164 phone) — look them up the
  // same way, so "9876500002" and "+91 98765 00002" both find the code, and Twilio Verify always gets E.164.
  const raw = String(given || '').trim();
  const plainTarget = !raw ? '' : raw.includes('@') ? raw.toLowerCase() : (normalizePhone(raw) || raw);
  const target = plainTarget ? keyFor(purpose, plainTarget) : null;
  if (plainTarget) dailyGuard(plainTarget);
  const row = target ? await adapter.otpGet(target) : null;
  const clean = String(code || '').replace(/\D/g, '');
  if (!row) throw new OtpError('Please request a new code.');
  if (row.code_hash === 'burned') throw new OtpError('Please request a new code.');
  if (Date.now() > Number(row.expires_at)) { await burn(adapter, target, row); throw new OtpError('This code has expired. Please request a new one.'); }
  // Count the attempt atomically in the database and judge by the value it returns: a check on `row.attempts`
  // alone let many parallel guesses all read the same count before any increment landed.
  const used = Number(await adapter.otpAttempt(target) ?? Number(row.attempts) + 1);
  if (Number(row.attempts) >= MAX_ATTEMPTS || used > MAX_ATTEMPTS) { await burn(adapter, target, row); throw new OtpError('Too many wrong attempts. Please request a new code.', 429); }

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
    if (plainTarget) dailyFail(plainTarget);
    const left = MAX_ATTEMPTS - used;
    throw new OtpError(left > 0 ? `That code isn't right. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Too many wrong attempts. Please request a new code.');
  }
  dailyFails.delete(plainTarget);
  await adapter.otpDelete(target);
  return { target: plainTarget, channel: row.channel };
}

function publicConfig() {
  const c = configured();
  const sms = smsProvider();
  const dev = devMode();
  return {
    // Only channels that can actually deliver: SMS/WhatsApp need a gateway (or dev mode, where the code is shown on screen).
    channels: [...(smsOn(sms) ? ['sms'] : []), ...(whatsappOn(sms) ? ['whatsapp'] : []), ...(c.email || dev ? ['email'] : [])],
    emailOnly: emailOnly(),
    provider: sms,
    live: !emailOnly() && sms !== 'console',
    emailLive: c.email,
    devMode: dev,
    ...(smsOn(sms) ? {} : { smsReason: emailOnly() ? 'email_only' : 'no_gateway' }),
    codeLength: 6,
    ttlSeconds: Math.round(TTL / 1000),
    resendSeconds: Math.round(COOLDOWN / 1000),
  };
}

// Plain notification email (visit reminders, "prescription ready"…). Same SMTP settings as codes, but never the
// Ethereal test mailbox and never a placeholder/demo address. Without SMTP_HOST nothing is sent (dev logs it).
// Never throws — a reminder email failing must not break the request or the sweeper that sent it.
async function sendMail({ to, subject, text, html }) {
  const target = String(to || '').trim().toLowerCase();
  if (target.length > 254 || !EMAIL_OK.test(target) || DEMO_EMAIL.test(target)) return { sent: false, reason: 'not_a_real_inbox' };
  // Header values: callers build subjects from stored names — never let a newline reach the mail headers.
  subject = String(subject || '').replace(/[\r\n]+/g, ' ').slice(0, 250);
  if (!configured().email) {
    if (process.env.NODE_ENV !== 'production') console.log(`[mail] (no SMTP_HOST — not sent) to ${maskEmail(target)}: ${subject}`);
    return { sent: false, reason: 'no_smtp' };
  }
  try {
    const info = await smtpTransport(require('nodemailer')).sendMail({ from: MAIL_FROM(), to: target, subject, text, html });
    return { sent: true, ref: info.messageId };
  } catch (e) {
    console.error('[mail] delivery failed:', e.message);
    return { sent: false, reason: 'smtp_error' };
  }
}

module.exports = { sendCode, verifyCode, normalizePhone, samePhone, publicConfig, OtpError, sendMail, maskEmail };
