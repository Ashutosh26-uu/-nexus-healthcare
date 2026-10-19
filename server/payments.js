// Payments.
//  • Razorpay (UPI, cards, netbanking) when RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET are set — orders are
//    created server-side and every payment is verified by its HMAC signature before anything is unlocked.
//  • Otherwise "demo": we show a real UPI QR (to UPI_VPA) and a clearly-labelled "mark as paid" button,
//    allowed only on demo networks (or with ALLOW_DEMO_PAYMENTS=true) so no one books free on a live site.
const crypto = require('crypto');

const keyId = () => process.env.RAZORPAY_KEY_ID || '';
const keySecret = () => process.env.RAZORPAY_KEY_SECRET || '';
const provider = () => (keyId() && keySecret() ? 'razorpay' : 'demo');

function demoAllowed(dataMode) {
  if (process.env.ALLOW_DEMO_PAYMENTS) return process.env.ALLOW_DEMO_PAYMENTS === 'true';
  return dataMode === 'demo';
}

async function createOrder({ amount, receipt, notes }) {
  if (provider() !== 'razorpay') return null;
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${Buffer.from(`${keyId()}:${keySecret()}`).toString('base64')}` },
    body: JSON.stringify({ amount: Math.round(amount * 100), currency: 'INR', receipt, notes }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.description || 'Could not start the payment. Please try again.');
  return { orderId: data.id };
}

function verifySignature({ orderId, paymentId, signature }) {
  if (!orderId || !paymentId || !signature) return false;
  const expected = crypto.createHmac('sha256', keySecret()).update(`${orderId}|${paymentId}`).digest('hex');
  const a = Buffer.from(expected); const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Standard UPI deep link — any UPI app (GPay, PhonePe, Paytm, BHIM) can scan the QR of this.
// Only when YOUR UPI ID is configured — never a guessed default, which could belong to a stranger.
function upiUri({ amount, ref, note }) {
  const vpa = process.env.UPI_VPA;
  if (!vpa) return null;
  const name = process.env.UPI_PAYEE_NAME || 'Nexus Healthcare';
  const am = Number(amount);
  if (!Number.isFinite(am) || am <= 0) return null; // never a QR for "₹NaN"
  const q = new URLSearchParams({ pa: vpa, pn: name, am: am.toFixed(2), cu: 'INR', tn: String(note || 'Nexus Healthcare').slice(0, 60), tr: String(ref || '') });
  return `upi://pay?${q.toString()}`;
}

function publicPayment(p, { dataMode }) {
  return {
    id: p.id, purpose: p.purpose, refId: p.refId, amount: p.amount, status: p.status, provider: p.provider, label: p.label,
    orderId: p.orderId || null, keyId: p.provider === 'razorpay' ? keyId() : null,
    upi: upiUri({ amount: p.amount, ref: p.id, note: p.label || 'Nexus Healthcare' }),
    demo: p.provider === 'demo', demoConfirmAllowed: p.provider === 'demo' && demoAllowed(dataMode), paidAt: p.paidAt || null,
    // Live network, real UPI ID, no gateway: the patient sends the UTR and the admin confirms (see /payments/:id/claim).
    manualConfirm: p.provider === 'demo' && Boolean(process.env.UPI_VPA) && !demoAllowed(dataMode),
    utr: p.utr || null, claimedAt: p.claimedAt || null, rejectReason: p.rejectReason || null,
    // Nexus credit (credits.js): `amount` is what's left to pay; `gross` is the price before credit.
    gross: p.gross ?? p.amount, creditApplied: p.creditApplied || 0, method: p.method || null,
  };
}

module.exports = { provider, createOrder, verifySignature, upiUri, publicPayment, demoAllowed };
