import { useState } from 'react';
import { Plus, Trash2, Wand2, Send, ClipboardList } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Card, Button, Field, StatusBadge, fmtDate, fmtNum, useToast } from '../../components/ui';
import { COMMON_DRUGS } from '../pharmacy/stock';

const SUPPLIERS = ['BPPI — Jan Aushadhi central store', 'HLL Lifecare Ltd', 'Cipla Ltd, Lucknow depot', 'J Mitra & Co (diagnostic kits)', 'Mankind Pharma, Kanpur C&F'];

let lineId = 0;
const mkLine = (drug = '', qty = '') => ({ id: ++lineId, drug, qty });

export default function BulkOrder({ home }) {
  const toast = useToast();
  const inAWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const [supplier, setSupplier] = useState(SUPPLIERS[0]);
  const [date, setDate] = useState(inAWeek);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([mkLine()]);
  const [sending, setSending] = useState(false);
  const [orders, setOrders] = useState([
    { id: 'PO-2026-0412', supplier: SUPPLIERS[1], items: 3, units: 42000, date: new Date(Date.now() + 3 * 86400000).toISOString(), status: 'confirmed' },
    { id: 'PO-2026-0398', supplier: SUPPLIERS[0], items: 5, units: 18500, date: new Date(Date.now() - 6 * 86400000).toISOString(), status: 'delivered' },
  ]);

  const fillGaps = () => {
    const gaps = home.forecast
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

  const submit = (e) => {
    e.preventDefault();
    if (!valid.length) return;
    setSending(true);
    setTimeout(() => {
      const id = `PO-2026-${String(413 + orders.length).padStart(4, '0')}`;
      setOrders((o) => [{ id, supplier, items: valid.length, units: valid.reduce((s, l) => s + Number(l.qty), 0), date: new Date(date).toISOString(), status: 'sent' }, ...o]);
      setLines([mkLine()]);
      setNotes('');
      setSending(false);
      toast(`${id} sent to ${supplier.split(' —')[0].split(',')[0]}. You'll get their confirmation by email and SMS.`);
    }, 900);
  };

  return (
    <>
      <PageHeader title="Bulk orders" subtitle="Raise a purchase order to a manufacturer or central store. Start from the forecast gaps so you don't miss anything." />
      <div className="grid side">
        <Card title="New purchase order" action={<Button size="sm" variant="soft" icon={Wand2} onClick={fillGaps}>Fill from forecast gaps</Button>}>
          <form className="stack" onSubmit={submit}>
            <div className="grid two" style={{ gap: 12 }}>
              <Field label="Supplier">
                <select className="select" value={supplier} onChange={(e) => setSupplier(e.target.value)}>
                  {SUPPLIERS.map((s) => <option key={s}>{s}</option>)}
                </select>
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
              <Button type="submit" icon={Send} loading={sending} disabled={!valid.length}>Send purchase order</Button>
            </div>
          </form>
        </Card>

        <Card title={<h3 className="row" style={{ gap: 8 }}><ClipboardList size={18} /> Recent orders</h3>}>
          <div className="list">
            {orders.map((o) => (
              <div key={o.id} className="list-item">
                <div className="grow">
                  <strong className="small mono" dir="ltr">{o.id}</strong>
                  <div className="tiny muted">{o.supplier}</div>
                  <div className="tiny muted">{o.items} items · {fmtNum(o.units)} units · {o.status === 'delivered' ? 'arrived' : 'due'} {fmtDate(o.date)}</div>
                </div>
                <StatusBadge status={o.status} />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
