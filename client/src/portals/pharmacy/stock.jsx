// Shared stock helpers for the Pharmacy and Supply (distributor) portals.
import { memo, useState } from 'react';
import { ScanBarcode, PackagePlus, ClipboardPaste, Truck, CheckCircle2 } from 'lucide-react';
import { Button, Field, Modal, Progress, Empty, useAction, useToast, fmtNum, fmtDate, cx } from '../../components/ui';
import { api } from '../../api';
import BarcodeScanner, { canScan, packFieldsFrom } from '../../components/BarcodeScanner';
import { excelSerialDate, readXlsx } from '../../xlsx';
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
  // No guessed expiry: it must be typed from the pack.
  const blank = { drug: '', batch: '', expiry: '', qty: '', safetyStock: defaultSafety, gtin: '' };
  const [form, setForm] = useState(blank);
  // Every opening starts clean: a cancelled scan's batch/expiry must not land on the next pack.
  if (open !== wasOpen) { setWasOpen(open); if (open) setForm(blank); if (open && scanFirst && canScan()) setScanning(true); if (!open) setScanNote(''); }
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const tooSoon = form.expiry && expiryInfo(form.expiry).days < 90;
  // A GS1 pack code (DataMatrix / GS1-128) carries the product number (GTIN), batch and expiry. The NAME comes from
  // Sehatra's barcode book — learned the first time any verified store names that barcode — so after the first time,
  // a scan fills everything except the quantity.
  const onScan = async (raw) => {
    setScanning(false);
    const f = packFieldsFrom(raw);
    const gtin = f.gtin || (/^\d{8,14}$/.test(String(raw).trim()) ? String(raw).trim() : '');
    if (!f.batch && !f.expiry && !gtin) { setForm((cur) => ({ ...cur, batch: cur.batch || f.raw.slice(0, 40) })); setScanNote('Read the code as the batch number — check it against the pack.'); return; }
    let name = null;
    if (gtin) { try { name = (await api.get(`/catalog/gtin/${encodeURIComponent(gtin)}`)).drug; } catch { /* offline or unknown: type it once */ } }
    setForm((cur) => ({ ...cur, gtin: gtin || cur.gtin, drug: name || cur.drug, batch: f.batch || cur.batch, expiry: f.expiry || cur.expiry }));
    const got = [name && name, f.batch && `batch ${f.batch}`, f.expiry && `expiry ${f.expiry}`].filter(Boolean).join(', ');
    setScanNote(name ? `Filled from the pack: ${got}. Just enter the quantity.` : `Filled from the pack: ${got || 'barcode read'}. Type the medicine name once — next time this barcode fills it in by itself, for every store on Sehatra.`);
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



/* ---------- Paste from Excel: whole supplier lists in one go ---------- */
// Columns in any order with a header row (Medicine/Name, Batch, Expiry, Qty, optional Barcode/GTIN, Safety) —
// or, without headers, Medicine · Batch · Expiry · Qty. Expiry can be 2027-08-31, 31/08/2027, 08/2027 or Aug-27.
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export function parseExpiry(v) {
  const s = String(v || '').trim();
  // An Excel date cell arrives as a day number (e.g. 46752 = 2027-12-31).
  if (/^\d{5}(\.\d+)?$/.test(s) && Number(s) > 36000 && Number(s) < 80000) return excelSerialDate(s);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/); // DD/MM/YYYY (Indian order)
  if (m) { const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]); return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  m = s.match(/^(\d{1,2})[/.-](\d{2,4})$/); // MM/YYYY → last day of that month
  if (m) { const y = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]); const mo = Number(m[1]); return mo >= 1 && mo <= 12 ? `${y}-${String(mo).padStart(2, '0')}-${lastDay(y, mo)}` : ''; }
  m = s.match(/^([a-z]{3})[a-z]*[\s/.-]*(\d{2,4})$/i); // Aug-27 / August 2027
  if (m && MONTHS[m[1].toLowerCase()]) { const y = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]); const mo = MONTHS[m[1].toLowerCase()]; return `${y}-${String(mo).padStart(2, '0')}-${lastDay(y, mo)}`; }
  return '';
}
export function parsePastedStock(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  // Tabs (pasted from Excel), else commas or semicolons — quotes respected, so "Paracetamol, 500mg" stays one cell.
  const sep = lines[0].includes('\t') ? '\t' : (lines[0].split(';').length > lines[0].split(',').length ? ';' : ',');
  const split = (l) => {
    if (sep === '\t') return l.split('\t').map((c) => c.trim().replace(/^"|"$/g, ''));
    const out = []; let cur = ''; let q = false;
    for (let i = 0; i < l.length; i += 1) {
      const ch = l[i];
      if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i += 1; } else q = !q; } else if (ch === sep && !q) { out.push(cur.trim()); cur = ''; } else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const head = split(lines[0]).map((h) => h.toLowerCase());
  // Names in order of preference — billing-software exports (Marg, GoFrugal…) call quantity "Closing Stock",
  // "Cl. Qty", "Stock Qty" or "Balance"; a "Stock Value" column must never be read as the quantity.
  const find = (...names) => { for (const n of names) { const i = head.findIndex((h) => h.includes(n) && !/value|amount|amt|rate|price/.test(h)); if (i >= 0) return i; } return -1; };
  const drugCol = find('medicine', 'item name', 'product name', 'drug', 'item', 'product', 'name', 'description');
  const qtyCol = find('closing', 'cl. qty', 'cl.qty', 'cl qty', 'stock qty', 'qty', 'quantity', 'balance', 'units', 'stock');
  const hasHeader = drugCol >= 0 && qtyCol >= 0;
  const idx = hasHeader
    ? { drug: drugCol, batch: find('batch', 'lot'), expiry: find('exp'), qty: qtyCol, gtin: find('barcode', 'gtin', 'ean'), safety: find('safety', 'min') }
    : { drug: 0, batch: 1, expiry: 2, qty: 3, gtin: -1, safety: -1 };
  return lines.slice(hasHeader ? 1 : 0).map((l) => {
    const c = split(l);
    const get = (k) => (idx[k] >= 0 ? c[idx[k]] || '' : '');
    // Quantities like "480", "1,200" or "480.00" (exports often add decimals) — never "48000".
    const qty = Math.floor(Number(String(get('qty')).replace(/[^\d.]/g, ''))) || 0;
    return { drug: get('drug'), batch: get('batch'), expiry: parseExpiry(get('expiry')), rawExpiry: get('expiry'), qty, gtin: get('gtin'), safetyStock: get('safety') };
  }).filter((r) => r.drug);
}

