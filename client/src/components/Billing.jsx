import { useMemo, useState } from 'react';
import { Receipt, Plus, Trash2, IndianRupee, Printer, Ban, Wallet, Settings2, Download, AlertTriangle, Search, ScanBarcode, FileText } from 'lucide-react';
import BarcodeScanner, { canScan, packFieldsFrom } from './BarcodeScanner';
import { api } from '../api';
import { useLive } from '../live';
import { PageHeader } from './PortalLayout';
import { Button, Card, Empty, Field, Loading, Modal, Stat, fmtDate, fmtDateTime, cx, useAction } from './ui';

// Billing for partners — one screen for a pharmacy counter, a warehouse's B2B invoices and a lab's bills. All
// money is worked out on the server (billing.js); this screen collects the lines and shows what came back.
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MODE_LABEL = { cash: 'Cash', upi: 'UPI', card: 'Card', credit: 'On credit' };
const STATUS_TONE = { paid: 'green', partial: 'sun', unpaid: 'rose', cancelled: '' };
const TITLE = {
  pharmacy: { title: 'Billing', subtitle: 'Counter sales from your stock — GST invoices, payments, dues and daily sales, all in one place.', newLabel: 'New sale' },
  warehouse: { title: 'Invoices', subtitle: 'B2B tax invoices to chemists, credit terms, payments received and what is still owed.', newLabel: 'New invoice' },
  lab: { title: 'Billing', subtitle: 'Bills for walk-in tests and packages, and the balance on booked orders — receipts and daily collections.', newLabel: 'New bill' },
};
const todayIso = () => new Date().toLocaleDateString('en-CA');
const monthStart = () => `${todayIso().slice(0, 7)}-01`;

