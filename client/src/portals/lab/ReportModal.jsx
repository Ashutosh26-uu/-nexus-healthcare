import { useRef, useState } from 'react';
import { Plus, Trash2, Paperclip, AlertTriangle, CheckCircle2, Radar, FileText, X } from 'lucide-react';
import { Modal, Button, useAction, cx } from '../../components/ui';
import { api } from '../../api';
import { TestChips } from './shared';

const TEMPLATES = {
  dengue: { label: 'Dengue NS1', rows: [{ name: 'Dengue NS1 Antigen', kind: 'qual', value: 'Negative', unit: '', range: 'Negative' }] },
  cbc: {
    label: 'CBC',
    rows: [
      { name: 'Haemoglobin', unit: 'g/dL', range: '12.0 – 16.0' },
      { name: 'Total WBC count', unit: '×10³/µL', range: '4.0 – 11.0' },
      { name: 'Platelet count', unit: '×10³/µL', range: '150 – 410' },
    ],
  },
  hba1c: { label: 'HbA1c', rows: [{ name: 'HbA1c', unit: '%', range: '4.0 – 5.6' }] },
  fbs: { label: 'Fasting sugar', rows: [{ name: 'Fasting Blood Sugar', unit: 'mg/dL', range: '70 – 100' }] },
  lipid: {
    label: 'Lipid profile',
    rows: [
      { name: 'Total Cholesterol', unit: 'mg/dL', range: '< 200' },
      { name: 'LDL', unit: 'mg/dL', range: '< 100' },
      { name: 'HDL', unit: 'mg/dL', range: '> 40' },
      { name: 'Triglycerides', unit: 'mg/dL', range: '< 150' },
    ],
  },
};

// Panic values that must reach the doctor straight away.
const CRITICAL = [
  { re: /haemoglobin|hemoglobin|\bhb\b/i, low: 7, high: 20 },
  { re: /platelet/i, low: 20, high: 1000 },
  { re: /wbc/i, low: 2, high: 30 },
  { re: /blood sugar|glucose|fbs/i, low: 50, high: 400 },
];

const FLAGS = ['normal', 'high', 'low', 'positive', 'negative', 'critical'];

function templateKeyFor(name = '') {
  const n = name.toLowerCase();
  if (n.includes('dengue')) return 'dengue';
  if (n.includes('blood count') || n.includes('cbc')) return 'cbc';
  if (n.includes('hba1c')) return 'hba1c';
  if (n.includes('fasting') || n.includes('sugar')) return 'fbs';
  if (n.includes('lipid')) return 'lipid';
  return null;
}

let uid = 0;
const mkRow = (r) => ({ id: ++uid, kind: 'num', value: '', unit: '', range: '', manual: false, ...r, flag: r.kind === 'qual' ? 'negative' : 'normal' });

function autoFlag(row) {
  if (row.manual) return row.flag;
  if (row.kind === 'qual') return /pos/i.test(row.value) ? 'positive' : 'negative';
  const v = parseFloat(row.value);
  if (Number.isNaN(v)) return 'normal';
  const crit = CRITICAL.find((c) => c.re.test(row.name));
  if (crit && (v < crit.low || v > crit.high)) return 'critical';
  const r = row.range.replace(/,/g, '');
  const between = r.match(/([\d.]+)\s*[–-]\s*([\d.]+)/);
  if (between) return v < parseFloat(between[1]) ? 'low' : v > parseFloat(between[2]) ? 'high' : 'normal';
  const lt = r.match(/<\s*([\d.]+)/);
  if (lt) return v >= parseFloat(lt[1]) ? 'high' : 'normal';
  const gt = r.match(/>\s*([\d.]+)/);
  if (gt) return v <= parseFloat(gt[1]) ? 'low' : 'normal';
  return 'normal';
}

function initialRows(order) {
  const rows = [];
  for (const t of order.tests) {
    const k = templateKeyFor(t.name);
    if (k) TEMPLATES[k].rows.forEach((r) => rows.push(mkRow(r)));
    else rows.push(mkRow({ name: t.name }));
  }
  return rows;
}

