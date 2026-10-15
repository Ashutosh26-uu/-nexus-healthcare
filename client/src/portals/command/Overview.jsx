import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BedDouble, HeartPulse, Stethoscope, MonitorSmartphone, Video, Siren, ChevronRight, MapPin, Building2, ShieldCheck, ArrowUpRight } from 'lucide-react';
import { PageHeader } from '../../components/PortalLayout';
import { Card, Sparkline, Progress, StatusBadge, Empty, cx, fmtNum, timeAgo } from '../../components/ui';
import { useAuth } from '../../auth';
import { useGov, trendTo, PINS, HOSPITAL_PIN, ALERT_KIND, alertTitle, isOpen, ScopeChip } from './shared';
import IndiaMap, { regionTone } from './IndiaMap';
import DistrictSketch from './DistrictSketch';
import { getLocale } from '../../i18n';

const KPIS = [
  { id: 'freeBeds', label: 'Free beds', icon: BedDouble, color: 'var(--green-2)' },
  { id: 'icuFree', label: 'ICU beds free', icon: HeartPulse, color: 'var(--rose)', warnBelow: 5 },
  { id: 'doctorsOnline', label: 'Doctors online', icon: Stethoscope, color: 'var(--sky)' },
  { id: 'kiosksOnline', label: 'Kiosks online', icon: MonitorSmartphone, color: 'var(--green-2)' },
  { id: 'consultsToday', label: 'Consults today', icon: Video, color: 'var(--clay)' },
  { id: 'openAlerts', label: 'Open alerts', icon: Siren, color: 'var(--rose)', warnAbove: 0 },
];

