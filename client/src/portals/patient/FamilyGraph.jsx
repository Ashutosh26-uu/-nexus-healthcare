import { Users, ShieldAlert, CalendarCheck, Dna } from 'lucide-react';
import { Card, Empty, cx } from '../../components/ui';
import { PageHeader } from '../../components/PortalLayout';
import { usePatientLive, PageSkeleton } from './shared';

export default function FamilyGraph() {
  // Live: adding a family member or updating anyone's conditions redraws the graph without a refresh.
  const { data: raw, error } = usePatientLive('/patient/family-graph', ['family', 'patients', 'records', 'consults']);

  if (error && !raw) return <Empty title="Couldn't load your family graph">{error}</Empty>;
  if (!raw) return <PageSkeleton />;
  const data = { profiles: Array.isArray(raw.profiles) ? raw.profiles : [], risks: Array.isArray(raw.risks) ? raw.risks : [] };

  return (
    <div className="stack lg">
      <PageHeader eyebrow="Family Health Graph" title="Your family’s inherited health"
        subtitle="Some conditions run in families. With everyone’s consent, we connect the dots so relatives can get screened early — before problems start." />

      {/* graph */}
      <Card>
        <div className="pt-fg-graph">
          {data.profiles.map((p) => (
            <div key={p.id} className="pt-fg-node">
              <div className={cx('pt-fg-avatar', p.self && 'self')}><Users size={18} /></div>
              <div className="small strong" translate="no">{p.name}</div>
              <div className="tiny muted">{p.relation}{p.age != null ? ` · ${p.age}y` : ''}</div>
              <div className="pt-fg-conds">
                {(p.conditions || []).length ? p.conditions.map((c) => <span key={c} className="badge rose">{c}</span>) : <span className="tiny muted">No conditions on file</span>}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <h3 className="mb-0">Inherited risks to watch</h3>
      {data.risks.length === 0 ? (
        <Empty icon={Dna} title="No inherited-risk patterns yet">As your family adds their health history, we’ll flag conditions worth screening relatives for.</Empty>
      ) : (
        <div className="grid two">
          {data.risks.map((r) => (
            <Card key={r.name} className="pt-fg-risk">
              <div className="row" style={{ gap: 10 }}>
                <span className="pt-fg-risk-ic"><ShieldAlert size={18} /></span>
                <div><div className="strong">{r.name}</div><div className="tiny muted">Runs in your family</div></div>
              </div>
              <div className="pt-fg-line"><span className="tiny strong">In the family:</span> {(r.affected || []).map((a) => <span key={a.name} className="badge rose" translate="no">{a.name} ({a.relation})</span>)}</div>
              {r.atRisk?.length > 0 && <div className="pt-fg-line"><span className="tiny strong">Should get screened:</span> {r.atRisk.map((a) => <span key={a.name} className="badge sun" translate="no">{a.name} ({a.relation})</span>)}</div>}
              <div className="callout green" style={{ marginTop: 6 }}><CalendarCheck /><span className="small">{r.advice} <strong>Suggested test:</strong> {r.screen}.</span></div>
            </Card>
          ))}
        </div>
      )}
      <p className="tiny muted">Shared only within your family, only with consent. You can remove a profile anytime from the Family page.</p>
    </div>
  );
}
