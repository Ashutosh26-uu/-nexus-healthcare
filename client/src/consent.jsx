import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Cookie, MapPin, LocateFixed, ShieldCheck, Loader2, Check, PencilLine } from 'lucide-react';
import { api } from './api';
import { useAuth } from './auth';
import { Button, Field, Modal, Switch, cx } from './components/ui';
import { COUNTRIES } from './i18n/countries';
import './consent.css';

// Cookie & location preferences (DPDP-style): nothing optional runs until the person chooses.
// Essential storage (sign-in, language) is always on. Location is asked for only after consent, then
// followed live while the app is open; anyone can type their city instead.
const CONSENT_KEY = 'nx_consent';
const LOC_KEY = 'nx_location';
const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const write = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };
const round3 = (n) => Math.round(n * 1000) / 1000; // ~100 m — enough to find nearby doctors, not a home
const km = (a, b) => {
  const r = (x) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

const Ctx = createContext(null);
export const useConsent = () => useContext(Ctx);
export const openCookieSettings = () => window.dispatchEvent(new Event('nx:cookie-settings'));
export const openLocationSettings = () => window.dispatchEvent(new Event('nx:location-settings'));

export function ConsentProvider({ children }) {
  const { user } = useAuth();
  const [consent, setConsentState] = useState(() => read(CONSENT_KEY));
  const [loc, setLoc] = useState(() => read(LOC_KEY)); // { lat, lng, accuracy, at, source: 'live' } | { district, state, country, pincode, source: 'manual' }
  const [status, setStatus] = useState(() => (read(LOC_KEY)?.source === 'manual' ? 'manual' : 'idle')); // idle | asking | live | denied | unsupported | error | manual
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [locOpen, setLocOpen] = useState(false);
  const watchId = useRef(null);
  const lastSent = useRef(null);

  const setConsent = useCallback((c) => {
    const v = { essential: true, analytics: !!c.analytics, location: !!c.location, at: new Date().toISOString(), v: 1 };
    write(CONSENT_KEY, v);
    setConsentState(v);
  }, []);

  // Live location while the app is open (only with consent).
  useEffect(() => {
    if (!consent?.location) return undefined;
    if (!('geolocation' in navigator)) { setStatus('unsupported'); return undefined; }
    setStatus((s) => (s === 'live' ? s : 'asking'));
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const v = { lat: round3(pos.coords.latitude), lng: round3(pos.coords.longitude), accuracy: Math.round(pos.coords.accuracy), at: Date.now(), source: 'live' };
        setLoc(v); write(LOC_KEY, v); setStatus('live');
      },
      (err) => setStatus(err.code === 1 ? 'denied' : 'error'),
      { enableHighAccuracy: true, maximumAge: 60000, timeout: 20000 },
    );
    return () => { if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current); watchId.current = null; };
  }, [consent?.location]);

  // Signed-in patients: keep their current location on the server (throttled) so doctor & chemist
  // searches start from where they are now.
  useEffect(() => {
    if (!loc || !user || !['patient', 'caregiver'].includes(user.role)) return;
    const prev = lastSent.current;
    if (loc.source === 'live' && prev?.source === 'live' && Date.now() - prev.at < 120000 && km(prev, loc) < 0.3) return;
    if (prev && JSON.stringify({ ...prev, at: 0 }) === JSON.stringify({ ...loc, at: 0 })) return;
    lastSent.current = { ...loc, at: Date.now() };
    api.post('/patient/location', loc).catch(() => { lastSent.current = prev; });
  }, [loc, user]);

  // Asking for location from a button counts as consent for location.
  const requestLive = useCallback(() => {
    setConsent({ ...(consent || {}), location: true });
    if (consent?.location && status !== 'live' && 'geolocation' in navigator) {
      setStatus('asking');
      navigator.geolocation.getCurrentPosition((pos) => {
        const v = { lat: round3(pos.coords.latitude), lng: round3(pos.coords.longitude), accuracy: Math.round(pos.coords.accuracy), at: Date.now(), source: 'live' };
        setLoc(v); write(LOC_KEY, v); setStatus('live');
      }, (err) => setStatus(err.code === 1 ? 'denied' : 'error'), { enableHighAccuracy: true, timeout: 20000 });
    }
  }, [consent, setConsent, status]);

  // Typing a place stops live tracking — the person chose a fixed location.
  const setManual = useCallback((m) => {
    const v = { district: m.district.trim(), state: m.state.trim(), country: m.country || 'IN', pincode: (m.pincode || '').trim(), source: 'manual', at: Date.now() };
    setConsent({ ...(consent || {}), location: false });
    setLoc(v); write(LOC_KEY, v); setStatus('manual');
  }, [consent, setConsent]);

  useEffect(() => {
    const s = () => setSettingsOpen(true);
    const l = () => setLocOpen(true);
    window.addEventListener('nx:cookie-settings', s);
    window.addEventListener('nx:location-settings', l);
    return () => { window.removeEventListener('nx:cookie-settings', s); window.removeEventListener('nx:location-settings', l); };
  }, []);

  const value = { consent, setConsent, loc, status, requestLive, setManual, openLocation: () => setLocOpen(true) };
  return (
    <Ctx.Provider value={value}>
      {children}
      <CookieBanner onCustomize={() => setSettingsOpen(true)} />
      <CookieSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <LocationSheet open={locOpen} onClose={() => setLocOpen(false)} />
    </Ctx.Provider>
  );
}

