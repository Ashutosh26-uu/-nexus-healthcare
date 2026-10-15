// Transfer helpers shared by the Pharmacy and Supply portals.
import { Check, X, Truck, AlertTriangle } from 'lucide-react';
import { Button, useAction, fmtNum, cx } from '../../components/ui';
import { api } from '../../api';
import { isColdChain } from './stock';
import './pharmacy.css';

const FLOW = ['requested', 'accepted', 'dispatched', 'delivered'];
const FLOW_LABEL = { requested: 'Requested', accepted: 'Accepted', dispatched: 'On the way', delivered: 'Delivered' };

export function TransferProgress({ status }) {
  if (status === 'declined') return <div className="tr-progress declined"><X size={14} /> Declined by the source</div>;
  const idx = FLOW.indexOf(status);
  return (
    <div className="tr-progress">
      {FLOW.map((s, i) => (
        <span key={s} className={cx('tr-step', i <= idx && 'done', i === idx && 'current')}>
          <span className="tr-dot">{i < idx || status === 'delivered' ? <Check size={11} /> : null}</span>
          <span className="tr-label">{FLOW_LABEL[s]}</span>
        </span>
      ))}
    </div>
  );
}

/* Accept / decline / dispatch controls for the facility that holds the stock. */
export function SourceActions({ t, inv, reload, who = 'you' }) {
  const [run, busy] = useAction();
  const after = inv ? inv.qty - t.qty : null;
  const breach = inv && after < (inv.safetyStock || 0);
  const act = async (action, msg) => {
    const ok = await run(action, () => api.post(`/transfers/${t.id}/${action}`), msg);
    if (ok) reload();
  };

  return (
    <div className="tr-source">
      {inv && ['requested', 'accepted'].includes(t.status) && (
        <div className={cx('tr-impact tiny', breach && 'warn')}>
          {breach ? <AlertTriangle size={13} /> : null}
          {fmtNum(inv.qty)} in stock → {fmtNum(Math.max(after, 0))} after sending · safety {fmtNum(inv.safetyStock)}
          {breach && <strong> — would go below safety stock</strong>}
        </div>
      )}
      {!inv && ['requested', 'accepted'].includes(t.status) && <div className="tr-impact tiny warn"><AlertTriangle size={13} /> {who === 'you' ? "You don't" : "The warehouse doesn't"} stock this item</div>}
      <div className="row wrap" style={{ gap: 8, justifyContent: 'flex-end' }}>
        {t.status === 'requested' && (
          <>
            <Button size="sm" variant="ghost" icon={X} loading={busy === 'decline'} onClick={() => act('decline', 'Declined — the supply engine will look for another source')}>Decline</Button>
            <Button size="sm" icon={Check} loading={busy === 'accept'} onClick={() => act('accept', 'Accepted. Pack it, then mark dispatched.')}>Accept</Button>
          </>
        )}
        {t.status === 'accepted' && (
          <Button size="sm" variant="clay" icon={Truck} loading={busy === 'dispatch'} onClick={() => act('dispatch', `Dispatched — a rider is assigned${isColdChain(t.drug) ? ' with a cold box' : ''}`)}>Mark dispatched</Button>
        )}
        {t.status === 'dispatched' && <span className="small muted row" style={{ gap: 6 }}><Truck size={15} /> With the rider</span>}
      </div>
    </div>
  );
}
