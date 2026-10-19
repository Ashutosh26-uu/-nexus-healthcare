import { useState } from 'react';
import { AlertOctagon, MapPin, Truck, CheckCircle2 } from 'lucide-react';
import { api } from '../../api';
import { PageHeader } from '../../components/PortalLayout';
import { Button, Empty, useAction, timeAgo, fmtNum } from '../../components/ui';

// "Offer" sends spare stock (above safety level) to the verified chemist in that district who has least of it.
// It becomes an accepted transfer, so it carries on under Dispatch approvals like any chemist's request.
function OfferRow({ a, inv, reload }) {
  const spare = inv ? Math.max(inv.qty - inv.safetyStock, 0) : 0;
  const [qty, setQty] = useState(Math.min(spare, 200));
  const [run, busy] = useAction();
  const offered = (a.actions || []).filter((x) => /^Offered /.test(x.action || ''));
  const offer = async () => {
    const r = await run('offer', () => api.post('/supply/offers', { alertId: a.id, qty: Number(qty) }), 'Offer sent — dispatch it from Dispatch approvals');
    if (r) { reload?.(); }
  };
  return (
    <article className="card sup-short">
      <span className="sup-short-icon"><AlertOctagon size={20} /></span>
      <div className="grow">
        <div className="row wrap" style={{ gap: 8 }}>
          <strong translate="no">{a.drug}</strong>
          <span className="badge rose">Shortage</span>
          <span className="tiny muted">{a.confidence != null ? `${Math.round(a.confidence * 100)}% confidence · ` : ''}{timeAgo(a.createdAt)}</span>
        </div>
        <div className="small muted row" style={{ gap: 6 }}><MapPin size={13} /> {a.district}, {a.state} · pin {a.pincode}</div>
        <p className="small mb-0 mt-1">{a.message}</p>
        <div className="tiny mt-1">{inv ? <>You hold <strong>{fmtNum(inv.qty)}</strong> · <strong>{fmtNum(spare)}</strong> spare above safety stock</> : <span className="muted">Not stocked in this warehouse</span>}</div>
        {offered.map((x, i) => <div key={i} className="tiny mt-1" style={{ color: 'var(--green-700, #1f7a4d)' }}><CheckCircle2 size={12} style={{ verticalAlign: '-2px' }} /> {x.by}: {x.action} · {timeAgo(x.at)}</div>)}
      </div>
      <div className="sup-short-act">
        {spare > 0 ? (
          <div className="row" style={{ gap: 6 }}>
            <input className="input" type="number" min="1" max={spare} value={qty} onChange={(e) => setQty(e.target.value)} aria-label={`Quantity of ${a.drug} to offer`} style={{ width: 90 }} />
            <Button size="sm" icon={Truck} loading={busy === 'offer'} disabled={!(Number(qty) >= 1 && Number(qty) <= spare)} onClick={offer}>Offer</Button>
          </div>
        ) : <Button size="sm" disabled>No spare</Button>}
      </div>
    </article>
  );
}

export default function Shortages({ home, reload }) {
  const list = home.regionalShortages || [];

  return (
    <>
      <PageHeader title="Regional shortages" subtitle="Flagged by the supply engine when many pharmacies in one area ask for the same medicine. Offer your spare stock and it goes to the chemist there who needs it most — then dispatch it from Dispatch approvals." />
      {list.length === 0 ? (
        <div className="card"><Empty icon={CheckCircle2} title="No shortages flagged">Every district in your area has enough stock right now.</Empty></div>
      ) : (
        <div className="stack">
          {list.map((a) => <OfferRow key={a.id} a={a} inv={home.inventory.find((i) => i.drug === a.drug)} reload={reload} />)}
        </div>
      )}
    </>
  );
}
