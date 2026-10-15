import { useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { LayoutDashboard, BedDouble, Activity, Package, Siren, FileText, CloudRain } from 'lucide-react';
import PortalLayout from '../../components/PortalLayout';
import { Loading, Empty, Button, fmtTime } from '../../components/ui';
import { useLive } from '../../live';
import { GovContext, ScopeChip, isOpen } from './shared';
import Overview from './Overview';
import Capacity from './Capacity';
import Outbreaks from './Outbreaks';
import Forecast from './Forecast';
import Supply from './Supply';
import Actions from './Actions';
import Reports, { ReportView } from './Reports';
import './command.css';

const TOPICS = ['gov', 'alerts', 'beds', 'supply', 'advisories', 'doctors', 'kiosks'];

function LiveStamp({ data }) {
  const [at, setAt] = useState(() => new Date().toISOString());
  useEffect(() => { if (data) setAt(new Date().toISOString()); }, [data]);
  return (
    <span className="cc-live tiny">
      <span className="dot green pulse" /> Live · updated {fmtTime(at)}
    </span>
  );
}

export default function CommandApp() {
  const live = useLive('/gov/overview', TOPICS);
  // The API returns every corridor; a district officer should only see corridors touching their district.
  const raw = live.data;
  const scoped = useMemo(() => {
    if (!raw || raw.scope.level === 'national') return raw;
    const mine = (c) => c.from.includes(raw.scope.district) || c.to.includes(raw.scope.district);
    return { ...raw, corridors: (raw.corridors || []).filter(mine) };
  }, [raw]);
  const gov = { ...live, data: scoped };
  const { data, loading, error, reload } = gov;
  const openAlerts = (data?.alerts || []).filter(isOpen).length;

  const nav = [
    { to: '/command', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/command/capacity', label: 'Capacity', icon: BedDouble },
    { to: '/command/outbreaks', label: 'Outbreaks', icon: Activity, badge: (data?.alerts || []).filter((a) => a.type === 'outbreak' && a.status === 'open').length || null },
    { to: '/command/forecast', label: 'Health Weather', icon: CloudRain },
    { to: '/command/supply', label: 'Supply', icon: Package },
    { to: '/command/actions', label: 'Alerts & actions', icon: Siren, badge: openAlerts || null },
    { to: '/command/reports', label: 'Reports', icon: FileText },
  ];

  const headerExtra = data ? (
    <div className="row" style={{ gap: 10, minWidth: 0 }}>
      <ScopeChip scope={data.scope} />
      <LiveStamp data={data} />
    </div>
  ) : null;

  let body;
  if (loading && !data) body = <Loading />;
  else if (error && !data) {
    body = (
      <Empty title="Couldn't load the command picture">
        <p>{error}</p>
        <Button variant="secondary" size="sm" onClick={reload}>Try again</Button>
      </Empty>
    );
  } else {
    body = (
      <Routes>
        <Route index element={<Overview />} />
        <Route path="capacity" element={<Capacity />} />
        <Route path="outbreaks" element={<Outbreaks />} />
        <Route path="forecast" element={<Forecast />} />
        <Route path="supply" element={<Supply />} />
        <Route path="actions" element={<Actions />} />
        <Route path="reports" element={<Reports />} />
        <Route path="reports/:id" element={<ReportView />} />
        <Route path="*" element={<Navigate to="/command" replace />} />
      </Routes>
    );
  }

  return (
    <GovContext.Provider value={gov}>
      <PortalLayout portal="Command Center" nav={nav} headerExtra={headerExtra}>
        <div className="cc">{body}</div>
      </PortalLayout>
    </GovContext.Provider>
  );
}
