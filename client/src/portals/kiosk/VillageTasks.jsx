import { ClipboardList } from 'lucide-react';
import { cx } from '../../components/ui';
import { useLive } from '../../live';

const KIND = { vaccine: 'Vaccine', readings: 'BP / sugar', recovery: 'Recovery', pregnancy: 'Pregnancy' };

// Today's to-do list for people this E-Clinic looks after: children due a vaccine, care-plan patients who
// haven't sent readings, people mid-course who haven't checked in. Urgent ones first.
export default function VillageTasks() {
  const { data } = useLive('/kiosk/tasks', ['kiosks', 'recovery', 'notifications']);
  const tasks = data?.tasks || [];
  if (!tasks.length) return null;
  return (
    <section className="k-op-card">
      <div className="k-op-card-h"><h3 className="row" style={{ gap: 8 }}><ClipboardList size={18} /> Today's follow-ups</h3><span className="k-fine">{tasks.length} for people registered or seen here</span></div>
      <div>
        {tasks.map((t, i) => (
          <div key={`${t.patientId}-${t.kind}-${i}`} className={cx('task-row', t.urgent && 'urgent')}>
            <span className="dot" />
            <div className="grow" style={{ minWidth: 0 }}>
              <strong translate="no">{t.name}</strong> <span className="k-fine">· {KIND[t.kind]} · {t.patientId}</span>
              <div className="k-fine">{t.text}</div>
            </div>
          </div>
        ))}
      </div>
      <p className="k-fine mb-0">Call or visit them, or remind them when they come in.</p>
    </section>
  );
}
