import { useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, PackageCheck, Snowflake, ArrowRight } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Button, Tabs, Empty, timeAgo, useAction } from '../../components/ui';
import { api } from '../../api';
import { TransferProgress, SourceActions } from './transfer';
import { isColdChain } from './stock';

export default function Transfers({ home, reload }) {
  const [tab, setTab] = useState(() => (home.transfersOut.some((t) => ['requested', 'accepted'].includes(t.status)) && !home.transfersIn.some((t) => t.status === 'offered') ? 'to-us' : 'ours'));
  const [run, busy] = useAction();
  const withdraw = async (t) => { if (await run(`wd-${t.id}`, () => api.post(`/transfers/${t.id}/decline`), 'Offer withdrawn')) reload(); };
  const sortT = (l) => [...l].sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
  const ours = sortT(home.transfersIn);
  const toUs = sortT(home.transfersOut);

  return (
    <>
      <PageHeader title="Transfers" subtitle="Medicines moving between stores and warehouses. When a nearby patient can't find something, the supply engine may ask you to share — never below your own safety stock." />
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'ours', label: 'Coming to us', icon: ArrowDownToLine, count: ours.filter((t) => !['delivered', 'declined'].includes(t.status)).length },
        { value: 'to-us', label: 'Going from us', icon: ArrowUpFromLine, count: toUs.filter((t) => ['requested', 'accepted', 'offered'].includes(t.status)).length },
      ]} />

      {tab === 'ours' ? (
        ours.length === 0 ? <div className="card"><Empty title="No requests yet">Request stock from the Stock alerts page when you run low.</Empty></div> : (
          <div className="stack">
            {ours.map((t) => <IncomingRow key={t.id} t={t} reload={reload} />)}
          </div>
        )
      ) : toUs.length === 0 ? (
        <div className="card"><Empty icon={ArrowUpFromLine} title="No one needs your stock right now">If a store nearby runs short and you have spare, the request shows up here.</Empty></div>
      ) : (
        <div className="stack">
          {toUs.map((t) => (
            <article key={t.id} className="card tr-card">
              <div className="tr-main">
                <div className="grow">
                  <div className="row wrap" style={{ gap: 8 }}>
                    <strong>{t.drug} × {t.qty}</strong>
                    {isColdChain(t.drug) && <span className="badge sky"><Snowflake /> Cold chain</span>}
                  </div>
                  <div className="small muted row" style={{ gap: 6 }}>To {t.toName} <span className="tiny">· {timeAgo(t.createdAt)}</span></div>
                  {t.reason && <div className="tiny muted mt-1">“{t.reason}”</div>}
                </div>
                <TransferProgress status={t.status} />
              </div>
              {t.status === 'offered' ? (
                <div className="tr-source row wrap" style={{ justifyContent: 'space-between', gap: 10 }}>
                  <span className="small muted">You offered this near-expiry batch. Once they accept, dispatch it from here.</span>
                  <Button size="sm" variant="ghost" loading={busy === `wd-${t.id}`} onClick={() => withdraw(t)}>Withdraw offer</Button>
                </div>
              ) : <SourceActions t={t} inv={home.inventory.find((i) => (t.inventoryId ? i.id === t.inventoryId : i.drug === t.drug))} reload={reload} />}
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function IncomingRow({ t, reload }) {
  const [run, busy] = useAction();
  const receive = async () => {
    const ok = await run('recv', () => api.post(`/transfers/${t.id}/receive`), `${t.qty} × ${t.drug} added to your stock`);
    if (ok) reload();
  };
  const answer = async (action) => {
    const ok = await run(action, () => api.post(`/transfers/${t.id}/${action}`), action === 'accept' ? 'Accepted — they will dispatch it to you' : 'Offer declined');
    if (ok) reload();
  };
  return (
    <article className="card tr-card">
      <div className="tr-main">
        <div className="grow">
          <div className="row wrap" style={{ gap: 8 }}>
            <strong>{t.drug} × {t.qty}</strong>
            {isColdChain(t.drug) && <span className="badge sky"><Snowflake /> Cold chain</span>}
          </div>
          <div className="small muted row" style={{ gap: 6 }}>{t.fromName} <ArrowRight size={13} /> your store <span className="tiny">· {timeAgo(t.createdAt)}</span></div>
          {t.reason && <div className="tiny muted mt-1">{t.reason}</div>}
        </div>
        <TransferProgress status={t.status} />
      </div>
      {t.status === 'offered' && (
        <div className="tr-source row wrap" style={{ justifyContent: 'space-between', gap: 10 }}>
          <span className="small muted">{t.expiry ? `Expires ${t.expiry}. ` : ''}Accept only if you expect to sell it before then.</span>
          <span className="row" style={{ gap: 8 }}>
            <Button size="sm" variant="ghost" loading={busy === 'decline'} onClick={() => answer('decline')}>Decline</Button>
            <Button size="sm" loading={busy === 'accept'} onClick={() => answer('accept')}>Accept</Button>
          </span>
        </div>
      )}
      {t.status === 'dispatched' && (
        <div className="tr-source row wrap" style={{ justifyContent: 'space-between', gap: 10 }}>
          <span className="small muted">Rider is on the way. Check the seal and count before confirming.</span>
          <Button size="sm" icon={PackageCheck} loading={busy === 'recv'} onClick={receive}>Received — add to stock</Button>
        </div>
      )}
    </article>
  );
}
