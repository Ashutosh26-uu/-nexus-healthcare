import { useEffect, useState } from 'react';
import { Network, Lock, TrendingUp, Server, Building2 } from 'lucide-react';
import { Card, Empty, Loading, fmtNum } from '../../components/ui';
import { PageHeader } from '../../components/PortalLayout';
import { api } from '../../api';

const NODE = { contributing: { c: 'var(--green-2)', label: 'Contributing' }, syncing: { c: 'var(--sun)', label: 'Syncing' }, onboarding: { c: 'var(--ink-3)', label: 'Onboarding' } };

export default function Federated() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    api.get('/admin/federated').then((d) => alive && setData(d)).catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, []);
  if (error) return <Empty title="Couldn't load the network">{error}</Empty>;
  if (!data) return <Loading />;

  return (
    <div className="stack lg">
      <PageHeader eyebrow="Federated Learning" title="Federated learning network"
        subtitle="Our AI gets smarter from every hospital — without any patient data ever leaving their building." />

      <div className="callout green"><Lock /><span>{data.privacyNote}</span></div>

      <div className="grid three">
        {data.models.map((m) => (
          <Card key={m.key} className="stat">
            <span className="label"><Server size={15} /> {m.label}</span>
            <span className="value">{m.accuracy}%</span>
            <span className="delta up"><TrendingUp size={13} style={{ verticalAlign: '-2px' }} /> +{m.delta}% this round · v{m.version}</span>
          </Card>
        ))}
      </div>

      <div className="grid side">
        <Card title="Member hospitals (training nodes)">
          <div className="table-wrap" style={{ border: 0 }}>
            <table className="table">
              <thead><tr><th>Hospital</th><th>District</th><th>Status</th><th>Rounds</th><th>Last update</th></tr></thead>
              <tbody>
                {data.nodes.map((n) => {
                  const st = NODE[n.status] || NODE.onboarding;
                  return (
                    <tr key={n.id}>
                      <td><span className="row" style={{ gap: 8 }}><Building2 size={15} className="muted" /><span translate="no">{n.name}</span></span></td>
                      <td translate="no">{n.district}</td>
                      <td><span className="badge" style={{ color: st.c }}><span className="dot" style={{ background: st.c }} /> {st.label}</span></td>
                      <td translate="no">{n.rounds}</td>
                      <td className="muted">{n.lastUpdate}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        <Card className="center">
          <div className="ad-fed-ring"><Network size={40} /></div>
          <div className="serif" style={{ fontSize: '2rem', fontWeight: 600 }}>{fmtNum(data.totalRounds)}</div>
          <div className="muted small">training rounds completed across the network</div>
          <div className="divider" />
          <p className="small muted mb-0">Each round, hospitals train locally and send only encrypted model updates. The improved model flows back to everyone — so a small clinic gets the same AI as a metro hospital.</p>
        </Card>
      </div>
    </div>
  );
}
