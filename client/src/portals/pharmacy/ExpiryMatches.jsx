import { useState } from 'react';
import { ArrowRightLeft, CalendarX, Check, MapPin } from 'lucide-react';
import { Button, Card, cx, fmtDate, useAction } from '../../components/ui';
import { useLive } from '../../live';
import { api } from '../../api';

// Expiring soon? Send it where it sells: for each batch expiring within 90 days, nearby stores that will sell
// it before it expires (from their own recent sales) or have run low. One tap offers it; they accept or decline.
export default function ExpiryMatches() {
  const { data, reload } = useLive('/pharmacy/expiry-matches', ['pharmacy', 'supply']);
  const items = (data?.items || []).filter((i) => i.offered || i.matches.length);
  if (!items.length) return null;
  return (
    <Card className="ex-card" title={<h3 className="row" style={{ gap: 8 }}><ArrowRightLeft size={18} /> Expiring soon? Send it where it sells</h3>}>
      <p className="small muted mt-0">These stores near you will sell these medicines before they expire, or have run low. Offer the batch — they accept or decline, and a rider picks it up as usual.</p>
      <div className="ex-list">
        {items.map((i) => <Row key={i.id} i={i} onDone={reload} />)}
      </div>
    </Card>
  );
}

function Row({ i, onDone }) {
  const [run, busy] = useAction();
  const [qty, setQty] = useState({});
  const offer = async (m) => {
    const n = Number(qty[m.id] ?? m.suggestQty);
    if (await run(`of-${m.id}`, () => api.post('/pharmacy/expiry-offer', { inventoryId: i.id, toId: m.id, qty: n }), `Offered ${n} × ${i.drug} to ${m.name}`)) onDone();
  };
  return (
    <div className="ex-item">
      <div className="ex-head">
        <strong className="small" translate="no">{i.drug}</strong>
        <span className="tiny muted">{i.qty} units · batch <span className="mono">{i.batch || '—'}</span></span>
        <span className={cx('badge', i.daysLeft <= 30 ? 'rose' : 'sun')}><CalendarX size={12} /> {i.daysLeft} days · {fmtDate(i.expiry)}</span>
      </div>
      {i.offered ? (
        <div className="tiny ex-done"><Check size={13} /> Offered — see Transfers for their reply.</div>
      ) : i.matches.map((m) => (
        <div key={m.id} className="ex-match">
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="small"><strong>{m.name}</strong> <span className="tiny muted"><MapPin size={11} /> {m.km != null ? `${m.km} km` : m.district}</span></div>
            <div className="tiny muted">{m.why}</div>
          </div>
          <input className="input sm ex-qty" type="number" min={1} max={i.qty} value={qty[m.id] ?? m.suggestQty} onChange={(e) => setQty((q) => ({ ...q, [m.id]: e.target.value }))} aria-label={`Units to offer ${m.name}`} />
          <Button size="sm" loading={busy === `of-${m.id}`} onClick={() => offer(m)}>Offer</Button>
        </div>
      ))}
    </div>
  );
}
