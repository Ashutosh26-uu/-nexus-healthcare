import { useState } from 'react';
import { ShieldCheck, Smartphone, CreditCard, CheckCircle2, Info } from 'lucide-react';
import { api } from '../../api';
import { Button, fmtMoney, safeUrl } from '../../components/ui';
import QR from '../../components/QR';
import { useAuth } from '../../auth';

let rzpLoading = null;
const loadRazorpay = () => {
  if (window.Razorpay) return Promise.resolve();
  if (!rzpLoading) {
    rzpLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://checkout.razorpay.com/v1/checkout.js';
      s.onload = resolve; s.onerror = () => { rzpLoading = null; reject(new Error('Could not load the payment window. Check your connection.')); };
      document.head.appendChild(s);
    });
  }
  return rzpLoading;
};

const isMobile = () => /android|iphone|ipad|ipod/i.test(navigator.userAgent);

// Pay for a consult or a delivery. Razorpay (real money, signature-verified on our server) when the
// keys are configured; otherwise a real UPI QR plus a clearly-labelled demo confirmation.
// `onError(err)` lets the parent offer a way forward — a 409 means the booking can no longer be paid for
// (time passed, cancelled, changed), so paying again can't work.
export default function PaymentStep({ payment, onPaid, onError, breakdown }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const confirm = async (body = {}) => {
    setBusy(true); setError('');
    try {
      const r = await api.post(`/payments/${payment.id}/confirm`, body);
      if (r.status === 'paid') onPaid(r);
    } catch (e) { setError(e.message); onError?.(e); } finally { setBusy(false); }
  };

  const payRazorpay = async () => {
    if (busy) return; // a second tap while checkout.js loads would open two checkout windows
    setError(''); setBusy(true);
    try {
      await loadRazorpay();
      const rzp = new window.Razorpay({
        key: payment.keyId, order_id: payment.orderId, amount: Math.round(payment.amount * 100), currency: 'INR',
        name: 'Nexus Healthcare', description: payment.label,
        prefill: { name: user?.name, email: user?.email, contact: user?.phone },
        theme: { color: '#0f5c4d' },
        handler: (resp) => confirm(resp),
      });
      rzp.on('payment.failed', (r) => setError(r?.error?.description || 'Payment failed. No money was taken — please try again.'));
      rzp.open();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="pt-pay">
      <div className="pt-pay-amount">
        <span className="tiny muted">{payment.label}</span>
        <strong>{fmtMoney(payment.amount)}</strong>
        {breakdown && <span className="tiny muted">Medicines {fmtMoney(breakdown.medicines)} + delivery {fmtMoney(breakdown.deliveryFee)}</span>}
      </div>

      {payment.provider === 'razorpay' ? (
        <div className="stack" style={{ alignItems: 'center' }}>
          <Button size="lg" variant="clay" icon={CreditCard} loading={busy} onClick={payRazorpay}>Pay {fmtMoney(payment.amount)} securely</Button>
          <span className="tiny muted">UPI · cards · netbanking · wallets — via Razorpay</span>
        </div>
      ) : (
        <div className="pt-pay-upi">
          {payment.upi ? <QR value={payment.upi} size={176} label="UPI payment QR" /> : <div className="pt-pay-noqr tiny">UPI QR appears here once the clinic&apos;s UPI ID is set up</div>}
          <div className="stack" style={{ gap: 6 }}>
            <strong className="small">{payment.upi ? 'Scan with any UPI app' : 'Pay by UPI'}</strong>
            <span className="tiny muted">Google Pay · PhonePe · Paytm · BHIM</span>
            {safeUrl(payment.upi, ['upi:']) && isMobile() && <a className="btn sm secondary" href={safeUrl(payment.upi, ['upi:'])}><Smartphone size={15} /> Open my UPI app</a>}
            {payment.demo && (
              <div className="pt-pay-demo tiny"><Info size={13} /> <span><strong>Demo payments</strong> — online payments aren&apos;t connected yet, so no money moves. {payment.demoConfirmAllowed ? 'Tap below to continue.' : 'Please contact support to complete this booking.'}</span></div>
            )}
            {payment.demoConfirmAllowed && <Button icon={CheckCircle2} loading={busy} onClick={() => confirm()}>I&apos;ve paid — continue</Button>}
          </div>
        </div>
      )}
      {error && <div className="form-error mt-1">{error}</div>}
      <p className="tiny muted center mb-0"><ShieldCheck size={12} style={{ verticalAlign: '-2px' }} /> Payments are verified on our server before your booking is confirmed.</p>
    </div>
  );
}
