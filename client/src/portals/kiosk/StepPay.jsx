import { useEffect, useState } from 'react';
import { Printer, Smartphone, Banknote, BadgeIndianRupee, ArrowRight, Check } from 'lucide-react';
import { api } from '../../api';
import { useLive } from '../../live';
import QR from '../../components/QR';
import { cx, useAction } from '../../components/ui';
import { usePublicConfig } from '../../config';
import { useKiosk } from './context';
import { KButton, StepFrame } from './KUi';
import Slip from './Slip';

export default function StepPay() {
  const { t, say, flow, setFlow, kiosk } = useKiosk();
  const { data: c } = useLive(flow.consultId ? `/consults/${flow.consultId}` : null, ['prescriptions', 'consults', `consult:${flow.consultId}`]);
  // UPI is offered only when the network has its UPI ID set (UPI_VPA): then the QR is a real, payable code for
  // the amount the operator enters, recorded once the operator sees success on the patient's phone. Every QR a
  // kiosk shows is real — without a UPI ID it offers cash instead of a look-alike.
  const realUpi = usePublicConfig()?.upi === true;
  const [amount, setAmount] = useState('');
  const [upi, setUpi] = useState(null);
  const [run, busy] = useAction();
  const makeQr = async () => {
    const r = await run('qr', () => api.post('/kiosk/upi', { consultId: flow.consultId, amount: Number(amount), note: 'Kiosk visit' }));
    if (r) setUpi(r);
  };
  const [method, setMethod] = useState(flow.payment?.method || 'pilot');
  const [paid, setPaid] = useState(Boolean(flow.payment?.done));
  const [printed, setPrinted] = useState(false);

  useEffect(() => { say('pay_title');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doPrint = () => { setPrinted(true); setTimeout(() => window.print(), 50); };
  const confirm = async () => {
    if (method === 'upi') {
      const r = await run('confirm', () => api.post(`/kiosk/upi/${upi.id}/confirm`), 'Payment recorded');
      if (!r) return;
    }
    setPaid(true); setFlow({ payment: { method, done: true, ...(upi && method === 'upi' ? { id: upi.id, amount: upi.amount } : {}) } });
  };

  return (
    <StepFrame
      title={t('pay_title')}
      sub={c?.prescription ? `${c.prescription.items.length} medicine${c.prescription.items.length > 1 ? 's' : ''} from ${c.doctorName}. Take the printed slip to the pharmacy.` : 'Here is the summary of your visit.'}
      wide
      actions={<KButton icon={ArrowRight} className="xl" disabled={!paid} onClick={() => setFlow({ step: 6 })}>{t('next')}</KButton>}
    >
      <div className="k-pay">
        <div className="k-pay-slip">
          {c ? <Slip kind="rx" kiosk={kiosk} patient={flow.patient} consult={c} /> : <div className="k-center"><span className="k-spin big" /></div>}
          <KButton variant="secondary" icon={printed ? Check : Printer} onClick={doPrint}>{printed ? 'Printed — print again' : t('print')}</KButton>
        </div>

        <div className="k-pay-side">
          <div className="k-pilot">
            <BadgeIndianRupee />
            <div>
              <strong>No charge at the kiosk</strong>
              <span>There is no consultation fee to collect here. Medicines are paid for at the pharmacy.</span>
            </div>
          </div>
          <span className="k-field-l">How will you pay for anything extra?</span>
          <div className="k-paymethods">
            {[
              { id: 'pilot', icon: BadgeIndianRupee, label: 'Nothing to pay', sub: 'No fee today' },
              { id: 'upi', icon: Smartphone, label: 'UPI', sub: realUpi ? 'Any UPI app' : 'Not set up', off: !realUpi },
              { id: 'cash', icon: Banknote, label: 'Cash', sub: 'Give to operator' },
            ].map((m) => (
              <button key={m.id} type="button" className={cx('k-paym', method === m.id && 'on')} disabled={m.off} aria-disabled={m.off || undefined} onClick={() => { if (m.off) return; setMethod(m.id); setPaid(false); setUpi(null); }}>
                <m.icon /><strong>{m.label}</strong><span>{m.sub}</span>
              </button>
            ))}
          </div>
          {!realUpi && <p className="k-fine">UPI isn&apos;t set up on this network yet — the admin adds the network&apos;s UPI ID to turn it on. Cash works meanwhile.</p>}
          {realUpi && method === 'upi' && !paid && (
            upi ? (
              <div className="k-upi fade-in">
                <QR value={upi.upi} size={180} label={`UPI QR for ₹${upi.amount}`} />
                <div>
                  <strong>Scan with any UPI app to pay ₹{upi.amount}</strong>
                  <span className="k-fine">Operator: tap “Payment received” only after the patient&apos;s app shows success.</span>
                  <button type="button" className="btn ghost sm" onClick={() => setUpi(null)}>Change amount</button>
                </div>
              </div>
            ) : (
              <div className="k-upi fade-in">
                <label className="k-field-l" htmlFor="k-upi-amt">Amount (₹)</label>
                <input id="k-upi-amt" className="input" type="number" inputMode="decimal" min="1" max="20000" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <KButton icon={Smartphone} disabled={!(Number(amount) >= 1 && Number(amount) <= 20000) || busy === 'qr'} onClick={makeQr}>Show UPI QR</KButton>
              </div>
            )
          )}
          {method === 'cash' && <p className="k-fine">Operator: collect the cash and give your own receipt — kiosk cash isn&apos;t recorded in Nexus Healthcare yet.</p>}
          {paid ? (
            <div className="k-paid fade-in"><Check />{method === 'pilot' ? 'All set — nothing to pay today.' : 'Noted. Thank you!'}</div>
          ) : (
            <KButton icon={Check} disabled={method === 'upi' && (!upi || busy === 'confirm')} onClick={confirm}>{method === 'pilot' ? 'Confirm' : method === 'upi' ? 'Payment received' : 'Cash collected'}</KButton>
          )}
        </div>
      </div>
    </StepFrame>
  );
}
