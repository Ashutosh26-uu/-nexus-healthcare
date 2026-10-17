import { Link } from 'react-router-dom';
import { Activity, Syringe, CalendarClock, Users, UserPlus, ChevronRight } from 'lucide-react';
import { Card, timeAgo } from '../../components/ui';
import { getLocale } from '../../i18n';
import { READING_KINDS, FlagBadge, dayLabel, readingValue } from './health';

// Home: "Your health today" — the latest home reading, next vaccine and next visit for the active profile,
// each a tap away from the page that acts on it.
export function HealthToday({ card, isSelf, name }) {
  if (!card) return null;
  const r = card.latestReading;
  const v = card.vaccines;
  const visit = card.nextAppointment;
  const vaxText = !card.hasDob ? 'Add date of birth'
    : v?.overdue ? `${v.overdue} overdue` : v?.due ? `${v.due} due now` : v?.next ? `${v.next.name} · ${dayLabel(v.next.dueOn)}` : v?.child ? 'All done' : 'Reminders';
  return (
    <Card title={isSelf ? 'Your health today' : `${name}’s health today`} className="fade-in">
      <div className="hl-today">
        <Link to="/patient/tracker" className="hl-today-item">
          <span className="tiny muted row" style={{ gap: 6 }}><Activity size={14} /> Latest reading</span>
          {r ? (
            <>
              <span className="hl-big" translate="no" dir="ltr">{READING_KINDS[r.kind].short} {readingValue(r)} <span className="tiny muted">{READING_KINDS[r.kind].unit}</span></span>
              <span className="tiny muted">{timeAgo(r.at)} <FlagBadge flag={r.flag} /></span>
            </>
          ) : <><span className="hl-big">Log BP or sugar</span><span className="tiny muted">Takes 10 seconds</span></>}
        </Link>
        <Link to="/patient/vaccines" className="hl-today-item">
          <span className="tiny muted row" style={{ gap: 6 }}><Syringe size={14} /> {v?.child ? 'Next vaccine' : 'Vaccines'}</span>
          <span className={`hl-big${v?.overdue ? ' pt-clay' : ''}`}>{vaxText}</span>
          {v?.child && v.dueNames?.length ? <span className="tiny muted">{v.dueNames.slice(0, 2).join(', ')}</span> : null}
        </Link>
        <Link to="/patient/follow-ups" className="hl-today-item">
          <span className="tiny muted row" style={{ gap: 6 }}><CalendarClock size={14} /> Next appointment</span>
          {visit ? (
            <>
              <span className="hl-big">{visit.status === 'scheduled' ? new Date(visit.at).toLocaleString(getLocale(), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : visit.status === 'in_progress' ? 'Now' : 'In queue'}</span>
              {visit.doctorName && <span className="tiny muted" translate="no">{visit.doctorName}</span>}
            </>
          ) : <><span className="hl-big">None booked</span><span className="tiny muted">Talk to a doctor anytime</span></>}
        </Link>
      </div>
    </Card>
  );
}

// New accounts with only their own profile: invite them to bring the family in.
export function FamilyInvite() {
  return (
    <div className="hl-invite fade-in">
      <span className="hl-invite-ic"><Users size={22} /></span>
      <div className="grow">
        <strong className="block">Add your parents and children — manage everyone&apos;s health in one place</strong>
        <span className="small muted">Book doctors, track vaccines and BP, and get reminders for the whole family from your phone.</span>
      </div>
      <Link to="/patient/family?add=1" className="btn clay"><UserPlus size={16} /> Add family member <ChevronRight size={16} /></Link>
    </div>
  );
}
