import { LogoMark } from '../../components/Logo';
import { TRIAGE } from '../../components/ui';
import { useSupport } from '../../config';
import { getLocale } from '../../i18n';

const fmt = (iso) => new Date(iso || Date.now()).toLocaleString(getLocale(), { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/* Printable slip — what the kiosk thermal/A5 printer produces. Also shown on screen. */
export default function Slip({ kiosk, patient, consult, triage, vitals, booking, kind = 'rx' }) {
  const support = useSupport();
  const rx = consult?.prescription;
  const v = consult?.vitals || vitals;
  return (
    <div className="k-slip k-print-slip">
      <div className="k-slip-head">
        <LogoMark size={36} />
        <div>
          <strong>Nexus Healthcare E-Clinic</strong>
          <span>{kiosk?.name} · {kiosk?.district}, {kiosk?.state} {kiosk?.pincode}</span>
        </div>
        <span className="k-slip-date">{fmt(consult?.completedAt || consult?.createdAt)}</span>
      </div>

      <div className="k-slip-pt">
        <div><small>Patient</small><strong translate="no">{patient?.name}</strong><span>{patient?.age} y · {patient?.gender}</span></div>
        <div><small>Health Passport</small><strong className="mono" dir="ltr" translate="no">{patient?.id}</strong><span>Blood group {patient?.bloodGroup || '—'}</span></div>
        {patient?.allergies?.length > 0 && <div><small>Allergies</small><strong className="k-slip-allergy" translate="no">{patient.allergies.join(', ')}</strong></div>}
      </div>

      {v && (
        <div className="k-slip-vitals" dir="ltr">
          {v.bp && <span>BP <b>{v.bp}</b></span>}
          {v.pulse && <span>Pulse <b>{v.pulse}</b></span>}
          {v.spo2 && <span>SpO₂ <b>{v.spo2}%</b></span>}
          {v.temp && <span>Temp <b>{v.temp}°F</b></span>}
          {v.weight && <span>Wt <b>{v.weight} kg</b></span>}
          {v.sugar && <span>Sugar <b>{v.sugar}</b></span>}
        </div>
      )}

      {kind === 'rx' && consult && (
        <>
          <div className="k-slip-row"><small>Doctor</small><strong translate="no">{consult.doctorName}</strong><span>{consult.doctorSpecialty} · teleconsultation</span></div>
          {consult.diagnosis && <div className="k-slip-row"><small>Diagnosis</small><strong translate="no">{consult.diagnosis}</strong></div>}
          <div className="k-slip-rx">℞</div>
          {rx?.items?.length ? (
            <table className="k-slip-table">
              <thead><tr><th>Medicine</th><th>Dose</th><th>When</th><th>Days</th></tr></thead>
              <tbody>
                {rx.items.map((i) => <tr key={i.drug}><td translate="no"><b>{i.drug}</b></td><td>{i.dose}</td><td>{i.freq}</td><td>{i.days}</td></tr>)}
              </tbody>
            </table>
          ) : <p className="k-slip-none">No medicines prescribed.</p>}
          {rx?.advice && <div className="k-slip-row"><small>Advice</small><span translate="no">{rx.advice}</span></div>}
          <div className="k-slip-sign">
            <span>Digitally signed</span>
            <strong translate="no">{rx?.signature || consult.doctorName}</strong>
            <span className="mono" dir="ltr">Rx {rx?.id || consult.id}</span>
          </div>
        </>
      )}

      {kind === 'advice' && triage && (
        <>
          <div className="k-slip-row"><small>Guidance</small><strong>{TRIAGE[triage.level]?.label}</strong><span>{triage.note}</span></div>
          <div className="k-slip-row"><small>What to do</small><span>{triage.advice}</span></div>
          {booking && <div className="k-slip-row"><small>Appointment</small><strong>{fmt(booking.scheduledAt)} with {booking.doctorName}</strong><span>Come back to this kiosk 10 minutes early. Booking {booking.id}</span></div>}
          <div className="k-slip-row"><small>Come back at once if</small><span>breathing becomes hard, chest pain, fits, fainting, very high fever, or bleeding.</span></div>
        </>
      )}

      <div className="k-slip-foot">Emergency: call 108{support.phone ? ` · Helpline ${support.phone}` : ''} · This slip is also on your Health Passport.</div>
    </div>
  );
}
