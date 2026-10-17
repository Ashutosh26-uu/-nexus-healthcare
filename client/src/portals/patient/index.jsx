import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Home as HomeIcon, HeartPulse, Video, FolderHeart, Pill, ShieldCheck, Users, IdCard, Settings as SettingsIcon, ChevronDown, Check, UserPlus, Activity, Coins, Dna, ScanLine, UserRoundPen, MapPin, Stethoscope, FileUp, FlaskConical, CalendarClock, Repeat, Gauge, Syringe } from 'lucide-react';
import { Gift } from 'lucide-react'; // Invite & earn
import PortalLayout from '../../components/PortalLayout';
import { Avatar, Button, Modal, cx, useToast } from '../../components/ui';
import { session } from '../../api';
import { useLive } from '../../live';
import { PatientContext, HOME_TOPICS, PageSkeleton, firstName, greeting, relationOf, usePatient } from './shared';
import Home from './Home';
import { useI18n, codeForName } from '../../i18n';
import './patient.css';

// Only Home is in the first load; every other page (and the doctor finder, booking, payment and call code they
// pull in) is fetched on demand. Code is cached by the browser; data is still fetched live on every visit.
const Triage = lazy(() => import('./Triage'));
const Consult = lazy(() => import('./Consult'));
const ConsultRoom = lazy(() => import('./ConsultRoom'));
const Records = lazy(() => import('./Records'));
const Medicines = lazy(() => import('./Medicines'));
const Settings = lazy(() => import('./Settings'));
const CompleteProfile = lazy(() => import('./CompleteProfile'));
const FollowUps = lazy(() => import('./FollowUps'));
const Twin = lazy(() => import('./Twin'));
const Wallet = lazy(() => import('./Wallet'));
const Invite = lazy(() => import('./Invite'));
const FamilyGraph = lazy(() => import('./FamilyGraph'));
const MedicineScan = lazy(() => import('./MedicineScan'));
const ChangeDoctor = lazy(() => import('./ChangeDoctor'));
const OrderMedicines = lazy(() => import('./OrderMedicines'));
const Tests = lazy(() => import('./Tests'));
const EmergencyCard = lazy(() => import('./EmergencyCard'));
const Consents = lazy(() => import('./Consents'));
const Family = lazy(() => import('./Family'));
const Tracker = lazy(() => import('./Tracker'));
const Vaccines = lazy(() => import('./Vaccines'));

// Keyed by id so state from one consult never carries into the next.
function ConsultRoomById() {
  const { id } = useParams();
  return <ConsultRoom key={id} />;
}

