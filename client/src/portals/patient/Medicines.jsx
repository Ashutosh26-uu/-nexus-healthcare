import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Pill, Truck, Store, ScanLine, BadgeCheck, AlertTriangle, PenLine, Package, Download, BadgeIndianRupee, FileText, ShoppingBag, Info } from 'lucide-react';
import WhereToBuy from './WhereToBuy';
import { api } from '../../api';
import { Button, Card, Empty, StatusBadge, cx, fmtDate, fmtMoney, useAction } from '../../components/ui';
import { PageHeader } from '../../components/PortalLayout';
import { usePatient, usePatientLive, firstName, RxTracker, PageSkeleton } from './shared';
import { rxStatusLabel } from './Home';

export default function Medicines() {
  const { home, homeLoading, patient, profiles } = usePatient();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const isSelf = profiles.find((p) => p.id === patient?.id)?.self;

  const rxs = useMemo(() => home?.prescriptions || [], [home]);

  useEffect(() => {
    const id = params.get('order');
    if (id) navigate(`/patient/medicines/order?rx=${id}`, { replace: true });
  }, [params, navigate]);

  if (homeLoading) return <PageSkeleton />;

  const active = rxs.filter((r) => !['delivered', 'collected'].includes(r.status));
  const past = rxs.filter((r) => ['delivered', 'collected'].includes(r.status));

  return (
    <div className="stack lg">
      <PageHeader eyebrow="Medicines" title={isSelf ? 'Your medicines' : `${firstName(patient?.name)}’s medicines`}
        subtitle="E-prescriptions from your doctors. Order from a chemist within 50 km — pick it up or get it delivered — and track every step.">
        <Button variant="clay" icon={ShoppingBag} onClick={() => navigate('/patient/medicines/order')}>Order medicines</Button>
      </PageHeader>
      <MyOrders />

      <div className="grid side">
        <div className="stack lg">
          {rxs.length === 0 && (
            <Card><Empty icon={Pill} title="No prescriptions yet">When a doctor prescribes something after a consult, it appears here — ready to order in one tap.
              <div className="mt-2"><Button size="sm" onClick={() => navigate('/patient/consult')}>Talk to a doctor</Button></div>
            </Empty></Card>
          )}
          {active.length > 0 && <h3 className="pt-section-title">In progress</h3>}
          {active.map((r) => <RxCard key={r.id} rx={r} onOrder={() => navigate(`/patient/medicines/order?rx=${r.id}`)} />)}
          {past.length > 0 && <h3 className="pt-section-title">Past prescriptions</h3>}
          {past.map((r) => <RxCard key={r.id} rx={r} past />)}
        </div>
        <div className="stack lg">
          <AuthenticityCard />
          {patient?.currentMeds?.length > 0 && (
            <Card title="Taking regularly">
              <div className="list">
                {patient.currentMeds.map((m) => <div key={m} className="list-item small"><Pill size={16} className="pt-clay" /> {m}</div>)}
              </div>
              <p className="tiny muted mb-0 mt-1">Doctors see this list before prescribing, so they can check for clashes.</p>
            </Card>
          )}
        </div>
      </div>

    </div>
  );
}

