// Shared stock helpers for the Pharmacy and Supply (distributor) portals.
import { memo, useState } from 'react';
import { ScanBarcode, PackagePlus } from 'lucide-react';
import { Button, Field, Modal, Progress, Empty, useAction, useToast, fmtNum, fmtDate, cx } from '../../components/ui';
import { api } from '../../api';
import BarcodeScanner, { canScan, packFieldsFrom } from '../../components/BarcodeScanner';
import './stock.css';

export const COMMON_DRUGS = [
  'Paracetamol 500mg', 'Paracetamol 650mg', 'Metformin 500mg', 'Amlodipine 5mg', 'Telmisartan 40mg', 'Azithromycin 500mg', 'Amoxicillin 500mg',
  'Cetirizine 10mg', 'Pantoprazole 40mg', 'ORS sachet', 'Zinc 20mg', 'Salbutamol inhaler 100mcg', 'Budesonide inhaler 200mcg', 'Ibuprofen 400mg',
  'Insulin Glargine 100IU/ml', 'Atorvastatin 10mg', 'Glimepiride 1mg', 'Doxycycline 100mg', 'Artemether-Lumefantrine', 'Platelet count kit',
  'Dengue NS1 rapid kit', 'Prednisolone 10mg', 'Ondansetron 4mg', 'Vitamin B12 1500mcg', 'Aspirin 75mg', 'Losartan 50mg',
];

export const isColdChain = (drug = '') => /insulin|vaccine/i.test(drug);

export function expiryInfo(date) {
  const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  if (days < 0) return { days, label: 'Expired', tone: 'rose' };
  if (days <= 30) return { days, label: `${days} days left`, tone: 'rose' };
  if (days <= 60) return { days, label: `${days} days left`, tone: 'sun' };
  return { days, label: fmtDate(date), tone: '' };
}

export function stockLevel(item) {
  const s = item.safetyStock || 0;
  if (item.qty === 0) return { key: 'out', label: 'Out of stock', tone: 'solid-rose', bar: 'danger' };
  if (item.qty <= s) return { key: 'low', label: 'Below safety', tone: 'rose', bar: 'danger' };
  if (item.qty <= s * 1.5) return { key: 'watch', label: 'Running low', tone: 'sun', bar: 'warn' };
  return { key: 'ok', label: 'Healthy', tone: 'green', bar: 'ok' };
}

/* Reorder suggestion: bring stock up to ~3× safety, rounded to a sensible pack size. */
export function suggestQty(item) {
  const target = Math.max((item.safetyStock || 10) * 3, 20);
  const need = Math.max(target - item.qty, 10);
  const step = need > 500 ? 100 : need > 100 ? 50 : 10;
  return Math.ceil(need / step) * step;
}

function QtyInput({ item, field = 'qty', onSaved, label }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const save = async (e) => {
    const n = Math.max(0, Math.round(Number(e.target.value)));
    if (Number.isNaN(n) || n === item[field]) { e.target.value = item[field]; return; }
    setSaving(true);
    try {
      const updated = await api.put(`/inventory/${item.id}`, { [field]: n });
      toast(`${item.drug}: ${field === 'qty' ? 'stock' : 'safety stock'} set to ${fmtNum(n)}`);
      onSaved?.(updated);
    } catch (err) {
      toast(err.message, 'error');
      e.target.value = item[field];
    } finally { setSaving(false); }
  };
  return (
    <span className={cx('qty-input', saving && 'saving')}>
      <input key={item[field]} type="number" min="0" className="input sm" defaultValue={item[field]} onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.currentTarget.value = item[field]; e.currentTarget.blur(); } }}
        aria-label={label || `${item.drug} quantity`} />
      {saving && <span className="spinner sm" />}
    </span>
  );
}

/**
 * Inventory table with inline quantity editing.
 * showSafety: render the safety-stock column as an editable field + coverage bar (distributor view).
 */
