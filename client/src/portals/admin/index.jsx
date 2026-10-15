import { Navigate, Route, Routes } from 'react-router-dom';
import { LayoutDashboard, BadgeCheck, Users as UsersIcon, SlidersHorizontal, MonitorSmartphone, Activity, ScrollText, Languages, Network } from 'lucide-react';
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
import './admin.css';

export default function AdminApp() {
  const { data } = useLive('/admin/home', ['admin', 'doctors', 'kiosks', 'audit']);
  const c = data?.counts;
  const nav = [
    { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/admin/onboarding', label: 'Onboarding', icon: BadgeCheck, badge: c?.pendingVerification || null },
    { to: '/admin/users', label: 'Users & roles', icon: UsersIcon },
    { to: '/admin/ai', label: 'AI configuration', icon: SlidersHorizontal },
    { to: '/admin/kiosks', label: 'Kiosk fleet', icon: MonitorSmartphone, badge: c ? (c.kiosksTotal - c.kiosksOnline) || null : null },
    { to: '/admin/monitoring', label: 'Monitoring', icon: Activity },
    { to: '/admin/federated', label: 'Federated AI', icon: Network },
    { to: '/admin/audit', label: 'Audit & compliance', icon: ScrollText, badge: c?.breakGlassUnreviewed || null },
    { to: '/admin/content', label: 'Content & languages', icon: Languages },
  ];
  const headerExtra = data ? (
    <span className="ad-health tiny">
      <span className={data.monitoring.uptime >= 99.9 ? 'dot green pulse' : 'dot sun'} />
      All systems normal · {data.monitoring.uptime}% uptime
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
          <Route path="audit" element={<Audit />} />
          <Route path="content" element={<Content />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </div>
    </PortalLayout>
  );
}
