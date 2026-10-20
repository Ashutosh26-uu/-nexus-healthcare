// Sehatra credit + Refer & earn.
//  • Credit is a rupee ledger (collection `credits`, one row per change; balance = sum of rows). Every positive
//    row is a "lot" that expires CREDIT_DAYS after it was earned; spends use the soonest-expiring lot first.
//  • A referral pays nothing at sign-up (fake accounts are free to make) — both people get REFERRAL_AMOUNT
//    only when the invited person completes their first consult / lab booking paid with real money.
//  • Every change is audited: in live mode this is money-equivalent.
// All sums are computed here, server-side; a client can only ever say "use my credit: yes / no".
const crypto = require('crypto');
const store = require('./db');
const { samePhone } = require('./otp');

const CREDIT_DAYS = 180;
const REFERRAL_AMOUNT = 50;
const REFERRAL_CAP = 20; // rewarded referrals per referrer (the invited friend still gets theirs past the cap)
const PURPOSES = new Set(['consult', 'lab_advance', 'med_order_advance']); // what credit can pay for
const MIN_GATEWAY = 1; // Razorpay / UPI can't take less than ₹1 — a remainder is either 0 or ≥ ₹1
const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — read aloud and typed from WhatsApp
const CODE_LEN = 7; // 32^7 ≈ 34 billion: not guessable by walking the space
const SYSTEM = { id: 'system', name: 'Sehatra', role: 'system' };

const r2 = (x) => Math.round(Number(x) * 100) / 100;
const nowIso = () => new Date().toISOString();
const db = () => store.get();
const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || 'A friend';
let hooks = { audit: () => {}, notify: () => {} };
const init = (h) => { hooks = { ...hooks, ...h }; };

const selfPatientId = (d, userId) => d.patients.find((p) => p.userId === userId)?.id || null;
function log(d, actor, userId, row) {
  hooks.audit(actor || SYSTEM, `credit_${row.reason}`, selfPatientId(d, userId), 'credit', `${row.amount > 0 ? '+' : ''}₹${row.amount} · ${row.reason}${row.refId ? ` · ${row.refId}` : ''} · user ${userId}`);
}
function add(d, actor, userId, amount, reason, refId, extra = {}) {
  if (!d.credits) d.credits = [];
  if (!Number.isFinite(Number(amount)) || !amount || typeof userId !== 'string') throw new Error(`bad credit row (${userId}, ${amount})`);
  const at = nowIso();
  const row = { id: store.id('cr'), userId, amount: r2(amount), reason, refId: refId || null, at, ...(amount > 0 ? { expiresAt: new Date(Date.now() + CREDIT_DAYS * 86400000).toISOString() } : {}), ...extra };
  d.credits.push(row);
  log(d, actor, userId, row);
  return row;
}

// Replay a user's rows: what is left of each earned lot (FIFO by expiry).
function lotsOf(d, userId) {
  const rows = (d.credits || []).filter((c) => c.userId === userId);
  const lots = [];
  for (const c of rows) {
    if (c.amount > 0) { lots.push({ id: c.id, left: c.amount, expiresAt: c.expiresAt }); continue; }
    let need = -c.amount;
    const order = c.reason === 'expired' ? [...lots.filter((l) => l.id === c.refId), ...lots.filter((l) => l.id !== c.refId)] : [...lots].sort((a, b) => (a.expiresAt < b.expiresAt ? -1 : 1));
    for (const l of order) { if (need <= 0) break; const take = Math.min(l.left, need); l.left = r2(l.left - take); need = r2(need - take); }
  }
  return { rows, lots };
}

// Write 'expired' rows for whatever is left of lots past their date; returns the live balance (never < 0).
function balance(d, userId) {
  const { lots } = lotsOf(d, userId);
  const now = nowIso();
  for (const l of lots) if (l.left > 0 && l.expiresAt && l.expiresAt <= now) { add(d, SYSTEM, userId, -l.left, 'expired', l.id); l.left = 0; }
  return r2(Math.max(0, lots.reduce((s, l) => s + l.left, 0)));
}