// Memoised: a search box above it re-renders the page on every keystroke, but the table (one row and
// two inputs per batch) only re-renders when its items actually change.
export const StockTable = memo(function StockTable({ items, onSaved, showSafety, unit = 'units', emptyText, actions }) {
  if (!items.length) return <div className="card"><Empty icon={PackagePlus} title="Nothing matches">{emptyText || 'Try a different search or filter.'}</Empty></div>;
  return (
    <div className="table-wrap">
      <table className="table stock-table">
        <thead>
          <tr>
            <th>Medicine</th><th>Batch</th><th>Expiry</th><th>In stock</th>
            {showSafety ? <th>Safety stock</th> : null}
            <th style={{ minWidth: 150 }}>Level</th>
            {actions ? <th /> : null}
          </tr>
        </thead>
        <tbody>
          {items.map((i) => {
            const ex = expiryInfo(i.expiry);
            const lvl = stockLevel(i);
            return (
              <tr key={i.id} className={cx(lvl.key === 'out' && 'row-out')}>
                <td>
                  <strong className="small" translate="no">{i.drug}</strong>
                  {isColdChain(i.drug) && <span className="badge sky cold-tag">2–8°C</span>}
                </td>
                <td className="mono small muted">{i.batch || '—'}</td>
                <td>{ex.tone ? <span className={`badge ${ex.tone}`}>{ex.label}</span> : <span className="small">{ex.label}</span>}</td>
                <td><QtyInput item={i} onSaved={onSaved} /></td>
                {showSafety ? <td><QtyInput item={i} field="safetyStock" onSaved={onSaved} label={`${i.drug} safety stock`} /></td> : null}
                <td>
                  <div className="stock-level">
                    <Progress value={i.qty} max={Math.max(i.safetyStock * 4, i.qty, 1)} tone={lvl.bar} />
                    <span className={`tiny lvl-${lvl.key}`}>{lvl.label}{!showSafety && ` · safety ${fmtNum(i.safetyStock)}`}</span>
                  </div>
                </td>
                {actions ? <td className="right">{actions(i)}</td> : null}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="stock-foot tiny muted">Click a number to correct it — press Enter to save. Quantities are in {unit}.</div>
    </div>
  );
});

export function AddStockModal({ open, onClose, onAdded, defaultSafety = 20, title = 'Add stock', scanFirst = false }) {
  const [run, busy] = useAction();
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState('');
  const [wasOpen, setWasOpen] = useState(false);
  // Opened from "Scan barcode": go straight to the camera.
  if (open !== wasOpen) { setWasOpen(open); if (open && scanFirst && canScan()) setScanning(true); if (!open) setScanNote(''); }
  // No guessed expiry: it must be typed from the pack.
  const blank = { drug: '', batch: '', expiry: '', qty: '', safetyStock: defaultSafety };
  const [form, setForm] = useState(blank);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const tooSoon = form.expiry && expiryInfo(form.expiry).days < 90;
  // A GS1 pack code (DataMatrix / GS1-128) carries batch and expiry; the product name has to be typed — packs
  // only carry a product number (GTIN), and there's no GTIN → name list on Nexus yet.
  const onScan = (raw) => {
    setScanning(false);
    const f = packFieldsFrom(raw);
    if (!f.batch && !f.expiry) { setForm((cur) => ({ ...cur, batch: cur.batch || f.raw.slice(0, 40) })); setScanNote('Read the code as the batch number — check it against the pack.'); return; }
    setForm((cur) => ({ ...cur, batch: f.batch || cur.batch, expiry: f.expiry || cur.expiry }));
    setScanNote(`Filled from the pack: ${[f.batch && `batch ${f.batch}`, f.expiry && `expiry ${f.expiry}`].filter(Boolean).join(', ')}. Type the medicine name and quantity.`);
  };
  const submit = async (e) => {
    e.preventDefault();
    const ok = await run('add', () => api.post('/inventory', { ...form, qty: Number(form.qty), safetyStock: Number(form.safetyStock) }), `${form.qty} × ${form.drug} added to stock`);
    if (ok) { onAdded?.(ok); setForm(blank); onClose(); }
  };
  return (
    <Modal open={open} onClose={onClose} title={title} subtitle="Enter what's printed on the strip or carton.">
      <form className="stack" onSubmit={submit}>
        {canScan() && <Button type="button" variant="secondary" icon={ScanBarcode} onClick={() => setScanning(true)}>Scan the pack’s barcode</Button>}
        {scanNote && <div className="callout green"><span className="small">{scanNote}</span></div>}
        <Field label="Medicine">
          <input className="input" list="oc-drug-list" value={form.drug} onChange={set('drug')} placeholder="Start typing, e.g. Paracetamol 500mg" required autoFocus />
          <datalist id="oc-drug-list">{COMMON_DRUGS.map((d) => <option key={d} value={d} />)}</datalist>
        </Field>
        <div className="grid two" style={{ gap: 12 }}>
          <Field label="Batch number" hint="Optional — leave blank if the pack has none"><input className="input mono" value={form.batch} onChange={set('batch')} placeholder="e.g. PCM24A118" /></Field>
          <Field label="Expiry date *" hint={tooSoon ? undefined : 'Required — as printed on the strip or carton'} error={tooSoon ? 'Expires within 3 months — are you sure?' : undefined}><input className="input" type="date" value={form.expiry} onChange={set('expiry')} required onInvalid={(e) => e.currentTarget.setCustomValidity('Please enter the expiry date printed on the pack.')} onInput={(e) => e.currentTarget.setCustomValidity('')} /></Field>
        </div>
        <div className="grid two" style={{ gap: 12 }}>
          <Field label="Quantity received"><input className="input" type="number" min="1" value={form.qty} onChange={set('qty')} required /></Field>
          <Field label="Safety stock" hint="We'll warn you below this"><input className="input" type="number" min="0" value={form.safetyStock} onChange={set('safetyStock')} /></Field>
        </div>
        {isColdChain(form.drug) && <div className="callout sky"><span>Cold-chain item — store at 2–8°C straight away.</span></div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy === 'add'}>Add to stock</Button>
        </div>
      </form>
      <BarcodeScanner open={scanning} onClose={() => setScanning(false)} onResult={onScan} title="Scan the strip or carton" subtitle="The square (DataMatrix) or long barcode — it fills the batch and expiry." />
    </Modal>
  );
}