function CookieBanner({ onCustomize }) {
  const { consent, setConsent } = useConsent();
  const path = useLocation().pathname;
  if (consent || path.startsWith('/kiosk') || path.startsWith('/rx/') || path.startsWith('/lab-report/')) return null;
  return (
    <div className="nx-cookie" role="dialog" aria-label="Cookie preferences" aria-live="polite">
      <div className="nx-cookie-text">
        <strong className="row" style={{ gap: 8 }}><Cookie size={18} /> Your privacy, your choice</strong>
        <p className="small mb-0">We use essential storage to keep you signed in and remember your language. With your OK we&apos;ll also use your <strong>live location</strong> to show doctors, hospitals and chemists near you, and anonymous usage stats to improve Nexus. No advertising cookies — ever.</p>
      </div>
      <div className="nx-cookie-actions">
        <Button variant="ghost" size="sm" onClick={onCustomize}>Customize</Button>
        <Button variant="secondary" size="sm" onClick={() => setConsent({ analytics: false, location: false })}>Essential only</Button>
        <Button size="sm" onClick={() => setConsent({ analytics: true, location: true })}>Accept all</Button>
      </div>
    </div>
  );
}

function CookieSettings({ open, onClose }) {
  const { consent, setConsent } = useConsent();
  const [draft, setDraft] = useState({ analytics: false, location: false });
  useEffect(() => { if (open) setDraft({ analytics: !!consent?.analytics, location: !!consent?.location }); }, [open, consent]);
  if (!open) return null;
  return (
    <Modal open onClose={onClose} title="Cookie & privacy preferences" subtitle="Change these any time from “Cookie preferences”."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={() => { setConsent(draft); onClose(); }}>Save preferences</Button></>}>
      <div className="nx-pref-list">
        <div className="nx-pref"><div><strong>Essential</strong><p className="small muted mb-0">Keeps you signed in, remembers your language and keeps the app secure. Always on.</p></div><span className="badge green">Always on</span></div>
        <div className="nx-pref"><div><strong>Live location</strong><p className="small muted mb-0">Finds doctors within 20 km and chemists within 50 km, updated as you move. Rounded to about 100 m and never shared with advertisers. You can type your city instead.</p></div><Switch checked={draft.location} onChange={(v) => setDraft((d) => ({ ...d, location: v }))} label="Live location" /></div>
        <div className="nx-pref"><div><strong>Usage statistics</strong><p className="small muted mb-0">Anonymous counts of which screens are used, so we can make Nexus better. No personal data.</p></div><Switch checked={draft.analytics} onChange={(v) => setDraft((d) => ({ ...d, analytics: v }))} label="Usage statistics" /></div>
      </div>
    </Modal>
  );
}

