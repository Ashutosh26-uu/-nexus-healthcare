import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, EyeOff, Check, X, Eye, Megaphone, Activity, Clock, CircleDot } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Card, Progress, Pills, Empty, LineChart, StatusBadge, Button, cx, fmtDateTime, timeAgo } from '../../components/ui';
import { useGov, ALERT_KIND, alertTitle, isOpen } from './shared';
import DistrictSketch from './DistrictSketch';
import AlertAction from './AlertAction';
import OutbreakPlan from './OutbreakPlan';

function confidenceWord(c) {
  if (c >= 0.85) return 'High';
  if (c >= 0.7) return 'Moderate';
  return 'Low';
}

function SignalCard({ a, active, onClick }) {
  const k = ALERT_KIND[a.type] || {};
  return (
    <button type="button" className={cx('cc-signal', active && 'on', isOpen(a) && 'open')} onClick={onClick}>
      <span className={cx('cc-tone-bar', k.tone)} />
      <span className="grow" style={{ minWidth: 0 }}>
        <span className="row between" style={{ gap: 8 }}>
          <span className="small" style={{ fontWeight: 700 }}>{alertTitle(a)}</span>
          <StatusBadge status={a.status} />
        </span>
        <span className="tiny muted" style={{ display: 'block' }}>{k.label} · {a.district}, {a.state} · {timeAgo(a.createdAt)}</span>
        <span className="cc-signal-metrics">
          {a.multiplier && <span><strong>{a.multiplier}×</strong> baseline</span>}
          {a.cases != null && <span><strong>{a.cases}</strong> cases</span>}
          {a.confidence != null && (
          <span className="grow cc-conf">
            <span className="tiny muted">AI confidence {Math.round(a.confidence * 100)}%</span>
            <Progress value={a.confidence * 100} tone={a.confidence >= 0.85 ? 'danger' : a.confidence >= 0.7 ? 'warn' : 'ok'} />
          </span>
          )}
        </span>
      </span>
    </button>
  );
}

