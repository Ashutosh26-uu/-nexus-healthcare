import { Component, lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth, ROLE_HOME } from './auth';
import { ToastProvider, Loading } from './components/ui';
import { I18nProvider } from './i18n';
import InstallPrompt from './components/InstallPrompt';
import { ConsentProvider } from './consent';
import Landing from './pages/Landing';
import Login from './pages/Login';
import NotFound from './pages/NotFound';

// Kept out of the entry chunk (RxPrint/LabReportPrint pull in qrcode).
const Signup = lazy(() => import('./pages/Signup'));
const Join = lazy(() => import('./pages/Join'));
const RxPrint = lazy(() => import('./pages/RxPrint'));
const LabReportPrint = lazy(() => import('./pages/LabReportPrint'));
const ChatWidget = lazy(() => import('./components/ChatWidget'));

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
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
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

function AppRoutes() {
  const location = useLocation();
  // The kiosk is a full-screen touch app; the floating chat would get in the way there.
  const hideChat = location.pathname.startsWith('/kiosk') || location.pathname.startsWith('/rx/') || location.pathname.startsWith('/lab-report/');
  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Lazy><Signup /></Lazy>} />
        <Route path="/join" element={<Lazy><Join /></Lazy>} />
        <Route path="/rx/:id" element={<RequireRole roles={['patient', 'caregiver', 'doctor', 'pharmacist', 'lab_tech', 'super_admin']}><Lazy><RxPrint /></Lazy></RequireRole>} />
        <Route path="/lab-report/:id" element={<RequireRole roles={['patient', 'caregiver', 'doctor', 'lab_tech', 'super_admin']}><Lazy><LabReportPrint /></Lazy></RequireRole>} />
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
      {!hideChat && <Lazy quiet><ChatWidget /></Lazy>}
      {!location.pathname.startsWith('/kiosk') && !location.pathname.startsWith('/rx/') && !location.pathname.startsWith('/lab-report/') && <InstallPrompt />}
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
