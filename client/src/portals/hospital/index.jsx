import { Navigate, Route, Routes } from 'react-router-dom';
import { LayoutDashboard, BedDouble, Ambulance, Users, CalendarClock, Building2, BarChart3, FileCheck2, Ticket, FileChartColumn } from 'lucide-react';
import PortalLayout from '../../components/PortalLayout';
import { Loading, Empty } from '../../components/ui';
import { useLive } from '../../live';
import { HmisChip, useHmis } from './shared';
import Overview from './Overview';
import BedBoard from './BedBoard';
import Referrals from './Referrals';
import Roster from './Roster';
import Opd from './Opd';
import Profile from './Profile';
import Analytics from './Analytics';
import Claims from './Claims';
import Reception from './Reception';
import Reports from './Reports';
import './hospital.css';

export default function HospitalApp() {
  const live = useLive('/hospital/home', ['beds', 'referrals', 'gov', 'hospital', 'roster']);
  const hmis = useHmis();
  const home = live.data;
  const pending = home?.referrals.filter((r) => r.status === 'pending').length || 0;

  const nav = [
    { to: '/hospital', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/hospital/beds', label: 'Live bed board', icon: BedDouble },
    { to: '/hospital/referrals', label: 'Incoming referrals', icon: Ambulance, badge: pending || null },
    { to: '/hospital/roster', label: 'Staff roster', icon: Users },
    { to: '/hospital/reception', label: 'Reception desk', icon: Ticket },
    { to: '/hospital/opd', label: 'OPD & appointments', icon: CalendarClock },
    { to: '/hospital/profile', label: 'Facility profile', icon: Building2 },
    { to: '/hospital/analytics', label: 'Analytics', icon: BarChart3 },
    { to: '/hospital/reports', label: 'Front-desk reports', icon: FileChartColumn },
    { to: '/hospital/claims', label: 'Insurance claims', icon: FileCheck2 },
  ];

  let body;
  if (live.loading && !home) body = <Loading />;
  else if (!home) body = <Empty title="Couldn't load the hospital dashboard">{live.error || 'Please refresh the page in a moment.'}</Empty>;
  else {
    const props = { home, reload: live.reload, setData: live.setData, hmis };
    body = (
      <Routes>
        <Route index element={<Overview {...props} />} />
        <Route path="beds" element={<BedBoard {...props} />} />
        <Route path="referrals" element={<Referrals {...props} />} />
        <Route path="roster" element={<Roster {...props} />} />
        <Route path="opd" element={<Opd {...props} />} />
        <Route path="profile" element={<Profile {...props} />} />
        <Route path="analytics" element={<Analytics {...props} />} />
        <Route path="claims" element={<Claims {...props} />} />
        <Route path="reception" element={<Reception {...props} />} />
        <Route path="reports" element={<Reports {...props} />} />
        <Route path="*" element={<Navigate to="/hospital" replace />} />
      </Routes>
    );
  }

  return (
    <PortalLayout portal="Hospital Portal" nav={nav} headerExtra={<HmisChip hmis={hmis} compact />}>
      {body}
    </PortalLayout>
  );
}
