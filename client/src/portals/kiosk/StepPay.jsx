import { useEffect, useMemo, useState } from 'react';
import { Printer, Smartphone, Banknote, BadgeIndianRupee, ArrowRight, Check } from 'lucide-react';
import { useLive } from '../../live';
import { cx, PreviewBadge } from '../../components/ui';
import { usePublicConfig } from '../../config';
import { useKiosk } from './context';
import { KButton, StepFrame } from './KUi';
import Slip from './Slip';

/* Demo network only: a QR-looking pattern that is NOT a payable code. A live kiosk never shows it. */
function MockQR({ seed = 'omnicare', size = 29 }) {
  const cells = useMemo(() => {
    let h = [...seed].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
    const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100) / 100; };
    const out = [];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const finder = (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7);
      if (finder) {
        const fx = x >= size - 7 ? x - (size - 7) : x;
        const fy = y >= size - 7 ? y - (size - 7) : y;
        const ring = fx === 0 || fy === 0 || fx === 6 || fy === 6 || (fx >= 2 && fx <= 4 && fy >= 2 && fy <= 4);
        if (ring) out.push([x, y]);
      } else if (rnd() > 0.52) out.push([x, y]);
    }
    return out;
  }, [seed, size]);
  return (
    <svg viewBox={`-2 -2 ${size + 4} ${size + 4}`} className="k-qrsvg" role="img" aria-label="UPI QR code">
      <rect x="-2" y="-2" width={size + 4} height={size + 4} fill="#fff" />
      {cells.map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width="1.02" height="1.02" fill="#1d2b2a" />)}
    </svg>
  );
}

export default function StepPay() {
  const { t, say, flow, setFlow, kiosk } = useKiosk();
  const { data: c } = useLive(flow.consultId ? `/consults/${flow.consultId}` : null, ['prescriptions', 'consults', `consult:${flow.consultId}`]);
  // Kiosk payments aren't wired to a gateway yet: on a live kiosk there is no UPI QR and nothing is "recorded".
  const demo = usePublicConfig()?.demo === true;
  const [method, setMethod] = useState(flow.payment?.method || 'pilot');
  const [paid, setPaid] = useState(Boolean(flow.payment?.done));
  const [printed, setPrinted] = useState(false);

  useEffect(() => { say('pay_title');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doPrint = () => { setPrinted(true); setTimeout(() => window.print(), 50); };
  const confirm = () => { setPaid(true); setFlow({ payment: { method, done: true } }); };

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
              { id: 'upi', icon: Smartphone, label: 'UPI', sub: demo ? 'Any UPI app' : 'Coming soon', off: !demo },
              { id: 'cash', icon: Banknote, label: 'Cash', sub: 'Give to operator' },
            ].map((m) => (
              <button key={m.id} type="button" className={cx('k-paym', method === m.id && 'on')} disabled={m.off} aria-disabled={m.off || undefined} onClick={() => { if (m.off) return; setMethod(m.id); setPaid(false); }}>
                <m.icon /><strong>{m.label}</strong><span>{m.sub}</span>
              </button>
            ))}
          </div>
          {!demo && <p className="k-fine"><PreviewBadge>Coming soon</PreviewBadge> UPI payment at the kiosk isn&apos;t connected yet.</p>}
          {demo && method === 'upi' && (
            <div className="k-upi fade-in">
              <MockQR seed={flow.consultId || 'oc'} />
              <div>
                <strong>Demo QR — not a real payment code</strong>
                <span className="k-fine">On the demo network nothing is charged.</span>
              </div>
            </div>
          )}
          {method === 'cash' && <p className="k-fine">Operator: collect the cash and give your own receipt — kiosk cash isn&apos;t recorded in Nexus Healthcare yet.</p>}
          {paid ? (
            <div className="k-paid fade-in"><Check />{method === 'pilot' ? 'All set — nothing to pay today.' : 'Noted. Thank you!'}</div>
          ) : (
            <KButton icon={Check} onClick={confirm}>{method === 'pilot' ? 'Confirm' : method === 'upi' ? 'Payment received' : 'Cash collected'}</KButton>
          )}
        </div>
      </div>
    </StepFrame>
  );
}
