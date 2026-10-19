import { DoctorCtx } from './context';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Activity, ListChecks, Users, CalendarDays, Wallet, Award, Pill, UserRound, Clock, FilePen, Video, Building2, GraduationCap, MapPin, Camera } from 'lucide-react';
import { Suspense, useState } from 'react';
import PortalLayout from '../../components/PortalLayout';
import { pageLoader } from '../../prefetch';
import { useLive } from '../../live';
import { api } from '../../api';
import { Button, Loading, Modal, Switch, useAction, cx } from '../../components/ui';
import { useAuth } from '../../auth';
import Queue from './Queue';
import { NewBookingPopup } from './BookingAlerts';

// The queue is the first screen; the consult room (WebRTC, prescription writer), records, schedule, profile
// and the rest load when opened. Only code is cached — every screen still fetches live data.
const { page, usePrefetch } = pageLoader();
const Clinic = page(() => import('./Clinic'));
const Score = page(() => import('./Score'));
const Consult = page(() => import('./Consult'));
const Patients = page(() => import('./Patients'));
const Schedule = page(() => import('./Schedule'));
const Earnings = page(() => import('./Earnings'));
const Medicines = page(() => import('./Medicines'));
const Profile = page(() => import('./Profile'));
const Prescribe = page(() => import('./Prescribe'));
const Monitoring = page(() => import('./Monitoring'));
import './doctor.css';

// Keyed by id so state from one consult never carries into the next.
function ConsultById() {
  const { id } = useParams();
  return <Consult key={id} />;
}

// E-Clinic partners check themselves in/out when they arrive at / leave an Nexus Healthcare E-Clinic.
// Hospital and partner-clinic doctors get no switch — their status follows their weekly hours.
function PresenceControl({ home }) {
  const [run, busy] = useAction();
  // The E-Clinic picked while checked out lives here, not in the live data — a refetch used to snap it back.
  const [pick, setPick] = useState(null);
  const doctor = home.data?.doctor;
  if (!doctor) return null;
  if (!doctor.verified) return <span className="dr-online"><span className="dot sun" /><span className="small dr-online-label">Verification pending</span></span>;
  const a = doctor.availability || {};
  if (!doctor.eClinicPartner) {
    // Hospital / clinic doctor: status follows their hours, and any time they have a spare
    // moment they can open themselves to video consults for a while ("I'm free now").
    const setFree = (mins) => run('free', async () => {
      const doc = await api.put('/doctor/me', { virtualFor: mins });
      home.setData((d) => (d ? { ...d, doctor: doc } : d));
    }, mins ? `You're open for video consults for ${mins >= 60 ? `${mins / 60} hour${mins > 60 ? 's' : ''}` : `${mins} minutes`}` : 'Video consults paused');
    return (
      <div className={cx('dr-online', a.available && 'on')}>
        <span className={cx('dot', a.available ? 'green pulse' : '')} />
        {a.mode === 'virtual' ? <Video size={14} className="muted" /> : <Clock size={14} className="muted" />}
        <span className="small dr-online-label">{a.available ? a.label : `Off duty${a.next ? ` · next ${a.next}` : ''}`}</span>
        {a.mode === 'virtual'
          ? <button type="button" className="dr-free-btn stop" disabled={busy === 'free'} onClick={() => setFree(0)}>Stop</button>
          : !a.available && (
            <select className="dr-free-btn" value="" disabled={busy === 'free'} onChange={(e) => e.target.value && setFree(Number(e.target.value))} aria-label="I'm free for video consults">
              <option value="">I&apos;m free — take video consults</option>
              <option value="30">for 30 minutes</option>
              <option value="60">for 1 hour</option>
              <option value="120">for 2 hours</option>
              <option value="240">for 4 hours</option>
            </select>
          )}
      </div>
    );
  }
  const clinics = home.data.eClinics || [];
  // The server sends null both for "checked out" and for "online, video only"; '' is the doctor's explicit
  // "video only" pick while checked out. What the select shows must be where the switch checks them in.
  const clinicId = doctor.presenceClinicId ?? (doctor.online ? '' : pick ?? (clinics[0]?.id || ''));
  const setPresence = (online, presenceClinicId = clinicId || null) => run('online', async () => {
    const doc = await api.put('/doctor/me', { online, presenceClinicId: online ? presenceClinicId : null });
    home.setData((d) => (d ? { ...d, doctor: doc } : d));
  }, online ? `You're available${presenceClinicId ? ` at ${clinics.find((c) => c.id === presenceClinicId)?.name.replace('E-Clinic · ', '') || 'the E-Clinic'}` : ''} — patients can see you now` : 'You\'re checked out. See you next time!');
  return (
    <div className={cx('dr-online', doctor.online && 'on')}>
      <span className={cx('dot', doctor.online ? 'green pulse' : '')} />
      {clinics.length > 0 && (
        <select className="dr-presence-select" value={clinicId} disabled={busy === 'online'} aria-label="E-Clinic"
          onChange={(e) => (doctor.online ? setPresence(true, e.target.value || null) : setPick(e.target.value))}>
          {clinics.map((c) => <option key={c.id} value={c.id}>{c.name.replace('E-Clinic · ', '')}</option>)}
          <option value="">Video only (from home)</option>
        </select>
      )}
      <span className="small dr-online-label">{doctor.online ? 'At E-Clinic' : 'Checked out'}</span>
      <Switch checked={!!doctor.online} onChange={busy ? () => {} : (v) => setPresence(v)} label="I'm at the E-Clinic" />
    </div>
  );
}

