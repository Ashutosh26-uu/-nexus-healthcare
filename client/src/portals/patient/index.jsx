import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Home as HomeIcon, HeartPulse, Video, FolderHeart, Pill, ShieldCheck, Users, IdCard, Settings as SettingsIcon, ChevronDown, Check, UserPlus, Activity, Coins, Dna, ScanLine, UserRoundPen, MapPin, Stethoscope, FileUp, FlaskConical, CalendarClock, Repeat, Gauge, Syringe } from 'lucide-react';
import { Gift, Siren, LayoutGrid, BadgeIndianRupee } from 'lucide-react'; // Invite & earn · SOS · More · Ayushman
import PortalLayout from '../../components/PortalLayout';
import { pageLoader } from '../../prefetch';
import { Avatar, Button, Modal, cx, useToast } from '../../components/ui';
import { session } from '../../api';
import { useLive } from '../../live';
import { PatientContext, HOME_TOPICS, PageSkeleton, firstName, greeting, relationOf, usePatient } from './shared';
import Home from './Home';
import { SosButton } from './Sos';
import WelcomeTips from './WelcomeTips';
import { useI18n, codeForName } from '../../i18n';
import './patient.css';

// Only Home is in the first load; every other page (and the doctor finder, booking, payment and call code they
// pull in) is fetched on demand. Code is cached by the browser; data is still fetched live on every visit.
const { page, usePrefetch } = pageLoader();
const Triage = page(() => import('./Triage'));
const Consult = page(() => import('./Consult'));
const ConsultRoom = page(() => import('./ConsultRoom'));
const Records = page(() => import('./Records'));
const Medicines = page(() => import('./Medicines'));
const Settings = page(() => import('./Settings'));
const CompleteProfile = page(() => import('./CompleteProfile'));
const FollowUps = page(() => import('./FollowUps'));
const Twin = page(() => import('./Twin'));
const Wallet = page(() => import('./Wallet'));
const Invite = page(() => import('./Invite'));
const FamilyGraph = page(() => import('./FamilyGraph'));
const MedicineScan = page(() => import('./MedicineScan'));
const ChangeDoctor = page(() => import('./ChangeDoctor'));
const OrderMedicines = page(() => import('./OrderMedicines'));
const Tests = page(() => import('./Tests'));
const EmergencyCard = page(() => import('./EmergencyCard'));
const Consents = page(() => import('./Consents'));
const Family = page(() => import('./Family'));
const Tracker = page(() => import('./Tracker'));
const Vaccines = page(() => import('./Vaccines'));
const SosPage = page(() => import('./Sos'));
const Ayushman = page(() => import('./Ayushman'));

// Keyed by id so state from one consult never carries into the next.
function ConsultRoomById() {
  const { id } = useParams();
  return <ConsultRoom key={id} />;
}

export default function PatientApp() {
  usePrefetch();
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
  // Grouped by what a patient is trying to do, in everyday words. The phone tab bar carries the four most used.
  const upcomingCount = (home.data?.upcoming || []).length || null;
  const medsBadge = (activeRx + (home.data?.medicineOrders || 0)) || null;
  const nav = [
    { to: '/patient', label: 'Home', icon: HomeIcon, end: true },
    ...(incomplete ? [{ to: '/patient/complete-profile', label: 'Finish my profile', icon: UserRoundPen, badge: '!' }] : []),
    { to: '/patient/symptoms', label: 'I feel unwell', icon: HeartPulse, group: 'Get care', groupIcon: Stethoscope },
    { to: '/patient/consult', label: 'Talk to a doctor', icon: Video, group: 'Get care' },
    { to: '/patient/follow-ups', label: 'My appointments', icon: CalendarClock, badge: upcomingCount, group: 'Get care' },
    { to: '/patient/medicines', label: 'Medicines', icon: Pill, badge: medsBadge, group: 'Get care' },
    { to: '/patient/tests', label: 'Lab tests', icon: FlaskConical, group: 'Get care' },
    { to: '/patient/ayushman', label: 'Free treatment (Ayushman)', icon: BadgeIndianRupee, group: 'Get care' },
    { to: '/patient/records', label: 'My reports & records', icon: FolderHeart, group: 'My health', groupIcon: Activity },
    { to: '/patient/tracker', label: 'BP, sugar & weight', icon: Gauge, group: 'My health' },
    { to: '/patient/vaccines', label: 'Vaccinations', icon: Syringe, group: 'My health' },
    { to: '/patient/twin', label: 'My health trends', icon: Activity, group: 'My health' },
    { to: '/patient/family', label: 'Family members', icon: Users, group: 'Family', groupIcon: Users },
    { to: '/patient/family-graph', label: 'Family health history', icon: Dna, group: 'Family' },
    { to: '/patient/sos', label: 'SOS — emergency help', icon: Siren, group: 'Safety & privacy', groupIcon: ShieldCheck },
    { to: '/patient/emergency', label: 'Emergency card', icon: IdCard, group: 'Safety & privacy' },
    { to: '/patient/consents', label: 'Who sees my data', icon: ShieldCheck, badge: pending || null, group: 'Safety & privacy' },
    { to: '/patient/scan', label: 'Is my medicine genuine?', icon: ScanLine, group: 'More', groupIcon: LayoutGrid },
    { to: '/patient/change-doctor', label: 'Change my doctor', icon: Repeat, group: 'More' },
    { to: '/patient/invite', label: 'Invite & earn', icon: Gift, group: 'More' },
    { to: '/patient/wallet', label: 'Share data for research', icon: Coins, group: 'More' },
    { to: '/patient/settings', label: 'Settings', icon: SettingsIcon, group: 'More' },
  ];
  const tabs = [
    { to: '/patient', label: 'Home', icon: HomeIcon, end: true },
    { to: '/patient/consult', label: 'Doctor', icon: Video, badge: upcomingCount },
    { to: '/patient/medicines', label: 'Medicines', icon: Pill, badge: medsBadge },
    { to: '/patient/records', label: 'Reports', icon: FolderHeart },
  ];

  return (
    <PatientContext.Provider value={ctx}>
      <PortalLayout portal="Patient App" nav={nav} tabs={tabs} headerExtra={<ProfileSwitcher />}
        headerEnd={<SosButton />}>
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
          <Route path="sos" element={<SosPage />} />
          <Route path="ayushman" element={<Ayushman />} />
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

        {/* After the "complete your profile" prompt, never on top of it. */}
        {home.data?.patient && !incomplete && <WelcomeTips name={firstName((home.data.profiles || []).find((x) => x.self)?.name || home.data.patient.name)} />}
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
  // Remembered for this browser session: the page area remounts on every navigation, so plain state brought the
  // prompt back on each page after "Later".
  const key = `nx_profile_prompt_later_${patient?.id || ''}`;
  const [dismissed, setDismissed] = useState(() => { try { return sessionStorage.getItem(key) === '1'; } catch { return false; } });
  const isSelf = profiles.find((p) => p.id === patient?.id)?.self;
  const onPage = useLocation().pathname.endsWith('/complete-profile');
  const needs = !!patient && (patient.profileComplete === false || (patient.bookingMissing || []).length > 0);
  const open = needs && isSelf && !dismissed && !onPage;
  const close = () => { setDismissed(true); try { sessionStorage.setItem(key, '1'); } catch { /* storage blocked */ } };
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