export default function ReportModal({ order, onClose, onDone }) {
  const [result, setResult] = useState(null);
  const close = () => { setResult(null); onClose(); };
  return (
    <Modal open={!!order} onClose={close} wide title={result ? 'Report sent' : 'Upload report'} subtitle={order && !result ? `${order.patientName} · ${order.patientAge ?? ''} ${order.patientGender || ''} · ${order.patientId}` : undefined}>
      {order && (result
        ? <Success res={result} onClose={close} />
        : <ReportForm key={order.id} order={order} onSent={(res) => { setResult(res); onDone(res); }} onCancel={close} />)}
    </Modal>
  );
}

function ReportForm({ order, onSent, onCancel }) {
  const [rows, setRows] = useState(() => initialRows(order));
  const [pdf, setPdf] = useState(null);
  const [checked, setChecked] = useState(false);
  const [run, busy] = useAction();
  const fileRef = useRef(null);

  const update = (id, patch) => setRows((rs) => rs.map((r) => {
    if (r.id !== id) return r;
    const next = { ...r, ...patch };
    if (!('flag' in patch)) next.flag = autoFlag(next);
    return next;
  }));
  const addTemplate = (k) => setRows((rs) => [...rs.filter((r) => r.name || r.value), ...TEMPLATES[k].rows.map(mkRow)]);
  const remove = (id) => setRows((rs) => rs.filter((r) => r.id !== id));

  const filled = rows.filter((r) => r.name && String(r.value).trim() !== '');
  const criticals = filled.filter((r) => r.flag === 'critical');
  const canSend = filled.length > 0 && (!criticals.length || checked);

  const submit = async (e) => {
    e.preventDefault();
    const results = filled.map(({ name, value, unit, range, flag }) => ({ name, value: String(value).trim(), unit, range, flag }));
    const res = await run('send', () => api.post(`/lab-orders/${order.id}/report`, { results, attachment: pdf?.name }));
    if (res) onSent({ ...res, critical: criticals.length > 0, pdf: pdf?.name });
  };

  return (
    <form onSubmit={submit} className="stack lg">
      <div className="row wrap between" style={{ gap: 10 }}>
        <TestChips tests={order.tests} />
        <div className="row wrap lab-templates" style={{ gap: 6 }}>
          <span className="tiny muted">Quick add:</span>
          {Object.entries(TEMPLATES).map(([k, t]) => <button type="button" key={k} className="chip" onClick={() => addTemplate(k)}>{t.label}</button>)}
        </div>
      </div>

      <div className="lab-results">
        <div className="lab-res-head">
          <span>Test / parameter</span><span>Result</span><span>Unit</span><span>Reference range</span><span>Flag</span><span />
        </div>
        {rows.map((r) => (
          <div key={r.id} className={cx('lab-res-row', `flag-${r.flag}`)}>
            <input className="input sm" value={r.name} onChange={(e) => update(r.id, { name: e.target.value })} placeholder="Parameter" aria-label="Parameter name" />
            {r.kind === 'qual' ? (
              <div className="lab-qual">
                {['Negative', 'Positive'].map((v) => (
                  <button type="button" key={v} className={cx('lab-qual-btn', r.value === v && 'on', v === 'Positive' && 'pos')} onClick={() => update(r.id, { value: v })}>{v}</button>
                ))}
              </div>
            ) : (
              <input className="input sm" dir="ltr" inputMode="decimal" value={r.value} onChange={(e) => update(r.id, { value: e.target.value })} placeholder="Value" aria-label={`${r.name} value`} />
            )}
            <input className="input sm" value={r.unit} onChange={(e) => update(r.id, { unit: e.target.value })} placeholder="Unit" aria-label="Unit" />
            <input className="input sm" value={r.range} onChange={(e) => update(r.id, { range: e.target.value })} placeholder="e.g. 70 – 100" aria-label="Reference range" />
            <select className={cx('select sm lab-flag', `f-${r.flag}`)} value={r.flag} onChange={(e) => update(r.id, { flag: e.target.value, manual: true })} aria-label="Flag">
              {FLAGS.map((f) => <option key={f} value={f}>{f[0].toUpperCase() + f.slice(1)}</option>)}
            </select>
            <button type="button" className="icon-btn" onClick={() => remove(r.id)} aria-label="Remove row"><Trash2 /></button>
          </div>
        ))}
        <button type="button" className="lab-add-row" onClick={() => setRows((rs) => [...rs, mkRow({ name: '' })])}><Plus size={16} /> Add a parameter</button>
      </div>

      <div className="row wrap between" style={{ gap: 12 }}>
        <div className="row" style={{ gap: 10 }}>
          <input ref={fileRef} type="file" accept="application/pdf" hidden onChange={(e) => setPdf(e.target.files?.[0] || null)} />
          {pdf ? (
            <span className="badge sky lab-pdf"><FileText /> {pdf.name} <button type="button" onClick={() => { setPdf(null); fileRef.current.value = ''; }} aria-label="Remove PDF"><X size={12} /></button></span>
          ) : (
            <Button type="button" variant="secondary" size="sm" icon={Paperclip} onClick={() => fileRef.current?.click()}>Attach signed PDF (optional)</Button>
          )}
        </div>
        <span className="tiny muted">Flags fill in automatically from the range. Change them if your pathologist disagrees.</span>
      </div>

      {criticals.length > 0 && (
        <div className="callout rose lab-critical">
          <AlertTriangle />
          <div className="grow">
            <strong>Critical value: {criticals.map((c) => `${c.name} ${c.value} ${c.unit}`).join(', ')}</strong>
            <div>Doctor and patient will be notified immediately when you send this report.</div>
            <label className="check mt-1"><input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} /> I have re-checked this value on the analyser</label>
          </div>
        </div>
      )}

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant={criticals.length ? 'danger' : undefined} loading={busy === 'send'} disabled={!canSend}>
          {criticals.length ? 'Send critical report' : `Send report${filled.length ? ` (${filled.length} values)` : ''}`}
        </Button>
      </div>
    </form>
  );
}

