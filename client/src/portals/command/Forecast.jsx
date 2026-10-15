import { useEffect, useMemo, useState } from 'react';
import { CloudRain, FlaskConical, MessageSquareWarning, Pill, CloudSun, Megaphone, RefreshCw, Info } from 'lucide-react';
import { Card, Button, Empty, Pills, useToast, cx, fmtDateTime } from '../../components/ui';
import { PageHeader } from '../../components/PortalLayout';
import { api } from '../../api';

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
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [level, setLevel] = useState('all');

  const load = () => { setError(''); api.get('/gov/forecast').then(setData).catch((e) => setError(e.message)); };
  useEffect(() => { load(); }, []);

  const list = useMemo(() => (data?.forecasts || []).filter((f) => level === 'all' || f.level === level), [data, level]);
  if (error) return <Empty title="Couldn't load the forecast">{error}</Empty>;

  const highs = (data?.forecasts || []).filter((f) => f.level === 'high');
  const watches = (data?.forecasts || []).filter((f) => f.level === 'watch');
  const topPeak = Math.max(0, ...(data?.forecasts || []).map((f) => Math.max(...f.forecast)));
  const topDisease = highs[0]?.disease || watches[0]?.disease || '—';

  return (
    <div className="stack lg">
      <PageHeader eyebrow="Health Weather" title="Health Weather Forecast"
        subtitle="Disease, forecast 2–3 weeks ahead for every pin code — by fusing lab results, pharmacy sell-through, kiosk symptoms and weather. Data no single lab, pharmacy or department has on its own.">
        <Button variant="secondary" icon={RefreshCw} onClick={load}>Refresh</Button>
      </PageHeader>

      <div className="grid four">
        <Card className="stat"><span className="label">High-risk hotspots</span><span className="value" style={{ color: 'var(--rose)' }}>{highs.length}</span></Card>
        <Card className="stat"><span className="label">On watch</span><span className="value" style={{ color: '#b47d12' }}>{watches.length}</span></Card>
        <Card className="stat"><span className="label">Top threat</span><span className="value" style={{ fontSize: '1.3rem' }}>{topDisease}</span></Card>
        <Card className="stat"><span className="label">Highest predicted peak</span><span className="value" translate="no">{topPeak}</span><span className="tiny muted">cases / wk in 3 wks</span></Card>
      </div>

      <div className="row between wrap">
        <Pills value={level} onChange={setLevel} options={[{ value: 'all', label: `All (${data?.forecasts?.length || 0})` }, { value: 'high', label: `High (${highs.length})` }, { value: 'watch', label: `Watch (${watches.length})` }]} />
        {data && <span className="tiny muted">Scope: <span translate="no">{data.scope}</span> · generated {fmtDateTime(data.generatedAt)}</span>}
      </div>

      {!data ? <Empty title="Loading forecast…" /> : list.length === 0 ? <Empty icon={CloudSun} title="Clear skies">No active disease signals at this risk level.</Empty> : (
        <div className="grid two">
          {list.map((f) => {
            const lv = LEVEL[f.level];
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
                  <Curve points={f.forecast} color={lv.c} peakWeek={f.peakWeek} />
                  <div className="cc-fc-nums">
                    <div><span className="tiny muted">now</span><div className="strong" translate="no">{f.current}</div></div>
                    <div><span className="tiny muted">in 3 weeks</span><div className="strong" style={{ color: lv.c }} translate="no">{f.forecast[3]}</div></div>
                    <div><span className="tiny muted">confidence</span><div className="strong" translate="no">{Math.round(f.confidence * 100)}%</div></div>
                  </div>
                </div>

                <div className="cc-fc-drivers">
                  <div className="tiny strong muted">Signals driving this</div>
                  {f.drivers.map((d) => {
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

                <div className="cc-fc-rec">
                  <Info size={14} />
                  <span className="small">{f.recommendation}</span>
                </div>
                <Button size="sm" icon={Megaphone} onClick={() => toast(`Action started for ${f.disease} in ${f.district} — advisory drafted & stock pre-positioning requested`)}>Act on this</Button>
              </Card>
            );
          })}
        </div>
      )}

      <div className="callout sky"><Info /><span>Forecasts combine four independent signals; confidence rises when more of them agree. Every public advisory still needs a human official to confirm.</span></div>
    </div>
  );
}
