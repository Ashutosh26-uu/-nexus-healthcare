import { useMemo, useState } from 'react';
import { CloudRain, FlaskConical, MessageSquareWarning, Pill, CloudSun, Megaphone, RefreshCw, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Empty, Loading, Pills, PreviewBadge, cx, fmtDateTime } from '../../components/ui';
import { PageHeader } from '../../components/PortalLayout';
import { useLive } from '../../live';

const LEVEL = { high: { c: 'var(--rose)', label: 'High risk', badge: 'rose' }, watch: { c: 'var(--sun)', label: 'Watch', badge: 'sun' }, low: { c: 'var(--green-2)', label: 'Low', badge: 'green' } };
const DRIVER_ICON = { labs: FlaskConical, symptoms: MessageSquareWarning, pharmacy: Pill, weather: CloudSun };

// Small inline area+line chart for the 4-week forecast curve.
function Curve({ points, color, peakWeek }) {
  const w = 240; const h = 70; const pad = 6;
  const max = Math.max(...points, 1);
  const x = (i) => pad + (i / (points.length - 1)) * (w - pad * 2);
  const y = (v) => h - pad - (v / max) * (h - pad * 2);
  const line = points.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="cc-fc-curve" dir="ltr" preserveAspectRatio="none">
      <path d={`${line} L${x(points.length - 1)},${h - pad} L${x(0)},${h - pad} Z`} fill={color} opacity="0.12" />
      <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {points.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={i === peakWeek ? 4 : 2.5} fill={i === peakWeek ? color : '#fff'} stroke={color} strokeWidth="2" />)}
    </svg>
  );
}

export default function Forecast() {
  const navigate = useNavigate();
  // Recomputed by the server from live lab results, consults, stock and alerts — refetch when any of them change.
  const { data, error: liveError, reload: load } = useLive('/gov/forecast', ['gov', 'alerts', 'lab', 'supply', 'pharmacy', 'consults']);
  const error = !data && liveError;
  const [level, setLevel] = useState('all');

  const list = useMemo(() => (data?.forecasts || []).filter((f) => level === 'all' || f.level === level), [data, level]);
  if (error) return <Empty title="Couldn't load the forecast">{error}</Empty>;

  const highs = (data?.forecasts || []).filter((f) => f.level === 'high');
  const watches = (data?.forecasts || []).filter((f) => f.level === 'watch');
  const topPeak = Math.max(0, ...(data?.forecasts || []).map((f) => (Array.isArray(f.forecast) && f.forecast.length ? Math.max(...f.forecast) : 0)));
  const topDisease = highs[0]?.disease || watches[0]?.disease || '—';

  return (
    <div className="stack lg">
      <PageHeader eyebrow="Health Weather" title={<>Health Weather Forecast <PreviewBadge /></>}
        subtitle="An experimental estimate per pin code from lab positives, consult symptoms, pharmacy stock and open alerts. The model isn't validated yet — treat it as a pointer, not a prediction.">
        <Button variant="secondary" icon={RefreshCw} onClick={load}>Refresh</Button>
      </PageHeader>

      <div className="grid four">
        <Card className="stat"><span className="label">High-risk hotspots</span><span className="value" style={{ color: 'var(--rose)' }}>{highs.length}</span></Card>
        <Card className="stat"><span className="label">On watch</span><span className="value" style={{ color: '#b47d12' }}>{watches.length}</span></Card>
        <Card className="stat"><span className="label">Top threat</span><span className="value" style={{ fontSize: '1.3rem' }}>{topDisease}</span></Card>
        <Card className="stat"><span className="label">Highest estimated peak</span><span className="value" translate="no">{topPeak || '—'}</span><span className="tiny muted">cases / wk in 3 wks (estimate)</span></Card>
      </div>

      <div className="row between wrap">
        <Pills value={level} onChange={setLevel} options={[{ value: 'all', label: `All (${data?.forecasts?.length || 0})` }, { value: 'high', label: `High (${highs.length})` }, { value: 'watch', label: `Watch (${watches.length})` }]} />
        {data && <span className="tiny muted">Scope: <span translate="no">{data.scope}</span> · generated {fmtDateTime(data.generatedAt)}</span>}
      </div>

      {!data ? <Loading /> : list.length === 0 ? <Empty icon={CloudSun} title="Clear skies">No active disease signals at this risk level.</Empty> : (
        <div className="grid two">
          {list.map((f) => {
            const lv = LEVEL[f.level] || LEVEL.low;
            return (
              <Card key={`${f.pincode}-${f.diseaseKey}`} className={cx('cc-fc', f.level === 'high' && 'high')}>
                <div className="row between top">
                  <div>
                    <div className="row" style={{ gap: 8 }}>
                      <CloudRain size={18} style={{ color: lv.c }} />
                      <span className="strong">{f.disease}</span>
                    </div>
                    <div className="tiny muted" translate="no">Pin {f.pincode} · {f.district}, {f.state}</div>
                  </div>
                  <span className={cx('badge', lv.badge)}>{lv.label}</span>
                </div>

                <div className="cc-fc-main">
                  {Array.isArray(f.forecast) && f.forecast.length > 1 ? <Curve points={f.forecast} color={lv.c} peakWeek={f.peakWeek} /> : <span className="tiny muted">No projection yet</span>}
                  <div className="cc-fc-nums">
                    <div><span className="tiny muted">now</span><div className="strong" translate="no">{f.current ?? '—'}</div></div>
                    <div><span className="tiny muted">in 3 weeks</span><div className="strong" style={{ color: lv.c }} translate="no">{f.forecast?.[3] ?? '—'}</div></div>
                    <div><span className="tiny muted">confidence</span><div className="strong" translate="no">{f.confidence != null ? `${Math.round(f.confidence * 100)}%` : '—'}</div></div>
                  </div>
                </div>

                <div className="cc-fc-drivers">
                  <div className="tiny strong muted">Signals driving this</div>
                  {(f.drivers || []).map((d) => {
                    const Icon = DRIVER_ICON[d.key] || Info;
                    return (
                      <div key={d.key} className="cc-fc-driver">
                        <Icon size={13} />
                        <span className="tiny">{d.label}</span>
                        <span className="cc-fc-strength"><span style={{ width: `${d.strength}%`, background: lv.c }} /></span>
                        <span className="tiny muted" translate="no">{typeof d.value === 'number' ? d.value : d.value}</span>
                      </div>
                    );
                  })}
                </div>

                {f.recommendation && (
                <div className="cc-fc-rec">
                  <Info size={14} />
                  <span className="small">{f.recommendation}</span>
                </div>
                )}
                {/* Opens the real advisory composer, pre-filled for this forecast — nothing is sent until an official publishes it. */}
                <Button size="sm" icon={Megaphone} onClick={() => navigate(`/command/actions?${new URLSearchParams({ disease: f.disease, district: f.district || '', pin: f.pincode || '' })}`)}>Draft an advisory</Button>
              </Card>
            );
          })}
        </div>
      )}

      <div className="callout sky"><Info /><span>Preview: estimates combine the signals above with a simple growth rule and the time of year; confidence rises when more of them agree. Every public advisory still needs a human official to confirm.</span></div>
    </div>
  );
}