export default function PatientApp() {
  const [profileKey, setProfileKey] = useState(() => session.profile || 'self');
  const home = useLive('/patient/home', HOME_TOPICS, [profileKey]);
  const toast = useToast();
  const navigate = useNavigate();
  const { lang, setLang } = useI18n();

  // First login with no saved language choice: adopt the patient's profile language (once).
  const selfLanguage = (home.data?.profiles || []).find((p) => p.self)?.language || (profileKey === 'self' ? home.data?.patient?.language : null);
  useEffect(() => {
    if (!selfLanguage || window.__ocLangSaved) return;
    window.__ocLangSaved = true;
    const navCode = codeForName((navigator.language || 'en').split('-')[0]);
    const code = codeForName(selfLanguage);
    if (code && code !== lang && (!navCode || navCode === lang)) setLang(code);
  }, [selfLanguage]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchProfile = useCallback((id, { stay = false, quiet = false } = {}) => {
    const profiles = home.data?.profiles || [];
    const target = profiles.find((p) => p.id === id);
    session.profile = target?.self ? null : id;
    setProfileKey(target?.self ? 'self' : id);
    if (!quiet && target) toast(target.self ? 'Back to your own profile' : `Now looking after ${firstName(target.name)}`);
    if (!stay) navigate('/patient');
  }, [home.data, navigate, toast]);

  const ctx = useMemo(() => ({
    home: home.data,
    homeLoading: home.loading && !home.data,
    homeError: home.error,
    reloadHome: home.reload,
    patient: home.data?.patient,
    profiles: home.data?.profiles || [],
    profileKey,
    switchProfile,
  }), [home.data, home.loading, home.error, home.reload, profileKey, switchProfile]);

  const pending = home.data?.pendingConsents || 0;
  const activeRx = (home.data?.prescriptions || []).filter((r) => ['issued', 'dispensed', 'out_for_delivery'].includes(r.status)).length;

  const incomplete = home.data?.patient?.profileComplete === false || (home.data?.patient?.bookingMissing || []).length > 0;
  const nav = [
    { to: '/patient', label: 'Home', icon: HomeIcon, end: true },
    ...(incomplete ? [{ to: '/patient/complete-profile', label: 'Complete profile', icon: UserRoundPen, badge: '!' }] : []),
    { to: '/patient/symptoms', label: 'Check symptoms', icon: HeartPulse },
    { to: '/patient/consult', label: 'Talk to a doctor', icon: Video },
    { to: '/patient/follow-ups', label: 'Follow-ups', icon: CalendarClock, badge: (home.data?.upcoming || []).length || null },
    { to: '/patient/tracker', label: 'Health tracker', icon: Gauge },
    { to: '/patient/vaccines', label: 'Vaccinations', icon: Syringe },
    { to: '/patient/twin', label: 'Health Twin', icon: Activity },
    { to: '/patient/records', label: 'My records', icon: FolderHeart },
    { to: '/patient/medicines', label: 'Medicines', icon: Pill, badge: (activeRx + (home.data?.medicineOrders || 0)) || null },
    { to: '/patient/change-doctor', label: 'Change doctor', icon: Repeat },
    { to: '/patient/tests', label: 'Tests & reports', icon: FlaskConical },
    { to: '/patient/consents', label: 'Who sees my data', icon: ShieldCheck, badge: pending || null },
    { to: '/patient/wallet', label: 'Data Wallet', icon: Coins },
    { to: '/patient/invite', label: 'Invite & earn', icon: Gift },
    { to: '/patient/family', label: 'Family', icon: Users },
    { to: '/patient/family-graph', label: 'Family health', icon: Dna },
    { to: '/patient/scan', label: 'Check a medicine', icon: ScanLine },
    { to: '/patient/emergency', label: 'Emergency card', icon: IdCard },
    { to: '/patient/settings', label: 'Settings', icon: SettingsIcon },
  ];

  return (
    <PatientContext.Provider value={ctx}>
      <PortalLayout portal="Patient App" nav={nav} headerExtra={<ProfileSwitcher />}>
        <div className="pt-root">
        <Suspense fallback={<PageSkeleton />}>
        <Routes>
          <Route index element={<Home />} />
          <Route path="symptoms" element={<Triage />} />
          <Route path="consult" element={<Consult />} />
          <Route path="consult/:id" element={<ConsultRoomById />} />
          <Route path="twin" element={<Twin />} />
          <Route path="records" element={<Records />} />
          <Route path="medicines" element={<Medicines />} />
          <Route path="consents" element={<Consents />} />
          <Route path="wallet" element={<Wallet />} />
          <Route path="invite" element={<Invite />} />
          <Route path="family" element={<Family />} />
          <Route path="tracker" element={<Tracker />} />
          <Route path="vaccines" element={<Vaccines />} />
          <Route path="family-graph" element={<FamilyGraph />} />
          <Route path="scan" element={<MedicineScan />} />
          <Route path="emergency" element={<EmergencyCard />} />
          <Route path="settings" element={<Settings />} />
          <Route path="complete-profile" element={<CompleteProfile />} />
          <Route path="tests" element={<Tests />} />
          <Route path="follow-ups" element={<FollowUps />} />
          <Route path="change-doctor" element={<ChangeDoctor />} />
          <Route path="medicines/order" element={<OrderMedicines />} />
          <Route path="*" element={<Navigate to="/patient" replace />} />
        </Routes>
        </Suspense>
        </div>
        <CompleteProfilePrompt />
      </PortalLayout>
    </PatientContext.Provider>
  );
}

function ProfileSwitcher() {
  const { profiles, patient, switchProfile } = usePatient();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  if (!patient) return null;
  const active = profiles.find((p) => p.id === patient.id);
  const isSelf = active?.self;

  return (
    <div className="pt-switch" ref={ref}>
      <button className={cx('pt-switch-btn', !isSelf && 'other')} onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open} aria-label={`Profile: ${patient.name} — switch family profile`}>
        <Avatar name={patient.name} size="sm" />
        <span className="pt-switch-meta">
          <span className="tiny muted">{isSelf ? 'Your profile' : 'Looking after'}</span>
          <span className="small strong" translate="no">{firstName(patient.name)}</span>
        </span>
        <ChevronDown size={16} className="muted" />
      </button>
      {open && (
        <div className="pt-switch-pop" role="listbox" aria-label="Switch family profile">
          <div className="tiny muted pt-switch-head">Switch whose health you&apos;re managing</div>
          {profiles.map((p) => (
            <button key={p.id} role="option" aria-selected={p.id === patient.id} className={cx('pt-switch-item', p.id === patient.id && 'on')}
              onClick={() => { setOpen(false); if (p.id !== patient.id) switchProfile(p.id); }}>
              <Avatar name={p.name} size="sm" />
              <span className="grow">
                <span className="small strong block" translate="no">{p.name}</span>
                <span className="tiny muted">{relationOf(p)}{p.age != null ? ` · ${p.age} yrs` : ''}</span>
              </span>
              {p.id === patient.id && <Check size={16} className="pt-green" />}
            </button>
          ))}
          <button className="pt-switch-item add" onClick={() => { setOpen(false); navigate('/patient/family?add=1'); }}>
            <span className="pt-switch-plus"><UserPlus size={16} /></span>
            <span className="small strong">Add a family member</span>
          </button>
        </div>
      )}
    </div>
  );
}

