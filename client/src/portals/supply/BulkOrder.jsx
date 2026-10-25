import { useState } from 'react';
import { Plus, Trash2, Wand2, Send, ClipboardList } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Card, Button, Field, Empty, StatusBadge, fmtDate, fmtNum, useAction, useToast } from '../../components/ui';
import { api } from '../../api';
import { COMMON_DRUGS } from '../pharmacy/stock';
import { localDay } from '../../dates';

let lineId = 0;
const mkLine = (drug = '', qty = '') => ({ id: ++lineId, drug, qty });

// Purchase orders are saved on the server (POST /distributor/purchase-orders) and listed from home.purchaseOrders.
// The app doesn't send them to the supplier yet — the screen says so instead of pretending it did.
export default function BulkOrder({ home, reload }) {
  const toast = useToast();
  const inAWeek = localDay(new Date(Date.now() + 7 * 86400000));
  const [supplier, setSupplier] = useState('');
  const [date, setDate] = useState(inAWeek);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([mkLine()]);
  const [run, busy] = useAction();
  const orders = home.purchaseOrders || [];

  const fillGaps = () => {
    const gaps = (home.forecast || [])
      .map((f) => {
        const inv = home.inventory.find((i) => i.drug === f.drug);
        const usable = inv ? Math.max(inv.qty - inv.safetyStock, 0) : 0;
        return { drug: f.drug, gap: f.next14d - usable };
      })
      .filter((g) => g.gap > 0)
      .map((g) => mkLine(g.drug, Math.ceil((g.gap * 1.2) / 100) * 100));
    if (!gaps.length) { toast('Forecast is fully covered — nothing to add'); return; }
    setLines(gaps);
    toast(`Added ${gaps.length} lines from forecast gaps (+20% buffer)`);
  };

  const update = (id, k, v) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, [k]: v } : l)));
  const valid = lines.filter((l) => l.drug && Number(l.qty) > 0);

  const submit = async (e) => {
    e.preventDefault();
    if (!valid.length) return;
    const po = await run('po', () => api.post('/distributor/purchase-orders', { supplier, deliverBy: date, notes, lines: valid.map((l) => ({ drug: l.drug, qty: Number(l.qty) })) }));
    if (!po) return;
    setLines([mkLine()]);
    setNotes('');
    toast(`${po.poNo} saved. Share this PO number with ${po.supplier} — sending it from the app is coming soon.`);
    reload();
  };
  const cancel = async (o) => {
    if (await run(o.id, () => api.post(`/distributor/purchase-orders/${o.id}/cancel`), `${o.poNo} cancelled`)) reload();
  };

  return (
    <>
      <PageHeader title="Bulk orders" subtitle="Raise a purchase order to a manufacturer or central store. Start from the forecast gaps so you don't miss anything." />
      <div className="grid side">
        <Card title="New purchase order" action={<Button size="sm" variant="soft" icon={Wand2} onClick={fillGaps}>Fill from forecast gaps</Button>}>
          <form className="stack" onSubmit={submit}>
            <div className="grid two" style={{ gap: 12 }}>
              <Field label="Supplier">
                <input className="input" value={supplier} onChange={(e) => setSupplier(e.target.value)} maxLength={120} placeholder="Supplier or central store name" required />
              </Field>
              <Field label="Deliver by"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
            </div>

            <div className="sup-lines">
              <div className="sup-line head"><span>Medicine / SKU</span><span>Quantity</span><span /></div>
              {lines.map((l) => (
                <div key={l.id} className="sup-line">
                  <input className="input sm" list="sup-drugs" value={l.drug} onChange={(e) => update(l.id, 'drug', e.target.value)} placeholder="e.g. ORS sachet" aria-label="Medicine" />
                  <input className="input sm" type="number" min="1" value={l.qty} onChange={(e) => update(l.id, 'qty', e.target.value)} placeholder="Units" aria-label="Quantity" />
                  <button type="button" className="icon-btn" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.id !== l.id) : [mkLine()]))} aria-label="Remove line"><Trash2 /></button>
                </div>
              ))}
              <datalist id="sup-drugs">{COMMON_DRUGS.map((d) => <option key={d} value={d} />)}</datalist>
              <button type="button" className="sup-add" onClick={() => setLines((ls) => [...ls, mkLine()])}><Plus size={15} /> Add line</button>
            </div>

            <Field label="Notes for supplier (optional)"><textarea className="textarea" style={{ minHeight: 70 }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Cold-chain items in insulated boxes with data loggers" /></Field>
            <div className="row between wrap">
              <span className="small muted">{valid.length} line{valid.length === 1 ? '' : 's'} · {fmtNum(valid.reduce((s, l) => s + Number(l.qty), 0))} units</span>
              <Button type="submit" icon={Send} loading={busy === 'po'} disabled={!valid.length || supplier.trim().length < 2}>Save purchase order</Button>
            </div>
            <p className="tiny muted mb-0">The order is saved here with a PO number. Sending it to the supplier from the app is coming soon.</p>
          </form>
        </Card>

        <Card title={<h3 className="row" style={{ gap: 8 }}><ClipboardList size={18} /> Recent orders</h3>}>
          {orders.length === 0 ? <Empty icon={ClipboardList} title="No purchase orders yet">Orders you save will be listed here.</Empty> : (
            <div className="list">
              {orders.map((o) => (
                <div key={o.id} className="list-item">
                  <div className="grow">
                    <strong className="small mono" dir="ltr">{o.poNo}</strong>
                    <div className="tiny muted" translate="no">{o.supplier}</div>
                    <div className="tiny muted">{o.lines.length} item{o.lines.length === 1 ? '' : 's'} · {fmtNum(o.units)} units{o.deliverBy ? ` · due ${fmtDate(o.deliverBy)}` : ''}</div>
                  </div>
                  <StatusBadge status={o.status} />
                  {o.status === 'raised' && <Button size="sm" variant="ghost" loading={busy === o.id} onClick={() => cancel(o)}>Cancel</Button>}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
