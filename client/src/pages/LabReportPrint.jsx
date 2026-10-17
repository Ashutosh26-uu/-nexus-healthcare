import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Download, ArrowLeft, Printer, BadgeCheck } from 'lucide-react';
import { api } from '../api';
import { Loading, fmtDate, fmtDateTime } from '../components/ui';
import { LogoMark } from '../components/Logo';
import QR from '../components/QR';
import './rxprint.css';

// Printable lab report with results, flags, plain-language suggestions and the doctor's advice.
export default function LabReportPrint() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [o, setO] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const title = document.title;
    api.get(`/lab-orders/${encodeURIComponent(id)}`).then((r) => { setO(r); document.title = `Lab report ${r.id} · ${r.patient?.name || ''}`; }).catch((e) => setError(e.message));
    return () => { document.title = title; }; // don't leave the patient's name in the tab after "Back"
  }, [id]);
  if (error) return <div className="rxp-wrap"><div className="rxp-error">{error}</div></div>;
  if (!o) return <Loading />;
  const reported = o.status === 'reported';
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
            <div><strong>Nexus Healthcare</strong><span>Laboratory report</span></div>
          </div>
          <div className="rxp-doc">
            <strong translate="no">{o.lab?.name}</strong>
            {o.lab?.address && <span>{o.lab.address}</span>}
            <span>{o.lab?.district}{o.lab?.phone ? ` · ${o.lab.phone}` : ''}</span>
            {o.lab?.nabl && <span><BadgeCheck size={12} style={{ verticalAlign: '-2px' }} /> NABL accredited</span>}
          </div>
        </header>
        <section className="rxp-patient">
          <div><span>Patient</span><strong translate="no">{o.patient?.name}</strong></div>
          <div><span>Age / Sex</span><strong>{o.patient?.age ?? '—'} y / {o.patient?.gender || '—'}</strong></div>
          <div><span>Health Passport</span><strong className="mono">{o.patient?.id}</strong></div>
          <div><span>Referred by</span><strong translate="no">{o.doctorName || '—'}</strong></div>
          <div><span>Ordered</span><strong>{fmtDate(o.createdAt)}</strong></div>
          <div><span>Reported</span><strong>{reported ? fmtDateTime(o.reportedAt) : 'Pending'}</strong></div>
        </section>
        <h4 className="rxp-section-title">{(o.tests || []).map((t) => t.name).join(' · ')}</h4>
        {reported ? (
          <table className="rxp-table">
            <thead><tr><th>Test</th><th>Result</th><th>Unit</th><th>Reference range</th><th>Flag</th></tr></thead>
            <tbody>
              {(o.results || []).map((r, i) => (
                <tr key={`${r.name}-${i}`} className={r.flag && !['normal', 'negative'].includes(r.flag) ? 'rxp-flag' : ''}>
                  <td>{r.name}</td><td><strong>{r.value}</strong></td><td>{r.unit}</td><td>{r.range}</td><td>{r.flag && !['normal', 'negative'].includes(r.flag) ? r.flag.toUpperCase() : r.flag || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p>Results are not ready yet.</p>}
        {o.insights?.length > 0 && (
          <section className="rxp-block"><h4>What this means</h4>{o.insights.map((x, i) => <p key={i}>{x.test ? <strong>{x.test}: </strong> : null}{x.text}</p>)}</section>
        )}
        {o.nextSteps?.length > 0 && <section className="rxp-block"><h4>What to do next</h4>{o.nextSteps.map((x, i) => <p key={i}>{x.kind === 'urgent' ? '⚠ ' : '• '}{x.text}</p>)}</section>}
        {o.doctorNote && <section className="rxp-block"><h4>Doctor&apos;s advice — {o.doctorNote.by}</h4><p>{o.doctorNote.text}</p></section>}
        <footer className="rxp-foot">
          <div className="rxp-qr"><QR value={`nexus:lab:${o.id}`} size={84} label="Report QR" /><span>Scan to verify on Nexus Healthcare</span></div>
          <div className="rxp-sign">
            <span>Report ID {o.id}{o.sampleId ? ` · Sample ${o.sampleId}` : ''}</span>
            {reported && o.signedBy
              ? <span><strong translate="no">Approved by {o.signedBy.name}</strong> (Reg {o.signedBy.regNo}) · {fmtDateTime(o.signedBy.at)}{o.signedBy.self ? ' · reporting pathologist' : ''}</span>
              : <span>Electronically generated · no signature required</span>}
          </div>
        </footer>
        <p className="rxp-note">Suggestions are general guidance generated from the reference ranges, not a diagnosis. Please discuss your results with your doctor.</p>
      </article>
    </div>
  );
}
