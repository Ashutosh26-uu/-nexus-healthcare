import { useEffect, useRef, useState } from 'react';
import { BellRing, Check, X, Truck, Store, Package, PackageCheck, KeyRound, FileText, Megaphone, Phone, Bike, MapPin, Clock } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { api } from '../../api';
import { Button, Card, Empty, Field, Modal, Pills, StatusBadge, fmtMoney, timeAgo, useAction, cx } from '../../components/ui';
import { OtpInput } from '../../components/OtpFlow';
import { chime } from '../../components/chime';

const LABEL = { requested: 'New', accepted: 'Accepted', packed: 'Packed', out_for_delivery: 'Out for delivery', delivered: 'Delivered', collected: 'Collected', declined: 'Declined', cancelled: 'Cancelled by patient' };
const openFile = (id) => { const w = window.open('', '_blank'); api.fileObjectUrl(id).then((u) => { if (w) w.location.href = u; setTimeout(() => URL.revokeObjectURL(u), 60000); }).catch(() => w?.close()); };

// Accept (choosing who delivers) or decline an order — shared by the pop-up and the list.
export function RespondButtons({ o, reload, pharmacy, onDone }) {
  const [run, busy] = useAction();
  const [mode, setMode] = useState(null); // 'accept' | 'decline'
  const [deliveryBy, setDeliveryBy] = useState(pharmacy?.delivery ? 'store' : 'nexus');
  const [reason, setReason] = useState('Out of stock');
  const respond = (action) => run(`r-${o.id}`, async () => {
    await api.post(`/medicine-orders/${o.id}/respond`, { action, deliveryBy, reason });
    reload(); onDone?.();
  }, action === 'accept' ? `Order ${o.orderNo} accepted` : 'Order declined');
  if (mode === 'accept' && o.fulfilment === 'delivery') {
    return (
      <div className="stack" style={{ gap: 8 }}>
        <Field label="Who will deliver it?">
          <Pills value={deliveryBy} onChange={setDeliveryBy} options={[{ value: 'store', label: 'We deliver ourselves' }, { value: 'nexus', label: 'Send a Nexus rider' }]} />
        </Field>
        <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost" size="sm" onClick={() => setMode(null)}>Back</Button>
          <Button size="sm" icon={Check} loading={busy === `r-${o.id}`} onClick={() => respond('accept')}>Accept order</Button>
        </div>
      </div>
    );
  }
  if (mode === 'decline') {
    return (
      <div className="stack" style={{ gap: 8 }}>
        <Field label="Why can't you take it?">
          <div className="chip-select">{['Out of stock', 'Needs a valid prescription', 'Store closed now', 'Can’t deliver to this area'].map((r) => <button type="button" key={r} className={cx('chip', reason === r && 'on')} onClick={() => setReason(r)}>{r}</button>)}</div>
        </Field>
        <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost" size="sm" onClick={() => setMode(null)}>Back</Button>
          <Button size="sm" variant="secondary" icon={X} loading={busy === `r-${o.id}`} onClick={() => respond('decline')}>Decline</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
      <Button size="sm" variant="ghost" icon={X} onClick={() => setMode('decline')}>Decline</Button>
      <Button size="sm" icon={Check} loading={busy === `r-${o.id}`} onClick={() => (o.fulfilment === 'delivery' ? setMode('accept') : respond('accept'))}>Accept</Button>
    </div>
  );
}

function OrderBody({ o }) {
  return (
    <>
      <div className="ph-mo-items">
        {o.items.map((i) => <span key={i.drug} className="ph-mo-item"><strong translate="no">{i.drug}</strong> × {i.qty}{i.lineTotal != null ? <span className="muted"> · {fmtMoney(i.lineTotal)}</span> : null}</span>)}
      </div>
      <div className="tiny muted ph-mo-meta">
        <span>{o.fulfilment === 'delivery' ? <><Truck size={12} /> Home delivery</> : <><Store size={12} /> Pickup at your counter</>}</span>
        {o.fulfilment === 'delivery' && o.address && <span><MapPin size={12} /> {o.address}</span>}
        <span>Total {fmtMoney(o.total)}{o.fulfilment === 'delivery' ? ` · ${fmtMoney(o.advancePaid || 0)} paid in advance · collect ${fmtMoney(o.balance)}` : ' · patient pays at counter'}</span>
        {o.rxDoctor && <span><FileText size={12} /> From {o.rxDoctor}&apos;s prescription</span>}
        {o.patientPhone && <span><Phone size={12} /> <bdi dir="ltr">{o.patientPhone}</bdi></span>}
        <span><Clock size={12} /> {timeAgo(o.paidAt || o.createdAt)}</span>
      </div>
      {o.rxFileId && <button type="button" className="ph-rx-link tiny" onClick={() => openFile(o.rxFileId)}><FileText size={12} /> View prescription photo</button>}
    </>
  );
}

// "New demand" pop-up: the moment a patient orders a medicine from this store (or asks all nearby stores).
export function NewOrderPopup({ home, reload }) {
  const [seen, setSeen] = useState(() => new Set());
  const chimed = useRef(new Set());
  const o = (home?.orders || []).find((x) => x.status === 'requested' && !seen.has(x.id));
  useEffect(() => { if (o && !chimed.current.has(o.id)) { chimed.current.add(o.id); chime([523, 784], 0.2, 0.35); } }, [o]);
  if (!o) return null;
  const close = () => setSeen((s) => new Set(s).add(o.id));
  return (
    <Modal open onClose={close} title={<span className="row" style={{ gap: 8 }}>{o.open ? <Megaphone size={20} /> : <BellRing size={20} className="dr-bell" />} {o.open ? 'Medicine wanted nearby' : 'New medicine order'}</span>}
      subtitle={o.open ? 'A patient near you is asking every chemist within 50 km — the first to accept gets the order.' : `${o.orderNo} · ${o.patientName}`}>
      {/* Keyed so accept/decline sub-state never carries over to the next order shown in this pop-up. */}
      <div className="stack" key={o.id}>
        <OrderBody o={o} />
        <RespondButtons o={o} reload={reload} pharmacy={home.pharmacy} onDone={close} />
      </div>
    </Modal>
  );
}

function Advance({ o, reload }) {
  const [run, busy] = useAction();
  const [code, setCode] = useState('');
  const [asking, setAsking] = useState(false);
  const step = (status, otp) => run(`s-${o.id}`, async () => { await api.post(`/medicine-orders/${o.id}/status`, { status, otp }); reload(); setAsking(false); setCode(''); }, { packed: 'Marked packed', out_for_delivery: 'Out for delivery', delivered: 'Delivered ✓', collected: 'Collected ✓' }[status]);
  const nexus = o.fulfilment === 'delivery' && o.deliveryBy === 'nexus';
  if (o.status === 'accepted') return <Button size="sm" icon={Package} loading={busy === `s-${o.id}`} onClick={() => step('packed')}>Mark packed</Button>;
  if (o.status === 'packed' && nexus) return <span className="tiny muted row" style={{ gap: 4 }}><Bike size={13} /> A Nexus rider is coming to collect it</span>;
  if (o.status === 'packed' && o.fulfilment === 'delivery') return <Button size="sm" icon={Truck} loading={busy === `s-${o.id}`} onClick={() => step('out_for_delivery')}>Out for delivery</Button>;
  const final = (o.status === 'packed' && o.fulfilment === 'pickup') ? 'collected' : o.status === 'out_for_delivery' && !nexus ? 'delivered' : null;
  if (!final) return null;
  return asking ? (
    <div className="stack" style={{ gap: 6, maxWidth: 300 }}>
      <span className="tiny muted">Ask the patient for the 4-digit code in their app</span>
      <OtpInput value={code} onChange={setCode} length={4} />
      <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
        <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>Cancel</Button>
        <Button size="sm" icon={KeyRound} disabled={code.length !== 4} loading={busy === `s-${o.id}`} onClick={() => step(final, code)}>Confirm</Button>
      </div>
    </div>
  ) : <Button size="sm" icon={PackageCheck} onClick={() => setAsking(true)}>{final === 'collected' ? 'Handed over' : 'Delivered'}</Button>;
}

export default function Orders({ home, reload }) {
  const [tab, setTab] = useState('active');
  const orders = home.orders || [];
  const active = orders.filter((o) => ['requested', 'accepted', 'packed', 'out_for_delivery'].includes(o.status));
  const done = orders.filter((o) => !active.includes(o));
  const list = tab === 'active' ? active : done;
  return (
    <>
      <PageHeader title="Medicine orders" subtitle="Orders from patients within 50 km. Accept, pack, and hand over or deliver — the patient sees every step." />
      <div className="row" style={{ gap: 8 }}>
        <Pills value={tab} onChange={setTab} options={[{ value: 'active', label: `Active (${active.length})` }, { value: 'done', label: `Completed (${done.length})` }]} />
      </div>
      {list.length === 0 ? (
        <Card><Empty icon={Package} title={tab === 'active' ? 'No active orders' : 'Nothing here yet'}>{tab === 'active' ? 'New orders pop up here the moment a patient orders a medicine you stock.' : 'Completed and declined orders show up here.'}</Empty></Card>
      ) : (
        <div className="stack">
          {list.map((o) => (
            <Card key={o.id} className={cx('ph-mo', o.status === 'requested' && 'new')}>
              <div className="row between wrap" style={{ gap: 8 }}>
                <div className="row wrap" style={{ gap: 8 }}>
                  <strong>{o.orderNo}</strong>
                  <span className="small" translate="no">{o.patientName}</span>
                  {o.open && <span className="badge sun"><Megaphone size={11} /> Asked to all nearby</span>}
                  {o.fulfilment === 'delivery' && o.deliveryBy && <span className="badge">{o.deliveryBy === 'store' ? 'You deliver' : 'Nexus rider'}</span>}
                </div>
                <StatusBadge status={['declined', 'cancelled'].includes(o.status) ? 'cancelled' : ['delivered', 'collected'].includes(o.status) ? 'delivered' : o.status === 'requested' ? 'pending' : o.status}>{LABEL[o.status] || o.status}</StatusBadge>
              </div>
              <OrderBody o={o} />
              <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
                {o.status === 'requested' ? <RespondButtons o={o} reload={reload} pharmacy={home.pharmacy} /> : <Advance o={o} reload={reload} />}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
