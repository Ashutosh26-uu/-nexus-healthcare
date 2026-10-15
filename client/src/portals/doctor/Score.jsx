import { useEffect, useState } from 'react';
import { Award, TrendingUp, TrendingDown, Info } from 'lucide-react';
import { Card, Empty, Donut } from '../../components/ui';
import { PageHeader } from '../../components/PortalLayout';
import { api } from '../../api';

const BAND = { excellent: 'var(--green-2)', good: 'var(--sky)', fair: 'var(--sun)' };

export default function Score() {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.get('/doctor/score').then(setD).catch((e) => setError(e.message)); }, []);
  if (error) return <Empty title="Couldn't load your score">{error}</Empty>;
  if (!d) return <Empty title="Loading…" />;
  const color = BAND[d.band] || 'var(--green-2)';

  return (
    <div className="stack lg">
      <PageHeader eyebrow="Outcome-verified score" title="Your quality score"
        subtitle="Not stars from a popup — a private score built from what actually happened to your patients afterwards." />

      <div className="grid side">
        <Card className="center">
          <Donut value={d.score} max={100} size={150} color={color} label="quality score" />
          <h3 className="mb-0 mt-2" style={{ color, textTransform: 'capitalize' }}>{d.band}</h3>
          <div className="tiny muted">based on {d.basedOn} completed consults with follow-up</div>
        </Card>
        <div className="stack">
          {d.metrics.map((m) => (
            <Card key={m.key} className="row between">
              <div>
                <div className="small strong">{m.label}</div>
                <div className="tiny muted">{m.invert ? 'lower is better' : 'higher is better'}</div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <span className="serif" style={{ fontSize: '1.5rem', color: m.good ? 'var(--green-2)' : 'var(--clay)' }} translate="no">{m.value}{m.unit}</span>
                {m.good ? <TrendingUp size={16} className="pt-green" /> : <TrendingDown size={16} style={{ color: 'var(--clay)' }} />}
              </div>
            </Card>
          ))}
        </div>
      </div>
      <div className="callout sky"><Info /><span>{d.note}</span></div>
    </div>
  );
}