function downloadCsv(name, rows) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const esc = (v) => { let s = v == null ? '' : String(v); if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`; return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const blob = new Blob([String.fromCharCode(0xfeff) + `${[cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------------- new bill ---------------- */
function NewBill({ setup, onClose, onDone }) {
  const [run, busy] = useAction();
  const type = setup.facility.type;
  const isLab = type === 'lab';
  const [lines, setLines] = useState([]);
  const [pick, setPick] = useState('');
  const [customer, setCustomer] = useState({ name: '', phone: '', gstin: '', state: '', facilityId: '' });
  const [mode, setMode] = useState(type === 'warehouse' ? 'credit' : 'cash');
  const [amount, setAmount] = useState('');
  const [ref, setRef] = useState('');
  const [dueDays, setDueDays] = useState(type === 'warehouse' ? 30 : 7);
  const [notes, setNotes] = useState('');
  const [q, setQ] = useState('');
  const [rxId, setRxId] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState('');

  // What can go on a bill: stock rows (pharmacy / warehouse) or tests, packages and booked balances (lab).
  const options = useMemo(() => {
    if (isLab) {
      return [
        ...setup.balances.map((b) => ({ key: `bal:${b.labOrderId}`, label: `Balance · ${b.patientName} · ${b.tests}`, line: { labOrderId: b.labOrderId, name: `Balance · ${b.tests}`, qty: 1, price: b.balance, fixed: true }, customer: b.patientName })),
        ...setup.packages.map((p) => ({ key: `pkg:${p.id}`, label: `Package · ${p.name} · ₹${p.price}`, line: { packageId: p.id, name: p.name, qty: 1, price: p.price } })),
        ...setup.tests.map((t) => ({ key: `test:${t.code}`, label: `${t.name}${t.price != null ? ` · ₹${t.price}` : ''}`, line: { code: t.code, name: t.name, qty: 1, price: t.price ?? '' } })),
      ];
    }
    return setup.stock.map((s) => ({ key: s.inventoryId, label: `${s.drug} · batch ${s.batch || '—'} · exp ${s.expiry || '—'} · ${s.qty} in stock`, line: { inventoryId: s.inventoryId, name: s.drug, batch: s.batch, expiry: s.expiry, max: s.qty, mrp: s.mrp, gstRate: s.gstRate, unit: s.unit, qty: 1, price: s.price ?? '' } }));
  }, [setup, isLab]);
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;

  const add = (key) => {
    const o = options.find((x) => x.key === key);
    if (!o || lines.some((l) => l.key === key)) return;
    setLines((ls) => [...ls, { key, discountPct: 0, ...o.line }]);
    if (o.customer && !customer.name) setCustomer((c) => ({ ...c, name: o.customer }));
    setPick(''); setQ('');
  };
  const setLine = (key, k, v) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, [k]: v } : l)));

  // Stock rows for a medicine, earliest expiry first (first-expiry-first-out).
  const rowsFor = (drug) => (setup.stock || []).filter((r) => r.drug.toLowerCase() === String(drug).toLowerCase()).sort((a, b) => String(a.expiry).localeCompare(String(b.expiry)));
  const lineFromRow = (r, qty) => ({ key: r.inventoryId, discountPct: 0, inventoryId: r.inventoryId, name: r.drug, batch: r.batch, expiry: r.expiry, max: r.qty, mrp: r.mrp, gstRate: r.gstRate, unit: r.unit, qty, price: r.price ?? '' });

  // An e-prescription → the whole bill: each medicine from the earliest-expiring batches, quantity from the dose.
  const loadRx = (id) => {
    setRxId(id);
    const rx = (setup.prescriptions || []).find((x) => x.rxId === id);
    if (!rx) return;
    const out = []; const missing = [];
    for (const it of rx.items) {
      let need = it.units;
      for (const r of rowsFor(it.drug)) {
        if (need <= 0) break;
        const take = rx.stockTaken ? need : Math.min(need, r.qty); // already dispensed → the stock is already off the shelf
        if (take > 0) { out.push(lineFromRow(r, take)); need -= take; }
      }
      if (need > 0) missing.push(`${it.drug}${need < it.units ? ` (${need} short)` : ''}`);
    }
    setLines(out);
    setCustomer((c) => ({ ...c, name: rx.patientName, phone: rx.phone || c.phone }));
    setScanMsg(missing.length ? `Not in your stock: ${missing.join(', ')}.` : `Loaded ${rx.items.length} medicine${rx.items.length === 1 ? '' : 's'} from the prescription.`);
  };

  // Scan a pack at the counter → that medicine goes on the bill (same batch if the code carries it); scan again for +1.
  const onScan = async (raw) => {
    setScanning(false);
    const f = packFieldsFrom(raw);
    const gtin = f.gtin || (/^\d{8,14}$/.test(String(raw).trim()) ? String(raw).trim() : '');
    const g14 = gtin ? gtin.padStart(14, '0') : '';
    let rows = (setup.stock || []).filter((r) => g14 && r.gtin === g14);
    if (!rows.length && gtin) { try { const name = (await api.get(`/catalog/gtin/${encodeURIComponent(gtin)}`)).drug; if (name) rows = rowsFor(name); } catch { /* unknown barcode */ } }
    if (f.batch) { const same = rows.filter((r) => r.batch === f.batch); if (same.length) rows = same; }
    rows = rows.filter((r) => r.qty > 0).sort((a, b) => String(a.expiry).localeCompare(String(b.expiry)));
    const r = rows[0];
    if (!r) { setScanMsg('That pack isn\u2019t in your stock on Sehatra yet — add it once under Inventory (scan there), then it scans straight onto bills.'); return; }
    setLines((ls) => (ls.some((l) => l.key === r.inventoryId) ? ls.map((l) => (l.key === r.inventoryId ? { ...l, qty: Math.min(Number(l.qty) + 1, r.qty) } : l)) : [...ls, lineFromRow(r, 1)]));
    setScanMsg(`Added ${r.drug} · batch ${r.batch || '—'}.`);
  };

  // A preview only (the server decides): MRP-inclusive for a pharmacy, + GST for a warehouse, exempt for a lab.
  const preview = useMemo(() => {
    let total = 0; let gst = 0;
    for (const l of lines) {
      const net = (Number(l.qty) || 0) * (Number(l.price) || 0) * (1 - (Number(l.discountPct) || 0) / 100);
      const rate = isLab ? 0 : Number(l.gstRate) || 0;
      if (type === 'warehouse') { gst += net * rate / 100; total += net * (1 + rate / 100); } else { gst += rate ? net - net / (1 + rate / 100) : 0; total += net; }
    }
    return { total: Math.round(total), gst };
  }, [lines, isLab, type]);

  const customerOut = type === 'warehouse' && customer.facilityId ? { facilityId: customer.facilityId } : { name: customer.name, phone: customer.phone, gstin: customer.gstin, state: customer.state };
  const save = async () => {
    const body = {
      customer: customerOut, notes, dueDays, rxId: rxId || undefined,
      lines: lines.map((l) => (l.labOrderId ? { labOrderId: l.labOrderId } : { inventoryId: l.inventoryId, code: l.code, packageId: l.packageId, qty: Number(l.qty), price: l.price === '' ? undefined : Number(l.price), discountPct: Number(l.discountPct) || 0 })),
      payment: { mode, amount: mode === 'credit' ? 0 : amount === '' ? undefined : Number(amount), ref },
    };
    const r = await run('save', () => api.post('/billing/bills', body), null);
    if (r) { onDone(r); onClose(); }
  };
  const short = mode !== 'credit' && amount !== '' && Number(amount) < preview.total;
  const needsName = (mode === 'credit' || short || type === 'warehouse') && !customer.name && !customer.facilityId;

  return (
    <Modal open wide onClose={onClose} title={TITLE[type].newLabel} subtitle={isLab ? 'Tests are exempt from GST — this prints as a bill of supply.' : type === 'warehouse' ? 'Trade prices are before GST; GST is added (IGST for another state).' : 'Prices are MRP-inclusive of GST, as on the pack. You can sell below MRP, never above.'}
      footer={<><span className="grow small"><strong>{inr(preview.total)}</strong>{preview.gst > 0 ? <span className="muted"> · GST {inr(preview.gst)}</span> : null}</span><Button variant="ghost" onClick={onClose}>Cancel</Button><Button icon={Receipt} loading={busy === 'save'} disabled={!lines.length || needsName} onClick={save}>Save &amp; print</Button></>}>
      <div className="stack">
        {type === 'pharmacy' && (setup.prescriptions?.length > 0 || canScan()) && (
          <div className="bl-quick">
            {setup.prescriptions?.length > 0 && (
              <Field label={<span className="row" style={{ gap: 6 }}><FileText size={14} /> Bill an e-prescription</span>}>
                <select className="select" value={rxId} onChange={(e) => loadRx(e.target.value)}>
                  <option value="">Choose a prescription ({setup.prescriptions.length})…</option>
                  {setup.prescriptions.map((r) => <option key={r.rxId} value={r.rxId}>{r.patientName} · {r.items.map((i) => i.drug).join(', ')}</option>)}
                </select>
              </Field>
            )}
            {canScan() && <Button type="button" variant="secondary" icon={ScanBarcode} onClick={() => setScanning(true)}>Scan pack</Button>}
          </div>
        )}
        {scanMsg && <div className="callout small"><span>{scanMsg}</span></div>}
        <Field label={isLab ? 'Add a test, package or booked balance' : 'Add a medicine from your stock'}>
          <div className="bl-picker">
            <div className="input-wrap"><Search /><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={isLab ? 'Search tests…' : 'Search by name…'} aria-label="Search items" /></div>
            <select className="select" value={pick} onChange={(e) => add(e.target.value)} aria-label="Pick an item">
              <option value="">{filtered.length ? `Choose (${filtered.length})…` : 'Nothing matches'}</option>
              {filtered.slice(0, 200).map((o) => <option key={o.key} value={o.key} disabled={lines.some((l) => l.key === o.key)}>{o.label}</option>)}
            </select>
          </div>
        </Field>

        {lines.length > 0 && (
          <div className="table-wrap">
            <table className="table bl-lines">
              <thead><tr><th>Item</th><th>Qty</th><th>{type === 'warehouse' ? 'Rate (before GST)' : isLab ? 'Fee' : 'Price (incl. GST)'}</th><th>Disc %</th><th className="right">Amount</th><th /></tr></thead>
              <tbody>
                {lines.map((l) => {
                  const amt = (Number(l.qty) || 0) * (Number(l.price) || 0) * (1 - (Number(l.discountPct) || 0) / 100) * (type === 'warehouse' ? 1 + (Number(l.gstRate) || 0) / 100 : 1);
                  return (
                    <tr key={l.key}>
                      <td><strong className="small" translate="no">{l.name}</strong>{l.batch ? <span className="tiny muted block">Batch {l.batch} · exp {l.expiry || '—'}{l.mrp ? ` · MRP ₹${l.mrp}` : ''}{l.gstRate != null && !isLab ? ` · GST ${l.gstRate}%` : ''}</span> : null}</td>
                      <td><input className="input bl-num" type="number" inputMode="numeric" min="1" max={l.max || 999} value={l.qty} disabled={l.fixed} onChange={(e) => setLine(l.key, 'qty', e.target.value)} aria-label={`Quantity of ${l.name}`} /></td>
                      <td><input className="input bl-num" type="number" inputMode="decimal" min="0" step="0.01" value={l.price} disabled={l.fixed} onChange={(e) => setLine(l.key, 'price', e.target.value)} aria-label={`Price of ${l.name}`} /></td>
                      <td><input className="input bl-num" type="number" inputMode="decimal" min="0" max="100" value={l.discountPct} disabled={l.fixed} onChange={(e) => setLine(l.key, 'discountPct', e.target.value)} aria-label={`Discount on ${l.name}`} /></td>
                      <td className="right">{inr(amt)}</td>
                      <td><button type="button" className="icon-btn" aria-label={`Remove ${l.name}`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><Trash2 size={16} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="grid two">
          {type === 'warehouse' && (
            <Field label="Bill to a chemist on Sehatra">
              <select className="select" value={customer.facilityId} onChange={(e) => setCustomer({ ...customer, facilityId: e.target.value })}>
                <option value="">Someone else (type below)</option>
                {setup.customers.map((c) => <option key={c.facilityId} value={c.facilityId}>{c.name} · {c.district}</option>)}
              </select>
            </Field>
          )}
          {!(type === 'warehouse' && customer.facilityId) && (
            <>
              <Field label={type === 'warehouse' ? 'Buyer name' : 'Customer name'} hint={type === 'warehouse' ? null : 'Optional for a fully paid walk-in sale.'}><input className="input" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} /></Field>
              <Field label="Phone"><input className="input" type="tel" inputMode="tel" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} /></Field>
              {type !== 'lab' && <Field label="Buyer GSTIN" hint="For a business buyer."><input className="input mono" value={customer.gstin} onChange={(e) => setCustomer({ ...customer, gstin: e.target.value.toUpperCase() })} /></Field>}
              {type === 'warehouse' && <Field label="Buyer state" hint="Another state → IGST."><input className="input" value={customer.state} onChange={(e) => setCustomer({ ...customer, state: e.target.value })} placeholder={setup.facility.state} /></Field>}
            </>
          )}
        </div>

        <div className="grid two">
          <Field label="Payment">
            <div className="pills" role="group" aria-label="Payment mode">
              {setup.modes.map((m) => <button key={m} type="button" className={cx('pill', mode === m && 'active')} onClick={() => setMode(m)} aria-pressed={mode === m}>{MODE_LABEL[m]}</button>)}
            </div>
          </Field>
          {mode !== 'credit' ? (
            <Field label="Amount received" hint="Leave empty for the full amount; less leaves the rest due."><input className="input" type="number" inputMode="decimal" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(preview.total)} /></Field>
          ) : null}
          {(mode === 'credit' || short) && (
            <Field label="Due in (days)"><input className="input" type="number" inputMode="numeric" min="0" max="180" value={dueDays} onChange={(e) => setDueDays(e.target.value)} /></Field>
          )}
          {(mode === 'upi' || mode === 'card') && <Field label="Reference (optional)" hint="UPI / card transaction ID."><input className="input mono" value={ref} onChange={(e) => setRef(e.target.value)} /></Field>}
        </div>
        <Field label="Note on the bill (optional)"><input className="input" maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        {type !== 'lab' && <BarcodeScanner open={scanning} onClose={() => setScanning(false)} onResult={onScan} title="Scan the pack" subtitle="The square (DataMatrix) or long barcode on the strip or carton." />}
        {needsName && lines.length > 0 && <p className="tiny" style={{ color: 'var(--rose)' }}><AlertTriangle size={12} style={{ verticalAlign: '-2px' }} /> {type === 'warehouse' ? 'Choose the chemist or enter the buyer’s name.' : 'Add the customer’s name to leave an amount due.'}</p>}
      </div>
    </Modal>
  );
}

/* ---------------- collect / cancel ---------------- */
function CollectModal({ bill, onClose, onDone }) {
  const [run, busy] = useAction();
  const [amount, setAmount] = useState(String(bill.due));
  const [mode, setMode] = useState('cash');
  const [ref, setRef] = useState('');
  const save = async () => { if (await run('pay', () => api.post(`/billing/bills/${bill.id}/payments`, { amount: Number(amount), mode, ref }), 'Payment recorded')) { onDone(); onClose(); } };
  return (
    <Modal open onClose={onClose} title={`Receive payment · ${bill.billNo}`} subtitle={`${bill.customer?.name || 'Walk-in'} · ${inr(bill.due)} due`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button icon={IndianRupee} loading={busy === 'pay'} onClick={save}>Record payment</Button></>}>
      <div className="stack">
        <Field label="Amount"><input className="input" type="number" inputMode="decimal" min="1" max={bill.due} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <div className="pills" role="group" aria-label="Payment mode">{['cash', 'upi', 'card'].map((m) => <button key={m} type="button" className={cx('pill', mode === m && 'active')} onClick={() => setMode(m)}>{MODE_LABEL[m]}</button>)}</div>
        {mode !== 'cash' && <Field label="Reference (optional)"><input className="input mono" value={ref} onChange={(e) => setRef(e.target.value)} /></Field>}
      </div>
    </Modal>
  );
}
function CancelModal({ bill, onClose, onDone }) {
  const [run, busy] = useAction();
  const [reason, setReason] = useState('');
  const save = async () => { if (await run('cancel', () => api.post(`/billing/bills/${bill.id}/cancel`, { reason }), 'Bill cancelled')) { onDone(); onClose(); } };
  return (
    <Modal open onClose={onClose} title={`Cancel ${bill.billNo}?`} subtitle={bill.lines.some((l) => l.inventoryId) ? 'The items go back into your stock.' : 'The bill stays on record, marked cancelled.'}
      footer={<><Button variant="ghost" onClick={onClose}>Keep the bill</Button><Button variant="clay" icon={Ban} loading={busy === 'cancel'} disabled={reason.trim().length < 3} onClick={save}>Cancel bill</Button></>}>
      <div className="stack">
        {bill.paid > 0 && <div className="callout sun small"><AlertTriangle size={16} /><span>{inr(bill.paid)} was already received — refund it the way it was paid.</span></div>}
        <Field label="Reason"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer returned the strips" /></Field>
      </div>
    </Modal>
  );
}
function SettingsModal({ setup, onClose, onDone }) {
  const [run, busy] = useAction();
  const f = setup.facility;
  const [form, setForm] = useState({ gstin: f.gstin, billTerms: f.billTerms, address: f.address, phone: f.phone });
  const save = async () => { if (await run('s', () => api.put('/billing/settings', form), 'Billing details saved')) { onDone(); onClose(); } };
  return (
    <Modal open onClose={onClose} title="Billing details" subtitle="Printed on every bill."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy === 's'} onClick={save}>Save</Button></>}>
      <div className="stack">
        <Field label="Your GSTIN" hint="With a GSTIN the bill prints as a Tax invoice; without one, as a Bill of supply."><input className="input mono" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} placeholder="09AAACH7409R1ZZ" /></Field>
        {f.type === 'warehouse' && (
          <>
            <Field label="Address"><input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
            <Field label="Phone"><input className="input" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          </>
        )}
        <Field label="Terms printed at the bottom (optional)"><textarea className="textarea" rows={2} maxLength={300} value={form.billTerms} onChange={(e) => setForm({ ...form, billTerms: e.target.value })} placeholder="e.g. Goods once sold are taken back only with this bill within 7 days." /></Field>
      </div>
    </Modal>
  );
}