// Spend up to `want` (synchronously — the caller never awaits between this and recording the payment).
function spend(d, actor, userId, want, refId) {
  const bal = balance(d, userId);
  const amount = r2(Math.min(bal, want));
  if (amount <= 0) return 0;
  const { lots } = lotsOf(d, userId);
  let need = amount; let lotExpiresAt = null;
  for (const l of [...lots].sort((a, b) => (a.expiresAt < b.expiresAt ? -1 : 1))) {
    if (need <= 0) break; if (l.left <= 0) continue;
    need = r2(need - Math.min(l.left, need)); lotExpiresAt = l.expiresAt;
  }
  add(d, actor, userId, -amount, 'used', refId, { lotExpiresAt });
  return amount;
}

// Give back credit spent on a payment that never went through (void / expired / refunded). Same expiry as the
// lots it came from (at least 7 more days) — so a book-and-cancel loop can't keep stretching it.
function giveBack(d, actor, pay, why) {
  if (!(pay.creditApplied > 0) || pay.creditReturned) return 0;
  const used = (d.credits || []).find((c) => c.reason === 'used' && c.refId === pay.id && c.userId === pay.userId);
  const exp = new Date(Math.max(Date.parse(used?.lotExpiresAt || 0) || 0, Date.now() + 7 * 86400000)).toISOString();
  const row = add(d, actor, pay.userId, pay.creditApplied, 'refund', pay.id, { note: why });
  row.expiresAt = exp;
  pay.creditReturned = row.at;
  return pay.creditApplied;
}

// How much credit this payment may take: all of it, or leave at least ₹1 for the gateway.
function coverable(gross, bal) {
  if (bal >= gross) return gross;
  return r2(Math.max(0, Math.min(bal, gross - MIN_GATEWAY)));
}

// ---------- referral codes ----------
const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
function codeFor(d, user) {
  if (user.referralCode) return user.referralCode;
  let code;
  do { code = Array.from({ length: CODE_LEN }, () => CODE_ABC[crypto.randomInt(CODE_ABC.length)]).join(''); } while (d.users.some((u) => u.referralCode === code));
  user.referralCode = code;
  return code;
}
const referrerByCode = (d, code) => {
  const c = normCode(code);
  return c.length >= 6 ? d.users.find((u) => u.referralCode === c && ['patient', 'caregiver'].includes(u.role) && u.status !== 'suspended') || null : null;
};
// Gmail ignores dots and +tags — "a.b+x@gmail.com" is the same inbox as "ab@gmail.com".
function normEmail(e) {
  let [local, dom] = String(e || '').toLowerCase().trim().split('@');
  if (!dom) return local || '';
  local = local.split('+')[0];
  if (dom === 'gmail.com' || dom === 'googlemail.com') { local = local.replace(/\./g, ''); dom = 'gmail.com'; }
  return `${local}@${dom}`;
}
// At sign-up: who invited this new account (null = no / invalid / self-referral). Never throws.
function referralAtSignup(d, code, { email, phone }) {
  if (!code) return { referrer: null };
  const ref = referrerByCode(d, code);
  if (!ref) return { referrer: null, reason: 'unknown_code' };
  if ((phone && ref.phone && samePhone(ref.phone, phone)) || (email && ref.email && normEmail(ref.email) === normEmail(email))) return { referrer: null, reason: 'self' };
  return { referrer: ref };
}