function greetName(name = '') {
  const clean = name.replace(/\(.*?\)/g, '').split(',')[0].trim();
  const words = clean.replace(/^Dr\.\s*/, '').split(/\s+/).filter((w) => w.replace('.', '').length > 1);
  if (/^Dr\./.test(clean)) return `Dr. ${words.at(-1) || ''}`.trim();
  return words[0] || '';
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export function KpiTile({ label, value, icon: Icon, color, series, note, warn }) {
  return (
    <div className={cx('card cc-kpi', warn && 'warn')}>
      <div className="row between">
        <span className="cc-kpi-label">{Icon && <Icon />}{label}</span>
        {note && <span className="tiny muted">{note}</span>}
      </div>
      <div className="cc-kpi-value">{fmtNum(value)}</div>
      <div className="cc-kpi-spark"><Sparkline data={series} color={color} height={34} /></div>
    </div>
  );
}

function Crumbs({ items, onJump }) {
  return (
    <nav className="cc-crumbs small" aria-label="Drill-down">
      {items.map((c, i) => (
        <span key={c.key} className="row" style={{ gap: 4 }}>
          {i > 0 && <ChevronRight size={14} className="muted" />}
          {i < items.length - 1 && c.jump !== false
            ? <button type="button" onClick={() => onJump(i)}>{c.label}</button>
            : <strong>{c.label}</strong>}
        </span>
      ))}
    </nav>
  );
}

function AlertLine({ a }) {
  const k = ALERT_KIND[a.type] || {};
  return (
    <Link to={a.type === 'outbreak' ? '/command/outbreaks' : '/command/actions'} className="cc-alert-line">
      <span className={cx('cc-tone-bar', k.tone)} />
      <span className="grow">
        <span className="small" style={{ fontWeight: 600, display: 'block' }}>{alertTitle(a)}</span>
        <span className="tiny muted">{k.label} · {a.district} · {timeAgo(a.createdAt)}</span>
      </span>
      <StatusBadge status={a.status} />
    </Link>
  );
}

function HospitalRow({ h, onPin }) {
  const occ = h.totalBeds ? ((h.totalBeds - h.freeBeds) / h.totalBeds) * 100 : 0;
  return (
    <div className="cc-hrow">
      <div className="row between top">
        <div className="grow">
          <div className="small" style={{ fontWeight: 600 }} translate="no">{h.name}</div>
          <div className="tiny muted">
            {h.district}
            {HOSPITAL_PIN[h.id] && (onPin
              ? <> · <button type="button" className="cc-link" onClick={() => onPin(HOSPITAL_PIN[h.id])}>pin {HOSPITAL_PIN[h.id]}</button></>
              : <> · pin {HOSPITAL_PIN[h.id]}</>)}
          </div>
        </div>
        <div className="right">
          <div className="small"><strong>{h.freeBeds}</strong><span className="muted"> / {h.totalBeds} free</span></div>
          <div className={cx('tiny', h.icuFree <= 2 ? 'cc-text-rose' : 'muted')}>ICU {h.icuFree} free</div>
        </div>
      </div>
      <Progress value={occ} />
    </div>
  );
}

function DrillPanel({ data, path, setPath }) {
  const { regions = [], capacity = [], alerts = [] } = data;
  const [state, district, pin] = path;
  const depth = path.length;

  if (depth === 0) {
    const rows = [...regions].sort((a, b) => b.doctorsOnline - a.doctorsOnline);
    return (
      <div className="stack">
        <p className="small muted mb-0">Select a state on the map or below to see its districts and hospitals.</p>
        <div className="list">
          {rows.map((r) => {
            const open = alerts.filter((a) => a.state === r.state && isOpen(a)).length;
            return (
              <button key={r.state} type="button" className="cc-drill-row" onClick={() => setPath([r.state])}>
                <span className={cx('cc-dot', regionTone(r.state, alerts))} />
                <span className="grow">
                  <span className="small" style={{ fontWeight: 600 }}>{r.state}</span>
                  <span className="tiny muted" style={{ display: 'block' }}>{fmtNum(r.doctorsOnline)} doctors · {r.kiosks} kiosks · {r.population}M people</span>
                </span>
                {open > 0 && <span className="badge rose">{open} open</span>}
                <ChevronRight size={16} className="muted" />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (depth === 1) {
    const r = regions.find((x) => x.state === state) || { districts: [], doctorsOnline: 0, kiosks: 0 };
    const hs = capacity.filter((h) => h.state === state);
    const districts = [...new Set([...(r.districts || []), ...hs.map((h) => h.district)])];
    return (
      <div className="stack">
        <div className="cc-mini-stats">
          <div><span className="tiny muted">Doctors online</span><strong>{fmtNum(r.doctorsOnline)}</strong></div>
          <div><span className="tiny muted">Kiosks</span><strong>{r.kiosks}</strong></div>
          <div><span className="tiny muted">Free beds</span><strong>{fmtNum(hs.reduce((s, h) => s + h.freeBeds, 0))}</strong></div>
        </div>
        <h4 className="mb-0 mt-1">Districts</h4>
        <div className="list">
          {districts.map((d) => {
            const open = alerts.filter((a) => a.district === d && isOpen(a)).length;
            const nh = hs.filter((h) => h.district === d).length;
            return (
              <button key={d} type="button" className="cc-drill-row" onClick={() => setPath([state, d])}>
                <MapPin size={16} className="muted" />
                <span className="grow small" style={{ fontWeight: 600 }}>{d}</span>
                <span className="tiny muted">{nh ? `${nh} hospital${nh > 1 ? 's' : ''}` : 'Kiosks only'}</span>
                {open > 0 && <span className="badge rose">{open}</span>}
                <ChevronRight size={16} className="muted" />
              </button>
            );
          })}
        </div>
        {hs.length > 0 && (
          <>
            <h4 className="mb-0 mt-1">Network hospitals</h4>
            {hs.map((h) => <HospitalRow key={h.id} h={h} />)}
          </>
        )}
      </div>
    );
  }

  if (depth === 2) {
    const hs = capacity.filter((h) => h.district === district);
    const pins = (PINS[district] || []).map((p) => p.pin);
    alerts.forEach((a) => { if (a.district === district && a.pincode && !pins.includes(a.pincode)) pins.push(a.pincode); });
    const da = alerts.filter((a) => a.district === district && isOpen(a));
    return (
      <div className="stack">
        {da.length > 0 && <div className="stack" style={{ gap: 6 }}>{da.map((a) => <AlertLine key={a.id} a={a} />)}</div>}
        <h4 className="mb-0">Hospitals</h4>
        {hs.length ? hs.map((h) => <HospitalRow key={h.id} h={h} onPin={(p) => setPath([state, district, p])} />) : <p className="small muted mb-0">No network hospitals reporting yet in {district}.</p>}
        <h4 className="mb-0 mt-1">Pin codes</h4>
        <div className="cc-pin-grid">
          {pins.map((p) => {
            const hot = alerts.some((a) => a.pincode === p && isOpen(a));
            const meta = (PINS[district] || []).find((x) => x.pin === p);
            return (
              <button key={p} type="button" className={cx('cc-pin-chip', hot && 'hot')} onClick={() => setPath([state, district, p])}>
                <strong>{p}</strong>
                <span className="tiny muted">{meta?.area || 'Reported area'}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const meta = (PINS[district] || []).find((x) => x.pin === pin);
  const pa = alerts.filter((a) => a.pincode === pin);
  const hs = capacity.filter((h) => HOSPITAL_PIN[h.id] === pin);
  return (
    <div className="stack">
      <div>
        <div className="serif" style={{ fontSize: '1.6rem', fontWeight: 600, lineHeight: 1.1 }}>{pin}</div>
        <div className="small muted">{meta?.area || 'Reported area'} · {district}</div>
      </div>
      {pa.length ? pa.map((a) => <AlertLine key={a.id} a={a} />) : <div className="callout green small"><ShieldCheck /> No signals above baseline at this pin code.</div>}
      {hs.map((h) => <HospitalRow key={h.id} h={h} />)}
      {!hs.length && <p className="small muted mb-0"><Building2 size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> No network hospital at this pin — patients route to the district hospital.</p>}
      <p className="tiny muted mb-0">Aggregated, anonymised counts only. Pin codes with fewer than 10 tests are grouped with neighbours so no individual can be identified.</p>
    </div>
  );
}

export default function Overview() {
  const { data } = useGov();
  const { user } = useAuth();
  const national = data.scope.level === 'national';
  const rootDepth = national ? 0 : 2;
  const [path, setPath] = useState(() => (national ? [] : [data.scope.state, data.scope.district]));

  const crumbs = [
    { key: 'in', label: 'India', jump: national },
    path[0] && { key: 's', label: path[0], jump: national },
    path[1] && { key: 'd', label: path[1] },
    path[2] && { key: 'p', label: `Pin ${path[2]}` },
  ].filter(Boolean);
  const sketchDistrict = path[1];
  const showIndia = national && !sketchDistrict;
  const jump = (i) => setPath(path.slice(0, Math.max(i, rootDepth)));

  const t = data.totals;
  const openAlerts = (data.alerts || []).filter(isOpen);
  const activeCorridors = (data.corridors || []).filter((c) => c.status === 'active');
  const firstName = greetName(user?.name);
  const today = new Date().toLocaleDateString(getLocale(), { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <>
      <PageHeader
        eyebrow={today}
        title={`${greeting()}, ${firstName}`}
        subtitle={national ? 'Here is the national picture right now — every number refreshes as facilities report.' : `Here is ${data.scope.district} right now — beds, doctors, signals and stock in one place.`}
      />

      <div className={cx('cc-banner', national ? 'national' : 'district')}>
        <div className="grow">
          <div className="cc-banner-title">{national ? 'National view' : `${data.scope.district} district view`}</div>
          <div className="small">
            {national
              ? `${data.regions?.length || 0} states reporting · ${activeCorridors.length} triage corridor${activeCorridors.length === 1 ? '' : 's'} active`
              : `${data.scope.state} · you see only facilities, alerts and stock inside ${data.scope.district}`}
          </div>
        </div>
        <ScopeChip scope={data.scope} />
      </div>

      <div className="cc-kpis">
        {KPIS.map((k) => (
          <KpiTile
            key={k.id}
            {...k}
            value={t[k.id]}
            series={trendTo(`${data.scope.level}-${k.id}`, t[k.id], 12, k.id === 'openAlerts' ? 0.4 : 0.09)}
            warn={(k.warnBelow !== undefined && t[k.id] < k.warnBelow) || (k.warnAbove !== undefined && t[k.id] > k.warnAbove)}
            note={k.id === 'consultsToday' ? 'since 00:00' : k.id === 'openAlerts' && t.openAlerts ? 'needs review' : null}
          />
        ))}
      </div>

      <div className="cc-map-layout">
        <Card
          className="cc-map-card"
          title={<div><h3>{showIndia ? 'Network map' : `${sketchDistrict} at pin-code level`}</h3><p className="tiny muted mb-0">{showIndia ? 'Tap a state to drill down to districts, hospitals and pin codes.' : 'Case clusters are drawn from anonymised lab results. Tap a pin code.'}</p></div>}
          action={national && !showIndia ? <button type="button" className="btn sm ghost" onClick={() => setPath([path[0]])}>Back to map</button> : null}
        >
          {showIndia
            ? <IndiaMap regions={data.regions || []} alerts={data.alerts} corridors={data.corridors} selected={path[0]} onSelect={(s) => setPath(s ? [s] : [])} />
            : <DistrictSketch key={sketchDistrict} district={sketchDistrict} alerts={data.alerts} hospitals={data.capacity.filter((h) => h.district === sketchDistrict)} selectedPin={path[2]} onSelectPin={(p) => setPath([path[0], sketchDistrict, p])} />}
        </Card>
        <Card className="cc-drill" title={<Crumbs items={crumbs} onJump={jump} />}>
          <DrillPanel data={data} path={path} setPath={setPath} />
        </Card>
      </div>

      <div className="grid two mt-3">
        <Card title="Needs your attention" action={<Link to="/command/actions" className="small row" style={{ gap: 4 }}>Alert inbox <ArrowUpRight size={14} /></Link>}>
          {openAlerts.length
            ? <div className="stack" style={{ gap: 6 }}>{openAlerts.map((a) => <AlertLine key={a.id} a={a} />)}</div>
            : <Empty icon={ShieldCheck} title="All clear">No open alerts in your area.</Empty>}
        </Card>
        <Card title="Triage corridors" action={<Link to="/command/actions" className="small row" style={{ gap: 4 }}>Manage <ArrowUpRight size={14} /></Link>}>
          {activeCorridors.length ? (
            <div className="stack" style={{ gap: 10 }}>
              {activeCorridors.map((c) => (
                <div key={c.id} className="cc-corridor-mini">
                  <div className="small"><strong>{c.from.split(',')[0]}</strong> <span className="muted">→</span> <strong>{c.to.split(',')[0]}</strong></div>
                  <div className="tiny muted">{c.reason} · {fmtNum(c.patientsRouted)} patients routed · opened {timeAgo(c.createdAt)}</div>
                </div>
              ))}
            </div>
          ) : <Empty title="No corridors open">Overflow routing opens here when a region crosses its wait-time threshold.</Empty>}
        </Card>
      </div>
    </>
  );
}
