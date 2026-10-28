import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Printer, AlertTriangle } from 'lucide-react';
import { api } from '../api';
import { Loading } from '../components/ui';
import './summary.css';

const Row = ({ k, v }) => (v ? <div className="ms-row"><span>{k}</span><strong>{v}</strong></div> : null);

// What a doctor anywhere sees from the private link a patient shared (Care abroad). English, printable, no
// account needed; the link expires or can be switched off by the patient.
export default function MedicalSummary() {
  const { token } = useParams();
  const [s, setS] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.get(`/public/travel-summary/${encodeURIComponent(token)}`).then(setS).catch((e) => setErr(e.message));
  }, [token]);
  if (err) return <main className="ms"><p>{err}</p></main>;
  if (!s) return <main className="ms"><Loading /></main>;
  const p = s.patient;
  return (
    <main className="ms" lang="en">
      <header className="ms-head">
        <div>
          <div className="ms-kicker">Patient medical summary · shared by the patient via Sehatra (India)</div>
          <h1 translate="no">{p.name}</h1>
          <div className="ms-sub">{[p.age != null && `${p.age} years`, p.sex, p.dateOfBirth && `born ${p.dateOfBirth}`, `blood group ${p.bloodGroup}`].filter(Boolean).join(' · ')}</div>
        </div>
        <button type="button" className="btn sm secondary no-print" onClick={() => window.print()}><Printer size={15} /> Print / save PDF</button>
      </header>

      <section className={s.allergies.length ? 'ms-alert' : 'ms-box'}>
        <h2>{s.allergies.length ? <><AlertTriangle size={16} /> Allergies</> : 'Allergies'}</h2>
        <p>{s.allergies.length ? s.allergies.join(', ') : 'None recorded'}</p>
      </section>
      <div className="ms-grid">
        <section className="ms-box"><h2>Conditions</h2><p>{s.conditions.length ? s.conditions.join(', ') : 'None recorded'}</p></section>
        <section className="ms-box"><h2>Current medicines</h2><p>{s.currentMedicines.length ? s.currentMedicines.join(', ') : 'None recorded'}</p></section>
      </div>
      {s.pregnancy && <section className="ms-alert"><h2>Pregnant</h2><p>{s.pregnancy.weeks} weeks · due {s.pregnancy.dueDate}</p></section>}

      {s.prescriptions?.length > 0 && (
        <section className="ms-box"><h2>Recent prescriptions</h2>
          {s.prescriptions.map((r, i) => (
            <div key={i} className="ms-item">
              <div className="ms-date">{r.date}{r.doctor ? ` · ${r.doctor}` : ''}{r.diagnosis ? ` · ${r.diagnosis}` : ''}</div>
              <ul>{r.medicines.map((m, j) => <li key={j}><strong>{m.name}</strong>{[m.dose, m.frequency, m.days && `${m.days} days`].filter(Boolean).length ? ` — ${[m.dose, m.frequency, m.days && `${m.days} days`].filter(Boolean).join(', ')}` : ''}</li>)}</ul>
              {r.advice && <div className="ms-note">{r.advice}</div>}
            </div>
          ))}
        </section>
      )}

      {s.labResults?.length > 0 && (
        <section className="ms-box"><h2>Recent lab results</h2>
          {s.labResults.map((o, i) => (
            <div key={i} className="ms-item">
              <div className="ms-date">{o.date}{o.lab ? ` · ${o.lab}` : ''}</div>
              <table className="ms-table"><tbody>
                {o.results.map((r, j) => <tr key={j} className={r.flag && !['normal', 'negative'].includes(String(r.flag).toLowerCase()) ? 'flag' : ''}><td>{r.test}</td><td><strong>{r.value}</strong> {r.unit}</td><td>{r.range}</td><td>{r.flag || ''}</td></tr>)}
              </tbody></table>
            </div>
          ))}
        </section>
      )}

      {s.vaccinations.length > 0 && <section className="ms-box"><h2>Vaccinations</h2><p>{s.vaccinations.map((v) => `${v.name}${v.date ? ` (${v.date})` : ''}`).join(', ')}</p></section>}
      {s.emergencyContacts.length > 0 && (
        <section className="ms-box"><h2>Emergency contacts</h2>
          {s.emergencyContacts.map((c, i) => <Row key={i} k={c.relation || 'Contact'} v={<>{c.name} · <a href={`tel:${c.phone}`}>{c.phone}</a></>} />)}
        </section>
      )}
      <footer className="ms-foot">
        Health Passport {p.passportId} · generated {s.generatedAt.slice(0, 16).replace('T', ' ')} UTC · link valid until {s.validUntil.slice(0, 10)}.
        Recorded by the patient and their doctors on Sehatra; please confirm anything critical with the patient or their doctor.
      </footer>
    </main>
  );
}
