import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PackageSearch, CalendarX, Sparkles, Truck, Undo2, Megaphone } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Card, Button, Empty, StatusBadge, fmtNum, fmtDate, useAction, useToast } from '../../components/ui';
import { api } from '../../api';
import { expiryInfo, stockLevel, suggestQty } from './stock';
import Advisory from './Advisory';

const ADVISORY_DRUGS = {
  Dengue: ['ORS sachet', 'Paracetamol 500mg', 'Dengue NS1 rapid kit', 'Platelet count kit'],
  default: ['ORS sachet', 'Paracetamol 500mg', 'Cetirizine 10mg'],
};

const RETURN_REASON = { near_expiry: 'Near expiry', expired: 'Expired', damaged: 'Damaged', recalled: 'Recalled' };

export default function Alerts({ home, reload }) {
  const openReq = (drug) => home.transfersIn.find((t) => t.drug.toLowerCase() === drug.toLowerCase() && ['requested', 'accepted', 'dispatched'].includes(t.status));
  const low = [...home.lowStock].sort((a, b) => a.qty / (a.safetyStock || 1) - b.qty / (b.safetyStock || 1));
  const expiring = [...home.expiring].sort((a, b) => new Date(a.expiry) - new Date(b.expiry));

  const adviceDrugs = [...new Set(home.advisories.flatMap((a) => ADVISORY_DRUGS[a.disease] || ADVISORY_DRUGS.default))];

  return (
    <>
      <PageHeader title="Stock alerts" subtitle="What's running out and what's about to expire, with a suggested reorder for each. One tap sends the request to the nearest store or warehouse with spare stock." />
      <Advisory advisories={home.advisories} linkToAlerts={false} />

      {adviceDrugs.length > 0 && (
        <Card className="mb-2" title={<h3 className="row" style={{ gap: 8 }}><Megaphone size={18} /> Stock up for the outbreak</h3>} action={<span className="tiny muted">Suggested by the district advisory</span>}>
          <div className="ph-advice-grid">
            {adviceDrugs.map((drug) => {
              const inv = home.inventory.find((i) => i.drug.toLowerCase() === drug.toLowerCase());
              const item = inv || { drug, qty: 0, safetyStock: 20 };
              return <ReorderRow key={drug} item={item} pending={openReq(drug)} reload={reload} boost compact />;
            })}
          </div>
        </Card>
      )}

      <div className="grid two">
        <Card title={<h3 className="row" style={{ gap: 8 }}><PackageSearch size={18} /> Low stock <span className="badge rose">{low.length}</span></h3>}>
          {low.length === 0 ? <Empty title="Nothing below safety stock">Nice — your shelves are well stocked.</Empty> : (
            <div className="list">{low.map((i) => <ReorderRow key={i.id} item={i} pending={openReq(i.drug)} reload={reload} />)}</div>
          )}
        </Card>

        <Card title={<h3 className="row" style={{ gap: 8 }}><CalendarX size={18} /> Expiring soon <span className="badge sun">{expiring.length}</span></h3>}>
          {expiring.length === 0 ? <Empty title="No near-expiry stock">Nothing expires in the next 60 days.</Empty> : (
            <div className="list">{expiring.map((i) => <ExpiryRow key={i.id} item={i} reload={reload} />)}</div>
          )}
        </Card>
      </div>

      {(home.returns || []).length > 0 && (
        <Card className="mt-2" title={<h3 className="row" style={{ gap: 8 }}><Undo2 size={18} /> Returns <span className="badge">{home.returns.length}</span></h3>} action={<span className="tiny muted">Set aside for the distributor</span>}>
          <div className="list">
            {home.returns.map((r) => (
              <div key={r.id} className="list-item">
                <div className="grow">
                  <strong className="small" translate="no">{r.drug}</strong>
                  <div className="tiny muted">Batch <span className="mono">{r.batch || '—'}</span> · {fmtNum(r.qty)} units · {RETURN_REASON[r.reason] || r.reason}</div>
                  <div className="tiny muted">{fmtDate(r.createdAt)} · by {r.createdByName}</div>
                </div>
                <span className="badge sun">Set aside</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

function ReorderRow({ item, pending, reload, boost, compact }) {
  const [run, busy] = useAction();
  const toast = useToast();
  const [qty, setQty] = useState(() => (boost ? Math.max(suggestQty(item), 100) : suggestQty(item)));
  const lvl = stockLevel(item);

  const request = async () => {
    const t = await run('req', () => api.post('/transfers/request', { drug: item.drug, qty: Number(qty) }));
    if (t) { toast(`Requested ${qty} × ${t.drug} from ${t.fromName} (${t.tierName})`); reload(); }
  };

  return (
    <div className={`list-item ph-reorder ${compact ? 'compact' : ''}`}>
      <div className="grow">
        <strong className="small" translate="no">{item.drug}</strong>
        <div className="tiny muted">
          <span className={`lvl-${lvl.key}`}>{fmtNum(item.qty)} left</span> · safety {fmtNum(item.safetyStock)}
        </div>
      </div>
      {boost && !pending && lvl.key === 'ok' && item.qty >= (item.safetyStock || 0) * 3 ? (
        <span className="badge green">Well stocked</span>
      ) : pending ? (
        <Link to="/pharmacy/transfers" className="ph-pending">
          <Truck size={14} /> <StatusBadge status={pending.status} /> <span className="tiny muted">{pending.qty} from {pending.fromName}</span>
        </Link>
      ) : (
        <div className="row ph-reorder-act" style={{ gap: 6 }}>
          {!compact && <span className="tiny muted ph-suggest"><Sparkles size={12} /> Suggest</span>}
          <input className="input sm" type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} aria-label={`Quantity of ${item.drug} to request`} />
          <Button size="sm" variant={boost ? 'secondary' : undefined} loading={busy === 'req'} disabled={!(Number(qty) > 0)} onClick={request}>Request</Button>
        </div>
      )}
    </div>
  );
}

// "Return" records the batch on the server (GET/POST /pharmacy/returns) and takes those units off the sellable shelf.
function ExpiryRow({ item, reload }) {
  const [run, busy] = useAction();
  const ex = expiryInfo(item.expiry);
  const setAside = async () => {
    const r = await run('ret', () => api.post('/pharmacy/returns', { inventoryId: item.id, qty: item.qty, reason: ex.days < 0 ? 'expired' : 'near_expiry' }), `${item.drug} (${item.batch}) set aside for return — ${item.qty} units taken off the shelf`);
    if (r) reload();
  };
  return (
    <div className="list-item">
      <div className="grow">
        <strong className="small" translate="no">{item.drug}</strong>
        <div className="tiny muted">Batch <span className="mono">{item.batch}</span> · {fmtNum(item.qty)} units</div>
        <div className="tiny muted mt-1">{ex.days <= 30 ? 'Return to the distributor for credit before it lapses.' : 'Move to the front shelf and dispense first.'}</div>
      </div>
      <span className={`badge ${ex.tone}`}>{ex.label}</span>
      <Button size="sm" variant="ghost" icon={Undo2} loading={busy === 'ret'} onClick={setAside}>Return</Button>
    </div>
  );
}
