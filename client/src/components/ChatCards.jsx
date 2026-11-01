import { useState } from 'react';
import { Star, MapPin, Video, CalendarCheck, Stethoscope } from 'lucide-react';
import { cx, fmtMoney } from './ui';
import { useAuth } from '../auth';

// Cards Saathi puts under a reply: doctors it found (same ranking as "Find a doctor"), and a booking card.
// Nothing here books by itself — "Continue" opens the app's normal booking flow (time, video/visit, payment).

export function DoctorCards({ data, onBook }) {
  const list = data?.list || [];
  if (!list.length) return null;
  return (
    <div className="chat-cards">
      {data.scope === 'all' && <div className="chat-cards-note">No one nearby yet — these doctors are across the country (many consult by video).</div>}
      {list.map((d, i) => (
        <div key={d.id} className={cx('chat-doc', i === 0 && 'top')}>
          <div className="chat-doc-main">
            <div className="chat-doc-name" translate="no">{d.name}</div>
            <div className="chat-doc-sub">{d.specialty}{d.online ? <span className="chat-doc-live"> · Available now</span> : null}</div>
            <div className="chat-doc-key">
              {d.fee != null && <span className="strong">{fmtMoney(d.fee)}</span>}
              <span><Star size={12} /> {d.reviewCount ? Number(d.rating).toFixed(1) : 'New'}</span>
              {d.distanceKm != null ? <span><MapPin size={12} /> {d.distanceKm} km</span> : d.practice === 'virtual' ? <span><Video size={12} /> Online</span> : null}
            </div>
          </div>
          <button type="button" className="chat-doc-book" onClick={() => onBook(d)}>Book</button>
        </div>
      ))}
    </div>
  );
}

export function BookCard({ data, onContinue }) {
  const { profiles = [], user } = useAuth() || {};
  const isSelf = (p) => p.self || (user && p.userId === user.id);
  const [who, setWho] = useState(() => (profiles.find(isSelf) || profiles[0])?.id || null);
  const [note, setNote] = useState(data?.note || '');
  const d = data?.doctor;
  if (!d) return null;
  return (
    <div className="chat-book">
      <div className="chat-book-head"><Stethoscope size={16} /> Book <strong translate="no">{d.name}</strong></div>
      <div className="chat-doc-sub">{d.specialty}{d.fee != null ? ` · ${fmtMoney(d.fee)}` : ''}</div>
      {profiles.length > 1 && (
        <div className="chat-book-row">
          <span className="chat-book-label">Who is it for?</span>
          <div className="chat-book-chips" role="radiogroup" aria-label="Who is the visit for">
            {profiles.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={who === p.id} className={cx(who === p.id && 'on')} onClick={() => setWho(p.id)}>
                <span translate="no">{isSelf(p) ? 'Me' : p.name.split(' ')[0]}</span>{!isSelf(p) && p.relation ? ` (${p.relation})` : ''}
              </button>
            ))}
          </div>
        </div>
      )}
      <label className="chat-book-row">
        <span className="chat-book-label">For the doctor — what's wrong?</span>
        <textarea rows={2} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="e.g. fever for 3 days, body ache" />
      </label>
      <button type="button" className="chat-book-go" onClick={() => onContinue(d, note.trim(), who)}><CalendarCheck size={16} /> Choose a time &amp; confirm</button>
      <div className="chat-cards-note">Next you pick video or clinic visit and a time, then pay. Nothing is booked until you confirm.</div>
    </div>
  );
}
