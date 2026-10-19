import { useMemo, useState } from 'react';
import { Search, BedDouble, HeartPulse, Wind, Building2 } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Card, Progress, Pills, Empty, Stat, cx, fmtNum } from '../../components/ui';
import { useGov, scopePlace } from './shared';

function HBar({ label, value, max, sub, tone = 'green' }) {
  const pct = Math.max(2, Math.min(100, (value / (max || 1)) * 100));
  return (
    <div className="cc-hbar">
      <div className="row between small">
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span className="muted">{sub}</span>
      </div>
      <div className="cc-hbar-track"><span className={tone} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

export default function Capacity() {
  const { data: raw } = useGov();
  const data = { ...raw, capacity: raw.capacity || [] };
  const national = data.scope.level === 'national';
  const [q, setQ] = useState('');
  const [state, setState] = useState('');
  const [view, setView] = useState('all');

  const states = [...new Set(data.capacity.map((h) => h.state))];
  const rows = useMemo(() => data.capacity
    .filter((h) => !q || `${h.name} ${h.district}`.toLowerCase().includes(q.toLowerCase()))
    .filter((h) => !state || h.state === state)
    .filter((h) => view === 'all' || (view === 'icu' ? h.icuTotal > 0 && h.icuFree / h.icuTotal < 0.1 : h.oxygenFree < 10))
    .sort((a, b) => (a.freeBeds / (a.totalBeds || 1)) - (b.freeBeds / (b.totalBeds || 1))), [data.capacity, q, state, view]);

  const sum = (k) => data.capacity.reduce((s, h) => s + h[k], 0);
  const totalBeds = sum('totalBeds');
  const freeBeds = sum('freeBeds');
  const icuTotal = sum('icuTotal');
  const icuFree = sum('icuFree');
  const oxyMax = Math.max(...data.capacity.map((h) => h.oxygenFree), 1);

  const regions = data.regions || [];
  const maxDocs = Math.max(...regions.map((r) => r.doctorsOnline || 0), 1);
  const maxKiosk = Math.max(...regions.map((r) => r.kiosks || 0), 1);

  return (
    <>
      <PageHeader eyebrow="Capacity" title="Beds, ICU & oxygen" subtitle={national ? 'Every network hospital, least headroom first.' : `Hospitals inside ${scopePlace(data.scope)}, least headroom first.`} />

      <div className="grid four mb-2">
        <Stat label="Beds free" icon={BedDouble} value={fmtNum(freeBeds)} sub={`of ${fmtNum(totalBeds)} · ${Math.round((1 - freeBeds / (totalBeds || 1)) * 100)}% occupied`} />
        <Stat label="ICU free" icon={HeartPulse} value={fmtNum(icuFree)} sub={`of ${fmtNum(icuTotal)} ICU beds`} />
        <Stat label="Oxygen beds free" icon={Wind} value={fmtNum(sum('oxygenFree'))} sub="across reporting hospitals" />
        <Stat label="Hospitals reporting" icon={Building2} value={data.capacity.length} sub="live from each hospital's bed board" />
      </div>

      <Card className="mb-2">
        <div className="row wrap" style={{ gap: 10, marginBottom: 14 }}>
          <div className="input-wrap grow" style={{ minWidth: 200 }}>
            <Search />
            <input className="input sm" placeholder="Search hospital or district" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {national && states.length > 1 && (
            <select className="select sm" style={{ width: 'auto' }} value={state} onChange={(e) => setState(e.target.value)} aria-label="Filter by state">
              <option value="">All states</option>
              {states.map((s) => <option key={s}>{s}</option>)}
            </select>
          )}
          <Pills value={view} onChange={setView} options={[{ value: 'all', label: 'All' }, { value: 'icu', label: 'ICU critical' }, { value: 'oxygen', label: 'Low oxygen' }]} />
        </div>
        {rows.length === 0 ? <Empty title="No hospitals match">Try clearing the filters.</Empty> : (
          <div className="table-wrap">
            <table className="table cc-cap-table">
              <thead>
                <tr><th>Hospital</th><th>Beds free</th><th style={{ minWidth: 140 }}>Occupancy</th><th>ICU free</th><th style={{ minWidth: 120 }}>ICU load</th><th>Oxygen free</th></tr>
              </thead>
              <tbody>
                {rows.map((h) => {
                  const occ = h.totalBeds ? ((h.totalBeds - h.freeBeds) / h.totalBeds) * 100 : 0;
                  const icuOcc = h.icuTotal ? ((h.icuTotal - h.icuFree) / h.icuTotal) * 100 : 0;
                  return (
                    <tr key={h.id}>
                      <td>
                        <div style={{ fontWeight: 600 }} translate="no">{h.name}</div>
                        <div className="tiny muted">{h.district}, {h.state}</div>
                      </td>
                      <td><strong>{h.freeBeds}</strong><span className="muted"> / {h.totalBeds}</span></td>
                      <td><div className="row" style={{ gap: 8 }}><div className="grow"><Progress value={occ} /></div><span className="tiny muted">{Math.round(occ)}%</span></div></td>
                      <td>{h.icuTotal ? <><strong className={cx(h.icuFree <= 2 && 'cc-text-rose')}>{h.icuFree}</strong><span className="muted"> / {h.icuTotal}</span></> : <span className="muted">No ICU</span>}</td>
                      <td>{h.icuTotal ? <Progress value={icuOcc} /> : <span className="tiny muted">—</span>}</td>
                      <td>
                        <div className="row" style={{ gap: 8 }}>
                          <strong className={cx(h.oxygenFree < 10 && 'cc-text-sun')} style={{ minWidth: 22 }}>{h.oxygenFree}</strong>
                          <div className="grow" style={{ minWidth: 60 }}><Progress value={h.oxygenFree} max={oxyMax} tone={h.oxygenFree < 10 ? 'warn' : 'ok'} /></div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {national ? (
        <div className="grid two">
          <Card title="Doctors online by state">
            {regions.length === 0 ? <Empty title="No states reporting yet">Doctors appear here by state as they join and go online.</Empty> : (
            <div className="stack">{[...regions].sort((a, b) => (b.doctorsOnline || 0) - (a.doctorsOnline || 0)).map((r) => <HBar key={r.state} label={r.state} value={r.doctorsOnline || 0} max={maxDocs} sub={`${fmtNum(r.doctorsOnline)} online`} tone="sky" />)}</div>
            )}
          </Card>
          <Card title="Kiosk coverage by state" action={<span className="tiny muted">E-Clinic kiosks</span>}>
            {regions.length === 0 ? <Empty title="No states reporting yet">E-Clinics appear here by state once they open.</Empty> : (
            <div className="stack">{[...regions].sort((a, b) => (b.kiosks || 0) - (a.kiosks || 0)).map((r) => <HBar key={r.state} label={r.state} value={r.kiosks || 0} max={maxKiosk} sub={r.population ? `${r.kiosks || 0} kiosks · ${(((r.kiosks || 0) / r.population) * 10).toFixed(1)} per 10M people` : `${r.kiosks || 0} kiosks`} tone={r.population && (r.kiosks || 0) / r.population < 0.05 ? 'clay' : 'green'} />)}</div>
            )}
          </Card>
        </div>
      ) : (
        <div className="grid two">
          <Card title="Free beds by hospital">
            <div className="stack">{data.capacity.map((h) => <HBar key={h.id} label={h.name} value={h.freeBeds} max={Math.max(...data.capacity.map((x) => x.freeBeds), 1)} sub={`${h.freeBeds} free`} />)}</div>
          </Card>
          <Card title={`Coverage in ${scopePlace(data.scope)}`}>
            <div className="stack">
              <HBar label="Kiosks online" value={data.totals?.kiosksOnline || 0} max={Math.max(1, data.totals?.kiosksOnline || 0)} sub={`${data.totals?.kiosksOnline ?? 0} online`} />
              <HBar label="Doctors available to the district" value={data.totals?.doctorsOnline || 0} max={Math.max(1, data.totals?.doctorsOnline || 0)} sub={`${data.totals?.doctorsOnline ?? 0} online (state pool)`} tone="sky" />
              <HBar label="ICU beds free" value={data.totals?.icuFree || 0} max={Math.max(1, icuTotal)} sub={`${data.totals?.icuFree ?? 0} of ${icuTotal}`} tone={(data.totals?.icuFree || 0) <= 2 ? 'clay' : 'green'} />
              <p className="tiny muted mb-0">District patients can still be routed to state and national doctors when local queues are long.</p>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
