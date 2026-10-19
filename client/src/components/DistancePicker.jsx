import { useState } from 'react';
import { Radar } from 'lucide-react';
import { cx } from './ui';

// "How far?" — quick choices plus a custom distance the person types. The choice is remembered on this device
// per kind (doctors, chemists) so the next search starts where they left it.
const KEY = (kind) => `nx_radius_${kind}`;

export function useRadius(kind, fallback, { min = 2, max = 200 } = {}) {
  const [km, setKm] = useState(() => {
    try { const v = Number(localStorage.getItem(KEY(kind))); return v >= min && v <= max ? v : fallback; } catch { return fallback; }
  });
  const set = (v) => {
    const n = Math.round(Math.max(min, Math.min(max, Number(v) || fallback)));
    setKm(n);
    try { localStorage.setItem(KEY(kind), String(n)); } catch { /* private mode */ }
  };
  return [km, set];
}

export default function DistancePicker({ value, onChange, options = [5, 10, 20, 50], min = 2, max = 200, label = 'Distance' }) {
  const preset = options.includes(value);
  const [custom, setCustom] = useState(!preset);
  const [draft, setDraft] = useState(preset ? '' : String(value));
  const apply = () => {
    const n = Number(draft);
    if (n >= min && n <= max) onChange(n);
  };
  const bad = draft !== '' && !(Number(draft) >= min && Number(draft) <= max);
  return (
    <div className="nx-dist" role="group" aria-label={label}>
      <Radar size={13} className="nx-dist-ic" aria-hidden="true" />
      {options.map((km) => (
        <button key={km} type="button" className={cx('nx-dist-chip', !custom && value === km && 'on')} aria-pressed={!custom && value === km}
          onClick={() => { setCustom(false); onChange(km); }}>{km} km</button>
      ))}
      {custom ? (
        <span className="nx-dist-custom">
          <input className={cx('input sm', bad && 'invalid')} type="number" inputMode="numeric" min={min} max={max} value={draft}
            onChange={(e) => setDraft(e.target.value)} onBlur={apply} onKeyDown={(e) => e.key === 'Enter' && apply()} aria-label={`Custom distance in km, ${min} to ${max}`} placeholder="km" />
          <span className="tiny muted">km</span>
        </span>
      ) : (
        <button type="button" className="nx-dist-chip" onClick={() => { setCustom(true); setDraft(String(value)); }}>Custom</button>
      )}
      {bad && <span className="tiny" style={{ color: 'var(--rose)' }}>{min}–{max} km</span>}
    </div>
  );
}
