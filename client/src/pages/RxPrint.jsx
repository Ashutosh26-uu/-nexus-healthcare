import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Download, ArrowLeft, Printer } from 'lucide-react';
import { api } from '../api';
import { Loading, fmtDate, fmtDateTime } from '../components/ui';
import { LogoMark } from '../components/Logo';
import QR from '../components/QR';
import { verifyUrl } from '../scanLinks';
import './rxprint.css';

// A clean A4 prescription. "Download PDF" uses the browser's Save-as-PDF, which renders every
// script (Hindi, Tamil, Urdu…) correctly — unlike a hand-built PDF with Latin-only fonts.
export default function RxPrint() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [rx, setRx] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const title = document.title;
    api.get(`/prescriptions/${encodeURIComponent(id)}`).then((r) => {
      setRx(r);
      document.title = `Prescription ${r.id} · ${r.patient?.name || ''}`;
    }).catch((e) => setError(e.message));
    return () => { document.title = title; }; // don't leave the patient's name in the tab after "Back"
  }, [id]);

  if (error) return <div className="rxp-wrap"><div className="rxp-error">{error}</div></div>;
  if (!rx) return <Loading />;

  const download = () => window.print();

  return (
    <div className="rxp-wrap">
      <div className="rxp-bar no-print">
        <button type="button" className="btn ghost" onClick={() => (window.history.length > 1 ? navigate(-1) : window.close())}><ArrowLeft size={16} /> Back</button>
        <span className="small muted">Choose <strong>“Save as PDF”</strong> as the printer to download.</span>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn secondary" onClick={download}><Printer size={16} /> Print</button>
          <button type="button" className="btn" onClick={download}><Download size={16} /> Download PDF</button>
        </div>
      </div>

      <article className="rxp-page">
        <header className="rxp-head">
          <div className="rxp-brand">
            <LogoMark size={40} />
            <div>
              <strong>Nexus Healthcare</strong>
              <span>National Health Network · e-Prescription</span>
            </div>
          </div>
          <div className="rxp-doc">
            <strong translate="no">{rx.doctor?.name}</strong>
            <span>{rx.doctor?.qualification}</span>
            <span>{rx.doctor?.specialty}{rx.doctor?.affiliation ? ` · ${rx.doctor.affiliation}` : ''}</span>
            <span>Reg. No. <b>{rx.doctor?.regNo}</b></span>
          </div>
        </header>

        <section className="rxp-patient">
          <div><span>Patient</span><strong translate="no">{rx.patient?.name}</strong></div>
          <div><span>Age / Sex</span><strong>{rx.patient?.age ?? '—'} y / {rx.patient?.gender || '—'}</strong></div>
          <div><span>Health Passport</span><strong className="mono">{rx.patient?.id}</strong></div>
          <div><span>Date</span><strong>{fmtDate(rx.createdAt)}</strong></div>
          <div><span>Rx No.</span><strong className="mono">{rx.id}</strong></div>
          {rx.patient?.allergies?.length > 0 && <div className="rxp-allergy"><span>Allergies</span><strong>{rx.patient.allergies.join(', ')}</strong></div>}
        </section>

        {rx.complaint && <p className="rxp-dx"><span>Complaint:</span> {rx.complaint}</p>}
        {rx.diagnosis && <p className="rxp-dx"><span>Diagnosis:</span> {rx.diagnosis}</p>}

        <div className="rxp-rx">℞</div>
        <table className="rxp-table">
          <thead><tr><th>#</th><th>Medicine</th><th>Dose</th><th>When</th><th>Days</th><th>Qty</th></tr></thead>
          <tbody>
            {(rx.items || []).map((it, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td translate="no"><strong>{it.drug}</strong></td>
                <td>{it.dose}</td>
                <td>{it.freq}{it.food ? <span className="rxp-food"> · {it.food}</span> : null}{it.note ? <div className="rxp-food">{it.note}</div> : null}{it.noSub ? <div className="rxp-food"><strong>No substitution</strong></div> : null}</td>
                <td>{it.days}</td>
                <td>{it.units} {it.unit}{it.units > 1 ? 's' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {rx.labTests?.length > 0 && (
          <section className="rxp-block"><h4>Investigations advised</h4><p>{rx.labTests.map((t) => t.name).join(' · ')}</p></section>
        )}
        {rx.advice && <section className="rxp-block"><h4>Advice</h4><p>{rx.advice}</p></section>}
        {(rx.dos?.length > 0 || rx.donts?.length > 0) && (
          <section className="rxp-block rxp-dos">
            {rx.dos?.length > 0 && <div><h4>Do</h4><ul>{rx.dos.map((x) => <li key={x}>{x}</li>)}</ul></div>}
            {rx.donts?.length > 0 && <div><h4>Don&apos;t</h4><ul>{rx.donts.map((x) => <li key={x}>{x}</li>)}</ul></div>}
          </section>
        )}
        {rx.followUp && <section className="rxp-block"><h4>Follow-up</h4><p>{fmtDateTime(rx.followUp)}</p></section>}

        <footer className="rxp-foot">
          <div className="rxp-qr">
            <QR value={verifyUrl('rx', rx.id, rx.verifySig) || `nexus:rx:${rx.id}`} size={92} label="Prescription QR — scan to verify" />
            <span>Scan with any phone camera to check it’s genuine</span>
          </div>
          <div className="rxp-sign">
            <span className="rxp-sig-name" translate="no">{rx.doctor?.name}</span>
            <span>Digitally signed · {rx.signature}</span>
            <span>{fmtDateTime(rx.createdAt)}</span>
          </div>
        </footer>
        <p className="rxp-note">This is a digitally signed e-prescription issued through Nexus Healthcare (Telemedicine Practice Guidelines, 2020). Valid without a physical signature. Not valid for Schedule X drugs.</p>
      </article>
    </div>
  );
}
