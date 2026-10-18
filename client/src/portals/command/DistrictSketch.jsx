import { cx } from '../../components/ui';

/* Schematic district outline (not a real map). Hospitals with map coordinates are placed relative to each other
   from their real lat/lng; pin codes without coordinates are spaced evenly around the middle. */
const OUTLINE = 'M17 31 C21 22 27 15 36 13 C44 11 50 8 58 6 C67 5 75 9 81 15 C87 21 90 28 87 36 C85 42 90 47 90 54 C90 62 84 68 78 73 C72 78 66 81 60 86 C54 91 46 93 39 90 C32 87 26 83 21 76 C16 69 12 62 11 54 C10 46 13 38 17 31 Z';

const fallbackPos = (i, n) => {
  const a = (i / Math.max(1, n)) * Math.PI * 2;
  return { x: 50 + Math.cos(a) * 24, y: 50 + Math.sin(a) * 24 };
};

export default function DistrictSketch({ district, alerts = [], hospitals = [], selectedPin, onSelectPin, compact }) {
  // Only pin codes from real alerts and hospital records — no hard-coded gazetteer or invented positions.
  const list = [];
  [...alerts.filter((a) => a.district === district), ...hospitals].forEach((x) => { if (x.pincode && !list.some((p) => p.pin === x.pincode)) list.push({ pin: x.pincode }); });
  // Project the hospitals' real coordinates into the sketch box (north up), keeping their relative layout.
  const geo = hospitals.filter((h) => Number.isFinite(h.lat) && Number.isFinite(h.lng));
  const lats = geo.map((h) => h.lat); const lngs = geo.map((h) => h.lng);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const span = Math.max(maxLat - minLat, maxLng - minLng);
  const project = (h) => (span > 0
    ? { x: 22 + ((h.lng - minLng) / span) * 56, y: 78 - ((h.lat - minLat) / span) * 56 }
    : { x: 50, y: 50 });
  const posOfPin = (pin) => {
    const hs = geo.filter((h) => h.pincode === pin);
    if (!hs.length) return null;
    const ps = hs.map(project);
    return { x: ps.reduce((t, q) => t + q.x, 0) / ps.length, y: ps.reduce((t, q) => t + q.y, 0) / ps.length };
  };
  const loose = list.filter((p) => !posOfPin(p.pin));
  const pins = list.map((p) => ({ ...p, ...(posOfPin(p.pin) || fallbackPos(loose.indexOf(p), loose.length)) }));
  const pinPos = Object.fromEntries(pins.map((p) => [p.pin, p]));
  const clusters = alerts.filter((a) => a.district === district && a.pincode && pinPos[a.pincode] && a.status !== 'dismissed');

  return (
    <div className={cx('cc-sketch', compact && 'compact')} dir="ltr">
      <svg viewBox="0 0 100 100" aria-label={`Schematic of ${district} with pin codes`}>
        <defs>
          <pattern id="ccSketchDots" width="3" height="3" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="0.35" fill="var(--green)" opacity="0.14" />
          </pattern>
          <radialGradient id="ccHeat">
            <stop offset="0%" stopColor="var(--rose)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="var(--rose)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="ccHeatSun">
            <stop offset="0%" stopColor="var(--sun)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--sun)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <path d={OUTLINE} transform="translate(0.8 1)" fill="#e9e1d2" />
        <path d={OUTLINE} fill="#fffdf8" />
        <path d={OUTLINE} fill="url(#ccSketchDots)" />
        <path d={OUTLINE} fill="none" stroke="var(--green)" strokeOpacity="0.5" strokeWidth="0.6" />

        {clusters.map((a) => {
          const p = pinPos[a.pincode];
          const r = a.type === 'outbreak' ? 8 + Math.min(14, (a.cases || 10) / 3) : 9;
          return (
            <g key={a.id}>
              <circle cx={p.x} cy={p.y} r={r} fill={a.type === 'outbreak' ? 'url(#ccHeat)' : 'url(#ccHeatSun)'} />
              {a.type === 'outbreak' && a.status === 'open' && <circle cx={p.x} cy={p.y} r={r * 0.55} fill="none" stroke="var(--rose)" strokeWidth="0.5" className="cc-pulse-ring" />}
            </g>
          );
        })}

        {hospitals.map((h) => {
          const p = pinPos[h.pincode] || (Number.isFinite(h.lat) && Number.isFinite(h.lng) ? project(h) : null);
          if (!p) return null;
          return <rect key={h.id} x={p.x + 2.4} y={p.y - 5.4} width="3.2" height="3.2" rx="0.6" fill="var(--sky)" stroke="#fff" strokeWidth="0.5"><title>{h.name}</title></rect>;
        })}

        {pins.map((p) => {
          const hot = clusters.some((a) => a.pincode === p.pin && a.type === 'outbreak');
          return (
            <g key={p.pin} className={cx('cc-pin', selectedPin === p.pin && 'on', onSelectPin && 'clickable')} onClick={() => onSelectPin?.(p.pin)}>
              <circle cx={p.x} cy={p.y} r={selectedPin === p.pin ? 2.2 : 1.6} fill={hot ? 'var(--rose)' : 'var(--green)'} stroke="#fff" strokeWidth="0.6" />
              {!compact && <text x={p.x} y={p.y + 5.2} fontSize="2.7" textAnchor="middle" fill="var(--ink-2)" fontWeight="600">{p.pin}</text>}
            </g>
          );
        })}
      </svg>
      <div className="cc-legend tiny static">
        <span><i className="calm" /> Pin code</span>
        <span><i className="alert" /> Case cluster</span>
        <span><i className="hosp" /> Hospital</span>
        <span className="muted">{geo.length > 1 ? 'Outline is schematic · hospitals placed by their map coordinates' : 'Schematic — not to scale'}</span>
      </div>
    </div>
  );
}
