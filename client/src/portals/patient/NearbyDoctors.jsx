import { useEffect, useState } from 'react';
import { useConsent, openLocationSettings } from '../../consent';
import { LocateFixed, MapPin, Star, Video, Stethoscope, Ambulance, Phone, Building2, Loader2, CalendarClock, BedDouble, Clock, X, Globe2, Radar, MonitorSmartphone, SlidersHorizontal, ChevronDown } from 'lucide-react';
import { api, subscribe } from '../../api';
import { Avatar, Button, Empty, Field, fmtMoney, cx, useDebounced } from '../../components/ui';
import { AvailBadge, availClass } from '../../components/Availability';
import VoiceInput from '../../components/VoiceInput';
import DistancePicker, { useRadius } from '../../components/DistancePicker';
import DoctorProfile from './DoctorProfile';
import BookingFlow from './BookingFlow';


// The person's location from the app-wide consent manager: live (while the app is open, after they
// agree) or a place they typed. Coordinates go only to our own server, rounded to ~100 m.
export function useDeviceLocation() {
  const ctx = useConsent();
  const live = ctx?.loc?.source === 'live' && ctx?.consent?.location ? ctx.loc : null;
  const state = { live: 'ok', asking: 'asking', denied: 'denied', unsupported: 'unsupported', error: 'error' }[ctx?.status] || 'idle';
  return { loc: live, manual: ctx?.loc?.source === 'manual' ? ctx.loc : null, state, request: () => ctx?.requestLive() };
}

export function LocationButton({ device, size = 'sm' }) {
  const { state, request, loc } = device;
  const label = { idle: 'Use my location', asking: 'Finding you…', ok: 'Using your location', denied: 'Location blocked', unsupported: 'Location not available', error: 'Try location again' }[state];
  return (
    <span className="pt-loc">
      <Button size={size} variant={state === 'ok' ? 'soft' : 'secondary'} icon={state === 'asking' ? Loader2 : LocateFixed} onClick={request} disabled={state === 'asking'}>{label}</Button>
      {state !== 'ok' && <button type="button" className="link-btn tiny" onClick={openLocationSettings}>or type your place</button>}
      {state === 'denied' && <span className="tiny muted">Location is blocked in your browser — type your place instead.</span>}
      {state === 'ok' && loc?.accuracy > 3000 && <span className="tiny muted">Approximate (±{Math.round(loc.accuracy / 1000)} km)</span>}
    </span>
  );
}


