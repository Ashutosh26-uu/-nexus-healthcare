import { Component, lazy, Suspense, useLayoutEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import { AuthProvider, useAuth, ROLE_HOME } from './auth';
import { ToastProvider, Loading } from './components/ui';
import { I18nProvider } from './i18n';
import InstallPrompt from './components/InstallPrompt';
import { ConsentProvider } from './consent';
import Landing, { About } from './pages/Landing';
import { reportError } from './errorReport';
import NotFound from './pages/NotFound';

const Login = lazy(() => import('./pages/Login'));

// Kept out of the entry chunk (RxPrint/LabReportPrint pull in qrcode).
const Signup = lazy(() => import('./pages/Signup'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const Join = lazy(() => import('./pages/Join'));
const RxPrint = lazy(() => import('./pages/RxPrint'));
const LabReportPrint = lazy(() => import('./pages/LabReportPrint'));
const SampleLabel = lazy(() => import('./pages/SampleLabel'));
const InvoicePrint = lazy(() => import('./pages/InvoicePrint'));
const StatementPrint = lazy(() => import('./pages/StatementPrint'));
const BillPrint = lazy(() => import('./pages/BillPrint'));
const ChatWidget = lazy(() => import('./components/ChatWidget'));
const QueueDisplay = lazy(() => import('./pages/QueueDisplay'));
// Public, no-login pages (free tools, doctor & lab profiles) — found from Google and WhatsApp shares.
const MedicinePrices = lazy(() => import('./pages/public/MedicinePrices'));
const LabTests = lazy(() => import('./pages/public/LabTests'));
const PublicDoctors = lazy(() => import('./pages/public/Doctors'));
const PublicLabs = lazy(() => import('./pages/public/Labs'));
const PassportLanding = lazy(() => import('./pages/ScanLink').then((m) => ({ default: m.PassportLanding })));
const VerifyDocument = lazy(() => import('./pages/ScanLink').then((m) => ({ default: m.VerifyDocument })));
const SosFamily = lazy(() => import('./pages/SosFamily'));
const CircleInvite = lazy(() => import('./pages/CircleInvite'));
const MedicalSummary = lazy(() => import('./pages/MedicalSummary'));
const SupplierPo = lazy(() => import('./pages/SupplierPo'));
const VisitLanding = lazy(() => import('./pages/ScanLink').then((m) => ({ default: m.VisitLanding })));
const PrivacyPolicy = lazy(() => import('./pages/Policies').then((m) => ({ default: m.PrivacyPolicy })));
const CookiePolicy = lazy(() => import('./pages/Policies').then((m) => ({ default: m.CookiePolicy })));
const Testimonials = lazy(() => import('./pages/Testimonials'));

const PatientApp = lazy(() => import('./portals/patient'));
const KioskApp = lazy(() => import('./portals/kiosk'));
const DoctorApp = lazy(() => import('./portals/doctor'));
const HospitalApp = lazy(() => import('./portals/hospital'));
const LabApp = lazy(() => import('./portals/lab'));
const PharmacyApp = lazy(() => import('./portals/pharmacy'));
const SupplyApp = lazy(() => import('./portals/supply'));
const DispatchApp = lazy(() => import('./portals/dispatch'));
const CommandApp = lazy(() => import('./portals/command'));
const AdminApp = lazy(() => import('./portals/admin'));

// After a deploy, old chunk names 404 — reload once to pick up the new build; otherwise show a friendly card.
const RELOAD_FLAG = 'oc_chunk_reload';
const isChunkError = (e) => /dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError|Failed to fetch/i.test(`${e?.name} ${e?.message}`);

class ChunkBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) { return { error }; }

  componentDidCatch(error) {
    if (!isChunkError(error)) reportError(error, 'screen crashed');
    let reloaded = false;
    try { reloaded = sessionStorage.getItem(RELOAD_FLAG); } catch { /* ignore */ }
    if (isChunkError(error) && !reloaded) {
      try { sessionStorage.setItem(RELOAD_FLAG, '1'); } catch { /* ignore */ }
      window.location.reload();
    }
  }

  componentDidMount() {
    // Loaded fine, so a future stale-chunk error may reload again.
    setTimeout(() => { try { sessionStorage.removeItem(RELOAD_FLAG); } catch { /* ignore */ } }, 10000);
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.quiet) return null;
    return (
      <div className="card" style={{ maxWidth: 420, margin: '15vh auto', padding: 28, textAlign: 'center' }} role="alert">
        <h3>Something went wrong</h3>
        <p className="muted">Please reload the page. Your data is safe.</p>
        <button className="btn" onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }
}

function Lazy({ children, quiet }) {
  return <ChunkBoundary quiet={quiet}><Suspense fallback={quiet ? null : <Loading />}>{children}</Suspense></ChunkBoundary>;
}

function RequireRole({ roles, children }) {
  const { user, loading, unreachable, refresh } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  // Still holding a token but the server isn't answering: auth keeps retrying, so don't send them to /login.
  if (!user && unreachable) {
    return (
      <div className="card" style={{ maxWidth: 420, width: 'calc(100% - 32px)', boxSizing: 'border-box', margin: '15vh auto', padding: 28, textAlign: 'center' }} role="status">
        <div className="spinner" style={{ margin: '0 auto 16px' }} />
        <h3>Can&apos;t reach the server — retrying…</h3>
        <p className="muted">Check your internet connection. You&apos;re still signed in.</p>
        <button type="button" className="btn secondary" onClick={() => refresh()}>Try now</button>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!roles.includes(user.role)) return <Navigate to={ROLE_HOME[user.role] || '/'} replace />;
  return children;
}

function Guarded({ roles, Comp }) {
  return (
    <RequireRole roles={roles}>
      <Lazy><Comp /></Lazy>
    </RequireRole>
  );
}

// Client-side navigation keeps the old scroll offset, so a link tapped at the foot of the landing
// page used to open the next screen scrolled to its bottom. Back/forward are left to the browser.
function ScrollToTop() {
  const { pathname } = useLocation();
  const navType = useNavigationType();
  useLayoutEffect(() => {
    if (navType === 'POP') return;
    const html = document.documentElement;
    const prev = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto'; // the global smooth-scroll would animate the jump
    window.scrollTo(0, 0);
    html.style.scrollBehavior = prev;
  }, [pathname, navType]);
  return null;
}

function AppRoutes() {
  const location = useLocation();
  // The kiosk is a full-screen touch app and the print pages are documents; no floating chat or install nudge there.
  const bare = ['/kiosk', '/rx/', '/lab-report/', '/lab-label/', '/invoice/', '/statement/', '/bill/', '/display/', '/summary/', '/po/'].some((p) => location.pathname.startsWith(p));
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/about" element={<About />} />
        <Route path="/display/:code" element={<Lazy><QueueDisplay /></Lazy>} />
        <Route path="/login" element={<Lazy><Login /></Lazy>} />
        <Route path="/signup" element={<Lazy><Signup /></Lazy>} />
        <Route path="/forgot-password" element={<Lazy><ForgotPassword /></Lazy>} />
        <Route path="/join" element={<Lazy><Join /></Lazy>} />
        <Route path="/medicines/:slug?" element={<Lazy><MedicinePrices /></Lazy>} />
        <Route path="/lab-tests/:code?" element={<Lazy><LabTests /></Lazy>} />
        <Route path="/find/doctors/:slug?" element={<Lazy><PublicDoctors /></Lazy>} />
        <Route path="/find/labs/:slug?" element={<Lazy><PublicLabs /></Lazy>} />
        <Route path="/s/p/:id" element={<Lazy><PassportLanding /></Lazy>} />
        <Route path="/v/:kind/:token" element={<Lazy><VerifyDocument /></Lazy>} />
        <Route path="/sos/:token" element={<Lazy><SosFamily /></Lazy>} />
        <Route path="/circle/:token" element={<Lazy><CircleInvite /></Lazy>} />
        <Route path="/summary/:token" element={<Lazy><MedicalSummary /></Lazy>} />
        <Route path="/po/:token" element={<Lazy><SupplierPo /></Lazy>} />
        <Route path="/s/v/:id/:code" element={<Lazy><VisitLanding /></Lazy>} />
        <Route path="/privacy" element={<Lazy><PrivacyPolicy /></Lazy>} />
        <Route path="/cookies" element={<Lazy><CookiePolicy /></Lazy>} />
        <Route path="/testimonials" element={<Lazy><Testimonials /></Lazy>} />
        <Route path="/rx/:id" element={<RequireRole roles={['patient', 'caregiver', 'doctor', 'pharmacist', 'lab_tech', 'super_admin']}><Lazy><RxPrint /></Lazy></RequireRole>} />
        <Route path="/lab-label/:id" element={<RequireRole roles={['lab_tech']}><Lazy><SampleLabel /></Lazy></RequireRole>} />
        <Route path="/invoice/:orderId" element={<RequireRole roles={['patient', 'caregiver', 'pharmacist']}><Lazy><InvoicePrint /></Lazy></RequireRole>} />
        <Route path="/lab-report/:id"element={<RequireRole roles={['patient', 'caregiver', 'doctor', 'lab_tech', 'super_admin']}><Lazy><LabReportPrint /></Lazy></RequireRole>} />
        <Route path="/bill/:id" element={<RequireRole roles={['pharmacist', 'distributor', 'lab_tech']}><Lazy><BillPrint /></Lazy></RequireRole>} />
        <Route path="/statement/:month" element={<RequireRole roles={['doctor']}><Lazy><StatementPrint /></Lazy></RequireRole>} />
        <Route path="/patient/*" element={<Guarded roles={['patient', 'caregiver']} Comp={PatientApp} />} />
        <Route path="/kiosk/*" element={<Guarded roles={['kiosk_operator']} Comp={KioskApp} />} />
        <Route path="/doctor/*" element={<Guarded roles={['doctor']} Comp={DoctorApp} />} />
        <Route path="/hospital/*" element={<Guarded roles={['hospital_admin']} Comp={HospitalApp} />} />
        <Route path="/lab/*" element={<Guarded roles={['lab_tech']} Comp={LabApp} />} />
        <Route path="/pharmacy/*" element={<Guarded roles={['pharmacist']} Comp={PharmacyApp} />} />
        <Route path="/supply/*" element={<Guarded roles={['distributor']} Comp={SupplyApp} />} />
        <Route path="/dispatch/*" element={<Guarded roles={['delivery']} Comp={DispatchApp} />} />
        <Route path="/command/*" element={<Guarded roles={['official']} Comp={CommandApp} />} />
        <Route path="/admin/*" element={<Guarded roles={['super_admin']} Comp={AdminApp} />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      {!bare && <Lazy quiet><ChatWidget /></Lazy>}
      {!bare && <InstallPrompt />}
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <I18nProvider>
        <AuthProvider>
          <ToastProvider>
            <ConsentProvider>
              <AppRoutes />
            </ConsentProvider>
          </ToastProvider>
        </AuthProvider>
      </I18nProvider>
    </BrowserRouter>
  );
}
