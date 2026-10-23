import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, WifiOff, AlertTriangle } from 'lucide-react';
import { cx, timeAgo, useAction } from '../../components/ui';
import { api } from '../../api';
import { useLive } from '../../live';
import { KButton } from './KUi';
import { useKiosk } from './context';

// Visits recorded while the internet was down, now on Sehatra: continue each one through the normal visit with
// everything pre-filled (identify or register the patient, then vitals and the doctor). Danger signs first.
export default function OfflineIntakes() {
  const { reset, setFlow } = useKiosk();
  const navigate = useNavigate();
  const { data, reload } = useLive('/kiosk/intakes', ['kiosks', 'notifications']);
  const [run, busy] = useAction();
  const rows = data?.intakes || [];
  if (!rows.length) return null;

  const resume = (i) => {
    reset();
    setFlow({
      step: 1,
      intakeId: i.id,
      prefill: { name: i.patient.name, age: i.patient.age, gender: i.patient.gender, phone: i.patient.phone },
      vitals: Object.keys(i.vitals || {}).length ? i.vitals : null,
      symptoms: i.symptoms ? { picked: [], text: i.symptoms, duration: '', severity: 0 } : null,
    });
    navigate('/kiosk');
  };

  return (
    <section className="k-op-card">
      <div className="k-op-card-h"><h3 className="row" style={{ gap: 8 }}><WifiOff size={18} /> Offline visits to finish</h3><span className="k-fine">{rows.length} recorded without internet</span></div>
      <div className="stack" style={{ gap: 8 }}>
        {rows.map((i) => (
          <div key={i.id} className={cx('k-intake', i.level === 'emergency' && 'emergency')}>
            <div className="grow" style={{ minWidth: 0 }}>
              <strong translate="no">{i.patient.name}</strong>{i.patient.age ? ` · ${i.patient.age} y` : ''}{i.patient.gender ? ` · ${i.patient.gender}` : ''}
              <div className="k-fine">
                {i.level === 'emergency' && <><AlertTriangle size={13} /> Danger signs{i.danger?.length ? `: ${i.danger.join(', ')}` : ''} · </>}
                {i.symptoms ? `“${i.symptoms.slice(0, 80)}”` : 'No symptoms written'} · recorded {timeAgo(i.recordedAt)}
              </div>
            </div>
            <KButton variant="ghost" icon={Check} loading={busy === `done-${i.id}`} onClick={() => run(`done-${i.id}`, () => api.post(`/kiosk/intakes/${i.id}/done`), 'Marked as handled').then(reload)}>Handled</KButton>
            <KButton icon={ArrowRight} onClick={() => resume(i)}>Continue visit</KButton>
          </div>
        ))}
      </div>
    </section>
  );
}
