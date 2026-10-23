import { AlertTriangle, CheckCircle2, Phone } from 'lucide-react';
import { cx, timeAgo } from '../../components/ui';
import { useLive } from '../../live';

const STEP = { 1: 'Doctor & patient alerted', 2: 'Doctor alerted again — please call', 3: 'Patient & family told to see a doctor', 4: 'Sehatra team alerted' };

// Critical results from this lab in the last two days: has the doctor seen it, and how far has it escalated?
// Unread ones come first, with the doctor's number so the lab can phone them.
export default function CriticalWatch() {
  const { data } = useLive('/lab/critical', ['lab', 'notifications']);
  const rows = data?.results || [];
  if (!rows.length) return null;
  const waiting = rows.filter((r) => !r.acknowledged).length;
  return (
    <section className={cx('card lab-crit', waiting && 'alert')} aria-label="Critical results">
      <div className="lab-crit-head">
        <strong className="row" style={{ gap: 8 }}><AlertTriangle size={18} /> Critical results {waiting ? `· ${waiting} not yet seen by the doctor` : '· all acknowledged'}</strong>
        <span className="tiny muted">Unread results escalate: doctor again at 30 min, patient &amp; family at 1 h, Sehatra team at 2 h.</span>
      </div>
      <div className="lab-crit-list">
        {rows.map((r) => (
          <div key={r.id} className={cx('lab-crit-row', !r.acknowledged && 'open')}>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="small"><strong translate="no">{r.patientName}</strong> · <span className="lab-crit-val">{r.values}</span></div>
              <div className="tiny muted">
                Signed {timeAgo(r.reportedAt)} · {r.doctorName ? <span translate="no">{r.doctorName}</span> : 'no ordering doctor'}
                {' · '}
                {r.acknowledged
                  ? <span className="lab-crit-ok"><CheckCircle2 size={12} /> seen by <span translate="no">{r.ackBy}</span> {timeAgo(r.ackAt)}</span>
                  : <span>{STEP[r.level] || STEP[1]}</span>}
              </div>
            </div>
            {!r.acknowledged && r.doctorPhone && <a className="btn sm" href={`tel:${r.doctorPhone}`}><Phone size={14} /> Call doctor</a>}
          </div>
        ))}
      </div>
    </section>
  );
}
