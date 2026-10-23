import { MapPin, Navigation } from 'lucide-react';
import { cx } from './ui';

// An ordered list of stops with the drive between them, plus one button that opens the whole route in Google Maps.
// `stops` come from the server already in order: { label, sub, legKm, etaMin, hasLocation, tag }.
export default function RouteStops({ stops, totalKm, totalMin, mapsUrl, className }) {
  if (!stops?.length) return null;
  const missing = stops.filter((s) => !s.hasLocation).length;
  return (
    <div className={cx('route-stops', className)}>
      <ol className="route-list">
        {stops.map((s, i) => (
          <li key={`${s.key || i}`} className="route-stop">
            <span className={cx('route-num', s.tone)}>{i + 1}</span>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="small"><strong translate="no">{s.label}</strong>{s.tag ? <span className={cx('badge', s.tone || 'sky')} style={{ marginLeft: 6 }}>{s.tag}</span> : null}</div>
              {s.sub && <div className="tiny muted">{s.sub}</div>}
              <div className="tiny muted">
                {s.legKm != null ? `${s.legKm} km · ` : s.hasLocation ? '' : 'No map location · '}
                {i === 0 ? 'first stop' : `about ${s.etaMin} min in`}
              </div>
            </div>
          </li>
        ))}
      </ol>
      <div className="row wrap" style={{ gap: 10, justifyContent: 'space-between' }}>
        <span className="tiny muted">
          <MapPin size={12} /> {totalKm ? `${totalKm} km` : 'Distance unknown'}{totalMin ? ` · about ${Math.round(totalMin / 5) * 5 || totalMin} min with stops` : ''}
          {missing ? ` · ${missing} stop${missing === 1 ? '' : 's'} without a map location go last` : ''}
        </span>
        {mapsUrl && <a className="btn sm" href={mapsUrl} target="_blank" rel="noreferrer"><Navigation size={15} /> Open route in Maps</a>}
      </div>
    </div>
  );
}
