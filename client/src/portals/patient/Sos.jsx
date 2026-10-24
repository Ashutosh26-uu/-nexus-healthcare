import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, MapPin, Hospital, BedDouble, Navigation, Share2, MessageCircle, Copy, ShieldCheck, Users, BellRing, X, Eye, RefreshCw, Siren } from 'lucide-react';
import { api } from '../../api';
import { Button, Card, cx, timeAgo, useToast } from '../../components/ui';
import { PageHeader } from '../../components/PortalLayout';
import { usePatient, usePatientLive, firstName, PageSkeleton } from './shared';
import EmergencyCircle from './EmergencyCircle';
import './sos.css';

const HOLD_MS = 1200; // a press this long opens the countdown — a brush of the thumb doesn't
const COUNTDOWN = 5;

// Best location the phone can give within a few seconds; null if refused or unavailable.
function locate(timeout = 9000) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy || 0) }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout, maximumAge: 30000 },
    );
  });
}

// tel: links open the phone's dialer with the number filled in — the person presses call (browsers can't).
function dial(number) {
  const a = document.createElement('a');
  a.href = `tel:${number}`;
  a.click();
}

// Dial 108 first (an ambulance call must never wait for our server), then raise the alert with whatever location
// arrives within 1.5 s; a slower GPS fix is sent to the family page when it comes. Returns the SOS.
async function sendSos(wherePromise) {
  dial('108');
  let loc = null;
  try { loc = await Promise.race([wherePromise, new Promise((r) => setTimeout(() => r(null), 1500))]); } catch { /* none */ }
  const { sos } = await api.post('/patient/sos', loc || {});
  if (!loc) wherePromise?.then((l) => l && api.post(`/patient/sos/${sos.id}/location`, l).catch(() => {}));
  return sos;
}

// Press and hold → ring fills → onDone. A short tap only explains what to do.
function HoldButton({ onDone, className, children, label = 'Hold for SOS' }) {
  const [p, setP] = useState(0);
  const timer = useRef(null);
  const start = useRef(0);
  const toast = useToast();
  const stop = (fired) => {
    clearInterval(timer.current);
    timer.current = null;
    if (!fired && start.current && Date.now() - start.current < HOLD_MS) toast('Keep holding the SOS button for a moment to send an alert.');
    start.current = 0;
    setP(0);
  };
  const tick = () => {
    const v = Math.min(1, (Date.now() - start.current) / HOLD_MS);
    setP(v);
    if (v >= 1) { stop(true); onDone(); }
  };
  const down = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    start.current = Date.now();
    // A plain timer, not requestAnimationFrame: that pauses in some webviews and power-saving modes.
    clearInterval(timer.current);
    timer.current = setInterval(tick, 30);
  };
  useEffect(() => () => clearInterval(timer.current), []);
  return (
    <button
      type="button" className={cx('sos-hold', className, p > 0.5 && 'holding')} aria-label={label}
      onPointerDown={down} onPointerUp={() => stop(false)} onPointerLeave={() => timer.current && stop(false)} onPointerCancel={() => stop(false)}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) onDone(); }}
      style={{ '--p': p }}
    >
      <span className="sos-ring" aria-hidden="true" />
      {children}
    </button>
  );
}

