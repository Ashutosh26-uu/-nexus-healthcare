import { TrendingUp, TrendingDown, Info, Award } from 'lucide-react';
import { Card, Empty, Donut, Loading } from '../../components/ui';
import { PageHeader } from '../../components/PortalLayout';
import { useLive } from '../../live';

// Every figure is counted by the server from the doctor's own Nexus records. A measure without enough data
// comes back as null (with a note) and is shown as "—", never as a number.

const BAND = { excellent: 'var(--green-2)', good: 'var(--sky)', fair: 'var(--sun)' };

export default function Score() {
  // Refreshes as consults are completed and prescriptions signed.
  const { data: d, error } = useLive('/doctor/score', ['consults', 'prescriptions']);
  if (error && !d) return <Empty title="Couldn't load your score">{error}</Empty>;
  if (!d) return <Loading />;
  const color = BAND[d.band] || 'var(--green-2)';
  const metrics = (Array.isArray(d.metrics) ? d.metrics : []).filter(Boolean);
  const hasScore = typeof d.score === 'number';

  return (
    <div className="stack lg">
      <PageHeader eyebrow="Outcome-based score" title="Your quality score"
        subtitle="A private score built from what happened to your patients afterwards — not stars from a popup." />
      <div className="callout"><Info /><span>{hasScore && d.note ? d.note : 'Everything here is counted from your own Nexus records.'} Nothing here affects how patients are routed to you.</span></div>

      <div className="grid side">
        <Card className="center">
          {hasScore ? (
            <>
              <Donut value={d.score} max={100} size={150} color={color} label="quality score" />
              {d.band && <h3 className="mb-0 mt-2" style={{ color, textTransform: 'capitalize' }}>{d.band}</h3>}
            </>
          ) : <Empty icon={Award} title="Not enough data yet">{d.minimum ? `Your score appears once at least ${d.minimum} visits or prescriptions are old enough to judge.` : 'Your score appears once there is enough data from your own visits.'}</Empty>}
          <div className="tiny muted">{d.basedOn ? `${d.basedOn} completed consult${d.basedOn === 1 ? '' : 's'} so far` : 'No completed consults yet'}</div>
        </Card>
        <div className="stack">
          {metrics.length === 0 && <Card><Empty title="Nothing measured yet">Measures show here as your patients come back for follow-ups.</Empty></Card>}
          {metrics.map((m) => {
            const has = m.value !== null && m.value !== undefined && m.value !== '';
            const tone = m.good === true ? 'var(--green-2)' : m.good === false ? 'var(--clay)' : 'var(--ink)';
            return (
              <Card key={m.key || m.label} className="row between">
                <div>
                  <div className="small strong">{m.label}</div>
                  <div className="tiny muted">{has ? `${m.invert ? 'lower is better' : 'higher is better'}${m.basedOn ? ` · from ${m.basedOn}` : ''}` : (m.note || 'Not enough data yet')}</div>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  {has ? (
                    <>
                      <span className="serif" style={{ fontSize: '1.5rem', color: tone }} translate="no">{m.value}{m.unit || ''}</span>
                      {m.good === true && <TrendingUp size={16} style={{ color: 'var(--green-2)' }} />}
                      {m.good === false && <TrendingDown size={16} style={{ color: 'var(--clay)' }} />}
                    </>
                  ) : <span className="serif muted" style={{ fontSize: '1.5rem' }}>—</span>}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