// The doctor finder. In `full` mode it has its own symptom box (type or speak) and department picker;
// otherwise it follows the `symptoms` / `department` it's given. Default: doctors within the patient's chosen distance (20 km) of the
// patient. "All centres in <country>" lifts the radius (e.g. to change doctor). `onPick` turns the card
// button into "Choose" (used by the change-doctor flow).
export default function NearbyDoctors({ symptoms: givenSymptoms, department: givenDept, title, compact, full, device: shared, defaultScope = 'near', onPick, pickLabel = 'Choose', excludeId }) {
  const own = useDeviceLocation();
  const device = shared || own;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState(null);
  const [scope, setScope] = useState(defaultScope);
  const [radius, setRadius] = useRadius('doctors', 20);
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
  // Primitives, not the location objects: a fresh GPS fix at the same spot must not refetch the list.
  const lat = device.loc?.lat;
  const lng = device.loc?.lng;
  const manualDistrict = device.manual?.district || '';
  const manualState = device.manual?.state || '';

  // Live: availability, queues and free beds change while the list is open — refetch quietly when they do.
  const [tick, setTick] = useState(0);
  useEffect(() => subscribe((topics) => {
    if (topics.includes('all') || topics.some((t) => ['doctors', 'queue', 'beds', 'roster'].includes(t))) setTick((n) => n + 1);
  }), []);

  useEffect(() => {
    if (!active) { setData(null); return undefined; }
    let alive = true;
    setLoading(true); setError('');
    const params = new URLSearchParams({ symptoms: q, scope, radiusKm: String(radius) });
    if (dept) params.set('department', dept);
    if (excludeId) params.set('exclude', excludeId);
    if (place) { params.set('district', place.district); params.set('state', place.state); } else if (lat != null && lng != null) { params.set('lat', lat); params.set('lng', lng); } else if (manualDistrict) { params.set('district', manualDistrict); params.set('state', manualState); }
    api.get(`/doctors/recommend?${params}`).then((r) => alive && setData(r)).catch((e) => { if (alive) { setData(null); setError(e.message); } }).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [q, dept, scope, radius, lat, lng, manualDistrict, manualState, place, active, excludeId, tick]);

  const [booking, setBooking] = useState(null);
  const pick = (doc) => (onPick ? onPick(doc) : setBooking(doc));
  // Filters stay folded into one line until asked for: most people only need to say what's wrong.
  const [showFilters, setShowFilters] = useState(false);

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
          <VoiceInput label="Speak instead" onText={(t) => setTyped((v) => [v.trim(), t].filter(Boolean).join(v.trim() ? ', ' : ''))} />
        </div>
      )}

      <div className="pt-find-head">
        <h3 className="mb-0 row" style={{ gap: 8 }}><Stethoscope size={19} />{title || (scope === 'all' ? `Doctors across ${countryName}` : `Doctors within ${radius} km`)}</h3>
        {data && (
          <p className="small muted mb-0">
            {data.triage.byDepartment ? <>Department: <strong>{data.triage.specialty}</strong></> : q ? <>For “{q.length > 50 ? `${q.slice(0, 50)}…` : q}” we suggest <strong>{data.triage.specialty}</strong></> : 'All specialties'}
            {scope === 'near' && (data.origin.district ? <> · near <strong>{data.origin.district}</strong></> : ' · share your location to see doctors near you')}
          </p>
        )}
        <div className="row wrap" style={{ gap: 8 }}>
          <button type="button" className={cx('pt-filter-toggle', showFilters && 'on')} onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
            <SlidersHorizontal size={15} /> Filters{dept ? ' · 1 department' : ''}{place ? ` · ${place.district}` : ''} <ChevronDown size={15} />
          </button>
          {scope === 'near' && !place && device.state !== 'ok' && <LocationButton device={device} />}
        </div>
      </div>

      {showFilters && (
        <div className="pt-filters fade-in">
          <Field label="Department">
            <select className="select" value={dept} onChange={(e) => setDept(e.target.value)}>
              <option value="">Any — match my problem</option>
              {(data?.departments || []).map((d2) => <option key={d2}>{d2}</option>)}
            </select>
          </Field>
          <div className="pt-filter-row">
          <div className="pt-scope" role="radiogroup" aria-label="Search area">
            <button type="button" role="radio" aria-checked={scope === 'near'} className={cx(scope === 'near' && 'on')} onClick={() => setScope('near')}><Radar size={13} /> Near me</button>
            <button type="button" role="radio" aria-checked={scope === 'all'} className={cx(scope === 'all' && 'on')} onClick={() => setScope('all')}><Globe2 size={13} /> All of {countryName}</button>
          </div>
          {scope === 'near' && <DistancePicker value={radius} onChange={setRadius} label="How far to look for doctors" />}
          {scope === 'near' && (place ? (
            <span className="badge green pt-place"><MapPin size={12} /> {place.district} <button type="button" onClick={clearPlace} aria-label="Clear chosen area"><X size={12} /></button></span>
          ) : picking ? (
            <input className="input sm pt-place-input" list="oc-districts" autoFocus placeholder="Type a city or district" onChange={(e) => choosePlace(e.target.value)} onBlur={() => setTimeout(() => setPicking(false), 200)} />
          ) : <Button size="sm" variant="ghost" icon={MapPin} onClick={() => setPicking(true)}>Choose area</Button>)}
          <datalist id="oc-districts">{districts.map((x) => <option key={`${x.district}-${x.state}`} value={`${x.district}, ${x.state}`} />)}</datalist>
          {scope === 'near' && !place && device.state === 'ok' && <LocationButton device={device} />}
          </div>
        </div>
      )}

      {data?.triage.level === 'emergency' && (
        <div className="callout rose mt-2"><Ambulance /><div><strong>These symptoms can be serious.</strong> {data.triage.advice} <a href="tel:108" className="strong"><Phone size={13} style={{ verticalAlign: '-2px' }} /> Call 108</a></div></div>
      )}

      {loading && !data && <div className="row small muted mt-2"><span className="spinner sm" /> Finding the right doctors…</div>}
      {error && !loading && <div className="form-error mt-2">{error}</div>}
      {data && data.doctors.length === 0 && (
        <Empty icon={Stethoscope} title={scope === 'near' ? `No matching doctor within ${radius} km yet` : 'No verified doctors for this yet'}>
          {scope === 'near' ? <>Our network is growing. Try a bigger distance, or <button type="button" className="link-btn" onClick={() => setScope('all')}>See doctors across {countryName}</button> — many consult by video.</> : 'Try another department, or a general physician.'}
        </Empty>
      )}
      {data && data.doctors.length > 0 && specialists.length === 0 && !data.triage.byDepartment && q && (
        <p className="tiny muted mt-2 mb-0">No {data.triage.specialty.toLowerCase()} specialist {scope === 'near' ? `within ${radius} km` : 'on the network'} yet — these general physicians can examine you and refer you on.</p>
      )}

      {data && data.doctors.length > 0 && (
        <div className="pt-nearby-list">
          {data.doctors.map((d, i) => {

            return (
              // The three things that decide a booking — when, how much, how far — up front; the rest is in Profile.
              <article key={d.id} className={cx('pt-near-doc', availClass(d.availability), i === 0 && d.match === 'specialist' && 'best')}>
                {i === 0 && d.match === 'specialist' && <span className="pt-near-best">Best match</span>}
                <Avatar name={d.name} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="row wrap" style={{ gap: 8 }}>
                    <strong translate="no">{d.name}</strong>
                    <AvailBadge a={d.availability} />
                  </div>
                  <div className="small muted">{d.specialty}</div>
                  <div className="pt-doc-key">
                    <span className="strong">{fmtMoney(d.fee)}</span>
                    {d.distanceKm !== null && <span><MapPin size={13} /> {d.distanceKm} km</span>}
                    {d.practice === 'virtual' && <span><Video size={13} /> Online</span>}
                    <span><Star size={13} className="pt-sun" /> {d.rating && d.reviewCount ? Number(d.rating).toFixed(1) : 'New'}</span>
                  </div>
                  <button type="button" className="link-btn tiny" onClick={() => setProfile(d)}>Experience, reviews &amp; timings</button>
                </div>
                <div className="pt-near-actions">
                  <Button variant={onPick ? 'clay' : d.online ? 'primary' : 'secondary'} icon={onPick ? undefined : d.online ? Video : CalendarClock} onClick={() => pick(d)}>
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
          <h4 className="row mb-1" style={{ gap: 8 }}><Building2 size={17} />Hospitals &amp; clinics {scope === 'near' ? `within ${radius} km` : `in ${countryName}`}</h4>
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
                        <button type="button" key={x.id} className={cx('pt-fac-doc', !x.available && 'off')} onClick={() => pick(x)}>
                          <span className={cx('dot', x.available ? 'green' : '')} />
                          <span translate="no">{x.name}</span>
                          <span className="muted">· {x.specialty} · ★{x.rating && x.reviewCount ? Number(x.rating).toFixed(1) : 'New'}</span>
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
          <span className="tiny muted strong row" style={{ gap: 6 }}><MonitorSmartphone size={13} /> Sehatra E-Clinics <span className="soon-badge">Coming soon</span></span>
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
