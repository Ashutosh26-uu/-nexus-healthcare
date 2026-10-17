import { useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Inbox, Route as RouteIcon, FileText, PlugZap, Radar, X, Stamp, Users } from 'lucide-react';
import PortalLayout from '../../components/PortalLayout';
import { Loading, Empty } from '../../components/ui';
import { useLive } from '../../live';
import Orders from './Orders';
import Tracking from './Tracking';
import Reports from './Reports';
import Connectors from './Connectors';
import Approvals from './Approvals';
import Setup from './Setup';
import ReportModal from './ReportModal';
import './lab.css';

export default function LabApp() {
  const live = useLive('/lab/home', ['lab']);
  const [reportFor, setReportFor] = useState(null);
  const [feed, setFeed] = useState(null); // last outbreak-engine hand-off, shown as a banner
  const orders = live.data?.orders || [];
  const open = orders.filter((o) => o.status !== 'reported').length;

  const nav = [
    { to: '/lab', label: 'Orders inbox', icon: Inbox, end: true, badge: orders.filter((o) => o.status === 'ordered').length || null },
    { to: '/lab/tracking', label: 'Sample tracking', icon: RouteIcon, badge: null },
    { to: '/lab/approvals', label: 'Pathologist sign-off', icon: Stamp, badge: orders.filter((o) => o.status === 'review').length || null },
    { to: '/lab/reports', label: 'Reports sent', icon: FileText },
    { to: '/lab/setup', label: 'Team & packages', icon: Users },
    { to: '/lab/connectors', label: 'LIS & data feed', icon: PlugZap },
  ];

  const onReported = (res) => {
    live.reload();
    if (res.awaitingApproval) return; // nothing is released (or fed to the outbreak engine) until it's signed
    const positives = res.order.results.filter((r) => r.flag === 'positive' && /dengue|malaria|typhoid|widal|influenza/i.test(r.name));
    if (res.newAlerts?.length || positives.length) setFeed({ alerts: res.newAlerts || [], order: res.order, positives });
  };

  let body;
  if (live.loading && !live.data) body = <Loading />;
  else if (!live.data) body = <Empty title="Couldn't load your orders">{live.error || 'Please refresh in a moment.'}</Empty>;
  else {
    // Optimistic status steps (mark collected / received / processing): the row moves on at once.
    const patchOrder = (id, changes) => live.setData((d) => (d ? { ...d, orders: d.orders.map((o) => (o.id === id ? { ...o, ...changes } : o)) } : d));
    const props = { home: live.data, orders, reload: live.reload, onReport: setReportFor, patchOrder };
    body = (
      <>
        {feed && <FeedBanner feed={feed} onClose={() => setFeed(null)} />}
        <Routes>
          <Route index element={<Orders {...props} />} />
          <Route path="tracking" element={<Tracking {...props} />} />
          <Route path="reports" element={<Reports {...props} />} />
          <Route path="connectors" element={<Connectors {...props} />} />
          <Route path="approvals" element={<Approvals {...props} onApproved={onReported} />} />
          <Route path="setup" element={<Setup />} />
          <Route path="*" element={<Navigate to="/lab" replace />} />
        </Routes>
      </>
    );
  }

  return (
    <PortalLayout portal="Lab Portal" nav={nav} headerExtra={live.data && <span className="small muted lab-head">{open} sample{open === 1 ? '' : 's'} in progress · {live.data.lab?.name}</span>}>
      {body}
      <ReportModal order={reportFor} home={live.data} onClose={() => setReportFor(null)} onDone={onReported} />
    </PortalLayout>
  );
}

function FeedBanner({ feed, onClose }) {
  const a = feed.alerts[0];
  return (
    <div className="lab-feed-banner fade-in">
      <Radar size={20} />
      <div className="grow">
        {a ? (
          <>
            <strong>Anonymised result sent to the outbreak engine — new {a.disease} watch alert created for pin {a.pincode}.</strong>
            <div className="small">Only the test, result, pin code and date were shared. The district health officer will review it before anything goes public.</div>
          </>
        ) : (
          <>
            <strong>Anonymised result sent to the outbreak engine for pin {feed.order.pincode}.</strong>
            <div className="small">It was added to the existing watch for this area. No name or ID left the lab.</div>
          </>
        )}
      </div>
      <button className="icon-btn" onClick={onClose} aria-label="Dismiss"><X /></button>
    </div>
  );
}
