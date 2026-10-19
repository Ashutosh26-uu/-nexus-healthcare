import { Fragment, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Download, ArrowLeft, Printer } from 'lucide-react';
import { api } from '../api';
import { Loading, fmtDate, fmtDateTime } from '../components/ui';
import './rxprint.css';

// A partner's bill (pharmacy counter sale, warehouse B2B invoice, lab bill), laid out like the medicine-order
// invoice. Every number comes from the server; "Download PDF" is the browser's Save as PDF.
const inr = (n) => (n === null || n === undefined ? '—' : `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const mmyy = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { month: '2-digit', year: '2-digit' }) : '—');
const MODE = { cash: 'Cash', upi: 'UPI', card: 'Card', credit: 'Credit' };

export default function BillPrint() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [bill, setBill] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const title = document.title;
    let alive = true;
    api.get(`/billing/bills/${encodeURIComponent(id)}`).then((r) => {
      if (!alive) return;
      setBill(r);
      document.title = `${r.billNo} · ${r.facility?.name || ''}`;
    }).catch((e) => alive && setError(e.message));
    return () => { alive = false; document.title = title; };
  }, [id]);

  if (error) return <div className="rxp-wrap"><div className="rxp-error">{error}</div></div>;
  if (!bill) return <Loading />;
  const f = bill.facility || {};
  const t = bill.totals || {};
  const lab = f.type === 'lab';
  const b2b = f.type === 'warehouse';
  const docTitle = lab ? 'Bill of supply' : f.gstin ? 'Tax invoice' : 'Bill of supply';
  const hasBatch = bill.lines.some((l) => l.batch);
  const anyDiscount = bill.lines.some((l) => l.discount > 0);

  return (
    <div className="rxp-wrap">
      <div className="rxp-bar no-print">
        <button type="button" className="btn ghost" onClick={() => (window.history.length > 1 ? navigate(-1) : window.close())}><ArrowLeft size={16} /> Back</button>
        <span className="small muted">Choose <strong>“Save as PDF”</strong> as the printer to download.</span>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn secondary" onClick={() => window.print()}><Printer size={16} /> Print</button>
          <button type="button" className="btn" onClick={() => window.print()}><Download size={16} /> Download PDF</button>
        </div>
      </div>

      <article className="rxp-page inv-page">
        {bill.status === 'cancelled' && <div className="bl-void">CANCELLED · {fmtDate(bill.cancelledAt)} · {bill.cancelReason}</div>}
        <header className="rxp-head">
          <div className="inv-store">
            <strong translate="no">{f.name}</strong>
            {f.address && <span>{f.address}</span>}
            <span>{[f.district, f.state, f.pincode].filter(Boolean).join(', ')}{f.phone ? ` · ${f.phone}` : ''}</span>
            {f.gstin && <span>GSTIN <b className="mono">{f.gstin}</b></span>}
            {f.licenceNo && <span>{lab ? 'Registration' : 'Drug licence'} {f.licenceNo}</span>}
            {lab && f.nabl && <span>NABL accredited</span>}
          </div>
          <div className="rxp-doc">
            <strong>{docTitle}</strong>
            <span>No. <b className="mono">{bill.billNo}</b></span>
            <span>{fmtDateTime(bill.createdAt)}</span>
            {bill.dueDate && bill.due > 0 && <span>Due by {fmtDate(bill.dueDate)}</span>}
          </div>
        </header>

        <section className="rxp-patient inv-party">
          <div><span>{b2b ? 'Billed to' : lab ? 'Patient' : 'Customer'}</span><strong translate="no">{bill.customer?.name || 'Walk-in customer'}</strong></div>
          {bill.customer?.phone && <div><span>Phone</span><strong>{bill.customer.phone}</strong></div>}
          {bill.customer?.gstin && <div><span>Buyer GSTIN</span><strong className="mono">{bill.customer.gstin}</strong></div>}
          {b2b && <div><span>Place of supply</span><strong>{bill.customer?.state || f.state}{t.interState ? ' (inter-state)' : ''}</strong></div>}
          {bill.customer?.address && <div><span>Address</span><strong>{bill.customer.address}</strong></div>}
        </section>

        <div className="inv-scroll">
          <table className="rxp-table inv-table">
            <thead>
              <tr>
                <th>#</th><th>{lab ? 'Test / package' : 'Item'}</th>{hasBatch && <th>Batch · Exp</th>}<th>Qty</th>
                <th>{b2b ? 'Rate' : lab ? 'Fee' : 'Price'}</th>{anyDiscount && <th>Disc.</th>}
                {!lab && <th>Taxable</th>}{!lab && <th>GST</th>}<th style={{ textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {bill.lines.map((l, i) => (
                <tr key={`${l.name}-${i}`}>
                  <td>{i + 1}</td>
                  <td translate="no"><strong>{l.name}</strong>{l.mrp ? <div className="rxp-food">MRP {inr(l.mrp)}</div> : null}</td>
                  {hasBatch && <td>{l.batch || '—'} · {mmyy(l.expiry)}</td>}
                  <td>{l.qty}{l.unit && !['test', 'booking'].includes(l.unit) ? ` ${l.unit}` : ''}</td>
                  <td>{inr(l.price)}</td>
                  {anyDiscount && <td>{l.discount > 0 ? `−${inr(l.discount)}` : ''}</td>}
                  {!lab && <td>{inr(l.taxable)}</td>}
                  {!lab && <td>{l.gstRate}%</td>}
                  <td style={{ textAlign: 'right' }}>{inr(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="inv-bottom">
          {!lab && t.slabs?.length > 0 ? (
            <table className="inv-slabs">
              <thead><tr><th>GST</th><th>Taxable</th>{t.interState ? <th>IGST</th> : <><th>CGST</th><th>SGST</th></>}</tr></thead>
              <tbody>{t.slabs.map((s) => <tr key={s.rate}><td>{s.rate}%</td><td>{inr(s.taxable)}</td>{t.interState ? <td>{inr(s.igst)}</td> : <><td>{inr(s.cgst)}</td><td>{inr(s.sgst)}</td></>}</tr>)}</tbody>
            </table>
          ) : <div />}
          <dl className="inv-totals">
            {t.discount > 0 && <><dt>Discount</dt><dd>−{inr(t.discount)}</dd></>}
            {!lab && <><dt>Taxable value</dt><dd>{inr(t.taxable)}</dd><dt>GST</dt><dd>{inr(t.gst)}</dd></>}
            {t.roundOff ? <><dt>Round off</dt><dd>{t.roundOff > 0 ? '+' : '−'}{inr(Math.abs(t.roundOff))}</dd></> : null}
            <dt className="inv-grand">Total</dt><dd className="inv-grand">{inr(t.total)}</dd>
            {(bill.payments || []).map((p) => <Fragment key={p.id}><dt>Paid · {MODE[p.mode] || p.mode}{p.ref ? ` (${p.ref})` : ''} · {fmtDate(p.at)}</dt><dd>{inr(p.amount)}</dd></Fragment>)}
            {bill.due > 0 && <><dt className="inv-grand">Balance due</dt><dd className="inv-grand">{inr(bill.due)}</dd></>}
            {bill.status === 'cancelled' && bill.refundDue > 0 && <><dt>To be refunded</dt><dd>{inr(bill.refundDue)}</dd></>}
          </dl>
        </div>

        {bill.notes && <p className="rxp-note"><strong>Note:</strong> {bill.notes}</p>}
        <p className="rxp-note">
          {lab ? 'Healthcare diagnostic services are exempt from GST. ' : b2b ? 'Rates are before GST; GST is added as shown. ' : 'Prices include GST (MRP-inclusive); the taxable value is worked back from the price. '}
          {f.billTerms ? `${f.billTerms} ` : ''}Generated on Nexus Healthcare by {bill.createdByName || 'the store'}.
        </p>
      </article>
    </div>
  );
}
