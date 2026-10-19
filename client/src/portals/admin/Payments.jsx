import { useState } from 'react';
import { IndianRupee, Check, X, Smartphone, Info } from 'lucide-react';
import { api } from '../../api';
import { PageHeader } from '../../components/PortalLayout';
import { Card, Empty, Button, Modal, Field, StatusBadge, useAction, fmtMoney, fmtDateTime, timeAgo } from '../../components/ui';
import { useLive } from '../../live';
import { LiveGate } from './shared';

const PURPOSE = { consult: 'Consult booking', lab_advance: 'Lab test advance', med_order_advance: 'Medicine order advance', delivery: 'Medicine delivery', kiosk_extra: 'Kiosk payment' };

// UPI payments made to the network's own UPI ID. UPI gives no callback, so the patient sends the reference (UTR)
// from their app and whoever holds the UPI account matches it here. Confirming unlocks the booking exactly as a
// gateway payment would; sending it back lets the patient re-enter the reference.
export default function Payments() {
  const live = useLive('/admin/payments', ['payments', 'admin']);
  const [run, busy] = useAction();
  const [reject, setReject] = useState(null);
  const [reason, setReason] = useState('');
  const decide = async (p, action, body) => {
    const r = await run(`${action}:${p.id}`, () => api.post(`/admin/payments/${p.id}/${action}`, body), action === 'confirm' ? `${fmtMoney(p.amount)} confirmed — the booking is going ahead` : 'Sent back to the patient');
    if (r) { setReject(null); setReason(''); live.reload(); }
  };

  return (
    <>
      <PageHeader eyebrow="Money in" title="UPI payments" subtitle="Patients pay the network's UPI QR, then send the reference from their app. Match it in your UPI app and confirm here." />
      <LiveGate live={live}>
        {(d) => (
          <div className="stack lg">
            {!d.manualUpi && (
              <div className="callout sun"><Info /><span>{d.upiVpa ? 'Manual UPI confirmation is off on this network (a payment gateway or demo payments are in use).' : 'No UPI ID is set for this network (UPI_VPA), so patients can’t pay by UPI QR yet.'}</span></div>
            )}
            {d.upiVpa && <div className="row" style={{ gap: 8 }}><Smartphone size={16} /><span className="small">Receiving UPI ID: <strong translate="no">{d.upiVpa}</strong></span></div>}

            <Card title={`Waiting for confirmation${d.claimed.length ? ` · ${d.claimed.length}` : ''}`}>
              {d.claimed.length === 0 ? <Empty icon={IndianRupee} title="Nothing to confirm">When a patient sends a UPI reference, it appears here straight away.</Empty> : (
                <div className="stack">
                  {d.claimed.map((p) => (
                    <div key={p.id} className="card flat">
                      <div className="row between wrap" style={{ gap: 8 }}>
                        <div>
                          <strong>{fmtMoney(p.amount)}</strong> · {PURPOSE[p.purpose] || p.purpose}{p.label ? <span className="muted"> — {p.label}</span> : null}
                          <div className="small">UTR <strong className="mono" translate="no">{p.utr}</strong> · sent {timeAgo(p.claimedAt)}</div>
                          {p.payer && <div className="tiny muted" translate="no">{p.payer.name}{p.payer.phone ? ` · ${p.payer.phone}` : ''}{p.payer.email ? ` · ${p.payer.email}` : ''}</div>}
                        </div>
                        <div className="row" style={{ gap: 6 }}>
                          <Button size="sm" variant="ghost" icon={X} disabled={Boolean(busy)} onClick={() => { setReject(p); setReason(''); }}>Can&apos;t find it</Button>
                          <Button size="sm" icon={Check} loading={busy === `confirm:${p.id}`} disabled={Boolean(busy)} onClick={() => decide(p, 'confirm')}>Money received — confirm</Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Recently decided">
              {d.decided.length === 0 ? <Empty title="No decisions yet" /> : (
                <div className="stack" style={{ gap: 6 }}>
                  {d.decided.map((p) => (
                    <div key={p.id} className="row between wrap small" style={{ gap: 8 }}>
                      <span><strong>{fmtMoney(p.amount)}</strong> · {PURPOSE[p.purpose] || p.purpose} · UTR <span className="mono" translate="no">{p.utr}</span>{p.payer ? <span className="muted" translate="no"> · {p.payer.name}</span> : null}</span>
                      <span className="row" style={{ gap: 8 }}><StatusBadge status={p.status === 'created' ? 'sent back' : p.status} /><span className="tiny muted">{fmtDateTime(p.decidedAt)}</span></span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}
      </LiveGate>

      {reject && (
        <Modal open onClose={() => setReject(null)} title="Send this payment back" subtitle={`${fmtMoney(reject.amount)} · UTR ${reject.utr}`}
          footer={<><Button variant="ghost" onClick={() => setReject(null)}>Cancel</Button><Button icon={X} loading={busy === `reject:${reject.id}`} onClick={() => decide(reject, 'reject', { reason })}>Send back</Button></>}>
          <div className="stack">
            <p className="small muted mb-0">The patient is told the reference couldn&apos;t be matched and can enter it again. Their booking stays held for another 30 minutes.</p>
            <Field label="Reason (optional)"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. No payment of this amount has arrived" maxLength={200} /></Field>
          </div>
        </Modal>
      )}
    </>
  );
}