// sync: a stock export from billing software (Marg, GoFrugal…) — a file, quantities replace what's here
// (same medicine + batch + expiry), so importing again tomorrow never doubles the stock.
export function PasteStockModal({ open, onClose, onAdded, sync = false }) {
  const [run, busy] = useAction();
  const toast = useToast();
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [fileName, setFileName] = useState('');
  const rows = parsePastedStock(text);
  const bad = rows.filter((r) => !r.expiry || (!r.qty && !sync));
  const syncing = sync ? rows.filter((r) => r.qty > 0).length : rows.length;
  const pickFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (/\.xls$/i.test(f.name)) { toast('Old .xls files can\'t be read — save it as .xlsx or CSV, then choose that file', 'error'); return; }
    if (f.size > 5 * 1024 * 1024) { toast('That file is too big — export only the stock list', 'error'); return; }
    if (/\.xlsx$/i.test(f.name)) {
      // Excel: the first sheet becomes tab-separated rows, read by the same parser as a paste.
      readXlsx(f).then((rows) => { setText(rows.map((r) => r.join('\t')).join('\n')); setFileName(f.name); setResult(null); })
        .catch((err) => toast(err.message || 'Couldn\'t read that Excel file — save it as CSV instead', 'error'));
      return;
    }
    const rd = new FileReader();
    rd.onload = () => { setText(String(rd.result || '')); setFileName(f.name); setResult(null); };
    rd.readAsText(f);
  };
  const submit = async () => {
    // Zero-quantity lines in a stock export just mean "sold out" — skip them instead of failing.
    const send = rows.filter((r) => !sync || r.qty > 0).map(({ rawExpiry: _r, ...x }) => x);
    let added = 0; const errors = [];
    for (let i = 0; i < send.length; i += 300) {
      const r = await run('bulk', () => api.post('/inventory/bulk', { rows: send.slice(i, i + 300), mode: sync ? 'set' : 'add' }));
      if (!r) return;
      added += r.added;
      errors.push(...r.errors.map((e) => ({ ...e, row: e.row + i })));
    }
    setResult({ added, errors });
    if (added) { toast(`${added} line${added === 1 ? '' : 's'} ${sync ? 'synced' : 'added to stock'}`); onAdded?.(); }
    if (!errors.length) { setText(''); setFileName(''); onClose(); }
  };
  if (!open) return null;
  return (
    <Modal open wide onClose={onClose} title={sync ? 'Import from billing software' : 'Paste stock from Excel'}
      subtitle={sync ? 'Export your stock list from Marg, GoFrugal or any billing software as Excel (.xlsx) or CSV and choose the file. Quantities here are set to match it.' : 'Copy the rows from your supplier\'s sheet or invoice and paste them here — no typing one by one.'}
      footer={<><span className="grow tiny muted">{rows.length ? `${rows.length} row${rows.length === 1 ? '' : 's'} read${bad.length ? ` · ${bad.length} need a fix` : ''}` : ''}</span><Button variant="ghost" onClick={onClose}>Cancel</Button><Button icon={PackagePlus} loading={busy === 'bulk'} disabled={!syncing} onClick={submit}>{sync ? `Sync ${syncing || ''} lines` : `Add ${rows.length || ''} to stock`}</Button></>}>
      <div className="stack">
        {sync && (
          <div className="row wrap" style={{ gap: 8 }}>
            <label className="btn sm secondary" style={{ cursor: 'pointer' }}>Choose Excel or CSV file<input type="file" accept=".xlsx,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={pickFile} hidden /></label>
            <span className="tiny muted">{fileName || 'or paste the rows below'}</span>
          </div>
        )}
        <textarea className="textarea mono" rows={6} value={text} onChange={(e) => { setText(e.target.value); setResult(null); }}
          placeholder={'Medicine\tBatch\tExpiry\tQty\nParacetamol 500mg\tPCM24A118\t08/2027\t500\nMetformin 500mg\tMF2203\t31/03/2027\t300'} aria-label="Pasted rows" />
        <p className="tiny muted mb-0">Headers like Medicine / Item Name, Batch, Expiry, Qty / Closing Stock (and Barcode) are understood in any order. Expiry can be 2027-08-31, 31/08/2027, 08/2027 or Aug-27.{sync ? ' Lines with 0 in stock are skipped.' : ''}</p>
        {rows.length > 0 && (
          <div className="table-wrap" style={{ maxHeight: 260, overflow: 'auto' }}>
            <table className="table">
              <thead><tr><th>Medicine</th><th>Batch</th><th>Expiry</th><th className="right">Qty</th></tr></thead>
              <tbody>{rows.slice(0, 100).map((r, i) => (
                <tr key={i}><td>{r.drug}</td><td className="mono small">{r.batch || '—'}</td>
                  <td className={cx(!r.expiry && 'text-rose')}>{r.expiry || <span style={{ color: 'var(--rose)' }}>{r.rawExpiry ? `can't read “${r.rawExpiry}”` : 'missing'}</span>}</td>
                  <td className="right">{r.qty || (sync ? <span className="muted">0 · skipped</span> : <span style={{ color: 'var(--rose)' }}>missing</span>)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {result?.errors?.length > 0 && <div className="callout rose small"><span>{result.added} added. Not added: {result.errors.map((e) => `row ${e.row}${e.drug ? ` (${e.drug})` : ''} — ${e.error}`).join(' · ')}</span></div>}
      </div>
    </Modal>
  );
}

/* ---------- From your distributors: their invoice is your stock entry ---------- */
export function IncomingPurchases({ data, onDone }) {
  const [run, busy] = useAction();
  if (!data?.pending?.length) return null;
  const receive = async (b) => { if (await run(b.id, () => api.post(`/pharmacy/purchases/${b.id}/receive`), `${b.lines.length} item${b.lines.length === 1 ? '' : 's'} from ${b.from} added to your stock`)) onDone?.(); };
  return (
    <div className="card mb-2 ph-incoming">
      <h3 className="row" style={{ gap: 8 }}><Truck size={18} /> From your distributors</h3>
      <p className="small muted">Invoices billed to you on Sehatra — every medicine, batch and expiry is already on them. One tap puts them on your shelf.</p>
      <div className="stack" style={{ gap: 8 }}>
        {data.pending.map((b) => (
          <div key={b.id} className="row between wrap ph-incoming-row" style={{ gap: 8 }}>
            <span><strong translate="no">{b.from}</strong> <span className="mono tiny muted">{b.billNo}</span>
              <span className="tiny muted block">{fmtDate(b.createdAt)} · {b.lines.map((l) => `${l.name} × ${l.qty}`).join(', ')}</span></span>
            <Button size="sm" icon={CheckCircle2} loading={busy === b.id} onClick={() => receive(b)}>Add to my stock</Button>
          </div>
        ))}
      </div>
    </div>
  );
}
