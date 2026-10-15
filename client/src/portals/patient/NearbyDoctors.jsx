import { useCallback, useEffect, useState } from 'react';
import { LocateFixed, MapPin, Star, Languages, Video, Stethoscope, Ambulance, Phone, Building2, Loader2, CalendarClock, BedDouble, Clock, X, Smile, Users, Briefcase, Globe2, Radar, MonitorSmartphone, Home as HomeIcon } from 'lucide-react';
import { api } from '../../api';
import { Avatar, Button, Empty, Field, fmtMoney, cx } from '../../components/ui';
import { AvailBadge, availClass } from '../../components/Availability';
import VoiceInput from '../../components/VoiceInput';
import { useDebounced } from '../doctor/shared';
import { getLocale } from '../../i18n';
import DoctorProfile, { TodayTimings } from './DoctorProfile';
import BookingFlow from './BookingFlow';

const LOC_KEY = 'oc_device_loc';
const PRACTICE = {
  own_clinic: { icon: HomeIcon, label: 'Own clinic' },
  clinic: { icon: Building2, label: 'Clinic' },
  hospital: { icon: Building2, label: 'Hospital' },
  virtual: { icon: Video, label: 'Nexus virtual clinic' },
  independent: { icon: Stethoscope, label: 'Independent' },
};

// Device location (phone GPS or laptop Wi-Fi positioning) — asked only when the person taps the button.
// Coordinates go only to our own server, rounded, to rank doctors by distance.
export function useDeviceLocation() {
  const [loc, setLoc] = useState(() => { try { return JSON.parse(sessionStorage.getItem(LOC_KEY) || 'null'); } catch { return null; } });
  const [state, setState] = useState(loc ? 'ok' : 'idle'); // idle | asking | ok | denied | unsupported | error
  const request = useCallback(() => new Promise((resolve) => {
    if (!('geolocation' in navigator)) { setState('unsupported'); resolve(null); return; }
    setState('asking');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const v = { lat: Math.round(pos.coords.latitude * 1000) / 1000, lng: Math.round(pos.coords.longitude * 1000) / 1000, accuracy: Math.round(pos.coords.accuracy) };
        setLoc(v); setState('ok');
        try { sessionStorage.setItem(LOC_KEY, JSON.stringify(v)); } catch { /* ignore */ }
        resolve(v);
      },
      (err) => { setState(err.code === 1 ? 'denied' : 'error'); resolve(null); },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 5 * 60000 },
    );
  }), []);
  return { loc, state, request };
}

export function LocationButton({ device, size = 'sm' }) {
  const { state, request, loc } = device;
  const label = { idle: 'Use my location', asking: 'Finding you…', ok: 'Using your location', denied: 'Location blocked', unsupported: 'Location not available', error: 'Try location again' }[state];
  return (
    <span className="pt-loc">
      <Button size={size} variant={state === 'ok' ? 'soft' : 'secondary'} icon={state === 'asking' ? Loader2 : LocateFixed} onClick={request} disabled={state === 'asking'}>{label}</Button>
      {state === 'denied' && <span className="tiny muted">Allow location for this site in your browser settings, or we&apos;ll use your address.</span>}
      {state === 'ok' && loc?.accuracy > 3000 && <span className="tiny muted">Approximate (±{Math.round(loc.accuracy / 1000)} km)</span>}
    </span>
  );
}

// Trust signals on every doctor card: rating & reviews, satisfaction, patients seen, experience.
export function DoctorStats({ d }) {
  const n = (x) => Number(x || 0).toLocaleString(getLocale());
  return (
    <div className="pt-doc-stats tiny">
      <span title="Rating from patients"><Star size={12} className="pt-sun" /> <strong>{d.rating ? Number(d.rating).toFixed(1) : 'New'}</strong>{d.reviewCount ? <span className="muted"> ({n(d.reviewCount)} reviews)</span> : null}</span>
      {d.satisfaction != null && <span title="Patients who rated 4★ or 5★"><Smile size={12} /> <strong>{d.satisfaction}%</strong> satisfied</span>}
      <span><Users size={12} /> <strong>{n(d.patientsSeen)}+</strong> patients</span>
      <span><Briefcase size={12} /> <strong>{d.experience}</strong> yrs exp.</span>
    </div>
  );
}

