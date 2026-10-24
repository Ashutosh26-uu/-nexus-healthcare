import { CalendarX2, BellRing, X } from 'lucide-react';
import { Button, Card, fmtDateTime, timeAgo, useAction } from '../../components/ui';
import { useLive } from '../../live';
import { api } from '../../api';

// Patients who didn't come back for the follow-up you asked for (last 30 days). One tap sends them a
// "please book again" nudge; set aside the ones you've handled another way.
export default function MissedFollowUps() {
  const { data, reload } = useLive('/doctor/missed-followups', ['consults', 'queue']);
  const [run, busy] = useAction();
  const rows = data || [];
  if (!rows.length) return null;
  const remind = (r) => run(`r-${r.id}`, () => api.post(`/doctor/missed-followups/${r.id}/remind`), `${r.patientName.split(' ')[0]} has been asked to book again`).then(reload);
  const dismiss = (r) => run(`d-${r.id}`, () => api.post(`/doctor/missed-followups/${r.id}/dismiss`)).then(reload);
  return (
    <Card title={<h3 className="row" style={{ gap: 8 }}><CalendarX2 size={18} /> Missed follow-ups · {rows.length}</h3>}>
      <p className="small muted mt-0">You asked to see them again, and they didn’t come.</p>
      <div className="stack" style={{ gap: 8 }}>
        {rows.map((r) => (
          <div key={r.id} className="row wrap" style={{ gap: 8 }}>
            <div className="grow" style={{ minWidth: 0 }}>
              <strong className="small" translate="no">{r.patientName}</strong>{r.age != null ? <span className="tiny muted"> · {r.age} y</span> : null}
              <div className="tiny muted">Was due {fmtDateTime(r.scheduledAt)}{r.reason ? ` · ${r.reason.slice(0, 80)}` : ''}{r.remindedAt ? ` · reminded ${timeAgo(r.remindedAt)}` : ''}</div>
            </div>
            <Button size="sm" variant="secondary" icon={BellRing} disabled={!r.canRemind} loading={busy === `r-${r.id}`} onClick={() => remind(r)}>{r.canRemind ? 'Remind' : 'Reminded'}</Button>
            <button type="button" className="icon-btn" aria-label="Set aside" title="Set aside" onClick={() => dismiss(r)} disabled={busy === `d-${r.id}`}><X size={16} /></button>
          </div>
        ))}
      </div>
    </Card>
  );
}
