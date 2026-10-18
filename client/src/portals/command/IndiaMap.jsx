import { cx, fmtNum } from '../../components/ui';

/*
 * Stylised India outline, hand-traced from ~90 lon/lat points and projected into a 100×100 box
 * (x = (lon − 66) / 31 · 100, y = 114 − 3.08 · lat) so it lines up with regions[].x / y.
 */
const INDIA = 'M38.1 4.7 L40.6 7.4 L43.5 8.4 L41.6 13.9 L42.6 18.5 L46.1 20.4 L45.5 25.0 L50.0 27.1 L54.8 29.6 L60.0 30.8 L64.5 32.4 L71.3 32.7 L71.0 30.2 L73.5 27.8 L73.9 29.9 L76.1 31.5 L83.9 31.5 L83.9 28.4 L90.3 25.0 L94.8 23.8 L98.7 25.3 L101.3 28.1 L97.4 30.2 L94.2 32.4 L93.5 35.5 L92.3 38.5 L90.6 41.0 L88.1 44.4 L86.1 46.5 L84.8 41.3 L82.6 43.2 L83.5 39.5 L85.2 37.0 L77.4 36.4 L76.8 33.9 L72.9 33.0 L71.6 36.1 L73.2 39.2 L74.2 43.5 L74.5 47.2 L71.0 47.5 L67.4 48.1 L66.1 51.5 L61.9 53.9 L58.7 57.6 L52.9 61.6 L49.4 63.8 L46.1 66.0 L45.5 72.7 L44.5 78.0 L44.8 82.3 L42.6 82.6 L40.0 86.3 L37.1 89.1 L34.2 86.6 L32.9 82.3 L31.0 77.7 L28.4 74.0 L27.1 69.3 L24.8 64.7 L23.2 60.1 L21.9 55.5 L22.3 51.2 L21.3 48.4 L21.0 45.6 L19.4 48.1 L16.1 49.9 L12.9 48.4 L9.7 45.3 L13.5 43.8 L8.4 42.5 L7.1 40.7 L11.6 39.2 L16.1 38.5 L14.8 34.8 L11.6 32.1 L14.2 28.1 L19.0 28.1 L22.3 24.4 L24.2 21.6 L27.7 18.5 L30.3 14.5 L27.7 13.0 L25.8 10.5 L25.2 8.0 L27.7 5.6 L32.3 3.4 Z';
const LANKA = 'M44.8 84.4 L46.5 83.8 L49.0 87.8 L51.3 91.5 L50.6 94.0 L47.1 95.7 L45.2 94.3 L44.5 90.6 L44.8 84.4 Z';
const ANDAMAN = [[86.4, 72.6], [86.0, 75.4], [86.3, 78.2], [86.8, 81.0], [87.6, 91.8]];

export function regionTone(state, alerts = []) {
  const mine = alerts.filter((a) => a.state === state && (a.status === 'open' || a.status === 'acknowledged'));
  if (mine.some((a) => a.type === 'outbreak')) return 'alert';
  if (mine.length) return 'watch';
  if (alerts.some((a) => a.state === state && a.status === 'confirmed')) return 'watch';
  return 'calm';
}

export default function IndiaMap({ regions = [], alerts = [], corridors = [], selected, onSelect }) {
  const findRegion = (label) => regions.find((r) => label.includes(r.state));
  const arcs = corridors.filter((c) => c.status === 'active').map((c) => {
    const a = findRegion(c.from);
    const b = findRegion(c.to);
    if (!a || !b) return null;
    const mx = (a.x + b.x) / 2 + (b.y - a.y) * 0.28;
    const my = (a.y + b.y) / 2 - (b.x - a.x) * 0.28;
    return { id: c.id, d: `M${a.x} ${a.y} Q${mx} ${my} ${b.x} ${b.y}` };
  }).filter(Boolean);

  return (
    <div className="cc-map-wrap" dir="ltr">
    <div className="cc-map" role="group" aria-label="Map of India with regional load">
      <svg viewBox="0 0 100 100" className="cc-map-svg" aria-hidden="true">
        <defs>
          <pattern id="ccDots" width="2.2" height="2.2" patternUnits="userSpaceOnUse">
            <circle cx="1.1" cy="1.1" r="0.32" fill="var(--green)" opacity="0.16" />
          </pattern>
          <clipPath id="ccIndiaClip"><path d={INDIA} /></clipPath>
        </defs>
        <path d={INDIA} transform="translate(0.7 0.9)" fill="#e9e1d2" />
        <path d={INDIA} fill="#fffdf8" />
        <rect x="0" y="0" width="102" height="100" fill="url(#ccDots)" clipPath="url(#ccIndiaClip)" />
        <path d={INDIA} fill="none" stroke="var(--green)" strokeOpacity="0.55" strokeWidth="0.45" strokeLinejoin="round" />
        <path d={LANKA} fill="#f5efe4" stroke="var(--ink-3)" strokeOpacity="0.35" strokeWidth="0.3" strokeDasharray="0.8 0.6" />
        {ANDAMAN.map(([x, y]) => <circle key={y} cx={x} cy={y} r="0.55" fill="#fffdf8" stroke="var(--green)" strokeOpacity="0.5" strokeWidth="0.3" />)}
        {/* tropic of cancer — a quiet reference line */}
        <line x1="4" x2="96" y1="41.2" y2="41.2" stroke="var(--ink-3)" strokeOpacity="0.18" strokeWidth="0.25" strokeDasharray="1 1" />
        <text x="4" y="40.2" fontSize="1.9" fill="var(--ink-3)" opacity="0.6" fontStyle="italic">Tropic of Cancer</text>
        {arcs.map((a) => (
          <g key={a.id}>
            <path d={a.d} fill="none" stroke="var(--clay)" strokeWidth="0.7" strokeOpacity="0.25" />
            <path d={a.d} fill="none" stroke="var(--clay)" strokeWidth="0.55" strokeDasharray="1.6 1.4" className="cc-flow" strokeLinecap="round" />
          </g>
        ))}
      </svg>

      {regions.filter((r) => r.x != null && r.y != null).map((r) => {
        const tone = regionTone(r.state, alerts);
        const size = Math.round(20 + Math.sqrt(r.doctorsOnline || 0) * 1.55);
        return (
          <button
            key={r.state}
            type="button"
            className={cx('cc-bubble', tone, selected === r.state && 'on')}
            style={{ left: `${r.x}%`, top: `${r.y}%`, width: size, height: size }}
            onClick={() => onSelect?.(selected === r.state ? null : r.state)}
            aria-label={`${r.state}: ${r.doctorsOnline ?? 0} doctors online, ${r.kiosks ?? 0} kiosks`}
          >
            {tone === 'alert' && <span className="cc-ring" />}
            <span className="cc-bubble-code">{r.code}</span>
            <span className="cc-tip">
              <strong>{r.state}</strong>
              <span>{fmtNum(r.doctorsOnline)} doctors online · {r.kiosks ?? 0} kiosks</span>
            </span>
          </button>
        );
      })}

      {!regions.some((r) => r.x != null) && <p className="small muted center" style={{ position: 'absolute', insetInline: 0, top: '44%', margin: 0 }}>No states reporting yet</p>}
    </div>
      <div className="cc-legend tiny static">
        <span><i className="calm" /> Normal</span>
        <span><i className="watch" /> Watch</span>
        <span><i className="alert" /> Open outbreak</span>
        {arcs.length > 0 && <span><i className="arc" /> Triage corridor</span>}
        <span className="muted">Bubble size = doctors online</span>
      </div>
    </div>
  );
}
