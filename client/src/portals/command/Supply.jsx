import { useState } from 'react';
import { PackageX, Truck, AlertTriangle, ArrowRight, Pill, Check, Eye } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Card, Stat, Empty, StatusBadge, Button, Modal, Field, cx, fmtNum, timeAgo } from '../../components/ui';
import { useGov, regionOptions, isOpen } from './shared';
import AlertAction from './AlertAction';

function daysTone(d) {
  if (d <= 3) return 'rose';
  if (d <= 7) return 'sun';
  return 'green';
}

export function StockMoveModal({ open, onClose, drug: initialDrug = '' }) {
  const { data } = useGov();
  const opts = regionOptions(data);
  const drugs = [...new Set([...(data.shortages || []).map((s) => s.drug), 'ORS sachet', 'Paracetamol 500mg', 'Dengue NS1 rapid kit'])];
  const [form, setForm] = useState({ drug: initialDrug || drugs[0] || '', qty: 200, from: '', to: '', priority: 'urgent' });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  // Transfers can only be requested by the receiving chemist (POST /api/transfers/request is pharmacist-only);
  // there is no official-side "order a stock movement" endpoint yet, so this form can't be sent — it says so.
  const submit = (e) => e.preventDefault();

  return (
    <Modal open={open} onClose={onClose} title="Order stock movement" subtitle="Coming soon — moving stock between regions from here isn't live yet.">
      <form className="stack" onSubmit={submit}>
        <Field label="Medicine or kit">
          <input className="input" list="cc-drugs" value={form.drug} onChange={set('drug')} required />
          <datalist id="cc-drugs">{drugs.map((d) => <option key={d} value={d} />)}</datalist>
        </Field>
        <div className="grid two" style={{ gap: 12 }}>
          <Field label="Quantity"><input className="input" type="number" min="1" value={form.qty} onChange={set('qty')} required /></Field>
          <Field label="Priority">
            <select className="select" value={form.priority} onChange={set('priority')}>
              <option value="urgent">Urgent · within 24 h</option>
              <option value="routine">Routine · this week</option>
            </select>
          </Field>
        </div>
        <div className="grid two" style={{ gap: 12 }}>
          <Field label="From (source)">
            {/* Not `required`: "Nearest with stock" (empty value) is a valid choice. */}
            <select className="select" value={form.from} onChange={set('from')}>
              <option value="">Nearest with stock</option>
              {opts.map((o) => <option key={o.label}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="To (destination)">
            <select className="select" value={form.to} onChange={set('to')} required>
              <option value="" disabled>Choose…</option>
              {opts.map((o) => <option key={o.label}>{o.label}</option>)}
            </select>
          </Field>
        </div>
        <div className="callout sun small">Ordering stock moves from the command centre is coming soon. Today, chemists request stock themselves from their Stock alerts screen, and every transfer shows under “In transit”.</div>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 10 }}>
          <Button type="button" variant="ghost" onClick={onClose}>Close</Button>
          <Button type="submit" icon={Truck} disabled title="Not available yet">Coming soon</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function Supply() {
  const { data, reload } = useGov();
  const [move, setMove] = useState(null);
  const [act, setAct] = useState(null);
  const shortages = data.shortages || [];
  const transfers = data.transfersInTransit || [];
  const shortageAlerts = data.alerts.filter((a) => a.type === 'shortage');
  const critical = shortages.filter((s) => s.daysLeft <= 3).length;

  return (
    <>
      <PageHeader eyebrow="Supply grid" title="Medicine stock" subtitle="Where stock is running thin, and what is already moving to fix it.">
        <Button icon={Truck} onClick={() => setMove({ drug: shortages[0]?.drug })}>Order stock movement</Button>
      </PageHeader>

      <div className="grid three mb-2">
        <Stat label="Lines under 14 days" icon={Pill} value={shortages.length} sub="across pharmacies in scope" />
        <Stat label="Critical (≤ 3 days)" icon={PackageX} value={critical} sub={critical ? 'act today' : 'none right now'} />
        <Stat label="Transfers in transit" icon={Truck} value={transfers.length} sub={`${fmtNum(transfers.reduce((s, t) => s + t.qty, 0))} units moving`} />
      </div>

      <div className="grid side">
        <Card title="Stock running low" action={<span className="tiny muted">days of stock left</span>}>
          {shortages.length === 0 ? <Empty title="Healthy stock">No medicine is under 14 days of cover.</Empty> : (
            <div className="stack" style={{ gap: 4 }}>
              {shortages.map((s, i) => (
                <div key={`${s.drug}-${i}`} className="cc-stock-row">
                  <div className={cx('cc-days', daysTone(s.daysLeft))}>
                    <strong>{s.daysLeft}</strong>
                    <span>day{s.daysLeft === 1 ? '' : 's'}</span>
                  </div>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="small" style={{ fontWeight: 600 }} translate="no">{s.drug}</div>
                    <div className="tiny muted">{s.facility} · {fmtNum(s.qty)} in stock</div>
                    <div className="cc-days-bar"><span className={daysTone(s.daysLeft)} style={{ width: `${Math.max(3, (s.daysLeft / 14) * 100)}%` }} /></div>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => setMove({ drug: s.drug })}>Move stock</Button>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="stack lg">
          <Card title="In transit">
            {transfers.length === 0 ? <Empty icon={Truck} title="Nothing moving">No dispatches on the road right now.</Empty> : (
              <div className="stack" style={{ gap: 12 }}>
                {transfers.map((t) => (
                  <div key={t.id} className="cc-transfer">
                    <div className="row between">
                      <strong className="small">{fmtNum(t.qty)} × {t.drug}</strong>
                      <StatusBadge status={t.status} />
                    </div>
                    <div className="cc-route tiny">
                      <span translate="no">{t.fromName}</span>
                      <ArrowRight size={14} />
                      <span translate="no">{t.toName}</span>
                    </div>
                    <div className="tiny muted">{t.reason} · {timeAgo(t.createdAt)}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Shortage alerts">
            {shortageAlerts.length === 0 ? <Empty icon={AlertTriangle} title="No shortage flags" /> : (
              <div className="stack" style={{ gap: 12 }}>
                {shortageAlerts.map((a) => (
                  <div key={a.id} className="cc-transfer">
                    <div className="row between"><strong className="small" translate="no">{a.drug}</strong><StatusBadge status={a.status} /></div>
                    <div className="tiny muted">{a.message}</div>
                    {isOpen(a) && (
                      <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
                        <Button size="sm" variant="soft" icon={Truck} onClick={() => setMove({ drug: a.drug })}>Move stock</Button>
                        {a.status !== 'acknowledged' && <Button size="sm" variant="ghost" icon={Eye} onClick={() => setAct({ alert: a, action: 'acknowledge' })}>Acknowledge</Button>}
                        <Button size="sm" variant="ghost" icon={Check} onClick={() => setAct({ alert: a, action: 'resolve' })}>Resolve</Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {move && <StockMoveModal open onClose={() => setMove(null)} drug={move.drug} />}
      {act && <AlertAction alert={act.alert} action={act.action} onClose={() => setAct(null)} onDone={reload} />}
    </>
  );
}