function LocationSheet({ open, onClose }) {
  const { loc, status, requestLive, setManual } = useConsent();
  const [form, setForm] = useState({ district: '', state: '', country: 'IN', pincode: '' });
  const [districts, setDistricts] = useState([]);
  useEffect(() => {
    if (!open) return;
    setForm({ district: loc?.district || '', state: loc?.state || '', country: loc?.country || 'IN', pincode: loc?.pincode || '' });
    if (!districts.length) api.get('/geo/districts').then(setDistricts).catch(() => {});
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const pick = (v) => { const hit = districts.find((x) => `${x.district}, ${x.state}` === v); if (hit) setForm((f) => ({ ...f, district: hit.district, state: hit.state })); else set('district', v); };
  const label = { live: 'Using your live location', asking: 'Waiting for permission…', denied: 'Location is blocked in your browser', unsupported: 'This device can’t share location', error: 'Couldn’t get your location', manual: 'Using the place you typed', idle: 'Location not shared yet' }[status];
  return (
    <Modal open onClose={onClose} title="Your location" subtitle="Used to show doctors, hospitals and chemists near you."
      footer={<><Button variant="ghost" onClick={onClose}>Close</Button><Button icon={Check} disabled={form.district.trim().length < 2} onClick={() => { setManual(form); onClose(); }}>Use this place</Button></>}>
      <div className="stack">
        <div className={cx('nx-loc-status', status === 'live' && 'on')}>
          {status === 'asking' ? <Loader2 size={16} className="spin" /> : <MapPin size={16} />}
          <span className="small"><strong>{label}</strong>{status === 'live' && loc?.accuracy ? ` · accurate to about ${loc.accuracy > 1000 ? `${Math.round(loc.accuracy / 1000)} km` : `${loc.accuracy} m`}` : ''}</span>
        </div>
        {status !== 'live' && <Button variant="secondary" icon={LocateFixed} onClick={requestLive}>Use my live location</Button>}
        {status === 'denied' && <p className="tiny muted mb-0">To allow it: tap the lock icon next to the web address → Location → Allow. Or type your place below.</p>}
        <div className="nx-loc-or tiny muted"><PencilLine size={12} /> or type your place</div>
        <Field label="Country">
          <select className="select" value={form.country} onChange={(e) => set('country', e.target.value)}>
            {COUNTRIES.map((c) => <option key={c.iso} value={c.iso}>{c.flag} {c.name}</option>)}
          </select>
        </Field>
        <Field label="City / district">
          <input className="input" list="nx-loc-districts" value={form.district} onChange={(e) => pick(e.target.value)} placeholder="e.g. Lucknow" autoComplete="address-level2" />
          <datalist id="nx-loc-districts">{form.country === 'IN' && districts.map((x) => <option key={`${x.district}-${x.state}`} value={`${x.district}, ${x.state}`} />)}</datalist>
        </Field>
        <div className="grid two">
          <Field label="State / region"><input className="input" value={form.state} onChange={(e) => set('state', e.target.value)} autoComplete="address-level1" /></Field>
          <Field label="Pin / postal code"><input className="input" inputMode="numeric" value={form.pincode} onChange={(e) => set('pincode', e.target.value.slice(0, 12))} autoComplete="postal-code" /></Field>
        </div>
        <p className="tiny muted mb-0"><ShieldCheck size={12} style={{ verticalAlign: '-2px' }} /> Stored rounded to about 100 m, only to find care near you.</p>
      </div>
    </Modal>
  );
}

// Small chip for headers: shows where searches start from and opens the location sheet.
export function LocationChip() {
  const ctx = useConsent();
  if (!ctx) return null;
  const { loc, status, openLocation } = ctx;
  const text = status === 'live' ? 'Live location' : status === 'manual' && loc?.district ? loc.district : status === 'asking' ? 'Locating…' : 'Set location';
  return (
    <button type="button" className={cx('nx-loc-chip', status === 'live' && 'on')} onClick={openLocation} title="Your location">
      {status === 'asking' ? <Loader2 size={14} className="spin" /> : <MapPin size={14} />}<span>{text}</span>
    </button>
  );
}