function Success({ res, onClose }) {
  const o = res.order;
  const alert = res.newAlerts?.[0];
  const positives = o.results.filter((r) => r.flag === 'positive' && /dengue|malaria|typhoid|widal|influenza/i.test(r.name));
  return (
    <div className="stack lg lab-success">
      <div className="lab-success-hero">
        <CheckCircle2 size={40} />
        <div>
          <h3 className="mb-0">{o.patientName}'s report is in their Health Passport</h3>
          <p className="muted small mb-0">{o.results.length} values · mapped to LOINC · {res.pdf ? `PDF "${res.pdf}" attached` : 'structured values only'}</p>
        </div>
      </div>

      <ul className="lab-success-list">
        <li><CheckCircle2 size={16} /> {o.doctorName || 'The ordering doctor'} has been notified</li>
        <li><CheckCircle2 size={16} /> Patient gets an SMS and app notification</li>
        {res.critical && <li className="crit"><AlertTriangle size={16} /> Critical alert sent to doctor and patient — please also call the doctor if you can</li>}
      </ul>

      {alert ? (
        <div className="lab-feed-banner inline">
          <Radar size={20} />
          <div><strong>Anonymised result sent to the outbreak engine — new {alert.disease} watch alert created for pin {alert.pincode}.</strong>
            <div className="small">Shared: test, result, pin code, date. Not shared: name, Health ID, phone.</div></div>
        </div>
      ) : positives.length > 0 ? (
        <div className="lab-feed-banner inline">
          <Radar size={20} />
          <div><strong>Anonymised result sent to the outbreak engine for pin {o.pincode}.</strong>
            <div className="small">Counted toward the existing watch in this area.</div></div>
        </div>
      ) : null}

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button onClick={onClose}>Done</Button>
      </div>
    </div>
  );
}
