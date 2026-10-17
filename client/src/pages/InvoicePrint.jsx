import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Download, ArrowLeft, Printer } from 'lucide-react';
import { api } from '../api';
import { Loading, fmtDate } from '../components/ui';
import './rxprint.css';

// GST tax invoice for a medicine order — same approach as RxPrint: the browser's "Save as PDF" renders
// every script correctly. Amounts come from the server; this page only lays them out.
const inr = (n) => (n === null || n === undefined ? '—' : `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const mmyy = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { month: '2-digit', year: '2-digit' }) : '—');

export default function InvoicePrint() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [inv, setInv] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const title = document.title;
    api.get(`/medicine-orders/${encodeURIComponent(orderId)}/invoice`).then((r) => {
      setInv(r);
      document.title = `Invoice ${r.invoiceNo} · ${r.store?.name || ''}`;
    }).catch((e) => setError(e.message));
    return () => { document.title = title; };
  }, [orderId]);

  if (error) return <div className="rxp-wrap"><div className="rxp-error">{error}</div></div>;
  if (!inv) return <Loading />;

  const s = inv.store;
  const t = inv.totals;
  const print = () => window.print();

  return (
    <div className="rxp-wrap">
      <div className="rxp-bar no-print">
        <button type="button" className="btn ghost" onClick={() => (window.history.length > 1 ? navigate(-1) : window.close())}><ArrowLeft size={16} /> Back</button>
        <span className="small muted">Choose <strong>“Save as PDF”</strong> as the printer to download.</span>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn secondary" onClick={print}><Printer size={16} /> Print</button>
          <button type="button" className="btn" onClick={print}><Download size={16} /> Download PDF</button>
        </div>
      </div>

      <article className="rxp-page inv-page">
        <header className="rxp-head">
          <div className="inv-store">
            <strong translate="no">{s.name}</strong>
            <span>{[s.address, s.district, s.state].filter(Boolean).join(', ')}{s.pincode ? ` – ${s.pincode}` : ''}</span>
            {s.phone && <span>Phone <bdi dir="ltr">{s.phone}</bdi></span>}
            <span>Drug licence no. <b translate="no">{s.licenceNo || '—'}</b></span>
            {s.gstin ? <span>GSTIN <b translate="no">{s.gstin}</b></span> : <span>GSTIN: not registered</span>}
          </div>
          <div className="rxp-doc">
            <strong>{s.gstin ? 'Tax invoice' : 'Bill of supply'}</strong>
            <span>Invoice no. <b translate="no">{inv.invoiceNo}</b></span>
            <span>Date {fmtDate(inv.invoiceDate)}</span>
            <span>Order <span translate="no">{inv.orderNo}</span> · {fmtDate(inv.orderDate)}</span>
          </div>
        </header>

        <section className="rxp-patient inv-party">
          <div><span>Billed to</span><strong translate="no">{inv.patient?.name}</strong></div>
          <div><span>Supply</span>{inv.fulfilment === 'delivery' ? 'Home delivery' : 'Counter pickup'}</div>
          {inv.rxDoctor ? <div><span>Prescribed by</span><span translate="no" className="inv-plain">{inv.rxDoctor}</span></div> : <div />}
          {inv.patient?.address && <div className="inv-wide"><span>Deliver to</span>{inv.patient.address}</div>}
        </section>

        <div className="inv-scroll">
          <table className="rxp-table inv-table">
            <thead>
              <tr><th>#</th><th>Item</th><th>Batch</th><th>Exp.</th><th className="r">Qty</th><th className="r">MRP</th><th className="r">Disc.</th><th className="r">Taxable</th><th className="r">GST</th><th className="r">Amount</th></tr>
            </thead>
            <tbody>
              {inv.lines.map((l, i) => (
                <tr key={`${l.drug}-${i}`}>
                  <td>{i + 1}</td>
                  <td><span translate="no">{l.drug}</span>{l.switchedFrom && <div className="inv-sub">Same-salt option chosen by patient · Rx: <span translate="no">{l.switchedFrom}</span></div>}</td>
                  <td className="mono">{l.batch || '—'}</td>
                  <td>{mmyy(l.expiry)}</td>
                  <td className="r">{l.qty}</td>
                  <td className="r">{inr(l.mrp)}</td>
                  <td className="r">{l.discount ? inr(l.discount) : '—'}</td>
                  <td className="r">{inr(l.taxable)}</td>
                  <td className="r">{l.gstRate}%{l.gstIndicative ? '*' : ''}<div className="inv-sub">{inr(l.gst)}</div></td>
                  <td className="r"><b>{inr(l.amount)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="inv-bottom">
          <table className="rxp-table inv-slabs">
            <thead><tr><th>GST %</th><th className="r">Taxable</th><th className="r">CGST</th><th className="r">SGST</th></tr></thead>
            <tbody>{inv.slabs.map((g) => <tr key={g.rate}><td>{g.rate}%</td><td className="r">{inr(g.taxable)}</td><td className="r">{inr(g.cgst)}</td><td className="r">{inr(g.sgst)}</td></tr>)}</tbody>
          </table>
          <dl className="inv-totals">
            <dt>Total at MRP</dt><dd>{inr(t.gross)}</dd>
            {t.discount > 0 && <><dt>Discount</dt><dd>− {inr(t.discount)}</dd></>}
            <dt>Taxable value</dt><dd>{inr(t.taxable)}</dd>
            <dt>GST (included)</dt><dd>{inr(t.gst)}</dd>
            <dt>Medicines</dt><dd>{inr(t.medicines)}</dd>
            {t.deliveryFee > 0 && <><dt>Delivery charge</dt><dd>{inr(t.deliveryFee)}</dd></>}
            <dt className="inv-grand">Total</dt><dd className="inv-grand">{inr(t.total)}</dd>
            {t.advancePaid > 0 && <><dt>Advance paid online</dt><dd>− {inr(t.advancePaid)}</dd></>}
            <dt><b>{t.balance > 0 ? 'Balance due' : 'Balance'}</b></dt><dd><b>{t.balance > 0 ? inr(t.balance) : 'Paid'}</b></dd>
          </dl>
        </div>

        <p className="rxp-note">
          {inv.gstIndicative && <>* GST rate is an indicative default (12% for most medicines) — confirm against the store&apos;s billing records. </>}
          {!s.gstin && <>This store has not added a GSTIN, so this is a bill of supply; the GST columns show the tax included in the MRP, for reference. </>}
          MRPs are inclusive of GST. Prices shown are indicative catalogue prices for this pilot. Computer-generated invoice from Nexus Healthcare; no signature required.
        </p>
      </article>
    </div>
  );
}