export default function Outbreaks() {
  const { data, reload } = useGov();
  const [filter, setFilter] = useState('outbreak');
  const all = [...(data.alerts || [])].sort((a, b) => Number(isOpen(b)) - Number(isOpen(a)) || new Date(b.createdAt) - new Date(a.createdAt));
  const list = filter === 'outbreak' ? all.filter((a) => a.type === 'outbreak') : all;
  const [selId, setSelId] = useState(() => list[0]?.id);
  const sel = list.find((a) => a.id === selId) || list[0];
  const [modal, setModal] = useState(null);
  const [justConfirmed, setJustConfirmed] = useState(null);
  const tr = data.outbreakTrend;

  const timeline = sel ? [{ at: sel.createdAt, by: 'Outbreak engine', action: `Signal raised — ${sel.message}`, system: true }, ...(sel.actions || [])].reverse() : [];

  return (
    <>
      <PageHeader eyebrow="Outbreak detection" title="Disease signals" subtitle="The engine compares today's anonymised lab positives with the seasonal baseline for each pin code. You decide what happens next." />

      <div className="grid two mb-2">
        <div className="callout sky small"><ShieldCheck /> <span><strong>Public advisories need a human confirmation.</strong> The engine only raises signals — nothing reaches the public until an official confirms and publishes.</span></div>
        <div className="callout green small"><EyeOff /> <span><strong>Anonymised data only — no patient names.</strong> Signals carry only the test, result, pin code and date.</span></div>
      </div>

      <div className="cc-outbreak-grid">
        <div className="stack lg">
          <Card title="Live signals" action={<Pills value={filter} onChange={setFilter} options={[{ value: 'outbreak', label: 'Outbreaks' }, { value: 'all', label: 'All signals' }]} />}>
            {list.length === 0
              ? <Empty icon={Activity} title="No signals">Nothing above baseline in your area.</Empty>
              : <div className="stack" style={{ gap: 8 }}>{list.map((a) => <SignalCard key={a.id} a={a} active={sel?.id === a.id} onClick={() => setSelId(a.id)} />)}</div>}
          </Card>

          <Card title={<div><h3>Seven-week trend</h3><p className="tiny muted mb-0">Weekly positives{data.scope.level === 'district' ? ` · ${data.scope.district}` : ''}</p></div>}>
            {/* Live mode sends outbreakTrend: null rather than invented figures. */}
            {tr?.dengue?.length ? (
              <>
                <LineChart
                  labels={tr.labels}
                  series={[
                    { name: 'Dengue NS1 positives', data: tr.dengue, color: 'var(--rose)' },
                    tr.baseline?.length && { name: 'Seasonal baseline', data: tr.baseline, color: 'var(--ink-3)', dashed: true },
                    tr.ili?.length && { name: 'Influenza-like illness', data: tr.ili, color: 'var(--sky)' },
                  ].filter(Boolean)}
                  height={210}
                />
                {tr.baseline?.length > 0 && <p className="tiny muted mb-0 mt-1">This week dengue is <strong>{(tr.dengue.at(-1) / (tr.baseline.at(-1) || 1)).toFixed(1)}×</strong> the baseline.</p>}
              </>
            ) : <Empty icon={Activity} title="No outbreak signals yet">Trends appear as labs report results.</Empty>}
          </Card>
        </div>

        {sel ? (
          <Card className="cc-detail">
            <div className="row between top wrap" style={{ gap: 10 }}>
              <div>
                <div className="eyebrow" style={{ marginBottom: 2 }}>{ALERT_KIND[sel.type]?.label}</div>
                <h2 style={{ fontSize: '1.5rem', marginBottom: 2 }}>{alertTitle(sel)}</h2>
                <div className="small muted">{sel.district}, {sel.state} · raised {fmtDateTime(sel.createdAt)}</div>
              </div>
              <StatusBadge status={sel.status} />
            </div>

            <div className="cc-metric-row">
              {sel.confidence != null && <div><span className="tiny muted">AI confidence</span><strong>{Math.round(sel.confidence * 100)}%</strong><span className="tiny muted">{confidenceWord(sel.confidence)}</span></div>}
              {sel.multiplier && <div><span className="tiny muted">vs baseline</span><strong>{sel.multiplier}×</strong><span className="tiny muted">threshold 3×</span></div>}
              {sel.cases != null && <div><span className="tiny muted">Cases (7 days)</span><strong>{sel.cases}</strong>{sel.baseline != null && <span className="tiny muted">normal ≈ {sel.baseline}</span>}</div>}
              <div><span className="tiny muted">Pin code</span><strong>{sel.pincode}</strong><span className="tiny muted">{sel.district}</span></div>
            </div>

            <p className="small">{sel.message}</p>

            {isOpen(sel) ? (
              <div className="row wrap" style={{ gap: 8 }}>
                <Button variant="clay" size="sm" icon={Check} onClick={() => setModal('confirm')}>Confirm</Button>
                {sel.status !== 'acknowledged' && <Button variant="secondary" size="sm" icon={Eye} onClick={() => setModal('acknowledge')}>Acknowledge</Button>}
                <Button variant="ghost" size="sm" icon={X} onClick={() => setModal('dismiss')}>Dismiss</Button>
              </div>
            ) : sel.status === 'confirmed' ? (
              <div className="row wrap" style={{ gap: 8 }}>
                <Link to={`/command/actions?compose=${sel.id}`} className="btn sm soft"><Megaphone /> Draft public advisory</Link>
                <Button variant="ghost" size="sm" onClick={() => setModal('resolve')}>Mark resolved</Button>
              </div>
            ) : null}

            {justConfirmed === sel.id && (
              <div className="callout green small mt-2"><Check /> <span>District pharmacies and doctors have been notified. A public advisory is still your call.</span></div>
            )}

            {sel.type === 'outbreak' && sel.status !== 'dismissed' && sel.status !== 'resolved' && <OutbreakPlan key={sel.id} alert={sel} />}

            <h4 className="mt-3 mb-1">Case cluster</h4>
            <DistrictSketch district={sel.district} alerts={(data.alerts || []).filter((a) => a.id === sel.id)} hospitals={(data.capacity || []).filter((h) => h.district === sel.district)} selectedPin={sel.pincode} />

            <h4 className="mt-3 mb-1">Action history</h4>
            <ol className="cc-timeline">
              {timeline.map((t, i) => (
                <li key={`${t.at}-${i}`} className={t.system ? 'system' : ''}>
                  <span className="cc-tl-dot">{t.system ? <CircleDot /> : <Clock />}</span>
                  <div>
                    <div className="small">{t.action}</div>
                    <div className="tiny muted">{t.by} · {fmtDateTime(t.at)}</div>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        ) : <Card><Empty title="Select a signal">Pick an alert to see its cluster and history.</Empty></Card>}
      </div>

      {modal && sel && (
        <AlertAction
          alert={sel}
          action={modal}
          onClose={() => setModal(null)}
          onDone={(_, act) => { if (act === 'confirm') setJustConfirmed(sel.id); reload(); }}
        />
      )}
    </>
  );
}