function RxCard({ rx, onOrder, past }) {
  const [showShops, setShowShops] = useState(false);
  return (
    <article className={cx('card pt-rx-card fade-in', past && 'past')}>
      <div className="row top wrap">
        <div className="grow">
          <div className="row wrap" style={{ gap: 8 }}>
            <strong translate="no">{rx.doctorName}</strong>
            <span className="small muted">· {fmtDate(rx.createdAt)}</span>
            {rx.facilityName && <span className="badge tiny" translate="no">{rx.source === 'clinic' ? 'In clinic · ' : ''}{rx.facilityName}</span>}
          </div>
          <div className="small muted">
            {rx.pharmacyName ? <>{rx.fulfilment === 'delivery' ? <Truck size={13} className="inline-ic" /> : <Store size={13} className="inline-ic" />} {rx.pharmacyName} · {rx.fulfilment === 'delivery' ? 'Home delivery' : 'Pick up'}</> : 'Not ordered yet'}
          </div>
        </div>
        <StatusBadge status={rx.status}>{rxStatusLabel(rx)}</StatusBadge>
      </div>

      <div className="pt-rx-items mt-2">
        {rx.items.map((it, i) => (
          <div key={i} className="pt-rx-item">
            <strong translate="no">{it.drug}</strong>
            <span className="small muted">{[it.dose, it.freq, it.food, it.days ? `${it.days} days` : null].filter(Boolean).join(' · ')}</span>
            {it.note && <span className="tiny muted">{it.note}</span>}
          </div>
        ))}
      </div>
      {(rx.complaint || rx.diagnosis) && (
        <p className="small mt-2 mb-0">{rx.complaint && <><span className="muted">Problem:</span> {rx.complaint}</>}{rx.complaint && rx.diagnosis ? ' · ' : ''}{rx.diagnosis && <><span className="muted">Doctor&apos;s diagnosis:</span> <strong>{rx.diagnosis}</strong></>}</p>
      )}
      {(rx.dos?.length > 0 || rx.donts?.length > 0) && (
        <div className="pt-rx-dos mt-2">
          {rx.dos?.length > 0 && <div className="do"><strong className="small">✓ Do</strong><ul className="small">{rx.dos.map((x) => <li key={x}>{x}</li>)}</ul></div>}
          {rx.donts?.length > 0 && <div className="dont"><strong className="small">✗ Don&apos;t</strong><ul className="small">{rx.donts.map((x) => <li key={x}>{x}</li>)}</ul></div>}
        </div>
      )}

      {rx.advice && <p className="small mt-2 mb-0"><span className="muted">Doctor&apos;s advice:</span> {rx.advice}</p>}
      {rx.warnings?.length > 0 && <div className="callout mt-2"><AlertTriangle /><span className="small">{rx.warnings.map((w) => w.msg || w).join(' ')}</span></div>}

      {!past && rx.status !== 'issued' && <div className="mt-2"><RxTracker rx={rx} /></div>}
      {rx.status === 'dispensed' && rx.fulfilment === 'pickup' && (
        <div className="callout green mt-2"><Package /><span>Packed and waiting for you at <strong translate="no">{rx.pharmacyName}</strong>. Show your passport QR at the counter.</span></div>
      )}
      {rx.status === 'out_for_delivery' && (
        <div className="callout sky mt-2"><Truck /><span>On the way! The rider will ask for a 4-digit code from your SMS to hand it over.</span></div>
      )}

      {showShops && <div className="mt-2"><WhereToBuy rx={rx} /></div>}

      <div className="row between wrap mt-2 pt-rx-foot">
        <span className="tiny muted pt-sig"><PenLine size={13} className="inline-ic" /> Digitally signed · {rx.signature}</span>
        <div className="row wrap" style={{ gap: 8 }}>
          {rx.paperFileId && <Button variant="ghost" size="sm" icon={FileText} onClick={() => { const w = window.open('', '_blank'); api.fileObjectUrl(rx.paperFileId).then((u) => { if (w) w.location.href = u; setTimeout(() => URL.revokeObjectURL(u), 60000); }).catch(() => w?.close()); }}>Original</Button>}
          <Button variant="ghost" size="sm" icon={Download} onClick={() => window.open(`/rx/${rx.id}`, '_blank', 'noopener')}>Download</Button>
          <Button variant="secondary" size="sm" icon={BadgeIndianRupee} onClick={() => setShowShops((v) => !v)}>{showShops ? 'Hide stores' : 'Where to buy & price'}</Button>
          {!past && <Button variant="clay" icon={Pill} onClick={onOrder}>Order these medicines</Button>}
        </div>
      </div>
    </article>
  );
}

