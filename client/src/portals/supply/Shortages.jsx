import { AlertOctagon, MapPin, Truck, CheckCircle2 } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Button, Empty, timeAgo, fmtNum } from '../../components/ui';

// No server endpoint lets a warehouse push stock unprompted (transfers start from the chemist's request,
// which then shows under Dispatch approvals) — so "Offer" is marked as coming soon rather than faked.
export default function Shortages({ home }) {
  const list = home.regionalShortages || [];

  return (
    <>
      <PageHeader title="Regional shortages" subtitle="Flagged by the supply engine when many pharmacies in one area ask for the same medicine. Chemists there can request your spare stock; offering it to them directly is coming soon." />
      {list.length === 0 ? (
        <div className="card"><Empty icon={CheckCircle2} title="No shortages flagged">Every district in your area has enough stock right now.</Empty></div>
      ) : (
        <div className="stack">
          {list.map((a) => {
            const inv = home.inventory.find((i) => i.drug === a.drug);
            const spare = inv ? Math.max(inv.qty - inv.safetyStock, 0) : 0;
            const suggest = Math.min(spare, 200);
            return (
              <article key={a.id} className="card sup-short">
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
                </div>
                <div className="sup-short-act">
                  <Button size="sm" icon={Truck} disabled title="Offering stock to a district is not available yet">{suggest ? `Offer ${fmtNum(suggest)} · coming soon` : 'No spare'}</Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