// The doctor finder. In `full` mode it has its own symptom box (type or speak) and department picker;
// otherwise it follows the `symptoms` / `department` it's given. Default: doctors within 20 km of the
// patient. "All centres in <country>" lifts the radius (e.g. to change doctor). `onPick` turns the card
// button into "Choose" (used by the change-doctor flow).
export default function NearbyDoctors({ symptoms: givenSymptoms, department: givenDept, title, compact, full, device: shared, defaultScope = 'near', onPick, pickLabel = 'Choose', excludeId }) {
  const own = useDeviceLocation();
  const device = shared || own;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState(null);
  const [scope, setScope] = useState(defaultScope);
  const [typed, setTyped] = useState(givenSymptoms || '');
  const [dept, setDept] = useState(givenDept || '');
  useEffect(() => { if (!full) setTyped(givenSymptoms || ''); }, [givenSymptoms, full]);
  useEffect(() => { if (!full) setDept(givenDept || ''); }, [givenDept, full]);
  const q = useDebounced((typed || '').trim(), 500);
  // Preferred area — e.g. the city where the patient wants treatment, not where they are now.
  const [place, setPlace] = useState(() => { try { return JSON.parse(sessionStorage.getItem('oc_pref_place') || 'null'); } catch { return null; } });
  const [districts, setDistricts] = useState([]);
  const [picking, setPicking] = useState(false);
  useEffect(() => { if (picking && !districts.length) api.get('/geo/districts').then(setDistricts).catch(() => {}); }, [picking, districts.length]);
  const choosePlace = (v) => {
    const hit = districts.find((x) => `${x.district}, ${x.state}` === v);
    if (!hit) return;
    setPlace(hit); setPicking(false);
    try { sessionStorage.setItem('oc_pref_place', JSON.stringify(hit)); } catch { /* ignore */ }
  };
  const clearPlace = () => { setPlace(null); try { sessionStorage.removeItem('oc_pref_place'); } catch { /* ignore */ } };
  const active = full || q || dept;

  useEffect(() => {
    if (!active) { setData(null); return undefined; }
    let alive = true;
    setLoading(true);
    const params = new URLSearchParams({ symptoms: q, scope });
    if (dept) params.set('department', dept);
    if (excludeId) params.set('exclude', excludeId);
    if (place) { params.set('district', place.district); params.set('state', place.state); } else if (device.loc) { params.set('lat', device.loc.lat); params.set('lng', device.loc.lng); }
    api.get(`/doctors/recommend?${params}`).then((r) => alive && setData(r)).catch(() => alive && setData(null)).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [q, dept, scope, device.loc, place, active, excludeId]);

  const [booking, setBooking] = useState(null);
  const pick = (doc) => (onPick ? onPick(doc) : setBooking(doc));

  if (!active) return null;
  const specialists = data?.doctors.filter((d) => d.match === 'specialist') || [];
  const countryName = data?.country === 'IN' || !data ? 'India' : data.country;

  return (
    <section className={cx('card pt-nearby fade-in', compact && 'compact')}>
      {full && (
        <div className="pt-finder">
          <Field label="What's the problem?" hint="Type it, or tap the mic and say it in your language.">
            <textarea className="textarea" rows={2} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="e.g. fever and cough for 3 days" />
          </Field>
          <div className="row wrap between" style={{ gap: 10 }}>
            <VoiceInput label="Speak instead" onText={(t) => setTyped((v) => [v.trim(), t].filter(Boolean).join(v.trim() ? ', ' : ''))} />
            <select className="select pt-dept-select" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department">
              <option value="">Any department — match my symptoms</option>
              {(data?.departments || []).map((d2) => <option key={d2}>{d2}</option>)}
            </select>
          </div>
        </div>
      )}

      <div className="row between wrap" style={{ gap: 10 }}>
        <div>
          <h3 className="mb-0 row" style={{ gap: 8 }}><Stethoscope size={19} />{title || (scope === 'all' ? `Doctors across ${countryName}` : 'Doctors within 20 km of you')}</h3>
          {data && (
            <p className="small muted mb-0">
              {data.triage.byDepartment ? <>Department: <strong>{data.triage.specialty}</strong></> : q ? <>For “{q.length > 50 ? `${q.slice(0, 50)}…` : q}” we suggest <strong>{data.triage.specialty}</strong></> : 'All specialties'}
              {scope === 'near' && (data.origin.district ? <> · within {data.radiusKm} km of <strong>{data.origin.district}</strong> ({data.origin.source === 'chosen' ? 'your chosen area' : data.origin.source === 'device' ? 'your device location' : 'your address'})</> : ' · share your location to find doctors near you')}
            </p>
          )}
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          <div className="pt-scope" role="radiogroup" aria-label="Search area">
            <button type="button" role="radio" aria-checked={scope === 'near'} className={cx(scope === 'near' && 'on')} onClick={() => setScope('near')}><Radar size={13} /> Within 20 km</button>
            <button type="button" role="radio" aria-checked={scope === 'all'} className={cx(scope === 'all' && 'on')} onClick={() => setScope('all')}><Globe2 size={13} /> All of {countryName}</button>
          </div>
          {scope === 'near' && (place ? (
            <span className="badge green pt-place"><MapPin size={12} /> {place.district} <button type="button" onClick={clearPlace} aria-label="Clear chosen area"><X size={12} /></button></span>
          ) : picking ? (
            <input className="input sm pt-place-input" list="oc-districts" autoFocus placeholder="Type a city or district" onChange={(e) => choosePlace(e.target.value)} onBlur={() => setTimeout(() => setPicking(false), 200)} />
          ) : <Button size="sm" variant="ghost" icon={MapPin} onClick={() => setPicking(true)}>Choose area</Button>)}
          <datalist id="oc-districts">{districts.map((x) => <option key={`${x.district}-${x.state}`} value={`${x.district}, ${x.state}`} />)}</datalist>
          {scope === 'near' && !place && <LocationButton device={device} />}
        </div>
      </div>

      {data?.triage.level === 'emergency' && (
        <div className="callout rose mt-2"><Ambulance /><div><strong>These symptoms can be serious.</strong> {data.triage.advice} <a href="tel:108" className="strong"><Phone size={13} style={{ verticalAlign: '-2px' }} /> Call 108</a></div></div>
      )}

      {loading && !data && <div className="row small muted mt-2"><span className="spinner sm" /> Finding the right doctors…</div>}
      {data && data.doctors.length === 0 && (
        <Empty icon={Stethoscope} title={scope === 'near' ? 'No matching doctor within 20 km yet' : 'No verified doctors for this yet'}>
          {scope === 'near' ? <>Our network is growing. <button type="button" className="link-btn" onClick={() => setScope('all')}>See doctors across {countryName}</button> — many consult by video.</> : 'Try another department, or a general physician.'}
        </Empty>
      )}
      {data && data.doctors.length > 0 && specialists.length === 0 && !data.triage.byDepartment && q && (
        <p className="tiny muted mt-2 mb-0">No {data.triage.specialty.toLowerCase()} specialist {scope === 'near' ? 'within 20 km' : 'on the network'} yet — these general physicians can examine you and refer you on.</p>
      )}

      {data && data.doctors.length > 0 && (
        <div className="pt-nearby-list">
          {data.doctors.map((d, i) => {
            const P = PRACTICE[d.practice] || PRACTICE.independent;
            return (
              <article key={d.id} className={cx('pt-near-doc', availClass(d.availability), i === 0 && d.match === 'specialist' && 'best')}>
                {i === 0 && d.match === 'specialist' && <span className="pt-near-best">Best match</span>}
                <Avatar name={d.name} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="row wrap" style={{ gap: 8 }}>
                    <strong translate="no">{d.name}</strong>
                    <AvailBadge a={d.availability} />
                    <span className="badge tiny"><P.icon size={11} /> {P.label}</span>
                  </div>
                  <div className="small muted">{d.specialty} · {d.qualification}</div>
                  <DoctorStats d={d} />
                  <div className="pt-near-meta tiny">
                    <span><MapPin size={12} /> {d.distanceKm !== null ? `${d.distanceKm} km · ` : ''}<span translate="no">{d.at}</span></span>
                    <span><Languages size={12} /> {d.languages.slice(0, 3).join(', ')}</span>
                    <span>Fee {fmtMoney(d.fee)}</span>
                  </div>
                  <div className="pt-near-meta tiny"><TodayTimings doc={d} /></div>
                </div>
                <div className="pt-near-actions">
                  <Button size="sm" variant="ghost" onClick={() => setProfile(d)}>Profile</Button>
                  <Button size="sm" variant={onPick ? 'clay' : d.online ? 'primary' : 'secondary'} icon={onPick ? undefined : d.online ? Video : CalendarClock} onClick={() => pick(d)}>
                    {onPick ? pickLabel : d.online ? 'Book now' : 'Book a time'}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {data?.facilities?.length > 0 && (
        <div className="pt-near-fac">
          <h4 className="row mb-1" style={{ gap: 8 }}><Building2 size={17} />Hospitals &amp; clinics {scope === 'near' ? 'within 20 km' : `in ${countryName}`}</h4>
          <div className="pt-nearby-list">
            {data.facilities.map((f) => (
              <article key={f.id} className="pt-near-doc pt-near-facility">
                <span className="pt-fac-ic"><Building2 size={18} /></span>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="row wrap" style={{ gap: 8 }}>
                    <strong translate="no">{f.name}</strong>
                    <span className="badge">{f.kind}</span>
                    {f.emergency && <span className="badge rose">24×7 emergency</span>}
                  </div>
                  <div className="pt-near-meta tiny">
                    {f.distanceKm !== null && <span><MapPin size={12} /> {f.distanceKm} km · {f.district}</span>}
                    <span>OPD {f.opdFee === null ? '—' : f.opdFee === 0 ? 'free' : fmtMoney(f.opdFee)}</span>
                    {f.bedsFree > 0 && <span><BedDouble size={12} /> {f.bedsFree} beds free</span>}
                    {f.hours && <span><Clock size={12} /> {f.hours}</span>}
                  </div>
                  {f.matchedDepartments.length > 0 && <div className="pt-near-meta tiny"><span>Departments: {f.matchedDepartments.join(', ')}</span></div>}
                  {f.doctors?.length > 0 && (
                    <div className="pt-fac-docs">
                      {f.doctors.map((x) => (
                        <button type="button" key={x.id} className={cx('pt-fac-doc', !x.available && 'off')} onClick={() => pick({ ...x, fee: x.fee })}>
                          <span className={cx('dot', x.available ? 'green' : '')} />
                          <span translate="no">{x.name}</span>
                          <span className="muted">· {x.specialty} · ★{x.rating ? Number(x.rating).toFixed(1) : 'New'}</span>
                          <span className="pt-fac-doc-cta">{onPick ? pickLabel : 'Book'}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {f.phone && <a className="btn sm ghost" href={`tel:${f.phone}`}><Phone size={14} /> Call</a>}
              </article>
            ))}
          </div>
        </div>
      )}

      {data?.eClinics?.length > 0 && (
        <div className="pt-near-clinics">
          <span className="tiny muted strong row" style={{ gap: 6 }}><MonitorSmartphone size={13} /> Nexus E-Clinics <span className="soon-badge">Coming soon</span></span>
          {data.eClinics.map((c) => (
            <span key={c.id} className="pt-near-clinic off">
              <Building2 size={13} /> <span translate="no">{c.name.replace('E-Clinic · ', '')}</span>
              {c.distanceKm !== null && <span className="muted">· {c.distanceKm} km</span>}
            </span>
          ))}
        </div>
      )}
      <DoctorProfile doc={profile} onClose={() => setProfile(null)} consultLabel={onPick ? pickLabel : undefined} onConsult={(d) => { setProfile(null); pick(d); }} />
      {!onPick && <BookingFlow doctor={booking} symptoms={q} onClose={() => setBooking(null)} />}
    </section>
  );
}