/* ---------- my medicine orders ---------- */
const ORDER_STEPS = { pickup: ['requested', 'accepted', 'packed', 'collected'], delivery: ['requested', 'accepted', 'packed', 'out_for_delivery', 'delivered'] };
const ORDER_LABEL = { awaiting_payment: 'Waiting for advance payment', requested: 'Waiting for the chemist', accepted: 'Accepted', packed: 'Packed', out_for_delivery: 'On the way', delivered: 'Delivered', collected: 'Collected', declined: 'Not accepted', cancelled: 'Cancelled' };
function MyOrders() {
  const { patient } = usePatient();
  const { data, reload } = usePatientLive('/patient/medicine-orders', ['medorders', 'pharmacy', 'dispatch']);
  const [run, busy] = useAction();
  const navigate = useNavigate();
  const list = (data || []).filter((o) => o.status !== 'cancelled').slice(0, 6);
  if (!patient || !list.length) return null;
  return (
    <Card title={<h4 className="row mb-0" style={{ gap: 8 }}><Package size={17} />My medicine orders</h4>}>
      <div className="stack">
        {list.map((o) => {
          const steps = ORDER_STEPS[o.fulfilment] || [];
          const idx = steps.indexOf(o.status);
          const closed = ['delivered', 'collected', 'declined'].includes(o.status);
          return (
            <div key={o.id} className="pt-mo">
              <div className="row between wrap" style={{ gap: 8 }}>
                <div><strong>{o.orderNo}</strong> <span className="tiny muted">· {o.fulfilment === 'delivery' ? 'Home delivery' : 'Pickup'} · {o.pharmacyName ? <span translate="no">{o.pharmacyName}</span> : 'asking chemists near you'}</span></div>
                <StatusBadge status={o.status === 'declined' ? 'cancelled' : closed ? 'delivered' : o.status}>{ORDER_LABEL[o.status] || o.status}</StatusBadge>
              </div>
              <div className="small muted">{o.items.map((i) => `${i.drug} ×${i.qty}`).join(', ')}</div>
              {!closed && idx >= 0 && <div className="pt-mo-steps" aria-hidden="true">{steps.map((s2, i) => <span key={s2} className={cx(i <= idx && 'done')} />)}</div>}
              <div className="row between wrap" style={{ gap: 8 }}>
                <span className="small">Total <strong>{fmtMoney(o.total)}</strong>{o.fulfilment === 'delivery' ? ` · advance ${fmtMoney(o.advancePaid || 0)} paid · ${fmtMoney(o.balance)} on delivery` : ' · pay at the counter'}{o.refundDue ? ` · refund ${fmtMoney(o.refundDue)} on the way` : ''}</span>
                {!closed && o.status !== 'awaiting_payment' && <span className="tiny">{o.fulfilment === 'delivery' ? 'Delivery code' : 'Pickup code'} <span className="pt-mo-code mono">{o.otp}</span></span>}
              </div>
              {o.status === 'declined' && <div className="callout rose"><Info /><span className="small">{o.declineReason}. <button type="button" className="link-btn" onClick={() => navigate('/patient/medicines/order')}>Try another chemist</button></span></div>}
              {['awaiting_payment', 'requested'].includes(o.status) && (
                <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
                  <Button size="sm" variant="ghost" loading={busy === o.id} onClick={() => run(o.id, async () => { await api.post(`/medicine-orders/${o.id}/cancel`); reload(); }, 'Order cancelled')}>Cancel order</Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ---------- authenticity scan teaser ---------- */
function AuthenticityCard() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // the server's verdict: { status, drug, batch, expiry, message }
  const seq = useRef(0); // editing the code while a check is in flight discards that answer

  // Same check as the "Check a medicine" page — a verdict is only ever shown from the server's answer.
  const check = async (e) => {
    e.preventDefault();
    const c = code.trim();
    if (!c || busy) return;
    const id = ++seq.current;
    setBusy(true); setResult(null);
    try {
      const r = await api.post('/medicine/scan', { code: c });
      if (id === seq.current) setResult(r);
    } catch (err) {
      if (id === seq.current) setResult({ status: 'error', message: err.message });
    } finally { setBusy(false); }
  };

  return (
    <Card className="pt-auth">
      <div className="row top">
        <span className="pt-ic-tile green"><ScanLine size={18} /></span>
        <div className="grow">
          <strong>Is this medicine genuine?</strong>
          <p className="small muted mb-1">Type the code printed under the barcode on the strip or box.</p>
        </div>
      </div>
      <form className="row" onSubmit={check}>
        <label htmlFor="pack-code" className="sr-only">Pack code</label>
        <input id="pack-code" className="input sm mono" placeholder="e.g. 8XK29PL4" value={code} onChange={(e) => { setCode(e.target.value); setResult(null); seq.current++; }} />
        <Button size="sm" type="submit" loading={busy} disabled={!code.trim()}>Check</Button>
      </form>
      {result && (result.status === 'genuine' ? (
        <div className="pt-genuine fade-in" role="status">
          <BadgeCheck size={22} />
          <div>
            <strong>Genuine</strong>
            <div className="tiny"><span translate="no">{result.drug}</span>{result.batch ? <> · Batch <span translate="no">{result.batch}</span></> : null}{result.expiry ? <> · Expires {fmtDate(result.expiry)}</> : null}</div>
          </div>
        </div>
      ) : (
        <div className={cx('callout mt-1 fade-in', ['fake', 'recall', 'expired'].includes(result.status) && 'rose')} role="status">
          <AlertTriangle /><span className="small">{result.message || 'We couldn’t check that code right now. Please try again.'}</span>
        </div>
      ))}
      <p className="tiny muted mb-0 mt-1">Preview · live checks against the national drug registry are coming soon.</p>
    </Card>
  );
}
