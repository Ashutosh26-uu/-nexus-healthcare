import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Heart, Droplet, Wind, RotateCcw, Sparkles, TrendingDown, TrendingUp, Info } from 'lucide-react';
import { Card, Donut, Button, Empty, PreviewBadge, cx } from '../../components/ui';
import { PageHeader } from '../../components/PortalLayout';
import { usePatient, usePatientLive, firstName, PageSkeleton } from './shared';

const RISK_ICON = { heart: Heart, droplet: Droplet, activity: Activity, wind: Wind };
const BAND_COLOR = { low: 'var(--green-2)', moderate: 'var(--sun)', high: 'var(--rose)' };
const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const bandOf = (n) => (n >= 60 ? 'high' : n >= 30 ? 'moderate' : 'low');

// Same linear model the server uses, so the what-if simulation is instant. Only inputs with a real reading
// count — a missing reading adds nothing rather than a guessed value.
const scoreOf = (risk, vals, inputs) =>
  Math.round(clamp(Number(risk.base) + Object.entries(risk.coef || {}).reduce((s, [k, c]) => (vals[k] == null || !inputs[k] ? s : s + c * (vals[k] - inputs[k].ideal)), 0)));

export default function Twin() {
  const { patient, profileKey } = usePatient();
  // Live: a new home reading, visit vitals or lab result reshapes the twin without a refresh.
  const { data, error } = usePatientLive('/patient/twin', ['vitals', 'consults', 'lab', 'records', 'patients']);
  const [vals, setVals] = useState(null);

  // Only the readings we actually have on file — never a filled-in default.
  const inputs = useMemo(() => Object.fromEntries(Object.entries(data?.inputs || {}).filter(([, v]) => v && v.measured !== false && v.value != null && Number.isFinite(Number(v.value)))), [data]);
  const baseline = useMemo(() => Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, Number(v.value)])), [inputs]);
  useEffect(() => { setVals(baseline); }, [baseline]);
  const dirty = useMemo(() => vals && Object.keys(vals).some((k) => vals[k] !== baseline[k]), [vals, baseline]);

  if (error && !data) return <Empty title="Couldn't load your Health Twin">{error}</Empty>;
  if (!data || !vals) return <PageSkeleton />;

  const hasReadings = Object.keys(inputs).length > 0;
  const risks = hasReadings && Array.isArray(data.risks) ? data.risks.filter((r) => r && r.base != null && r.coef) : [];
  const live = risks.map((r) => { const liveScore = scoreOf(r, vals, inputs); return { ...r, liveScore, band: bandOf(liveScore), baseScore: scoreOf(r, baseline, inputs) }; });
  const overall = live.length ? Math.round(live.reduce((s, r) => s + r.liveScore, 0) / live.length) : null;
  const overallBand = overall != null ? bandOf(overall) : 'low';
  const tips = Array.isArray(data.tips) ? data.tips.filter((t) => t?.text) : [];
  const missing = Object.entries(data.inputs || {}).filter(([k]) => !inputs[k]).map(([, v]) => v?.label).filter(Boolean);

  return (
    <div className="stack lg">
      <PageHeader eyebrow="Swasthya Twin" title={profileKey === 'self' ? 'Your Health Twin' : `${firstName(patient?.name)}’s Health Twin`}
        subtitle="A simple model built from your own readings and records. See where you’re headed — and how small changes shift it.">
        {dirty && <Button variant="secondary" icon={RotateCcw} onClick={() => setVals(baseline)}>Reset to my readings</Button>}
      </PageHeader>

      <div className="callout"><Info /><span><PreviewBadge /> This is an early, experimental estimate from a simple formula — not a validated medical risk score or a diagnosis. Please talk to your doctor before acting on it.</span></div>

      {!hasReadings || live.length === 0 ? (
        <Card>
          <Empty icon={Activity} title="Not enough readings yet">
            Your Health Twin uses only real numbers from your passport — blood pressure, sugar (HbA1c), weight, cholesterol and oxygen. Log a reading in the <Link to="/patient/tracker">Health tracker</Link>, or add a lab report, and it will appear here.
          </Empty>
        </Card>
      ) : (
      <>
      {/* hero */}
      <div className="pt-twin-hero">
        <div className="pt-twin-ring">
          <Donut value={overall} max={100} size={132} color={BAND_COLOR[overallBand]} label="wellness index" />
        </div>
        <div className="grow">
          {/* Without a date of birth the server's age is null and its health age is meaningless — skip both. */}
          {data.patient?.age != null && data.healthAge != null ? (
            <>
              <div className="pt-twin-age">
                <div>
                  <div className="pt-twin-age-num" style={{ color: BAND_COLOR[overallBand] }}>{data.healthAge}</div>
                  <div className="tiny muted">health age</div>
                </div>
                <div className="pt-twin-vs">vs</div>
                <div>
                  <div className="pt-twin-age-num">{data.patient.age}</div>
                  <div className="tiny muted">your age</div>
                </div>
              </div>
              <p className="mb-0 mt-1">
                {data.healthAge > data.patient.age
                  ? <>Your body is behaving a little <strong>older</strong> than your age — the good news is the biggest drivers are things you can change.</>
                  : <>Your body is behaving <strong>younger</strong> than your age. Keep it up!</>}
              </p>
            </>
          ) : data.patient?.age == null ? (
            <p className="mb-0 small muted">Add a date of birth in <Link to="/patient/settings">Settings</Link> to see your health age.</p>
          ) : null}
          {data.dataPoints > 0 && <div className="pt-twin-trust"><Sparkles size={14} /> Built from {data.dataPoints} visits, reports and prescriptions in your Health Passport</div>}
          {missing.length > 0 && <div className="tiny muted mt-1">Not measured yet: {missing.join(', ')} — left out rather than guessed.</div>}
        </div>
      </div>

      <div className="grid side">
        {/* risks */}
        <div className="stack">
          <h3 className="mb-0">Your risk outlook</h3>
          <div className="grid two pt-twin-risks">
            {live.map((r) => {
              const Icon = RISK_ICON[r.icon] || Activity;
              const delta = r.liveScore - r.baseScore;
              return (
                <Card key={r.key} className="pt-twin-risk">
                  <div className="row between">
                    <span className="pt-twin-risk-ic" style={{ background: `color-mix(in srgb, ${BAND_COLOR[r.band]} 15%, transparent)`, color: BAND_COLOR[r.band] }}><Icon size={18} /></span>
                    <span className={cx('badge', r.band === 'high' ? 'rose' : r.band === 'moderate' ? 'sun' : 'green')} style={{ textTransform: 'capitalize' }}>{r.band}</span>
                  </div>
                  <div className="pt-twin-risk-score" style={{ color: BAND_COLOR[r.band] }}>
                    {r.liveScore}<span className="pt-twin-risk-pct">%</span>
                    {dirty && delta !== 0 && (
                      <span className={cx('pt-twin-delta', delta < 0 ? 'down' : 'up')}>
                        {delta < 0 ? <TrendingDown size={14} /> : <TrendingUp size={14} />}{Math.abs(delta)}
                      </span>
                    )}
                  </div>
                  <div className="small strong">{r.label}</div>
                  <div className="tiny muted">estimated risk over {r.horizon} years</div>
                  <div className="pt-twin-bar"><span style={{ width: `${r.liveScore}%`, background: BAND_COLOR[r.band] }} /></div>
                  {(r.drivers || []).some((d) => inputs[d.key]) && (
                    <div className="pt-twin-drivers">
                      {r.drivers.filter((d) => inputs[d.key]).slice(0, 2).map((d) => (
                        <span key={d.key} className="tiny muted">{d.contribution > 0 ? '↑' : '↓'} {d.label}</span>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>

        {/* what-if simulator */}
        <Card className="pt-twin-sim">
          <div className="card-head"><h3 className="mb-0">What if…?</h3><Sparkles size={18} className="pt-green" /></div>
          <p className="small muted mt-0">Drag the sliders to see how your health could change. Nothing here is saved — it’s your private sandbox.</p>
          <div className="stack">
            {Object.entries(inputs).map(([k, inp]) => {
              const improved = Math.abs(vals[k] - inp.ideal) < Math.abs(baseline[k] - inp.ideal);
              return (
                <div key={k} className="pt-sim-row">
                  <div className="row between">
                    <span className="small strong">{inp.label}</span>
                    <span className={cx('pt-sim-val', vals[k] !== baseline[k] && (improved ? 'better' : 'worse'))} translate="no">
                      {vals[k]}{inp.unit ? ` ${inp.unit}` : ''}
                    </span>
                  </div>
                  <input type="range" className="pt-sim-slider" min={inp.min} max={inp.max} step={inp.step} value={vals[k] ?? baseline[k] ?? inp.ideal}
                    onChange={(e) => setVals((v) => ({ ...v, [k]: Number(e.target.value) }))}
                    aria-label={inp.label} />
                  <div className="row between tiny muted">
                    <span translate="no">{inp.min}</span>
                    <span>healthy: <span translate="no">{inp.ideal}{inp.unit ? ` ${inp.unit}` : ''}</span></span>
                    <span translate="no">{inp.max}</span>
                  </div>
                </div>
              );
            })}
          </div>
          {dirty && (
            <div className="pt-sim-summary">
              <strong>If you reach these numbers:</strong>
              <ul>
                {live.filter((r) => r.liveScore !== r.baseScore).map((r) => (
                  <li key={r.key}>{r.label}: <span translate="no">{r.baseScore}% → <strong style={{ color: BAND_COLOR[r.band] }}>{r.liveScore}%</strong></span> {r.liveScore < r.baseScore ? '↓' : '↑'}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      {/* tips */}
      {tips.length > 0 && (
        <Card title="What would help most">
          <div className="pt-twin-tips">
            {tips.map((t, i) => {
              const Icon = RISK_ICON[t.icon] || Heart;
              return <div key={i} className="pt-twin-tip"><span className="pt-twin-tip-ic"><Icon size={16} /></span><span className="small">{t.text}</span></div>;
            })}
          </div>
        </Card>
      )}
      </>
      )}

      {data.note && <div className="callout"><Info /><span>{data.note}</span></div>}
    </div>
  );
}
