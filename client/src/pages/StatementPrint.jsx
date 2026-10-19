import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Download, ArrowLeft, Printer } from 'lucide-react';
import { api } from '../api';
import { Loading, fmtMoney, fmtDateTime } from '../components/ui';
import { getLocale } from '../i18n';
import { LogoMark } from '../components/Logo';
import './rxprint.css';

const monthLabel = (m) => new Date(`${m}-15T12:00:00`).toLocaleDateString(getLocale(), { month: 'long', year: 'numeric' });
const dayLabel = (d) => new Date(`${d}T12:00:00`).toLocaleDateString(getLocale(), { weekday: 'short', day: 'numeric', month: 'short' });

// A4 monthly earnings statement for the signed-in doctor. Like the prescription, "Download PDF" is the
// browser's Save-as-PDF, so every script renders correctly.
export default function StatementPrint() {
  const { month } = useParams();
  const navigate = useNavigate();
  const [st, setSt] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const title = document.title;
    let alive = true;
    api.get(`/doctor/statement?month=${encodeURIComponent(month)}`).then((r) => {
      if (!alive) return;
      setSt(r);
      document.title = `Statement ${r.month} · ${r.doctor?.name || ''}`;
    }).catch((e) => alive && setError(e.message));
    return () => { alive = false; document.title = title; };
  }, [month]);

  if (error) return <div className="rxp-wrap"><div className="rxp-error">{error}</div></div>;
  if (!st) return <Loading />;
  const rows = (st.days || []).filter((d) => d.consults > 0);
  const t = st.totals || {};

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

      <article className="rxp-page">
        <header className="rxp-head">
          <div className="rxp-brand">
            <LogoMark size={40} />
            <div>
              <strong>Nexus Healthcare</strong>
              <span>Monthly earnings statement</span>
            </div>
          </div>
          <div className="rxp-doc">
            <strong translate="no">{st.doctor.name}</strong>
            {st.doctor.qualification && <span>{st.doctor.qualification}</span>}
            <span>{st.doctor.specialty}{st.doctor.affiliation ? ` · ${st.doctor.affiliation}` : ''}</span>
            <span>Reg. No. <b>{st.doctor.regNo || '—'}</b></span>
          </div>
        </header>

        <section className="rxp-patient">
          <div><span>Statement for</span><strong>{monthLabel(st.month)}</strong></div>
          <div><span>Consults completed</span><strong>{t.consults}</strong></div>
          <div><span>Fees collected</span><strong>{fmtMoney(t.gross)}</strong></div>
          <div><span>Online / app</span><strong>{t.online}</strong></div>
          <div><span>E-Clinic (kiosk)</span><strong>{t.kiosk}</strong></div>
          <div><span>Your payout</span><strong>{fmtMoney(t.payout)}</strong></div>
        </section>

        {rows.length === 0 ? <p className="rxp-block">No consults were completed in {monthLabel(st.month)}.</p> : (
          <table className="rxp-table">
            <thead><tr><th>Date</th><th>Consults</th><th>Online</th><th>E-Clinic</th><th style={{ textAlign: 'right' }}>Fees</th></tr></thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.date}><td>{dayLabel(d.date)}</td><td>{d.consults}</td><td>{d.online}</td><td>{d.kiosk}</td><td style={{ textAlign: 'right' }}>{fmtMoney(d.fees)}</td></tr>
              ))}
            </tbody>
          </table>
        )}

        <table className="rxp-table rxp-totals">
          <tbody>
            <tr><td>Fees collected</td><td style={{ textAlign: 'right' }}>{fmtMoney(t.gross)}</td></tr>
            <tr><td>Platform fee ({Math.round(t.platformFeeRate * 100)}%)</td><td style={{ textAlign: 'right' }}>− {fmtMoney(t.platformFee)}</td></tr>
            <tr><td><strong>Payout to you</strong></td><td style={{ textAlign: 'right' }}><strong>{fmtMoney(t.payout)}</strong></td></tr>
          </tbody>
        </table>

        <p className="rxp-note">Fees are what patients paid for completed consults; E-Clinic consults count your listed fee of {fmtMoney(st.doctor.fee)}. Free follow-ups count as ₹0. Amounts are before TDS (section 194J), where applicable. Generated {fmtDateTime(st.generatedAt)}.</p>
      </article>
    </div>
  );
}
