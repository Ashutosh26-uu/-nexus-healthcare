import { Link } from 'react-router-dom';
import { HeartPulse, AlertTriangle, Check, FolderOpen } from 'lucide-react';
import { api } from '../../api';
import { Button, Card, Empty, Loading, cx, useAction } from '../../components/ui';
import { PageHeader } from '../../components/PortalLayout';
import { useLive } from '../../live';
import '../patient/recovery.css';

const FEEL = { better: 'Better', same: 'Same', worse: 'Worse' };
const TOOK = { all: 'took all doses', some: 'took some doses', none: 'missed doses' };

// Care Companion, doctor side: everyone on a short course you prescribed, with their daily "how do you feel"
// answers. Anyone worse, with danger signs, or not improving after three days comes first.
export default function Recovery() {
  const { data, loading, reload } = useLive('/doctor/recovery', ['recovery', 'prescriptions']);
  const [run, busy] = useAction();
  if (loading && !data) return <Loading />;
  const rows = data?.patients || [];
  const alerts = rows.filter((r) => r.needsReview);

  return (
    <div className="stack lg">
      <PageHeader eyebrow="Care Companion" title="Recovery check-ins"
        subtitle="Patients on a short course of your medicines answer two questions a day. Anyone feeling worse, with a danger sign, or not improving after three days is shown first — and you get an alert." />

      {!rows.length ? (
        <Card><Empty icon={HeartPulse} title="No one on a short course right now">When you prescribe a course of up to 14 days, the patient is asked each day how they feel — their answers show up here.</Empty></Card>
      ) : (
        <Card title={alerts.length ? `${alerts.length} need${alerts.length === 1 ? 's' : ''} your attention` : `${rows.length} recovering`}>
          <div className="rc-list">
            {rows.map((r) => (
              <article key={r.rxId} className={cx('rc-row', r.needsReview && 'alert')}>
                <div>
                  <div className="row wrap" style={{ gap: 8 }}>
                    <strong translate="no">{r.patientName}</strong>
                    {r.needsReview && <span className="badge rose"><AlertTriangle size={12} /> Needs review</span>}
                  </div>
                  <div className="rc-meta">
                    <span>Day {r.day} of {r.days}{r.diagnosis ? ` · ${r.diagnosis}` : ''}</span>
                    <span className="rc-dots" aria-label="Daily answers">{Array.from({ length: r.days }, (_, i) => <i key={i} className={r.trend[i] || ''} />)}</span>
                    {r.latest ? <span>Last: <strong>{FEEL[r.latest.feel]}</strong>{r.latest.took ? `, ${TOOK[r.latest.took]}` : ''}</span> : <span className="muted">No check-in yet</span>}
                    {r.adherence != null && <span>{r.adherence}% days with all doses</span>}
                    {!r.checkedInToday && <span className="muted">not checked in today</span>}
                  </div>
                </div>
                <div className="rc-actions">
                  <Link className="btn sm secondary" to={`/doctor/patients/${r.patientId}`}><FolderOpen size={15} /> Record</Link>
                  {r.needsReview && r.id && (
                    <Button size="sm" icon={Check} loading={busy === r.id} onClick={() => run(r.id, () => api.post(`/doctor/recovery/${r.id}/seen`), 'Marked as reviewed').then(reload)}>Reviewed</Button>
                  )}
                </div>
                {r.latest && (r.latest.flags?.length > 0 || r.latest.note) && (
                  <div className="rc-flags">
                    {r.latest.flags?.length > 0 && <><AlertTriangle size={13} /> {r.latest.flags.join(' · ')}</>}
                    {r.latest.note && <div className="muted">“{r.latest.note}”</div>}
                  </div>
                )}
              </article>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
