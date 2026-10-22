import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Phone, MapPin, Hospital, Navigation, BellRing, ShieldCheck } from 'lucide-react';
import { api } from '../api';
import { Card, Loading, timeAgo } from '../components/ui';
import '../portals/patient/sos.css';

const REFRESH_MS = 20000;
const mapsLink = (l) => `https://www.google.com/maps/search/?api=1&query=${l.lat},${l.lng}`;
const directions = (h) => (h.lat != null ? `https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([h.name, h.address].filter(Boolean).join(', '))}`);
const digits = (p) => String(p || '').replace(/[^\d+]/g, '');

// The page an SOS link opens for family — no sign-in. It refreshes itself while the SOS is active.
export default function SosFamily() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    let timer = null;
    const load = () => api.get(`/public/sos/${encodeURIComponent(token)}`)
      .then((r) => { if (!alive) return; setData(r); setError(''); if (r.status === 'active') timer = setTimeout(load, REFRESH_MS); })
      .catch((e) => alive && setError(e.message || 'This SOS link has expired.'));
    load();
    return () => { alive = false; clearTimeout(timer); };
  }, [token]);

  return (
    <main className="sosf">
      <div className="sosf-inner">
        <div className="sosf-brand">Sehatra</div>
        {error && <Card><p>{error}</p><p className="small muted">If you're still worried, call them — or call <a href="tel:108">108</a>.</p></Card>}
        {!error && !data && <Loading />}
        {data && (
          <>
            {data.status === 'active' ? (
              <div className="sos-banner" role="status">
                <BellRing size={22} />
                <div>
                  <div className="sos-banner-title" translate="no">{data.name} pressed SOS {timeAgo(data.startedAt)}</div>
                  <div className="small">They may need help now. Try calling them first. If you can't reach them, call 108.</div>
                </div>
              </div>
            ) : (
              <div className="sos-banner sosf-safe" role="status">
                <ShieldCheck size={22} />
                <div>
                  <div className="sos-banner-title" translate="no">{data.name} is safe</div>
                  <div className="small">They marked themselves safe {timeAgo(data.resolvedAt)}. The SOS is over.</div>
                </div>
              </div>
            )}

            {data.status === 'active' && (
              <>
                {data.phone && <a className="sos-call" href={`tel:${digits(data.phone)}`}><Phone size={22} /> Call {data.name}</a>}
                <a className="sos-call" href="tel:108"><Phone size={22} /> Call 108 — ambulance</a>

                <Card title={<span className="sos-ct"><MapPin size={18} /> Where they are</span>}>
                  {data.location ? (
                    <p className="small">Shared {timeAgo(data.location.at)}{data.location.accuracy ? ` · within about ${data.location.accuracy} m` : ''}. <a href={mapsLink(data.location)} target="_blank" rel="noreferrer">Open in Maps</a></p>
                  ) : <p className="small muted">Their phone hasn't shared a location. This page updates by itself if it does.</p>}
                </Card>

                <Card title={<span className="sos-ct"><Hospital size={18} /> Nearest hospitals</span>}>
                  {!data.hospitals.length && <p className="small muted">No verified hospital found nearby. 108 will take them to the right one.</p>}
                  <div className="sos-hosp-list">
                    {data.hospitals.map((h, i) => (
                      <div key={i} className="sos-hosp">
                        <div className="sos-hosp-head">
                          <strong>{h.name}</strong>
                          {h.distanceKm != null && <span className="tiny muted">{h.distanceKm < 1 ? 'under 1 km' : `${h.distanceKm.toFixed(1)} km`}</span>}
                        </div>
                        <div className="tiny muted">{[h.emergency ? 'Emergency department' : null, h.address].filter(Boolean).join(' · ')}</div>
                        {h.prealerted && <div className="tiny sos-ok"><ShieldCheck size={13} /> This hospital has been told they may be coming</div>}
                        <div className="sos-hosp-actions">
                          {h.phone && <a className="btn sm secondary" href={`tel:${digits(h.phone)}`}><Phone size={14} /> Call</a>}
                          <a className="btn sm secondary" href={directions(h)} target="_blank" rel="noreferrer"><Navigation size={14} /> Directions</a>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
                <p className="tiny muted">This page refreshes every 20 seconds. The link stops working 24 hours after the SOS, or soon after they mark themselves safe.</p>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