export default function DoctorApp() {
  usePrefetch();
  const home = useLive('/doctor/home', ['queue', 'consults', 'doctors', 'lab', 'payments', 'referrals', 'notifications', 'monitoring']);
  const waiting = home.data?.stats?.waiting || 0;
  const doctor = home.data?.doctor;
  const verified = doctor ? doctor.verified : true;
  const nav = verified ? [
    { to: '/doctor', label: 'Patient queue', icon: ListChecks, end: true, badge: waiting || null },
    { to: '/doctor/prescribe', label: 'Write prescription', icon: FilePen },
    { to: '/doctor/patients', label: 'Patients & records', icon: Users },
    { to: '/doctor/monitoring', label: 'Remote monitoring', icon: Activity, badge: home.data?.monitoringOpen || null },
    { to: '/doctor/schedule', label: 'Schedule & availability', icon: CalendarDays },
    { to: '/doctor/medicines', label: 'My medicines', icon: Pill },
    { to: '/doctor/clinic', label: home.data?.clinic ? 'My clinic & doctors' : 'Add my clinic', icon: Building2 },
    { to: '/doctor/earnings', label: 'Earnings & reports', icon: Wallet },
    { to: '/doctor/score', label: 'My quality score', icon: Award },
    { to: '/doctor/profile', label: 'My profile', icon: UserRound },
  ] : [
    { to: '/doctor', label: 'Home', icon: ListChecks, end: true },
    { to: '/doctor/profile', label: 'Complete profile', icon: UserRound, badge: doctor?.profileComplete ? null : '!' },
    { to: '/doctor/medicines', label: 'My medicines', icon: Pill },
  ];
  return (
    <DoctorCtx.Provider value={home}>
      <PortalLayout portal="Doctor Portal" nav={nav} headerExtra={<PresenceControl home={home} />}>
        <Suspense fallback={<Loading />}>
        <Routes>
          <Route index element={<Queue />} />
          <Route path="profile" element={<Profile />} />
          <Route path="medicines" element={<Medicines />} />
          {verified && <Route path="clinic" element={<Clinic />} />}
          {verified && <Route path="consult/:id" element={<ConsultById />} />}
          {verified && <Route path="prescribe" element={<Prescribe />} />}
          {verified && <Route path="patients" element={<Patients />} />}
          {verified && <Route path="patients/:pid" element={<Patients />} />}
          {verified && <Route path="monitoring" element={<Monitoring />} />}
          {verified && <Route path="schedule" element={<Schedule />} />}
          {verified && <Route path="earnings" element={<Earnings />} />}
          {verified && <Route path="score" element={<Score />} />}
          <Route path="*" element={<Navigate to="/doctor" replace />} />
        </Routes>
        </Suspense>
        {verified && <NewBookingPopup home={home} />}
        <CompleteProfilePrompt doctor={doctor} />
      </PortalLayout>
    </DoctorCtx.Provider>
  );
}

// Until the doctor's profile is complete, remind them on every visit (sign-up took only name, email, mobile).
function CompleteProfilePrompt({ doctor }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const onPage = useLocation().pathname.endsWith('/profile');
  const [dismissed, setDismissed] = useState(false);
  if (!doctor || doctor.profileComplete || dismissed || onPage) return null;
  const hour = new Date().getHours();
  const hi = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return (
    <Modal open onClose={() => setDismissed(true)} title={`${hi}, ${(user?.name || doctor.name).replace(/^Dr\.?\s*/i, 'Dr. ').split(' ').slice(0, 2).join(' ')} 👋`}
      subtitle="Complete your account to start seeing patients on Nexus Healthcare — about 3 minutes."
      footer={<><Button variant="ghost" onClick={() => setDismissed(true)}>Later</Button><Button onClick={() => { setDismissed(true); navigate('/doctor/profile'); }}>Continue onboarding</Button></>}>
      <div className="pt-cp-modal">
        <div className="pt-cp-modal-row"><span><UserRound size={16} /></span><div><strong>Already filled in</strong><div className="small muted">Your name, email and mobile number from sign-up.</div></div></div>
        <div className="pt-cp-modal-row"><span><MapPin size={16} /></span><div><strong>About you</strong><div className="small muted">Age, address, years of experience and patients seen till date.</div></div></div>
        <div className="pt-cp-modal-row"><span><GraduationCap size={16} /></span><div><strong>Latest degree (required)</strong><div className="small muted">Degree name plus a photo of the certificate or its number.</div></div></div>
        <div className="pt-cp-modal-row"><span><Camera size={16} /></span><div><strong>Professional photo</strong><div className="small muted">A clear photo with your stethoscope — patients see it before booking.</div></div></div>
        {doctor.ownsFacilityId && <div className="pt-cp-modal-row"><span><Building2 size={16} /></span><div><strong>Your clinic</strong><div className="small muted">Then list every doctor at your clinic under “My clinic &amp; doctors”.</div></div></div>}
      </div>
    </Modal>
  );
}
