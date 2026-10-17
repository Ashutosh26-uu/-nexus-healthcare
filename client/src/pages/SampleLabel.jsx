import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { api } from '../api';
import { Loading } from '../components/ui';
import { code128Svg } from '../portals/lab/code128';
import { getLocale } from '../i18n';
import './labelprint.css';

// 50×25 mm tube label: Code 128 barcode of the sample ID, initials + last 4 of the Health Passport ID
// (never the full name), age/sex, LOINC test codes and collection time.
export default function SampleLabel() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [l, setL] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get(`/lab-orders/${encodeURIComponent(id)}/label`).then(setL).catch((e) => setError(e.message));
  }, [id]);
  const print = () => {
    api.post(`/lab-orders/${encodeURIComponent(id)}/label/printed`).catch(() => {}); // records sampleLabelPrintedAt
    window.print();
  };
  if (error) return <div className="slp-wrap"><div className="slp-error">{error}</div></div>;
  if (!l) return <Loading />;
  const when = l.collectedAt ? new Date(l.collectedAt).toLocaleString(getLocale(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
  return (
    <div className="slp-wrap">
      <div className="slp-bar no-print">
        <button type="button" className="btn ghost sm" onClick={() => (window.history.length > 1 ? navigate(-1) : window.close())}><ArrowLeft size={16} /> Back</button>
        <button type="button" className="btn sm" onClick={print}><Printer size={16} /> Print label</button>
      </div>
      <p className="slp-hint small muted no-print">Set the printer to a 50 × 25 mm label, scale 100%, no margins.{l.printedAt ? ' Printed before — this is a reprint.' : ''}</p>
      <div className="slp-zoom">
        <div className="slp-label" translate="no">
          <div className="slp-top"><strong>{l.lab.short}</strong><span>{when}</span></div>
          <div className="slp-code" dangerouslySetInnerHTML={{ __html: code128Svg(l.sampleId, { title: l.sampleId }) }} />
          <div className="slp-id">{l.sampleId}</div>
          <div className="slp-who"><strong>{l.initials}</strong> · ID …{l.idLast4} · {l.age ?? '—'}{l.sex}</div>
          <div className="slp-tests">{l.tests.join(' ')}</div>
        </div>
      </div>
    </div>
  );
}
