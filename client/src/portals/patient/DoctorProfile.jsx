import { useEffect, useState } from 'react';
import { Star, Languages, MapPin, Clock, GraduationCap, Users, BadgeCheck, Building2, IndianRupee, Briefcase, Smile, Quote } from 'lucide-react';
import { api } from '../../api';
import { Avatar, Button, Modal, fmtMoney, timeAgo, cx } from '../../components/ui';
import { AvailBadge } from '../../components/Availability';
import { getLocale } from '../../i18n';
import ShareButton from '../../components/ShareButton';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const todayKey = () => DAYS[(new Date().getDay() + 6) % 7];

// "Today: 9 AM – 1 PM, 5 PM – 8 PM" — one line for list cards.
export function TodayTimings({ doc }) {
  if (!doc?.timings) return null;
  const t = doc.timings[todayKey()] || [];
  return (
    <span className="pt-today-time">
      <Clock size={12} /> Today: {doc.eClinicPartner && !t.length ? 'when checked in at an E-Clinic' : t.length ? t.join(', ') : 'Not working today'}
    </span>
  );
}

export default function DoctorProfile({ doc, onClose, onConsult, busy, consultLabel }) {
  const [rev, setRev] = useState(null);
  useEffect(() => {
    setRev(null);
    if (!doc?.id) return undefined;
    let alive = true; // opening another profile quickly must not show the previous doctor's reviews
    api.get(`/doctors/${doc.id}/reviews`).then((r) => alive && setRev(r)).catch(() => {});
    return () => { alive = false; };
  }, [doc?.id]);
  if (!doc) return null;
  const st = rev?.stats || { rating: doc.rating, reviewCount: doc.reviewCount, satisfaction: doc.satisfaction, patientsSeen: doc.patientsSeen };
  const today = todayKey();
  const fmt = (n) => Number(n || 0).toLocaleString(getLocale());
  return (
    <Modal open={!!doc} onClose={onClose} wide title={doc.name} subtitle={`${doc.specialty} · ${doc.qualification}`}
      footer={<>
        <span className="small grow"><strong>{fmtMoney(doc.fee)}</strong> <span className="muted">per consult</span></span>
        <Button variant="ghost" onClick={onClose}>Close</Button>
        {onConsult && <Button loading={busy} onClick={() => onConsult(doc)}>{consultLabel || (doc.online ? 'Book now' : 'Book a time')}</Button>}
      </>}>
      <div className="pt-dp">
        <div className="pt-dp-top">
          <Avatar name={doc.name} size="lg" />
          <div className="grow">
            <div className="row wrap" style={{ gap: 8 }}><AvailBadge a={doc.availability} />{doc.verified !== false && <span className="badge green"><BadgeCheck size={12} /> Registration verified</span>}</div>
            <div className="small muted mt-1">{doc.availability?.label}{doc.availability?.next ? ` · next ${doc.availability.next}` : ''}</div>
          </div>
          <ShareButton iconOnly label="Share this doctor on WhatsApp" url={window.location.origin}
            text={`${doc.name} (${doc.specialty}${doc.experience ? `, ${doc.experience} yrs experience` : ''}) is on Nexus Healthcare — registration-verified doctors, book from your phone:`} />
        </div>
        <div className="pt-dp-stats">
          {doc.experience > 0 && <div><Briefcase size={16} /><strong>{doc.experience} yrs</strong><span>experience</span></div>}
          <div><Star size={16} /><strong>{st.rating && st.reviewCount ? Number(st.rating).toFixed(1) : 'New'}</strong><span>{st.reviewCount ? `${fmt(st.reviewCount)} reviews` : 'rating'}</span></div>
          <div><Smile size={16} /><strong>{st.satisfaction != null ? `${st.satisfaction}%` : '—'}</strong><span>satisfied patients</span></div>
          {(st.patientsSeen || Math.max(doc.consultsDone || 0, doc.patientsLifetime || 0)) > 0 && <div><Users size={16} /><strong>{fmt(st.patientsSeen || Math.max(doc.consultsDone || 0, doc.patientsLifetime || 0))}</strong><span>patients seen</span></div>}
          <div><IndianRupee size={16} /><strong>{fmtMoney(doc.fee)}</strong><span>consult fee</span></div>
        </div>
        <dl className="pt-dp-kv">
          <dt><GraduationCap size={14} /> Qualification</dt><dd>{doc.qualification}</dd>
          <dt><Languages size={14} /> Speaks</dt><dd>{(doc.languages || []).join(', ')}</dd>
          {doc.affiliation && <><dt><Building2 size={14} /> Practises at</dt><dd translate="no">{doc.affiliation}</dd></>}
          <dt><MapPin size={14} /> Location</dt><dd>{doc.at || `${doc.district}, ${doc.state}`}{doc.distanceKm != null ? ` · ${doc.distanceKm} km from you` : ''}</dd>
          <dt><BadgeCheck size={14} /> Reg. no.</dt><dd className="mono">{doc.regNo}</dd>
        </dl>
        <div>
          <h4 className="row mb-1" style={{ gap: 6 }}><Clock size={16} /> Weekly timings</h4>
          {doc.eClinicPartner && <p className="tiny muted mb-1">E-Clinic doctor — usually at these hours, and shown as available whenever they check in.</p>}
          <div className="pt-dp-week">
            {DAYS.map((d) => {
              const t = doc.timings?.[d] || [];
              return (
                <div key={d} className={cx('pt-dp-day', d === today && 'today', !t.length && 'off')}>
                  <strong>{d}</strong>
                  <span>{t.length ? t.join(', ') : 'Off'}</span>
                </div>
              );
            })}
          </div>
        </div>
        {rev?.reviews?.length > 0 && (
          <div>
            <h4 className="row mb-1" style={{ gap: 6 }}><Quote size={16} /> What patients say</h4>
            <div className="pt-dp-reviews">
              {rev.reviews.slice(0, 4).map((r) => {
                const n = Math.max(0, Math.min(5, Math.round(Number(r.stars) || 0))); // repeat() throws on a negative/fractional count
                return (
                <div key={r.id} className="pt-dp-review">
                  <span className="pt-stars" aria-label={`${n} stars`}>{'★'.repeat(n)}<span className="muted">{'★'.repeat(5 - n)}</span></span>
                  {r.text && <p className="small mb-0">“{r.text}”</p>}
                  <span className="tiny muted" translate="no">{r.name} · {timeAgo(r.at)}</span>
                </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