// Keeps reminding (on every visit) until the details needed for booking are filled in — sign-up needs only
// name, email and mobile. "Later" hides it for this visit; it comes back next time.
function CompleteProfilePrompt() {
  const { patient, profiles } = usePatient();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  const isSelf = profiles.find((p) => p.id === patient?.id)?.self;
  const onPage = useLocation().pathname.endsWith('/complete-profile');
  const needs = !!patient && (patient.profileComplete === false || (patient.bookingMissing || []).length > 0);
  const open = needs && isSelf && !dismissed && !onPage;
  const close = () => setDismissed(true);
  if (!open) return null;
  return (
    <Modal open onClose={close} title={`${greeting()}, ${firstName(patient.name)}! 👋`} subtitle="To continue and book a hospital, clinic or doctor, please complete your account — it takes about 2 minutes."
      footer={<><Button variant="ghost" onClick={close}>Later</Button><Button variant="clay" onClick={() => { close(); navigate('/patient/complete-profile'); }}>Complete my profile</Button></>}>
      <div className="pt-cp-modal">
        <div className="pt-cp-modal-row"><span><MapPin size={16} /></span><div><strong>Doctors near you</strong><div className="small muted">Share your location or address to see the best doctors close by.</div></div></div>
        <div className="pt-cp-modal-row"><span><Stethoscope size={16} /></span><div><strong>Right specialist for your symptoms</strong><div className="small muted">Tell us how you feel — we match you to the right department.</div></div></div>
        <div className="pt-cp-modal-row"><span><FileUp size={16} /></span><div><strong>All your reports in one place</strong><div className="small muted">Add past reports and your Ayushman / ABHA card for faster, cashless care.</div></div></div>
        <div className="pt-cp-modal-row"><span><IdCard size={16} /></span><div><strong>Needed to book</strong><div className="small muted">Age and permanent address. Aadhaar / ID, blood group, medicines and old prescriptions are optional.</div></div></div>
        <p className="tiny muted mb-0">Your name, email and mobile are already filled in.</p>
      </div>
    </Modal>
  );
}
