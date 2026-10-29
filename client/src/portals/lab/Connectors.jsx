import { ShieldCheck, Check, X, Radar } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Card, Empty, fmtDate } from '../../components/ui';
import SoftwareConnect from '../../components/SoftwareConnect';

const NOTIFIABLE = /dengue|malaria|typhoid|widal|influenza/i;
const SHARED = ['Test type (LOINC code)', 'Result (positive / negative / value)', 'Pin code of the patient', 'Date of the test'];
const NOT_SHARED = ['Patient name', 'Health Passport / ABHA ID', 'Phone number or address', 'Age, gender or doctor name'];

export default function Connectors({ orders }) {

  // What the outbreak engine actually receives: one line per result, nothing personal.
  const feed = orders
    .filter((o) => o.status === 'reported')
    .flatMap((o) => (o.results || []).filter((r) => NOTIFIABLE.test(r.name)).map((r) => ({ test: r.name, code: o.tests.find((t) => NOTIFIABLE.test(t.name) && t.name.split(' ')[0].toLowerCase() === r.name.split(' ')[0].toLowerCase())?.code || '—', result: r.value, flag: r.flag, pin: o.pincode, date: o.reportedAt })))
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 8);

  return (
    <>
      <PageHeader title="LIS & data feed" subtitle="How results move in from your lab software, and what leaves the lab for public health." />
      <div className="grid two">
        <SoftwareConnect intro="Connect your lab software (LIS) or analyser PC: new orders reach it by themselves and results come back without typing. Results still wait for your pathologist's signature before anyone sees them. Manual entry with Enter results always works too." />

        <Card title={<h3 className="row" style={{ gap: 8 }}><ShieldCheck size={18} /> Anonymised feed to the outbreak engine</h3>}>
          <p className="small muted">For notifiable tests like Dengue, Malaria and Typhoid, a stripped-down copy of each result goes to the district outbreak engine. It compares today's positives with the usual level for that pin code and season.</p>
          <div className="lab-share">
            <div>
              <h4 className="small">What is shared</h4>
              <ul>{SHARED.map((s) => <li key={s}><Check size={15} className="ok" /> {s}</li>)}</ul>
            </div>
            <div>
              <h4 className="small">Never shared</h4>
              <ul>{NOT_SHARED.map((s) => <li key={s}><X size={15} className="no" /> {s}</li>)}</ul>
            </div>
          </div>
          <p className="tiny muted mb-0">Every alert is reviewed by a health official before any public advisory.</p>
        </Card>
      </div>

      <Card className="mt-3" title={<h3 className="row" style={{ gap: 8 }}><Radar size={18} /> Recent feed records</h3>} action={<span className="tiny muted">Exactly what left the lab</span>}>
        {feed.length === 0 ? <Empty title="Nothing sent yet">Records appear here after you release a Dengue, Malaria, Typhoid or Influenza result.</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Test</th><th>LOINC</th><th>Result</th><th>Pin code</th><th>Date</th></tr></thead>
              <tbody>
                {feed.map((f, i) => (
                  <tr key={i}>
                    <td>{f.test}</td>
                    <td className="mono muted">{f.code}</td>
                    <td><span className={`badge ${f.flag === 'positive' || f.flag === 'critical' ? 'clay' : f.flag === 'normal' || f.flag === 'negative' ? 'green' : 'sun'}`}>{f.result}</span></td>
                    <td className="mono">{f.pin}</td>
                    <td className="muted">{fmtDate(f.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
