import { Network, Lock, Building2 } from 'lucide-react';
import { Card, Empty, Loading, PreviewBadge } from '../../components/ui';
import { PageHeader } from '../../components/PortalLayout';
import { useLive } from '../../live';

// Federated training isn't running yet: no model accuracy, rounds or sync status exist, so none are shown.
// Only the real hospitals on the network (that could take part) are listed.
export default function Federated() {
  const { data, error } = useLive('/admin/federated', ['admin', 'hospital', 'doctors']);
  if (error && !data) return <Empty title="Couldn't load the network">{error}</Empty>;
  if (!data) return <Loading />;
  const nodes = Array.isArray(data.nodes) ? data.nodes : [];

  return (
    <div className="stack lg">
      <PageHeader eyebrow="Federated Learning" title={<>Federated learning network <PreviewBadge>Coming soon</PreviewBadge></>}
        subtitle="Planned: hospitals train shared AI models locally, so no patient data ever leaves their building." />

      <div className="callout"><Lock /><span>Federated training isn&apos;t switched on yet — no models are being trained and no hospital is sending updates. Accuracy figures and training rounds will appear here once it is live.</span></div>

      <Card title="Hospitals on the network">
        {nodes.length === 0 ? <Empty icon={Network} title="No hospitals yet">Hospitals appear here once they join Nexus.</Empty> : (
          <div className="table-wrap" style={{ border: 0 }}>
            <table className="table">
              <thead><tr><th>Hospital</th><th>District</th><th>Training</th></tr></thead>
              <tbody>
                {nodes.map((n) => (
                  <tr key={n.id}>
                    <td><span className="row" style={{ gap: 8 }}><Building2 size={15} className="muted" /><span translate="no">{n.name}</span></span></td>
                    <td translate="no">{n.district || '—'}</td>
                    <td className="muted">Not started</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
