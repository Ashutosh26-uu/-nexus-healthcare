import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight, Repeat } from 'lucide-react';
import NearbyDoctors from './NearbyDoctors';
import { Button, StatusBadge, fmtDateTime } from '../../components/ui';
import { PageHeader } from '../../components/PortalLayout';
import { usePatient } from './shared';

/* ---------- find a doctor ---------- */
// Doctors within 20 km for the patient's symptoms or chosen department — hospital doctors, doctors with
// their own clinic and Nexus virtual-clinic doctors — with "All of India" to look further.
export default function Consult() {
  const { patient, home } = usePatient();
  const navigate = useNavigate();
  const location = useLocation();
  const upcoming = home?.upcoming || [];
  const start = location.state || {};

  return (
    <div className="stack lg">
      <PageHeader eyebrow="Find a doctor" title="Talk to a doctor" subtitle="Tell us the problem — we show the best doctors, hospitals and clinics within 20 km, with reviews, experience, timings and fees.">
        <Button variant="secondary" icon={Repeat} onClick={() => navigate('/patient/change-doctor')}>Change my doctor</Button>
      </PageHeader>

      {patient?.bookingMissing?.length > 0 && (
        <div className="pt-cp-banner fade-in">
          <div className="grow">
            <strong>Complete your profile to book</strong>
            <div className="small muted">You can browse doctors now. To book, we need your age and permanent address.</div>
          </div>
          <Button variant="clay" onClick={() => navigate('/patient/complete-profile', { state: { returnTo: '/patient/consult' } })}>Complete now</Button>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="pt-upcoming-strip">
          {upcoming.map((c) => (
            <button key={c.id} className="pt-upcoming-pill" onClick={() => navigate(`/patient/consult/${c.id}`)}>
              <StatusBadge status={c.status} />
              <span className="small strong" translate="no">{c.doctorName}</span>
              <span className="tiny muted">{c.status === 'scheduled' ? fmtDateTime(c.scheduledAt) : c.status === 'queued' ? 'in queue' : 'live now'}</span>
              <ChevronRight size={15} className="muted" />
            </button>
          ))}
        </div>
      )}

      {/* Keyed on the profile: the finder only reads its prefills on mount, and `patient` arrives after the
          first render on a cold load (and changes on a family-profile switch). */}
      <NearbyDoctors key={patient?.id || 'none'} full symptoms={start.symptoms || patient?.currentSymptoms?.text || ''} department={start.department || patient?.currentSymptoms?.department || ''} />
    </div>
  );
}
