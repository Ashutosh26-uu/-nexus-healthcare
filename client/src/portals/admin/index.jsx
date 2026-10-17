import { Navigate, Route, Routes } from 'react-router-dom';
import { LayoutDashboard, BadgeCheck, Users as UsersIcon, SlidersHorizontal, MonitorSmartphone, Activity, ScrollText, Languages, Network, Workflow } from 'lucide-react';
import PortalLayout from '../../components/PortalLayout';
import { Suspense } from 'react';
import { useLive } from '../../live';
import { Loading } from '../../components/ui';
import { lazyPage } from '../../lazyPage';
import Overview from './Overview';
import './admin.css';

// Admin screens are visited one at a time and rarely: each loads on demand (preloaded on nav hover).
const Federated = lazyPage(() => import('./Federated'));
const Onboarding = lazyPage(() => import('./Onboarding'));
const Users = lazyPage(() => import('./Users'));
const AIConfig = lazyPage(() => import('./AIConfig'));
const Kiosks = lazyPage(() => import('./Kiosks'));
const Monitoring = lazyPage(() => import('./Monitoring'));
const Audit = lazyPage(() => import('./Audit'));
const Content = lazyPage(() => import('./Content'));
const Automations = lazyPage(() => import('./Automations'));

export default function AdminApp() {
  const { data } = useLive('/admin/home', ['admin', 'doctors', 'kiosks', 'audit']);
  const c = data?.counts;
  const nav = [
    { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/admin/onboarding', label: 'Onboarding', icon: BadgeCheck, badge: c?.pendingVerification || null, preload: Onboarding.preload, warm: '/admin/onboarding' },
    { to: '/admin/users', label: 'Users & roles', icon: UsersIcon, preload: Users.preload, warm: ['/admin/users', '/admin/onboarding'] },
    { to: '/admin/ai', label: 'AI configuration', icon: SlidersHorizontal, preload: AIConfig.preload, warm: '/admin/ai-config' },
    { to: '/admin/kiosks', label: 'Kiosk fleet', icon: MonitorSmartphone, badge: c ? (c.kiosksTotal - c.kiosksOnline) || null : null, preload: Kiosks.preload, warm: '/admin/kiosks' },
    { to: '/admin/monitoring', label: 'Monitoring', icon: Activity, preload: Monitoring.preload },
    { to: '/admin/automations', label: 'Automations (n8n)', icon: Workflow, preload: Automations.preload },
    { to: '/admin/federated', label: 'Federated AI', icon: Network, preload: Federated.preload },
    { to: '/admin/audit', label: 'Audit & compliance', icon: ScrollText, badge: c?.breakGlassUnreviewed || null, preload: Audit.preload },
    { to: '/admin/content', label: 'Content & languages', icon: Languages, preload: Content.preload, warm: '/admin/content' },
  ];
  // Live mode has no synthetic uptime figure (uptime is null) — show how long the server has been up instead.
  const m = data?.monitoring;
  const headerExtra = m ? (
    <span className="ad-health tiny">
      <span className={m.uptime == null || m.uptime >= 99.9 ? 'dot green pulse' : 'dot sun'} />
      {m.uptime == null ? `Server up ${m.processUptimeHours ?? 0} h · ${m.activeCalls} active calls` : `All systems normal · ${m.uptime}% uptime`}
    </span>
  ) : null;

  return (
    <PortalLayout portal="Super Admin" nav={nav} headerExtra={headerExtra}>
      <div className="ad">
        <Suspense fallback={<Loading />}>
        <Routes>
          <Route index element={<Overview />} />
          <Route path="federated" element={<Federated />} />
          <Route path="onboarding" element={<Onboarding />} />
          <Route path="users" element={<Users />} />
          <Route path="ai" element={<AIConfig />} />
          <Route path="kiosks" element={<Kiosks />} />
          <Route path="monitoring" element={<Monitoring />} />
          <Route path="automations" element={<Automations />} />
          <Route path="audit" element={<Audit />} />
          <Route path="content" element={<Content />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
        </Suspense>
      </div>
    </PortalLayout>
  );
}
