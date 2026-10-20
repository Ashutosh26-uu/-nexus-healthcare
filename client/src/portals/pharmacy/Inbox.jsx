import { useState } from 'react';
import { PackageCheck, Bike, HandHeart, ShieldCheck, Phone, Stethoscope, Store, Truck, AlertTriangle, FileSignature } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Button, Tabs, Empty, StatusBadge, timeAgo, fmtDateTime, useAction, useToast } from '../../components/ui';
import { api } from '../../api';
import Advisory from './Advisory';

const TABS = [
  { value: 'new', label: 'New', match: ['sent'] },
  { value: 'ready', label: 'Ready', match: ['dispensed'] },
  { value: 'out', label: 'Out for delivery', match: ['out_for_delivery'] },
  { value: 'done', label: 'Done', match: ['collected', 'delivered'] },
];
const STATUS_TEXT = { sent: 'New', dispensed: 'Packed & ready', out_for_delivery: 'Out for delivery', collected: 'Collected', delivered: 'Delivered' };

export default function Inbox({ home, reload }) {
  const [tab, setTab] = useState('new');
  const current = TABS.find((t) => t.value === tab);
  const list = home.inbox.filter((r) => current.match.includes(r.status));

  return (
    <>
      <PageHeader title="E-prescriptions" subtitle="Digitally signed prescriptions from Sehatra doctors. Check, pack, and hand over — the patient gets an update at each step." />
      <Advisory advisories={home.advisories} />
      <Tabs value={tab} onChange={setTab} tabs={TABS.map((t) => ({ value: t.value, label: t.label, count: home.inbox.filter((r) => t.match.includes(r.status)).length }))} />
      {list.length === 0 ? (
        <div className="card"><Empty icon={PackageCheck} title={tab === 'new' ? 'No new prescriptions' : 'Nothing here right now'}>{tab === 'new' ? "When a doctor sends a prescription to your store, it'll appear here with a ping." : 'Prescriptions move here as you work through them.'}</Empty></div>
      ) : (
        <div className="stack lg">{list.map((r) => <RxCard key={r.id} rx={r} inventory={home.inventory} transfers={home.transfersIn} reload={reload} />)}</div>
      )}
    </>
  );
}

