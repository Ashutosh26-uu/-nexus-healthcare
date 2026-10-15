import { useState } from 'react';
import { Truck, Snowflake, MapPin } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Tabs, Empty, timeAgo } from '../../components/ui';
import { TransferProgress, SourceActions } from '../pharmacy/transfer';
import { isColdChain } from '../pharmacy/stock';

const GROUPS = [
  { value: 'waiting', label: 'Needs approval', match: ['requested', 'accepted'] },
  { value: 'transit', label: 'In transit', match: ['dispatched'] },
  { value: 'done', label: 'Completed', match: ['delivered', 'declined'] },
];

export default function Approvals({ home, reload }) {
  const [tab, setTab] = useState('waiting');
  const g = GROUPS.find((x) => x.value === tab);
  const list = home.transfers.filter((t) => g.match.includes(t.status)).sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

  return (
    <>
      <PageHeader title="Dispatch approvals" subtitle="Transfer requests the supply engine has routed to this warehouse. Accept, pack, then mark dispatched — a rider is assigned automatically." />
      <Tabs value={tab} onChange={setTab} tabs={GROUPS.map((x) => ({ value: x.value, label: x.label, count: home.transfers.filter((t) => x.match.includes(t.status)).length }))} />

      {list.length === 0 ? (
        <div className="card"><Empty icon={Truck} title={tab === 'waiting' ? 'Nothing waiting for approval' : 'Nothing here'}>{tab === 'waiting' ? 'New requests from pharmacies and districts will appear here.' : 'Transfers move here as they progress.'}</Empty></div>
      ) : (
        <div className="stack">
          {list.map((t) => (
            <article key={t.id} className="card tr-card">
              <div className="tr-main">
                <div className="grow">
                  <div className="row wrap" style={{ gap: 8 }}>
                    <strong translate="no">{t.drug}</strong>
                    <span className="badge">{t.qty} units</span>
                    {isColdChain(t.drug) && <span className="badge sky"><Snowflake /> Cold chain · 2–8°C</span>}
                  </div>
                  <div className="small muted row" style={{ gap: 6 }}><MapPin size={13} /> To {t.toName} <span className="tiny">· requested {timeAgo(t.createdAt)}</span></div>
                  {t.reason && <div className="tiny muted mt-1">“{t.reason}”</div>}
                </div>
                <TransferProgress status={t.status} />
              </div>
              {!['delivered', 'declined'].includes(t.status) && (
                <SourceActions t={t} inv={home.inventory.find((i) => i.drug === t.drug)} reload={reload} who="warehouse" />
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
