import { Navigate, Route, Routes } from 'react-router-dom';
import { LayoutDashboard, BadgeCheck, Users as UsersIcon, SlidersHorizontal, MonitorSmartphone, Activity, ScrollText, Languages, Network, Workflow } from 'lucide-react';
import PortalLayout from '../../components/PortalLayout';
import { useLive } from '../../live';
import Overview from './Overview';
import Federated from './Federated';
import Onboarding from './Onboarding';
import Users from './Users';
import AIConfig from './AIConfig';
import Kiosks from './Kiosks';
import Monitoring from './Monitoring';
import Audit from './Audit';
import Content from './Content';
import Automations from './Automations';
import './admin.css';

export default function AdminApp() {
  const { data } = useLive('/admin/home', ['admin', 'doctors', 'kiosks', 'audit', 'patients', 'consults']);
  const c = data?.counts;
  const nav = [
    { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/admin/onboarding', label: 'Onboarding', icon: BadgeCheck, badge: c?.pendingVerification || null },
    { to: '/admin/users', label: 'Users & roles', icon: UsersIcon },
    { to: '/admin/ai', label: 'AI configuration', icon: SlidersHorizontal },
    { to: '/admin/kiosks', label: 'Kiosk fleet', icon: MonitorSmartphone, badge: c ? (c.kiosksTotal - c.kiosksOnline) || null : null },
    { to: '/admin/monitoring', label: 'Monitoring', icon: Activity },
    { to: '/admin/automations', label: 'Automations (n8n)', icon: Workflow },
    { to: '/admin/federated', label: 'Federated AI', icon: Network },
    { to: '/admin/audit', label: 'Audit & compliance', icon: ScrollText, badge: c?.breakGlassUnreviewed || null },
    { to: '/admin/content', label: 'Content & languages', icon: Languages },
  ];
  // Only facts the server knows: how long it has been up and how many consults are live.
  const m = data?.monitoring;
  const headerExtra = m ? (
    <span className="ad-health tiny">
      <span className="dot green pulse" />
      {m.processUptimeHours != null ? `Server up ${m.processUptimeHours} h · ${m.activeCalls ?? 0} active calls` : `${m.activeCalls ?? 0} active calls`}
    </span>
  ) : null;

  return (
    <PortalLayout portal="Super Admin" nav={nav} headerExtra={headerExtra}>
      <div className="ad">
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
      </div>
    </PortalLayout>
  );
}
