import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarX, PackageSearch, TrendingUp, ShoppingCart, Truck, Download, Printer, Sparkles } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Card, Button, Empty, Loading, Pills, StatusBadge, fmtMoney, fmtNum, fmtDate, useAction, useToast, cx } from '../../components/ui';
import { useLive } from '../../live';
import { api } from '../../api';

// Purchase list for the distributor when a request can't go through the network (or for the paper file).
function downloadCsv(rows, store) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['Medicine', 'In stock', 'Safety stock', 'Sold (30 days)', 'Order qty', 'Pack size', 'Unit'], ...rows.map((r) => [r.drug, r.stock, r.safetyStock, r.sold30d, r.suggest, r.pack, r.unit])];
  const blob = new Blob([`${lines.map((l) => l.map(esc).join(',')).join('\n')}\n`], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `purchase-list-${(store || 'store').replace(/\W+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

export default function Insights({ home, reload }) {
  const live = useLive('/pharmacy/stock-insights', ['pharmacy', 'medorders', 'supply', 'prescriptions']);
  const [window_, setWindow] = useState(30);
  const data = live.data;
  if (live.loading && !data) return <Loading />;
  if (!data) return <Card><Empty title="Couldn't load stock insights">{live.error || 'Please refresh in a moment.'}</Empty></Card>;
  const exp = data.expiring.find((e) => e.days === window_) || data.expiring[0];
  const refresh = () => { live.reload(); reload?.(); };

  return (
    <div className="ph-insights">
      <PageHeader title="Stock insights" subtitle="What's about to expire, what's below safety stock, what sells fastest — and what to reorder, worked out from the last 30 days of sales." />

      <div className="ph-kpis">
        {data.expiring.map((e) => (
          <button type="button" key={e.days} className={cx('card ph-kpi', window_ === e.days && 'on')} onClick={() => setWindow(e.days)}>
            <span className="tiny muted">Expiring within {e.days} days</span>
            <strong>{fmtMoney(e.valueAtRisk)}</strong>
            <span className="tiny muted">{e.count} batch{e.count === 1 ? '' : 'es'} at risk</span>
          </button>
        ))}
        <div className="card ph-kpi">
          <span className="tiny muted">Below safety stock</span>
          <strong>{data.belowSafety.length}</strong>
          <span className="tiny muted">medicines</span>
        </div>
      </div>

      <Reorder data={data} store={home.pharmacy?.name} onDone={refresh} />

      <div className="grid two mt-2">
        <Card title={<h3 className="row" style={{ gap: 8 }}><CalendarX size={18} /> Expiring</h3>} action={<Pills value={window_} onChange={setWindow} options={data.expiring.map((e) => ({ value: e.days, label: `${e.days} d` }))} />}>
          {exp.items.length === 0 ? <Empty title={`Nothing expires in ${exp.days} days`}>Your shelves are fresh.</Empty> : (
            <div className="list">
              {exp.items.map((i) => (
                <div key={i.id} className="list-item">
                  <div className="grow" style={{ minWidth: 0 }}>
                    <strong className="small" translate="no">{i.drug}</strong>
                    <div className="tiny muted">Batch <span className="mono">{i.batch}</span> · {fmtNum(i.qty)} units · {i.daysLeft < 0 ? 'expired' : `expires ${fmtDate(i.expiry)}`}</div>
                  </div>
                  <span className={cx('badge', i.daysLeft <= 30 ? 'rose' : 'sun')}>{i.value === null ? 'No price' : fmtMoney(i.value)}</span>
                </div>
              ))}
            </div>
          )}
          {exp.unpriced > 0 && <p className="tiny muted mb-0 mt-1">{exp.unpriced} item{exp.unpriced > 1 ? 's have' : ' has'} no catalogue price and {exp.unpriced > 1 ? 'are' : 'is'} not in the value.</p>}
        </Card>

        <div className="stack">
          <Card title={<h3 className="row" style={{ gap: 8 }}><TrendingUp size={18} /> Fast movers <span className="tiny muted">· last 30 days</span></h3>}>
            {data.fastMovers.length === 0 ? <Empty title="No sales in the last 30 days">Packed orders and dispensed prescriptions show up here.</Empty> : (
              <div className="list">
                {data.fastMovers.map((m) => (
                  <div key={m.drug} className="list-item">
                    <div className="grow" style={{ minWidth: 0 }}>
                      <strong className="small" translate="no">{m.drug}</strong>
                      <div className="tiny muted">{fmtNum(m.sold30d)} sold · ~{m.perDay}/day · {fmtNum(m.stock)} in stock</div>
                    </div>
                    {m.daysCover !== null && <span className={cx('badge', m.daysCover < 7 ? 'rose' : m.daysCover < 21 ? 'sun' : 'green')}>{m.daysCover} days left</span>}
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card title={<h3 className="row" style={{ gap: 8 }}><PackageSearch size={18} /> Below safety stock</h3>}>
            {data.belowSafety.length === 0 ? <Empty title="Nothing below safety stock">Nice — well stocked.</Empty> : (
              <div className="list">
                {data.belowSafety.map((i) => (
                  <div key={i.id} className="list-item">
                    <strong className="small grow" translate="no">{i.drug}</strong>
                    <span className="tiny muted">{fmtNum(i.qty)} / safety {fmtNum(i.safetyStock)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Reorder({ data, store, onDone }) {
  const [run, busy] = useAction();
  const toast = useToast();
  const [qty, setQty] = useState({});
  const [noSource, setNoSource] = useState([]);
  const rows = data.reorder.map((r) => ({ ...r, suggest: Number(qty[r.drug] ?? r.suggest) || 0 }));
  const request = (r) => run(`req-${r.drug}`, async () => {
    try {
      const t = await api.post('/transfers/request', { drug: r.drug, qty: r.suggest });
      toast(`Requested ${r.suggest} × ${t.drug} from ${t.fromName} (${t.tierName})`);
      onDone();
    } catch (e) {
      // Nobody on the network has spare stock — keep it on the purchase list for the distributor instead.
      setNoSource((l) => [...new Set([...l, r.drug])]);
      throw e;
    }
  });
  return (
    <Card title={<h3 className="row" style={{ gap: 8 }}><ShoppingCart size={18} /> Reorder suggestions <span className="badge">{rows.length}</span></h3>}
      action={rows.length > 0 && (
        <div className="row wrap no-print" style={{ gap: 6 }}>
          <Button size="sm" variant="ghost" icon={Download} onClick={() => downloadCsv(rows.filter((r) => !r.pending), store)}>Purchase list (CSV)</Button>
          <Button size="sm" variant="ghost" icon={Printer} onClick={() => window.print()}>Print</Button>
        </div>
      )}>
      <p className="tiny muted mt-0"><Sparkles size={12} style={{ verticalAlign: '-2px' }} /> Order = 30-day sales × {data.leadTimeFactor} (a month of cover plus the distributor&apos;s lead time) − stock, rounded up to whole packs. Below-safety items with no recent sales are topped up to twice the safety level.</p>
      {rows.length === 0 ? <Empty title="Nothing to reorder">Stock covers the next month at the current sales rate.</Empty> : (
        <div className="list">
          {rows.map((r) => (
            <div key={r.drug} className="list-item ph-reorder">
              <div className="grow" style={{ minWidth: 0 }}>
                <strong className="small" translate="no">{r.drug}</strong>
                <div className="tiny muted">{fmtNum(r.stock)} in stock · safety {fmtNum(r.safetyStock)} · {r.reason}{r.pack > 1 ? ` · packs of ${r.pack}` : ''}</div>
                {noSource.includes(r.drug) && <div className="tiny" style={{ color: 'var(--rose)' }}>No spare stock on the network — added to the purchase list for your distributor.</div>}
              </div>
              {r.pending ? (
                <Link to="/pharmacy/transfers" className="ph-pending"><Truck size={14} /> <StatusBadge status={r.pending.status} /> <span className="tiny muted">{r.pending.qty} requested</span></Link>
              ) : (
                <div className="row ph-reorder-act" style={{ gap: 6 }}>
                  <input className="input sm" type="number" min={r.pack} step={r.pack} value={r.suggest} onChange={(e) => setQty((q) => ({ ...q, [r.drug]: e.target.value }))} aria-label={`Quantity of ${r.drug} to order`} />
                  <Button size="sm" icon={Truck} loading={busy === `req-${r.drug}`} disabled={!(r.suggest > 0)} onClick={() => request(r)}>Request from distributor</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
