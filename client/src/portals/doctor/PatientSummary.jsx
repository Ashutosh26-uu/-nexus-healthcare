import { useState } from 'react';
import { ArrowUp, ArrowDown, ArrowRight, ShieldAlert, Lock, History, FlaskConical, MessageSquareQuote, Pill, ChevronDown } from 'lucide-react';
import { useLive } from '../../live';
import { fmtDate, cx } from '../../components/ui';

const TREND = { up: ArrowUp, down: ArrowDown, same: ArrowRight };
const since = (days) => (days == null ? null : days === 0 ? 'since today' : days === 1 ? 'for 1 day' : `for ${days} days`);

// The first-minute card on the consult page: who this is, what not to give them, what they're on, what
// happened last time and which numbers are off. Same access rules as the full record (server-side).
export default function PatientSummary({ consultId }) {
  const [open, setOpen] = useState(true);
  // Live, like the record tabs: when the patient approves access mid-consult (or a report lands), the
  // locked card opens up without reopening the page. A failed refresh keeps the last summary on screen.
  const { data: s, error: loadError } = useLive(`/consults/${encodeURIComponent(consultId)}/summary`, ['consents', 'records', 'lab', 'prescriptions']);
  const error = !s && loadError;

  if (error) return null; // the rest of the consult page still works; the record tabs show the reason
  if (!s) return <div className="card dr-psum loading"><span className="spinner sm" /><span className="small muted">Loading patient summary…</span></div>;
  const symptom = s.symptoms?.text && s.symptoms.text !== 'Not provided' ? s.symptoms : null;
  const locked = s.access === 'restricted';

  return (
    <section className="card dr-psum fade-in" aria-label="Patient summary">
      <button type="button" className="dr-psum-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="eyebrow">Before you start</span>
        <span className="small"><strong>{s.patient.age ?? '—'} y · {s.patient.gender || '—'}</strong>{s.bloodGroup ? ` · ${s.bloodGroup}` : ''}</span>
        <ChevronDown size={16} className={cx('dr-psum-chev', open && 'open')} />
      </button>
      {open && (
        <div className="dr-psum-body">
          {symptom && (
            <div className="dr-psum-say"><MessageSquareQuote size={15} /><span className="small">“{symptom.text}”{since(symptom.days) ? <strong> — {since(symptom.days)}</strong> : null}</span></div>
          )}
          {locked ? (
            <div className="callout small"><Lock /><span>Medical history is locked until the patient approves access{s.pendingRequest ? ' (request sent)' : ''}. Ask from the History tab — the allergy check on your prescription still runs.</span></div>
          ) : (
            <>
              <div className="dr-psum-tags">
                {s.allergies.length ? s.allergies.map((a) => <span key={a} className="badge solid-rose"><ShieldAlert />Allergy: {a}</span>) : <span className="badge green">No known allergies</span>}
                {s.conditions.map((c) => <span key={c} className="badge">{c}</span>)}
              </div>
              {s.currentMeds.length > 0 && <div className="tiny dr-psum-meds"><Pill size={13} /><span>On: <span translate="no">{s.currentMeds.join(', ')}</span></span></div>}
              {s.access === 'emergency' && <p className="tiny muted mb-0">Emergency access — critical details only, until {fmtDate(s.expiresAt)}.</p>}
              {s.access === 'copy' && <p className="tiny muted mb-0">Read-only copy up to {fmtDate(s.copyUntil)} (the patient moved their care).</p>}
              {s.visits && (
                <div className="dr-psum-grid">
                  <div>
                    <span className="tiny muted row" style={{ gap: 4 }}><History size={13} />Last visits</span>
                    {s.visits.length === 0 ? <p className="tiny muted mb-0">First visit on Nexus.</p> : (
                      <ul className="dr-psum-list">
                        {s.visits.map((v) => <li key={v.id}><span className="tiny muted nowrap">{fmtDate(v.date)}</span> <span className="small">{v.diagnosis || '—'}</span> <span className="tiny muted" translate="no">· {v.withYou ? 'you' : v.doctorName}</span></li>)}
                      </ul>
                    )}
                  </div>
                  <div>
                    <span className="tiny muted row" style={{ gap: 4 }}><FlaskConical size={13} />Latest labs</span>
                    {s.labs.length === 0 ? <p className="tiny muted mb-0">No lab results yet.</p> : (
                      <ul className="dr-psum-list">
                        {s.labs.map((l) => {
                          const T = TREND[l.trend];
                          return (
                            <li key={l.name} className={cx(l.abnormal && 'abn')} title={l.prev ? `Previous ${l.prev.value} on ${fmtDate(l.prev.date)}` : undefined}>
                              <span className="small">{l.name}</span> <strong className="small">{l.value} {l.unit}</strong>
                              {T && <T size={13} className="dr-psum-trend" aria-label={`${l.trend} from ${l.prev.value}`} />}
                              {l.abnormal && <span className="badge rose tiny">{l.flag}</span>}
                              <span className="tiny muted nowrap"> · {fmtDate(l.date)}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