// Called from finalizePayment for a consult / lab advance: the invited person's first booking paid with
// real money (not credit) earns both of them REFERRAL_AMOUNT, once.
function rewardReferral(d, pay) {
  if (!['consult', 'lab_advance'].includes(pay.purpose) || pay.method === 'credit' || !(pay.amount >= MIN_GATEWAY)) return;
  const u = d.users.find((x) => x.id === pay.userId);
  if (!u || !u.referredBy || u.referralRewarded) return;
  const ref = d.users.find((x) => x.id === u.referredBy);
  u.referralRewarded = nowIso(); u.referralPaymentId = pay.id;
  pay.referralQualified = true;
  add(d, SYSTEM, u.id, REFERRAL_AMOUNT, 'referral_welcome', pay.id);
  hooks.notify(u.id, `You earned ₹${REFERRAL_AMOUNT} Sehatra credit 🎉`, `Thanks for joining with ${firstName(ref?.name)}'s invite. Use it on your next consult, lab test or medicines within ${CREDIT_DAYS} days.`);
  const rewarded = ref ? d.users.filter((x) => x.referredBy === ref.id && x.referrerCredited).length : REFERRAL_CAP;
  if (ref && ref.status !== 'suspended' && rewarded < REFERRAL_CAP) {
    u.referrerCredited = true;
    add(d, SYSTEM, ref.id, REFERRAL_AMOUNT, 'referral_bonus', u.id);
    hooks.notify(ref.id, `You earned ₹${REFERRAL_AMOUNT} Sehatra credit 🎉`, `${firstName(u.name)} joined with your invite and booked their first visit. Thank you for spreading the word!`);
  }
}

// Undo a referral reward whose qualifying payment was refunded (book → pay → cancel for a full refund would
// otherwise mint ₹100 per fake account). Takes back at most what's left — a balance never goes below 0.
function reverseReferral(d, pay) {
  const u = d.users.find((x) => x.id === pay.userId);
  pay.referralReversed = nowIso();
  if (!u || u.referralPaymentId !== pay.id) return;
  const takeBack = (userId, refId) => { const amt = Math.min(REFERRAL_AMOUNT, balance(d, userId)); if (amt > 0) add(d, SYSTEM, userId, -amt, 'reversed', refId); };
  takeBack(u.id, pay.id);
  if (u.referrerCredited && u.referredBy) takeBack(u.referredBy, u.id);
  u.referralRewarded = null; u.referrerCredited = false; u.referralPaymentId = null; // the next real paid visit qualifies again
}

// Settle credit tied to payments that didn't go through. Cheap single pass; safe to call often.
function sweep(d, actor) {
  let n = 0;
  for (const pay of d.payments) {
    if (!pay.creditApplied && !pay.referralQualified) continue;
    const refunded = ['refund_pending', 'refunded'].includes(pay.status);
    if (pay.creditApplied > 0 && !pay.creditReturned) {
      let why = null;
      if (pay.status === 'void') why = 'Payment cancelled or expired';
      else if (refunded) why = pay.refundReason || 'Refunded';
      else if (pay.status === 'paid' && pay.purpose === 'med_order_advance') {
        const o = d.medOrders?.find((x) => x.id === pay.refId);
        if (o && ['cancelled', 'declined'].includes(o.status) && o.refundDue > 0) {
          why = 'Medicine order cancelled';
          o.refundDue = r2(Math.max(0, o.refundDue - pay.creditApplied)); // that part comes back as credit, not cash
          o.refundCredit = pay.creditApplied;
        }
      }
      if (why) {
        giveBack(d, actor, pay, why); n += 1;
        if (pay.status === 'refund_pending' && !(pay.amount > 0)) pay.status = 'refunded'; // all-credit: nothing for finance to pay out
      }
    }
    if (pay.referralQualified && refunded && !pay.referralReversed) { reverseReferral(d, pay); n += 1; }
  }
  return n;
}

function history(d, userId) {
  return (d.credits || []).filter((c) => c.userId === userId).slice(-60).reverse()
    .map(({ id, amount, reason, at, expiresAt }) => ({ id, amount, reason, at, expiresAt: amount > 0 ? expiresAt : null }));
}

function invitedBy(d, user) {
  return d.users.filter((u) => u.referredBy === user.id).slice(-100).reverse()
    .map((u) => ({ firstName: firstName(u.name), joinedAt: u.createdAt, status: u.referrerCredited ? 'earned' : u.referralRewarded ? 'capped' : 'joined' }));
}

module.exports = { init, CREDIT_DAYS, REFERRAL_AMOUNT, REFERRAL_CAP, PURPOSES, MIN_GATEWAY, SYSTEM, r2, balance, spend, giveBack, coverable, codeFor, referrerByCode, referralAtSignup, rewardReferral, sweep, history, invitedBy, firstName, normCode };