/* ---------------- page ---------------- */
export default function Billing() {
  const [range, setRange] = useState({ from: monthStart(), to: todayIso() });
  const [q, setQ] = useState('');
  const setupLive = useLive('/billing/setup', ['billing', 'pharmacy', 'supply', 'lab', 'stock', 'labs']);
  const bills = useLive(`/billing/bills?from=${range.from}&to=${range.to}&q=${encodeURIComponent(q)}`, ['billing']);
  const [adding, setAdding] = useState(false);
  const [collect, setCollect] = useState(null);
  const [cancel, setCancel] = useState(null);
  const [settings, setSettings] = useState(false);
  const [tab, setTab] = useState('bills');

  if ((setupLive.loading && !setupLive.data) || (bills.loading && !bills.data)) return <Loading />;
  if (!setupLive.data) return <Empty title="Billing isn't available">{setupLive.error}</Empty>;
  const setup = setupLive.data;
  const type = setup.facility.type;
  const data = bills.data || { bills: [], summary: { bills: 0, sales: 0, gst: 0, collected: 0, outstanding: 0, modes: {}, days: [], slabs: [], topItems: [], dues: [] } };
  const s = data.summary;
  const reload = () => { bills.reload(); setupLive.reload(); };
  const openPrint = (b) => window.open(`/bill/${b.id}`, '_blank', 'noopener');

  const exportBills = () => downloadCsv(`bills-${range.from}-to-${range.to}.csv`, data.bills.map((b) => ({ 'Bill no': b.billNo, Date: fmtDate(b.createdAt), Customer: b.customer?.name || 'Walk-in', 'Customer GSTIN': b.customer?.gstin || '', Taxable: b.totals.taxable, GST: b.totals.gst, Total: b.totals.total, Paid: b.paid, Due: b.due, Status: b.status })));
  const exportGst = () => downloadCsv(`gst-summary-${range.from}-to-${range.to}.csv`, s.slabs.map((x) => ({ 'GST rate %': x.rate, Taxable: x.taxable, CGST: x.cgst, SGST: x.sgst, IGST: x.igst })));

  return (
    <div className="stack">
      <PageHeader eyebrow="Billing" title={TITLE[type].title} subtitle={TITLE[type].subtitle}>
        <div className="row" style={{ gap: 8 }}>
          <Button variant="ghost" icon={Settings2} onClick={() => setSettings(true)}>Billing details</Button>
          <Button icon={Plus} onClick={() => setAdding(true)}>{TITLE[type].newLabel}</Button>
        </div>
      </PageHeader>
      {!setup.facility.gstin && type !== 'lab' && <div className="callout sun small"><AlertTriangle size={16} /><span>No GSTIN set — your bills print as a Bill of supply. Add it under Billing details to issue Tax invoices.</span></div>}

      <div className="bl-range">
        <Field label="From"><input className="input" type="date" value={range.from} max={range.to} onChange={(e) => setRange({ ...range, from: e.target.value })} /></Field>
        <Field label="To"><input className="input" type="date" value={range.to} min={range.from} max={todayIso()} onChange={(e) => setRange({ ...range, to: e.target.value })} /></Field>
      </div>

      <div className="grid four">
        <Stat label="Sales" value={inr(s.sales)} icon={Receipt} sub={`${s.bills} bill${s.bills === 1 ? '' : 's'}${s.cancelled ? ` · ${s.cancelled} cancelled` : ''}`} />
        <Stat label="Collected" value={inr(s.collected)} icon={Wallet} sub={['cash', 'upi', 'card'].filter((m) => s.modes?.[m]).map((m) => `${MODE_LABEL[m]} ${inr(s.modes[m])}`).join(' · ') || 'nothing yet'} />
        <Stat label="GST" value={inr(s.gst)} icon={IndianRupee} sub={type === 'lab' ? 'exempt services' : `on ${inr(s.taxable)} taxable`} />
        <Stat label="Owed to you" value={inr(s.outstanding)} icon={AlertTriangle} sub={`${s.dues.length} bill${s.dues.length === 1 ? '' : 's'} with a balance`} />
      </div>

      <div className="pills">
        <button type="button" className={cx('pill', tab === 'bills' && 'active')} onClick={() => setTab('bills')}>Bills</button>
        <button type="button" className={cx('pill', tab === 'dues' && 'active')} onClick={() => setTab('dues')}>{s.dues.length ? `Dues (${s.dues.length})` : 'Dues'}</button>
        <button type="button" className={cx('pill', tab === 'report' && 'active')} onClick={() => setTab('report')}>Report</button>
      </div>

      {tab === 'bills' && (
        <Card title="Bills" action={<div className="row" style={{ gap: 6 }}><div className="input-wrap bl-search"><Search /><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Bill no or customer" aria-label="Search bills" /></div><Button size="sm" variant="ghost" icon={Download} disabled={!data.bills.length} onClick={exportBills}>CSV</Button></div>}>
          {data.bills.length === 0 ? <Empty icon={Receipt} title="No bills in these dates">{TITLE[type].newLabel} creates a numbered, printable bill and updates your stock.</Empty> : (
            <div className="table-wrap" style={{ border: 0 }}>
              <table className="table">
                <thead><tr><th>Bill</th><th>Customer</th><th>Date</th><th className="right">Total</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {data.bills.map((b) => (
                    <tr key={b.id} className={cx(b.status === 'cancelled' && 'muted')}>
                      <td className="mono small">{b.billNo}</td>
                      <td><span translate="no">{b.customer?.name || 'Walk-in'}</span><span className="tiny muted block">{b.lines.length} item{b.lines.length === 1 ? '' : 's'}</span></td>
                      <td className="small">{fmtDateTime(b.createdAt)}</td>
                      <td className="right"><strong>{inr(b.totals.total)}</strong>{b.due > 0 && <span className="tiny block" style={{ color: 'var(--rose)' }}>{inr(b.due)} due</span>}</td>
                      <td><span className={cx('badge', STATUS_TONE[b.status])}>{b.status === 'partial' ? 'Part paid' : b.status}</span></td>
                      <td className="right nowrap">
                        <button type="button" className="icon-btn" aria-label={`Print ${b.billNo}`} title="Print" onClick={() => openPrint(b)}><Printer size={16} /></button>
                        {b.status !== 'cancelled' && b.due > 0 && <button type="button" className="icon-btn" aria-label={`Receive payment for ${b.billNo}`} title="Receive payment" onClick={() => setCollect(b)}><IndianRupee size={16} /></button>}
                        {b.status !== 'cancelled' && <button type="button" className="icon-btn" aria-label={`Cancel ${b.billNo}`} title="Cancel bill" onClick={() => setCancel(b)}><Ban size={16} /></button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'dues' && (
        <Card title="Still owed to you" action={<span className="tiny muted">all dates</span>}>
          {s.dues.length === 0 ? <Empty icon={Wallet} title="Nothing outstanding">Every bill is fully paid.</Empty> : (
            <div className="stack" style={{ gap: 8 }}>
              {s.dues.map((x) => {
                const late = x.dueDate && x.dueDate < todayIso();
                const bill = data.bills.find((b) => b.id === x.id);
                return (
                  <div key={x.id} className="row between wrap bl-due">
                    <span><strong translate="no">{x.customer}</strong> <span className="mono tiny muted">{x.billNo}</span><span className="tiny muted block">{fmtDate(x.createdAt)}{x.dueDate ? ` · due ${fmtDate(x.dueDate)}` : ''}{late ? ' · overdue' : ''}</span></span>
                    <span className="row" style={{ gap: 8 }}><strong style={{ color: late ? 'var(--rose)' : undefined }}>{inr(x.due)}</strong>{bill && <Button size="sm" icon={IndianRupee} onClick={() => setCollect(bill)}>Receive</Button>}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {tab === 'report' && (
        <div className="grid side">
          <Card title="Day by day">
            {s.days.length === 0 ? <Empty title="No sales in these dates" /> : (
              <table className="table">
                <thead><tr><th>Date</th><th>Bills</th><th className="right">Sales</th><th className="right">Collected</th></tr></thead>
                <tbody>{s.days.map((d) => <tr key={d.date}><td>{fmtDate(d.date)}</td><td>{d.bills}</td><td className="right">{inr(d.total)}</td><td className="right">{inr(d.collected)}</td></tr>)}</tbody>
              </table>
            )}
          </Card>
          <div className="stack">
            {type !== 'lab' && (
              <Card title="GST summary" action={<Button size="sm" variant="ghost" icon={Download} disabled={!s.slabs.length} onClick={exportGst}>CSV</Button>}>
                {s.slabs.length === 0 ? <p className="small muted mb-0">No taxable sales yet.</p> : (
                  <table className="table">
                    <thead><tr><th>Rate</th><th className="right">Taxable</th><th className="right">CGST</th><th className="right">SGST</th><th className="right">IGST</th></tr></thead>
                    <tbody>{s.slabs.map((x) => <tr key={x.rate}><td>{x.rate}%</td><td className="right">{inr(x.taxable)}</td><td className="right">{inr(x.cgst)}</td><td className="right">{inr(x.sgst)}</td><td className="right">{inr(x.igst)}</td></tr>)}</tbody>
                  </table>
                )}
                <p className="tiny muted mb-0 mt-1">A working summary for your accountant — rates come from your stock and are worth checking before filing.</p>
              </Card>
            )}
            <Card title="Top items">
              {s.topItems.length === 0 ? <p className="small muted mb-0">No sales yet.</p> : (
                <div className="stack" style={{ gap: 4 }}>{s.topItems.map((t) => <div key={t.name} className="row between small"><span translate="no">{t.name} <span className="muted">× {t.qty}</span></span><strong>{inr(t.amount)}</strong></div>)}</div>
              )}
            </Card>
          </div>
        </div>
      )}

      {adding && <NewBill setup={setup} onClose={() => setAdding(false)} onDone={(b) => { reload(); openPrint(b); }} />}
      {collect && <CollectModal bill={collect} onClose={() => setCollect(null)} onDone={reload} />}
      {cancel && <CancelModal bill={cancel} onClose={() => setCancel(null)} onDone={reload} />}
      {settings && <SettingsModal setup={setup} onClose={() => setSettings(false)} onDone={reload} />}
    </div>
  );
}
