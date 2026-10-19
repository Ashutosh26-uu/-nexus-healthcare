import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, AlertTriangle, CheckCircle2, HeartPulse, Droplet, Thermometer, Scale, Wind, MessageSquare, FolderOpen } from 'lucide-react';
import { api } from '../../api';
import { useLive } from '../../live';
import { PageHeader } from '../../components/PortalLayout';
import { Button, Card, Empty, Loading, timeAgo, useAction, cx } from '../../components/ui';

// Remote monitoring: alerts raised from patients' home readings (only patients who shared their record with
// this doctor), and a roll-call of every such patient's latest readings.
const KIND_ICON = { bp: HeartPulse, sugar: Droplet, spo2: Wind, temp: Thermometer, weight: Scale };
const LEVEL = { urgent: 'rose', watch: 'sun', ok: 'green' };

export default function Monitoring() {
  const { data, loading, error, reload } = useLive('/doctor/monitoring', ['monitoring', 'vitals', 'consents']);
  const navigate = useNavigate();
  const [tab, setTab] = useState('open');

  if (loading && !data) return <Loading />;
  if (error && !data) return <div className="form-error">{error}</div>;
  const open = data.alerts.filter((a) => a.status === 'open');
  const reviewed = data.alerts.filter((a) => a.status === 'reviewed');
  const shown = tab === 'open' ? open : reviewed;

  return (
    <div className="stack">
      <PageHeader eyebrow="Between visits" title="Remote monitoring"
        subtitle="Alerts from home readings of patients who shared their record with you — BP high on several days, rising averages, low sugars, low oxygen, lasting fever, sudden weight gain, and any dangerous single reading." />

      <div className="pills">
        <button type="button" className={cx('pill', tab === 'open' && 'active')} onClick={() => setTab('open')}>{open.length ? `Needs review (${open.length})` : 'Needs review'}</button>
        <button type="button" className={cx('pill', tab === 'reviewed' && 'active')} onClick={() => setTab('reviewed')}>Reviewed (14 days)</button>
      </div>

      {shown.length === 0 ? (
        <Card><Empty icon={CheckCircle2} title={tab === 'open' ? 'Nothing needs review' : 'No reviewed alerts in the last 14 days'}>
          {tab === 'open' ? 'When a patient’s home readings show a pattern worth a look, it appears here and in your notifications.' : 'Alerts you review stay here for two weeks.'}
        </Empty></Card>
      ) : (
        <div className="stack">
          {shown.map((a) => <AlertCard key={a.id} a={a} onOpen={() => navigate(`/doctor/patients/${a.patientId}`)} onDone={reload} />)}
        </div>
      )}

      <Card title={<h3 className="row" style={{ gap: 8 }}><Activity size={18} /> Patients sending home readings</h3>} action={<span className="tiny muted">Last 30 days</span>}>
        {data.patients.length === 0 ? (
          <Empty icon={Activity} title="No home readings yet">Patients who share their record with you and log BP, sugar, oxygen, temperature or weight at home appear here.</Empty>
        ) : (
          <div className="dr-mon-list">
            {data.patients.map((p) => (
              <button key={p.id} type="button" className="dr-mon-row" onClick={() => navigate(`/doctor/patients/${p.id}`)}>
                <span className="grow">
                  <strong className="notranslate" translate="no">{p.name}</strong>
                  <span className="tiny muted block">{[p.age != null ? `${p.age}y` : null, p.gender, `${p.readings30} reading${p.readings30 === 1 ? '' : 's'}`, p.lastAt ? `last ${timeAgo(p.lastAt)}` : null].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="dr-mon-chips">
                  {p.readings.map((r) => {
                    const Icon = KIND_ICON[r.kind] || Activity;
                    return <span key={r.kind} className={cx('badge', LEVEL[r.level])} title={`${r.text} · ${timeAgo(r.at)}`}><Icon size={12} /> {r.text}</span>;
                  })}
                </span>
                {p.openAlerts > 0 && <span className="badge rose">{p.openAlerts} to review</span>}
              </button>
            ))}
          </div>
        )}
        <p className="tiny muted mb-0 mt-2">{data.note}</p>
      </Card>
    </div>
  );
}

function AlertCard({ a, onOpen, onDone }) {
  const [message, setMessage] = useState('');
  const [writing, setWriting] = useState(false);
  const [run, busy] = useAction();
  const Icon = KIND_ICON[a.kind] || Activity;
  const review = () => run('review', async () => {
    await api.post(`/doctor/monitoring/${a.id}/review`, { message: message.trim() });
    onDone();
  }, message.trim() ? 'Marked reviewed — your message was sent to the patient' : 'Marked reviewed');
  const urgent = a.severity === 'urgent';
  return (
    <div className={cx('card dr-mon-alert', urgent ? 'urgent' : 'watch', a.status === 'reviewed' && 'done')}>
      <div className="row between wrap" style={{ gap: 8 }}>
        <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
          <span className={cx('dr-mon-ic', urgent ? 'rose' : 'sun')}>{urgent ? <AlertTriangle size={18} /> : <Icon size={18} />}</span>
          <div>
            <div className="small"><strong className="notranslate" translate="no">{a.patientName}</strong>{a.age != null ? ` · ${a.age}y` : ''}{a.gender ? ` · ${a.gender}` : ''}</div>
            <div style={{ fontWeight: 700 }}>{a.title}</div>
            <div className="small muted">{a.detail}</div>
            <div className="tiny muted mt-1">
              {urgent ? 'Urgent' : 'Pattern'} · raised {timeAgo(a.createdAt)}{a.updatedAt !== a.createdAt ? ` · updated ${timeAgo(a.updatedAt)}` : ''}
              {a.cleared && <span className="badge green" style={{ marginInlineStart: 6 }}>Back in range now</span>}
            </div>
          </div>
        </div>
        <Button size="sm" variant="ghost" icon={FolderOpen} onClick={onOpen}>Open record</Button>
      </div>
      {a.status === 'reviewed' ? (
        <p className="tiny muted mb-0 mt-1"><CheckCircle2 size={12} style={{ verticalAlign: '-2px' }} /> Reviewed {timeAgo(a.reviewedAt)} by {a.reviewedByName}{a.message ? ` — “${a.message}”` : ''}</p>
      ) : (
        <div className="stack mt-1" style={{ gap: 8 }}>
          {writing && (
            <textarea className="textarea" rows={2} maxLength={300} value={message} onChange={(e) => setMessage(e.target.value)}
              placeholder="Optional message to the patient, e.g. “Take your BP tablet daily and recheck in 3 days”" />
          )}
          <div className="row wrap" style={{ gap: 8, justifyContent: 'flex-end' }}>
            {!writing && <Button size="sm" variant="ghost" icon={MessageSquare} onClick={() => setWriting(true)}>Add a message</Button>}
            <Button size="sm" icon={CheckCircle2} loading={busy === 'review'} onClick={review}>{writing && message.trim() ? 'Send & mark reviewed' : 'Mark reviewed'}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
