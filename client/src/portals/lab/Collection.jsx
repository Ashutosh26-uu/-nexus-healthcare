import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bike, UserPlus, CheckCircle2, Phone, Clock } from 'lucide-react';
import { Button, useAction, cx } from '../../components/ui';
import { api } from '../../api';
import { getLocale } from '../../i18n';

// "2026-10-16T09:30" for <input type="datetime-local"> in the device's own time zone.
const toLocalInput = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };
const timeOf = (iso) => new Date(iso).toLocaleTimeString(getLocale(), { hour: 'numeric', minute: '2-digit' });
const windowText = (w) => (w ? `${new Date(w.from).toLocaleString(getLocale(), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} – ${timeOf(w.to)}` : 'Any time today');

// Home-collection dispatch on an order card: assign a technician + visit window → on the way (ETA) → collected.
export default function Collection({ order, collectors, reload }) {
  const c = order.collection;
  const [editing, setEditing] = useState(!c);
  const active = (collectors || []).filter((x) => x.active);
  const [who, setWho] = useState(c?.collectorId || active[0]?.id || '');
  const [from, setFrom] = useState(() => toLocalInput(c?.window?.from || order.booking?.slot || Date.now() + 3600000));
  const [mins, setMins] = useState(60);
  const [share, setShare] = useState(!!c?.sharePhone);
  const [eta, setEta] = useState(20);
  const [run, busy] = useAction();

  const assign = async () => {
    const start = new Date(from);
    const r = await run('assign', () => api.post(`/lab-orders/${order.id}/collection`, { collectorId: who, from: start.toISOString(), to: new Date(start.getTime() + mins * 60000).toISOString(), sharePhone: share }), 'Technician assigned — the patient has been told');
    if (r) { setEditing(false); reload(); }
  };
  const step = async (status) => {
    const r = await run(status, () => api.put(`/lab-orders/${order.id}/collection`, { status, etaMin: status === 'on_the_way' ? Number(eta) : undefined }), status === 'on_the_way' ? `Patient told: arriving in about ${eta} min` : 'Sample collected — label ID created');
    if (r) reload();
  };

  if (editing || !c) { // also while the list reloads right after assigning
    if (!active.length) return <div className="lab-collect tiny">No active technicians yet. <Link to="/lab/setup">Add your collection team</Link> to assign home visits.</div>;
    return (
      <div className="lab-collect">
        <div className="lab-collect-grid">
          <label className="tiny"><span className="muted">Technician</span>
            <select className="select sm" value={who} onChange={(e) => setWho(e.target.value)}>{active.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          </label>
          <label className="tiny"><span className="muted">Visit from</span>
            <input className="input sm" type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="tiny"><span className="muted">Window</span>
            <select className="select sm" value={mins} onChange={(e) => setMins(Number(e.target.value))}>
              <option value={30}>30 min</option><option value={60}>1 hour</option><option value={120}>2 hours</option>
            </select>
          </label>
        </div>
        <label className="check tiny"><input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} /> Share the technician&apos;s own number with the patient (otherwise they see the lab&apos;s number)</label>
        <div className="row wrap" style={{ gap: 8 }}>
          <Button size="sm" icon={UserPlus} loading={busy === 'assign'} disabled={!who || !from} onClick={assign}>{c ? 'Re-assign' : 'Assign technician'}</Button>
          {c && <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>}
        </div>
      </div>
    );
  }
  return (
    <div className={cx('lab-collect', c.status === 'on_the_way' && 'moving')}>
      <div className="row wrap" style={{ gap: 8 }}>
        <Bike size={15} />
        <strong className="small">{c.name}</strong>
        {c.phone && <a className="tiny" href={`tel:${c.phone}`}><Phone size={11} /> {c.phone}</a>}
        <span className="tiny muted"><Clock size={11} /> {windowText(c.window)}</span>
        <span className={cx('badge', c.status === 'on_the_way' ? 'sun' : 'sky')}>{c.status === 'on_the_way' ? `On the way · ~${c.etaLeftMin ?? c.etaMin} min` : 'Assigned'}</span>
        {c.sharePhone && <span className="tiny muted">number shared with patient</span>}
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        {c.status === 'assigned' && (
          <>
            <label className="row tiny" style={{ gap: 6 }}>ETA
              <input className="input sm lab-eta" type="number" min={1} max={240} value={eta} onChange={(e) => setEta(e.target.value)} aria-label="ETA in minutes" /> min
            </label>
            <Button size="sm" variant="secondary" icon={Bike} loading={busy === 'on_the_way'} disabled={!(eta >= 1 && eta <= 240)} onClick={() => step('on_the_way')}>On the way</Button>
          </>
        )}
        <Button size="sm" icon={CheckCircle2} loading={busy === 'collected'} onClick={() => step('collected')}>Sample collected</Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Change</Button>
      </div>
    </div>
  );
}
