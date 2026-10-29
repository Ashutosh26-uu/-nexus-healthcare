import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Truck, XCircle, Printer, Phone } from 'lucide-react';
import { api } from '../api';
import { Loading, Button, Field, StatusBadge, fmtDate, fmtNum, useAction } from '../components/ui';
import { localDay } from '../dates';
import './summary.css';

// The supplier's side of a purchase order a warehouse sent from Sehatra — no account needed. They accept it with
// a delivery date, mark it dispatched, or decline it with a reason; the warehouse sees each step live.
export default function SupplierPo() {
  const { token } = useParams();
  const [po, setPo] = useState(null);
  const [err, setErr] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [name, setName] = useState('');
  const [declining, setDeclining] = useState(false);
  const [run, busy] = useAction();
  const url = `/public/po/${encodeURIComponent(token)}`;
  useEffect(() => { api.get(url).then((p) => { setPo(p); setDate(p.deliverBy || ''); }).catch((e) => setErr(e.message)); }, [url]);
  if (err) return <main className="ms"><p>{err}</p></main>;
  if (!po) return <main className="ms"><Loading /></main>;
  const respond = async (action) => {
    const r = await run(action, () => api.post(`${url}/respond`, { action, date: date || undefined, note: note.trim() || undefined, name: name.trim() || undefined }), 'Sent to the warehouse');
    if (r) { setPo(r); setNote(''); setDeclining(false); }
  };
  const r = po.response || {};
  const b = po.buyer;
  const open = ['sent', 'raised', 'accepted'].includes(po.status);
  // 'UP State Drug Store, Lucknow' + district 'Lucknow' shouldn't read 'Lucknow, Lucknow'.
  const place = [b.district, b.state].filter((x) => x && !b.name.includes(x));
  return (
    <main className="ms" lang="en">
      <header className="ms-head">
        <div>
          <div className="ms-kicker">Purchase order · sent through Sehatra</div>
          <h1 dir="ltr">{po.poNo}</h1>
          <div className="ms-sub">From <strong translate="no">{b.name}</strong>{place.length ? `, ${place.join(', ')}` : ''} · to {po.supplier}</div>
        </div>
        <StatusBadge status={po.status} />
      </header>

      <section className="ms-box">
        <h2>Items</h2>
        <table className="ms-table"><tbody>
          {po.lines.map((l, i) => <tr key={i}><td>{l.drug}</td><td style={{ textAlign: 'right' }}><strong>{fmtNum(l.qty)}</strong> units</td></tr>)}
          <tr><td><strong>Total</strong></td><td style={{ textAlign: 'right' }}><strong>{fmtNum(po.units)}</strong> units</td></tr>
        </tbody></table>
        {po.deliverBy && <p className="ms-note">Needed by <strong>{fmtDate(po.deliverBy)}</strong></p>}
        {po.notes && <p className="ms-note">Notes: {po.notes}</p>}
      </section>

      <section className="ms-box">
        <h2>Deliver to</h2>
        <p translate="no">{[b.name, b.address, ...place].filter(Boolean).join(', ')}</p>
        {b.phone && <p className="ms-note"><Phone size={13} /> <a href={`tel:${b.phone}`} dir="ltr">{b.phone}</a></p>}
      </section>

      {po.status === 'cancelled' && <section className="ms-alert"><h2>Cancelled</h2><p>The warehouse cancelled this order{po.cancelledAt ? ` on ${fmtDate(po.cancelledAt)}` : ''}. Please don't dispatch it.</p></section>}
      {(r.acceptedAt || r.dispatchedAt || r.declinedAt) && (
        <section className="ms-box">
          <h2>Your answer</h2>
          {r.acceptedAt && <p>Accepted {fmtDate(r.acceptedAt)}{r.deliverOn ? ` · delivery on ${fmtDate(r.deliverOn)}` : ''}</p>}
          {r.dispatchedAt && <p>Dispatched {fmtDate(r.dispatchedAt)}{r.arrivesBy ? ` · arrives by ${fmtDate(r.arrivesBy)}` : ''}</p>}
          {r.declinedAt && <p>Declined {fmtDate(r.declinedAt)}</p>}
          {r.note && <p className="ms-note">“{r.note}”</p>}
        </section>
      )}

      {open && (
        <section className="ms-box no-print">
          <h2>{po.status === 'accepted' ? 'When it leaves your warehouse' : 'Can you supply this?'}</h2>
          <div className="stack">
            <Field label={po.status === 'accepted' ? 'Arrives by' : 'You will deliver on'}><input className="input" type="date" min={localDay()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Your name (optional)"><input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></Field>
            <Field label={declining ? 'Why can\'t you supply it?' : 'Note for the warehouse (optional)'}><textarea className="textarea" style={{ minHeight: 60 }} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder={declining ? 'e.g. Out of stock until next month' : 'e.g. Batch details, part delivery'} /></Field>
            <div className="row wrap" style={{ gap: 8 }}>
              {declining ? (
                <>
                  <Button variant="danger" icon={XCircle} loading={busy === 'decline'} disabled={note.trim().length < 3} onClick={() => respond('decline')}>Decline the order</Button>
                  <Button variant="ghost" onClick={() => setDeclining(false)}>Back</Button>
                </>
              ) : (
                <>
                  {po.status !== 'accepted' && <Button icon={CheckCircle2} loading={busy === 'accept'} disabled={!date} onClick={() => respond('accept')}>Accept</Button>}
                  <Button variant={po.status === 'accepted' ? undefined : 'secondary'} icon={Truck} loading={busy === 'dispatch'} onClick={() => respond('dispatch')}>Mark dispatched</Button>
                  <Button variant="ghost" onClick={() => setDeclining(true)}>Can't supply</Button>
                </>
              )}
            </div>
          </div>
        </section>
      )}
      <div className="row no-print" style={{ gap: 8 }}><Button variant="ghost" size="sm" icon={Printer} onClick={() => window.print()}>Print</Button></div>
      <footer className="ms-foot">Raised {fmtDate(po.createdAt)}. This private link was sent to {po.supplier} by {b.name}; Sehatra only carries the order and doesn't take part in the sale.</footer>
    </main>
  );
}
