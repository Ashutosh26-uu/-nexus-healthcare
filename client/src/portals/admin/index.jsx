import { Navigate, Route, Routes } from 'react-router-dom';
import { LayoutDashboard, BadgeCheck, Users as UsersIcon, SlidersHorizontal, MonitorSmartphone, Activity, ScrollText, Languages, Network, Workflow, IndianRupee, MessageSquareQuote, MessageSquareWarning, BadgeIndianRupee, GraduationCap } from 'lucide-react';
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
import Payments from './Payments';
import Stories from './Stories';
import Grievances from './Grievances';
import MemberPlans from './MemberPlans';
import TeachSaathi from './TeachSaathi';
import './admin.css';

export default function AdminApp() {
  const { data } = useLive('/admin/home', ['admin', 'doctors', 'kiosks', 'audit', 'patients', 'consults', 'payments', 'stories']);
  const c = data?.counts;
  const nav = [
    { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/admin/onboarding', label: 'Onboarding', icon: BadgeCheck, badge: c?.pendingVerification || null },
    { to: '/admin/users', label: 'Users & roles', icon: UsersIcon },
    { to: '/admin/payments', label: 'UPI payments', icon: IndianRupee, badge: c?.upiToConfirm || null },
    { to: '/admin/plans', label: 'Membership plans', icon: BadgeIndianRupee },
    { to: '/admin/ai', label: 'AI configuration', icon: SlidersHorizontal },
    { to: '/admin/saathi', label: 'Teach Saathi', icon: GraduationCap },
    { to: '/admin/kiosks', label: 'Kiosk fleet', icon: MonitorSmartphone, badge: c ? (c.kiosksTotal - c.kiosksOnline) || null : null },
    { to: '/admin/monitoring', label: 'Monitoring', icon: Activity },
    { to: '/admin/automations', label: 'Automations (n8n)', icon: Workflow },
    { to: '/admin/federated', label: 'Federated AI', icon: Network },
    { to: '/admin/audit', label: 'Audit & compliance', icon: ScrollText, badge: c?.breakGlassUnreviewed || null },
    { to: '/admin/content', label: 'Content & languages', icon: Languages },
    { to: '/admin/grievances', label: 'Privacy complaints', icon: MessageSquareWarning, badge: c?.grievancesOpen || null },
    { to: '/admin/stories', label: 'Stories', icon: MessageSquareQuote, badge: c?.storiesPending || null },
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
          <Route path="payments" element={<Payments />} />
          <Route path="ai" element={<AIConfig />} />
          <Route path="kiosks" element={<Kiosks />} />
          <Route path="monitoring" element={<Monitoring />} />
          <Route path="automations" element={<Automations />} />
          <Route path="audit" element={<Audit />} />
          <Route path="content" element={<Content />} />
          <Route path="stories" element={<Stories />} />
          <Route path="grievances" element={<Grievances />} />
          <Route path="plans" element={<MemberPlans />} />
          <Route path="saathi" element={<TeachSaathi />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </div>
    </PortalLayout>
  );
}
