import { Navigate, Route, Routes } from 'react-router-dom';
import { Warehouse, Truck, TrendingUp, AlertOctagon, ClipboardList } from 'lucide-react';
import PortalLayout from '../../components/PortalLayout';
import { Loading, Empty } from '../../components/ui';
import { useLive } from '../../live';
import Stock from './Stock';
import Approvals from './Approvals';
import Forecast from './Forecast';
import Shortages from './Shortages';
import BulkOrder from './BulkOrder';
import './supply.css';

export default function SupplyApp() {
  const live = useLive('/distributor/home', ['supply', 'pharmacy', 'dispatch', 'gov', 'alerts']);
  const home = live.data;
  const toApprove = home?.transfers.filter((t) => ['requested', 'accepted'].includes(t.status)).length || 0;

  const nav = [
    { to: '/supply', label: 'Warehouse stock', icon: Warehouse, end: true },
    { to: '/supply/approvals', label: 'Dispatch approvals', icon: Truck, badge: toApprove || null },
    { to: '/supply/forecast', label: 'Demand forecast', icon: TrendingUp },
    { to: '/supply/shortages', label: 'Regional shortages', icon: AlertOctagon, badge: home?.regionalShortages.length || null },
    { to: '/supply/orders', label: 'Bulk orders', icon: ClipboardList },
  ];

  let body;
  if (live.loading && !home) body = <Loading />;
  else if (!home) body = <Empty title="Couldn't load the warehouse">{live.error || 'Please refresh in a moment.'}</Empty>;
  else {
    const props = { home, reload: live.reload };
    body = (
      <Routes>
        <Route index element={<Stock {...props} />} />
        <Route path="approvals" element={<Approvals {...props} />} />
        <Route path="forecast" element={<Forecast {...props} />} />
        <Route path="shortages" element={<Shortages {...props} />} />
        <Route path="orders" element={<BulkOrder {...props} />} />
        <Route path="*" element={<Navigate to="/supply" replace />} />
      </Routes>
    );
  }

  return (
    <PortalLayout portal="Supply & Distribution" nav={nav} headerExtra={home && <span className="small muted sup-head"><Warehouse size={15} /> {home.warehouse?.name}</span>}>
      {body}
    </PortalLayout>
  );
}
