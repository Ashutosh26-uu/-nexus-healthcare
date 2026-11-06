import { useState } from 'react';
import { WifiOff, HeartPulse, Pill, CalendarClock, Phone, RefreshCw } from 'lucide-react';
import { readOfflineCopy } from '../offlineCopy';
import { cx, fmtDate, fmtDateTime } from './ui';

// Shown when the app opens with no internet and the person keeps an offline copy (Settings → Privacy).
// Read-only: nothing here can be changed or sent until the connection is back.
export default function OfflineCopy({ onRetry }) {
  const copies = readOfflineCopy();
  const [i, setI] = useState(0);
  const c = copies[i];
  if (!c) return null;
  const p = c.patient;
  return (
    <div className="offline-copy" role="main">
      <div className="offline-head">
        <WifiOff size={18} />
        <div className="grow">
          <strong>You&apos;re offline</strong>
          <div className="tiny">Showing the copy saved on this phone on {fmtDateTime(c.savedAt)}.</div>
        </div>
        <button type="button" className="btn sm secondary" onClick={onRetry}><RefreshCw size={14} /> Try again</button>
      </div>

      {copies.length > 1 && (
        <div className="pills" role="tablist">
          {copies.map((x, k) => <button key={x.patient.id} type="button" role="tab" aria-selected={k === i} className={cx('pill', k === i && 'active')} onClick={() => setI(k)} translate="no">{x.patient.name.split(' ')[0]}</button>)}
        </div>
      )}

      <section className="card offline-card offline-emergency">
        <h3 className="row" style={{ gap: 8 }}><HeartPulse size={18} /> Emergency card</h3>
        <div className="offline-grid">
          <div><span>Name</span><strong translate="no">{p.name}</strong></div>
          <div><span>Age / sex</span><strong>{p.age ?? '—'} / {p.gender || '—'}</strong></div>
          <div><span>Blood group</span><strong>{p.bloodGroup || 'Unknown'}</strong></div>
          <div><span>Health Passport</span><strong className="mono">{p.id}</strong></div>
        </div>
        <p className="small mb-1"><strong>Allergies:</strong> {p.allergies.length ? p.allergies.join(', ') : 'None recorded'}</p>
        <p className="small mb-1"><strong>Conditions:</strong> {p.conditions.length ? p.conditions.join(', ') : 'None recorded'}</p>
        <p className="small mb-1"><strong>Regular medicines:</strong> {p.currentMeds.length ? p.currentMeds.join(', ') : 'None recorded'}</p>
        {p.emergencyContacts.map((e) => (
          <a key={e.phone} className="offline-call" href={`tel:${e.phone}`}><Phone size={15} /> <span translate="no">{e.name}</span>{e.relation ? ` (${e.relation})` : ''} · {e.phone}</a>
        ))}
        <a className="offline-call sos" href="tel:108"><Phone size={15} /> Ambulance · 108</a>
      </section>

      {c.prescriptions.length > 0 && (
        <section className="card offline-card">
          <h3 className="row" style={{ gap: 8 }}><Pill size={18} /> Latest prescriptions</h3>
          {c.prescriptions.map((r) => (
            <div key={r.id} className="offline-rx">
              <div className="tiny muted">{fmtDate(r.createdAt)}{r.doctorName ? ` · ${r.doctorName}` : ''}</div>
              <ul>{r.items.map((it, k) => <li key={k}><strong translate="no">{it.drug}</strong> — {[it.dose, it.freq, it.food, it.days ? `${it.days} days` : ''].filter(Boolean).join(' · ')}</li>)}</ul>
            </div>
          ))}
        </section>
      )}

      {c.upcoming.length > 0 && (
        <section className="card offline-card">
          <h3 className="row" style={{ gap: 8 }}><CalendarClock size={18} /> Upcoming visits</h3>
          <ul className="small">{c.upcoming.map((v) => <li key={v.id}>{v.scheduledAt ? fmtDateTime(v.scheduledAt) : 'In queue'} · <span translate="no">{v.doctorName}</span>{v.bookingNo ? ` · ${v.bookingNo}` : ''}</li>)}</ul>
        </section>
      )}
    </div>
  );
}