// Full-screen countdown: 5…1 with a big Cancel, while the location is fetched; then the alert goes out.
function Countdown({ onCancel, onSend }) {
  const [n, setN] = useState(COUNTDOWN);
  const where = useRef(null);
  useEffect(() => {
    where.current = locate();
    navigator.vibrate?.(200);
    const t = setInterval(() => setN((v) => v - 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (n > 0) { navigator.vibrate?.(80); return; }
    onSend(where.current);
  }, [n]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="sos-overlay" role="alertdialog" aria-modal="true" aria-labelledby="sos-count-title">
      <div className="sos-count-box">
        <div id="sos-count-title" className="sos-count-title">Sending SOS in</div>
        <div className="sos-count-num" aria-live="assertive">{Math.max(n, 0)}</div>
        <p className="sos-count-text">Your family will be alerted with your location, and your phone will open <strong>108</strong> to call an ambulance.</p>
        <button type="button" className="sos-cancel" onClick={onCancel} autoFocus><X size={22} /> Cancel — I'm OK</button>
      </div>
    </div>
  );
}

// The SOS button on every patient screen: a small pill in the top bar, next to the bell, on every screen size.
// Press and hold — it fills with red while held, then the 5-second countdown opens.
export function SosButton() {
  const { patient } = usePatient();
  const [counting, setCounting] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  const send = useCallback(async (wherePromise) => {
    setCounting(false);
    try { await sendSos(wherePromise); } catch (e) { toast(e.message || "Couldn't send the alert — please call 108 directly."); }
    navigate('/patient/sos');
  }, [navigate, toast]);
  if (!patient) return null;
  return (
    <>
      <HoldButton className="sos-pill" onDone={() => setCounting(true)} label="SOS — press and hold for an emergency">
        <Siren size={16} />
        <span className="sos-pill-text">SOS</span>
      </HoldButton>
      {counting && <Countdown onCancel={() => setCounting(false)} onSend={send} />}
    </>
  );
}

const mapsLink = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
const directions = (h) => (h.lat != null && h.lng != null ? `https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([h.name, h.address].filter(Boolean).join(', '))}`);
const phoneDigits = (p) => String(p || '').replace(/[^\d+]/g, '');
// wa.me needs the country code: a bare 10-digit Indian mobile (or one with a leading 0) gets 91.
const waNumber = (p) => {
  const d = phoneDigits(p).replace(/^\+/, '').replace(/^0(?=[6-9]\d{9}$)/, '');
  return /^[6-9]\d{9}$/.test(d) ? `91${d}` : d;
};

export default function SosPage() {
  const { patient, homeLoading, profiles } = usePatient();
  const { data, loading, reload } = usePatientLive('/patient/sos', ['sos']);
  const [counting, setCounting] = useState(false);
  const [busy, setBusy] = useState('');
  const toast = useToast();
  const sos = data?.sos;
  const isSelf = profiles.find((x) => x.id === patient?.id)?.self;

  const send = async (wherePromise) => {
    setCounting(false);
    try { await sendSos(wherePromise); } catch (e) { toast(e.message || "Couldn't send the alert — please call 108 directly."); }
    reload();
  };

  const act = async (key, fn, ok) => {
    setBusy(key);
    try { await fn(); if (ok) toast(ok); reload(); } catch (e) { toast(e.message || 'Something went wrong — please try again.'); } finally { setBusy(''); }
  };
  const refreshLocation = () => act('loc', async () => {
    const l = await locate();
    if (!l) throw new Error('Location is off or unavailable. Turn on location for this site, or tell 108 where you are.');
    await api.post(`/patient/sos/${sos.id}/location`, l);
  }, 'Location updated for your family');

  if (homeLoading || (loading && !data)) return <PageSkeleton />;
  const who = isSelf ? 'you' : firstName(patient?.name);

  if (!sos || sos.status !== 'active') {
    return (
      <div className="stack lg">
        <PageHeader eyebrow="Emergency" title="SOS" subtitle={`Press and hold the button if ${who === 'you' ? 'you need' : `${who} needs`} urgent help.`} />
        <Card className="sos-intro">
          <HoldButton className="sos-big" onDone={() => setCounting(true)}>
            <span className="sos-big-text">SOS</span>
            <span className="sos-big-sub">Press &amp; hold</span>
          </HoldButton>
          <ol className="sos-steps">
            <li><strong>5-second countdown</strong> — tap Cancel if it was a mistake.</li>
            <li>Your phone opens <strong>108</strong> to call an ambulance.</li>
            <li>Your family and your emergency circle (below) get an alert at once, with your location. You can also send the alert to anyone by WhatsApp or SMS.</li>
            <li>You see the nearest hospitals with an emergency department, and free beds where the hospital shares them.</li>
          </ol>
          {sos?.status === 'safe' && <p className="small muted">Your last SOS ended {timeAgo(sos.resolvedAt)} — marked safe.</p>}
        </Card>
        <EmergencyCircle />
        {counting && <Countdown onCancel={() => setCounting(false)} onSend={send} />}
      </div>
    );
  }

  const msg = `🚨 SOS from ${firstName(sos.name)} on Sehatra. ${sos.location ? `Location: ${mapsLink(sos.location.lat, sos.location.lng)} ` : ''}Live updates: ${sos.shareUrl}`;
  return (
    <div className="stack lg">
      <div className="sos-banner" role="status">
        <BellRing size={22} />
        <div className="grow">
          <div className="sos-banner-title">SOS sent {timeAgo(sos.startedAt)}</div>
          <div className="small">Help is on the way to your phone and your family. Stay where you are if it's safe.</div>
        </div>
      </div>

      <a className="sos-call" href="tel:108"><Phone size={24} /> Call 108 — ambulance</a>

      <Card title={<span className="sos-ct"><MapPin size={18} /> Your location</span>}>
        {sos.location ? (
          <p className="small">Shared with your family{sos.location.accuracy ? ` (within about ${sos.location.accuracy} m)` : ''} · {timeAgo(sos.location.at)}. <a href={mapsLink(sos.location.lat, sos.location.lng)} target="_blank" rel="noreferrer">Open in Maps</a></p>
        ) : (
          <p className="small sos-warn">We couldn't get your location. Turn on location for this site — or tell the 108 operator where you are.</p>
        )}
        <Button size="sm" variant="secondary" icon={RefreshCw} loading={busy === 'loc'} onClick={refreshLocation}>Update my location</Button>
      </Card>

      <Card title={<span className="sos-ct"><Users size={18} /> Family</span>}>
        {sos.alerted.length ? (
          <p className="small">Alerted on Sehatra: <strong>{sos.alerted.map((a) => a.name).join(', ')}</strong>{sos.alerted.some((a) => a.email) ? ' (also by email)' : ''}.</p>
        ) : <p className="small muted">No family member is linked on Sehatra yet — send the alert below.</p>}
        <div className="sos-share">
          {sos.contacts.map((c, i) => (
            <div key={i} className="sos-contact">
              <span className="grow"><strong translate="no">{c.name}</strong> <span className="tiny muted">{c.relation}</span></span>
              <a className="btn sm secondary" href={`https://wa.me/${waNumber(c.phone)}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer"><MessageCircle size={15} /> WhatsApp</a>
              <a className="btn sm secondary" href={`sms:${phoneDigits(c.phone)}?body=${encodeURIComponent(msg)}`}><Share2 size={15} /> SMS</a>
              <a className="btn sm ghost" href={`tel:${phoneDigits(c.phone)}`} aria-label={`Call ${c.name}`}><Phone size={15} /></a>
            </div>
          ))}
          <div className="sos-share-row">
            {navigator.share && <Button size="sm" variant="secondary" icon={Share2} onClick={() => navigator.share({ title: 'SOS', text: msg }).catch(() => {})}>Share alert</Button>}
            <Button size="sm" variant="ghost" icon={Copy} onClick={() => navigator.clipboard?.writeText(msg).then(() => toast('Alert copied — paste it anywhere'))}>Copy alert</Button>
          </div>
          <p className="tiny muted"><Eye size={12} /> {sos.views ? `Your family page was opened ${sos.views} time${sos.views === 1 ? '' : 's'}, last ${timeAgo(sos.lastViewAt)}.` : 'The family page link works for 24 hours and stops when you mark yourself safe.'}</p>
        </div>
      </Card>

      <Card title={<span className="sos-ct"><Hospital size={18} /> Nearest hospitals</span>}>
        {sos.approximate && sos.hospitals.length > 0 && <p className="tiny muted">Sorted from the area on your profile — share your location for the closest ones.</p>}
        {!sos.hospitals.length && <p className="small muted">No verified hospital found near you yet. Call 108 — they will take you to the right one.</p>}
        <div className="sos-hosp-list">
          {sos.hospitals.map((h) => (
            <div key={h.id} className="sos-hosp">
              <div className="sos-hosp-head">
                <strong>{h.name}</strong>
                {h.distanceKm != null && <span className="tiny muted">{h.distanceKm < 1 ? 'under 1 km' : `${h.distanceKm.toFixed(1)} km`}</span>}
              </div>
              <div className="tiny muted">{[h.emergency ? 'Emergency department' : null, h.address].filter(Boolean).join(' · ')}</div>
              <div className="tiny sos-beds"><BedDouble size={13} /> {h.beds ? `${h.beds.free} of ${h.beds.total} beds free · updated ${timeAgo(h.beds.updatedAt)}` : 'Bed count not shared by this hospital'}</div>
              <div className="sos-hosp-actions">
                {h.phone && <a className="btn sm secondary" href={`tel:${phoneDigits(h.phone)}`}><Phone size={14} /> Call</a>}
                <a className="btn sm secondary" href={directions(h)} target="_blank" rel="noreferrer"><Navigation size={14} /> Directions</a>
                {h.canPrealert && (h.prealerted
                  ? <span className="tiny sos-ok"><ShieldCheck size={13} /> Hospital told you're coming</span>
                  : <Button size="sm" variant="ghost" loading={busy === `pa-${h.id}`} onClick={() => act(`pa-${h.id}`, () => api.post(`/patient/sos/${sos.id}/prealert`, { facilityId: h.id }), 'Hospital alerted that you are coming')}>Tell them I'm coming</Button>)}
              </div>
            </div>
          ))}
        </div>
        <p className="tiny muted">"Tell them I'm coming" shares your name, age, blood group, allergies and conditions with that hospital's emergency team, only if you tap it.</p>
      </Card>

      <Button block variant="secondary" icon={ShieldCheck} loading={busy === 'safe'}
        onClick={() => window.confirm('Mark yourself safe? Your family will be told, and the family page link stops working.') && act('safe', () => api.post(`/patient/sos/${sos.id}/safe`), 'Marked safe — your family has been told')}>
        I'm safe now
      </Button>
    </div>
  );
}
