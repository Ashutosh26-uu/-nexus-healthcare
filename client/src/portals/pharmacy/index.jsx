import { Navigate, Route, Routes } from 'react-router-dom';
import { FileText, Boxes, BellRing, ArrowLeftRight, Store, ShoppingBag, TrendingUp } from 'lucide-react';
import PortalLayout from '../../components/PortalLayout';
import { Loading, Empty } from '../../components/ui';
import { useLive } from '../../live';
import Inbox from './Inbox';
import Inventory from './Inventory';
import Alerts from './Alerts';
import Transfers from './Transfers';
import Profile from './Profile';
import Orders, { NewOrderPopup } from './Orders';
import StoreSetup from './StoreSetup';
import Insights from './Insights';
import './pharmacy.css';

export default function PharmacyApp() {
  const live = useLive('/pharmacy/home', ['pharmacy', 'prescriptions', 'supply', 'dispatch', 'alerts', 'medorders', 'admin']);
  const home = live.data;
  const newRx = home?.inbox.filter((r) => r.status === 'sent').length || 0;
  const alertCount = home ? new Set([...home.lowStock, ...home.expiring].map((i) => i.id)).size : 0;
  const toAct = home?.transfersOut.filter((t) => ['requested', 'accepted'].includes(t.status)).length || 0;

  const newOrders = home?.orders?.filter((o) => o.status === 'requested').length || 0;
  const onboarding = !!home?.onboarding;
  const nav = onboarding ? [{ to: '/pharmacy', label: 'Store setup', icon: Store, end: true, badge: home?.pharmacy?.profileComplete ? null : '!' }] : [
    { to: '/pharmacy', label: 'Medicine orders', icon: ShoppingBag, end: true, badge: newOrders || null },
    { to: '/pharmacy/prescriptions', label: 'E-prescriptions', icon: FileText, badge: newRx || null },
    { to: '/pharmacy/inventory', label: 'Inventory', icon: Boxes },
    { to: '/pharmacy/alerts', label: 'Stock alerts', icon: BellRing, badge: alertCount || null },
    { to: '/pharmacy/insights', label: 'Stock insights', icon: TrendingUp },
    { to: '/pharmacy/transfers', label: 'Transfers', icon: ArrowLeftRight, badge: toAct || null },
    { to: '/pharmacy/profile', label: 'Store & licence', icon: Store },
  ];

  let body;
  if (live.loading && !home) body = <Loading />;
  else if (!home) body = <Empty title="Couldn't load your pharmacy">{live.error || 'Please refresh in a moment.'}</Empty>;
  else {
    const props = { home, reload: live.reload };
    body = onboarding ? (
      <Routes>
        <Route index element={<StoreSetup {...props} />} />
        <Route path="*" element={<Navigate to="/pharmacy" replace />} />
      </Routes>
    ) : (
      <Routes>
        <Route index element={<Orders {...props} />} />
        <Route path="prescriptions" element={<Inbox {...props} />} />
        <Route path="inventory" element={<Inventory {...props} />} />
        <Route path="alerts" element={<Alerts {...props} />} />
        <Route path="insights" element={<Insights {...props} />} />
        <Route path="transfers" element={<Transfers {...props} />} />
        <Route path="profile" element={<Profile {...props} />} />
        <Route path="*" element={<Navigate to="/pharmacy" replace />} />
      </Routes>
    );
  }

  return (
    <PortalLayout portal="Pharmacy Portal" nav={nav} headerExtra={home && <OpenChip hours={home.pharmacy?.hours} />}>
      {body}
      {home && !onboarding && <NewOrderPopup home={home} reload={live.reload} />}
    </PortalLayout>
  );
}

function OpenChip({ hours }) {
  if (!hours) return null;
  const m = hours.match(/(\d{1,2}):(\d{2})\s*–\s*(\d{1,2}):(\d{2})/);
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const open = /24/.test(hours) || (m && mins >= +m[1] * 60 + +m[2] && mins < +m[3] * 60 + +m[4]);
  return (
    <span className="ph-open-chip">
      <span className={`dot ${open ? 'green' : 'rose'}`} />
      <span className="small"><strong>{open ? 'Open now' : 'Closed'}</strong> <span className="muted">· {hours}</span></span>
    </span>
  );
}
