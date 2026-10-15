import { cx } from '../../components/ui';
import { PINS, HOSPITAL_PIN } from './shared';

/* Hand-drawn district outline (not survey-accurate) — enough to place pin codes and clusters in context. */
const OUTLINE = 'M17 31 C21 22 27 15 36 13 C44 11 50 8 58 6 C67 5 75 9 81 15 C87 21 90 28 87 36 C85 42 90 47 90 54 C90 62 84 68 78 73 C72 78 66 81 60 86 C54 91 46 93 39 90 C32 87 26 83 21 76 C16 69 12 62 11 54 C10 46 13 38 17 31 Z';
const RIVER = 'M54 2 C64 6 72 6 80 11 C88 16 92 22 97 30';
const RIVER2 = 'M4 60 C14 62 20 70 26 74 C33 79 36 88 34 98';

const fallbackPos = (i, n) => {
  const a = (i / Math.max(1, n)) * Math.PI * 2;
  return { x: 50 + Math.cos(a) * 24, y: 50 + Math.sin(a) * 24 };
};

export default function DistrictSketch({ district, alerts = [], hospitals = [], selectedPin, onSelectPin, compact }) {
  const list = (PINS[district] || []).slice();
  alerts.forEach((a) => { if (a.pincode && a.district === district && !list.some((p) => p.pin === a.pincode)) list.push({ pin: a.pincode, area: 'Reported area' }); });
  const pins = list.map((p, i) => (p.x !== undefined ? p : { ...p, ...fallbackPos(i, list.length) }));
  const pinPos = Object.fromEntries(pins.map((p) => [p.pin, p]));
  const clusters = alerts.filter((a) => a.district === district && a.pincode && pinPos[a.pincode] && a.status !== 'dismissed');

  return (
    <div className={cx('cc-sketch', compact && 'compact')} dir="ltr">
      <svg viewBox="0 0 100 100" aria-label={`Sketch map of ${district} with pin codes`}>
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
        <path d={RIVER} fill="none" stroke="var(--sky)" strokeOpacity="0.45" strokeWidth="1.1" strokeLinecap="round" />
        <path d={RIVER2} fill="none" stroke="var(--sky)" strokeOpacity="0.35" strokeWidth="0.8" strokeLinecap="round" />
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
          const p = pinPos[HOSPITAL_PIN[h.id]];
          if (!p) return null;
          return <rect key={h.id} x={p.x + 2.4} y={p.y - 5.4} width="3.2" height="3.2" rx="0.6" fill="var(--sky)" stroke="#fff" strokeWidth="0.5"><title>{h.name}</title></rect>;
        })}

        {pins.map((p) => {
          const hot = clusters.some((a) => a.pincode === p.pin && a.type === 'outbreak');
          return (
            <g key={p.pin} className={cx('cc-pin', selectedPin === p.pin && 'on', onSelectPin && 'clickable')} onClick={() => onSelectPin?.(p.pin)}>
              <circle cx={p.x} cy={p.y} r={selectedPin === p.pin ? 2.2 : 1.6} fill={hot ? 'var(--rose)' : 'var(--green)'} stroke="#fff" strokeWidth="0.6" />
              {!compact && <text x={p.x} y={p.y + 5.2} fontSize="2.7" textAnchor="middle" fill="var(--ink-2)" fontWeight="600">{p.pin}</text>}
              {!compact && <text x={p.x} y={p.y + 8.2} fontSize="2.1" textAnchor="middle" fill="var(--ink-3)">{p.area.split(' · ')[0]}</text>}
            </g>
          );
        })}
      </svg>
      <div className="cc-legend tiny static">
        <span><i className="calm" /> Pin code</span>
        <span><i className="alert" /> Case cluster</span>
        <span><i className="hosp" /> Hospital</span>
        <span><i className="river" /> River</span>
      </div>
    </div>
  );
}