function RxCard({ rx, inventory, transfers = [], reload }) {
  const [run, busy] = useAction();
  const toast = useToast();
  const [checks, setChecks] = useState({ sig: false, dose: false });
  const verified = checks.sig && checks.dose;
  const lines = rx.items.map((it) => {
    const inv = inventory.find((i) => i.drug.toLowerCase() === it.drug.toLowerCase());
    return { ...it, stock: inv?.qty ?? 0 };
  });
  const missing = lines.filter((l) => l.stock <= 0);
  const inbound = (drug) => transfers.find((t) => t.drug.toLowerCase() === drug.toLowerCase() && ['requested', 'accepted', 'dispatched'].includes(t.status));
  const unrequested = missing.filter((m) => !inbound(m.drug));
  const delivery = rx.fulfilment === 'delivery';

  const act = async (status, extra = {}, msg) => {
    const ok = await run(status, () => api.post(`/prescriptions/${rx.id}/dispense`, { status, ...extra }), msg);
    if (ok) reload();
  };
  const requestMissing = async () => {
    for (const m of unrequested) {
      const t = await run('transfer', () => api.post('/transfers/request', { drug: m.drug, qty: 20 }));
      if (t) toast(`Asked ${t.fromName} for 20 × ${t.drug} (${t.tierName})`);
    }
    reload();
  };

  return (
    <article className={`card rx-card status-${rx.status}`}>
      <header className="rx-head">
        <div className="grow">
          <div className="row wrap" style={{ gap: 10 }}>
            <h3 className="mb-0" translate="no">{rx.patientName}</h3>
            <StatusBadge status={rx.status}>{STATUS_TEXT[rx.status]}</StatusBadge>
            {rx.partial && <span className="badge sun">Partial</span>}
          </div>
          <div className="row wrap tiny muted mt-1" style={{ gap: 14 }}>
            <span className="mono">{rx.id.toUpperCase()}</span>
            <span className="row" style={{ gap: 4 }}><Stethoscope size={12} /> {rx.doctorName}</span>
            {rx.patientPhone && <a className="row" style={{ gap: 4 }} href={`tel:${rx.patientPhone}`}><Phone size={12} /> {rx.patientPhone}</a>}
            <span>Received {timeAgo(rx.orderedAt || rx.createdAt)}</span>
          </div>
        </div>
        <span className={`rx-mode ${delivery ? 'delivery' : ''}`}>{delivery ? <><Truck size={15} /> Home delivery</> : <><Store size={15} /> Store pickup</>}</span>
      </header>

      <div className="rx-items">
        {lines.map((l) => (
          <div key={l.drug} className="rx-item">
            <div className="grow">
              <strong className="small" translate="no">{l.drug}</strong>
              <div className="tiny muted">{l.dose} · {l.freq} · {l.days} days</div>
              {l.noSub && <span className="badge sun tiny">Doctor: no substitution</span>}
            </div>
            {rx.status === 'sent' && (l.stock > 0
              ? <span className="badge green">{l.stock} in stock</span>
              : <span className="badge rose">Out of stock</span>)}
          </div>
        ))}
        {rx.advice && <div className="rx-advice small"><strong>Doctor's advice:</strong> {rx.advice}</div>}
        {rx.address && <div className="tiny muted mt-1">Deliver to: {rx.address}</div>}
      </div>

      {rx.status === 'sent' && (
        <div className="rx-actions">
          <div className="rx-verify">
            <label className="check"><input type="checkbox" checked={checks.sig} onChange={(e) => setChecks({ ...checks, sig: e.target.checked })} /> <FileSignature size={15} /> Signature valid <span className="tiny muted">({rx.signature})</span></label>
            <label className="check"><input type="checkbox" checked={checks.dose} onChange={(e) => setChecks({ ...checks, dose: e.target.checked })} /> <ShieldCheck size={15} /> Doses checked, no duplicate therapy</label>
          </div>
          {missing.length > 0 && (
            <div className="callout">
              <AlertTriangle />
              <div className="grow">{missing.map((m) => m.drug).join(', ')} {missing.length > 1 ? 'are' : 'is'} out of stock. Dispense what you have now and we'll find the rest nearby.</div>
              {unrequested.length > 0
                ? <Button size="sm" variant="secondary" loading={busy === 'transfer'} onClick={requestMissing}>Request transfer</Button>
                : <span className="badge sky nowrap">Transfer {inbound(missing[0].drug).status === 'dispatched' ? 'on its way' : 'requested'}</span>}
            </div>
          )}
          <div className="row wrap rx-btns">
            {!verified && <span className="tiny muted grow">Tick both checks to dispense.</span>}
            {missing.length === 0 && <Button variant="ghost" size="sm" disabled={!verified || !!busy} loading={busy === 'partial'} onClick={() => run('partial', () => api.post(`/prescriptions/${rx.id}/dispense`, { status: 'dispensed', partial: true }), 'Dispensed partially — patient told the rest will follow').then((ok) => ok && reload())}>Dispense partial</Button>}
            {/* Either dispense button in flight blocks both — one prescription, one stock deduction. */}
            <Button icon={PackageCheck} disabled={!verified || !!busy} loading={busy === 'dispensed'}
              onClick={() => act('dispensed', { partial: missing.length > 0 }, missing.length ? `Partially dispensed for ${rx.patientName}` : `Packed for ${rx.patientName} — they've been told it's ready`)}>
              {missing.length ? `Dispense ${lines.length - missing.length} of ${lines.length}` : 'Dispense full'}
            </Button>
          </div>
        </div>
      )}

      {/* The server only allows dispensed → out_for_delivery (delivery) or → collected (pickup); "delivered" is set by the rider's OTP. */}
      {rx.status === 'dispensed' && (
        <div className="rx-actions row wrap rx-btns">
          <span className="small muted grow">{delivery ? 'Patient asked for home delivery.' : 'Waiting for the patient to come in.'}</span>
          {delivery
            ? <Button variant="clay" icon={Bike} loading={busy === 'out_for_delivery'} onClick={() => act('out_for_delivery', {}, 'Handed to rider — the patient can track it live')}>Hand to rider</Button>
            : <Button icon={HandHeart} loading={busy === 'collected'} onClick={() => act('collected', {}, `${rx.patientName} collected their medicines`)}>Mark collected</Button>}
        </div>
      )}

      {rx.status === 'out_for_delivery' && (
        <div className="rx-actions row wrap rx-btns">
          <span className="small muted grow row" style={{ gap: 6 }}><Bike size={16} /> With the rider since {fmtDateTime(rx.out_for_deliveryAt)}. Closes automatically when the patient shares their OTP.</span>
        </div>
      )}

      {['collected', 'delivered'].includes(rx.status) && (
        <div className="rx-actions tiny muted">
          {rx.status === 'collected' ? 'Collected' : 'Delivered'} {fmtDateTime(rx[`${rx.status}At`] || rx.dispensedAt || rx.createdAt)}
        </div>
      )}
    </article>
  );
}
