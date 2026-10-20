import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Video, Building2, MapPin, Languages, BadgeCheck, ShieldCheck, Fingerprint, Clock, ArrowRight, Search, GraduationCap, Stethoscope } from 'lucide-react';
import { useSeo } from '../../seo';
import { initials } from '../../components/ui';
import { PublicPage, ShareBar, NearMeButton, Note, SkeletonList, Stars } from './PublicShell';
import { useContinue, useNearMe, usePublicJson, money, qs } from './kit';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function Availability({ a }) {
  if (a.available) return <span className="badge green"><span className="dot green pulse" /> {a.label || 'Available now'}</span>;
  return <span className="badge">{a.next ? <>Next: {a.next}</> : 'Not available right now'}</span>;
}

function VerifiedBadges({ v }) {
  return (
    <div className="pb-tags">
      <span className="badge green"><BadgeCheck /> Verified by Sehatra</span>
      {v.registry && <span className="badge sky"><ShieldCheck /> Registration checked on the medical register</span>}
      {v.aadhaar && <span className="badge plum"><Fingerprint /> Aadhaar verified</span>}
    </div>
  );
}

function DoctorCard({ d }) {
  return (
    <div className="pb-card">
      <div className="pb-person">
        <span className="pb-avatar" aria-hidden="true">{initials(d.name)}</span>
        <div className="grow">
          <h3><Link to={`/find/doctors/${d.slug}`} translate="no">{d.name}</Link></h3>
          <div className="small">{d.specialty}{d.qualification && <span className="muted"> · {d.qualification}</span>}</div>
          <div className="pb-meta">
            <Stars rating={d.rating} count={d.reviewCount} />
            {d.experience ? <span><GraduationCap /> {d.experience} years</span> : null}
            {d.place && <span><Building2 /> <span translate="no">{d.place.name}</span></span>}
            {d.district && d.practice !== 'virtual' && <span><MapPin /> <span translate="no">{d.district}</span>{d.distanceKm != null && <> · {d.distanceKm} km</>}</span>}
            {d.languages.length > 0 && <span><Languages /> {d.languages.join(', ')}</span>}
          </div>
        </div>
      </div>
      <div className="pb-tags"><Availability a={d.availability} />{d.verified.registry && <span className="badge sky"><ShieldCheck /> Registry checked</span>}</div>
      <div className="row wrap between" style={{ marginTop: 10, gap: 8 }}>
        <span className="small">
          {d.modes.video && <><Video size={14} style={{ verticalAlign: '-2px' }} /> Video {money(d.fees.video)}</>}
          {d.modes.clinic && <> · <Building2 size={14} style={{ verticalAlign: '-2px' }} /> Clinic fee {money(d.fees.clinic)}</>}
        </span>
        <Link className="btn sm clay" to={`/find/doctors/${d.slug}`}>View &amp; book <ArrowRight /></Link>
      </div>
    </div>
  );
}

function DoctorList() {
  const [params, setParams] = useSearchParams();
  const near = useNearMe();
  const [q, setQ] = useState('');
  const specialty = params.get('specialty') || '';
  const district = params.get('district') || '';
  const [term, setTerm] = useState('');
  const { data, error } = usePublicJson(`/public/doctors${qs({ specialty, district: near.loc ? '' : district, q: term, ...(near.loc || {}) })}`);
  const set = (k, v) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); };
  const where = district ? ` in ${district}` : '';
  useSeo({
    title: `${specialty ? `${specialty} doctors` : 'Find a verified doctor'}${where} — book online | Sehatra`,
    description: `Verified ${specialty ? `${specialty.toLowerCase()} ` : ''}doctors${where} with real patient ratings, languages, fees and live availability. Book a video or clinic consult online.`,
    path: `/find/doctors${qs({ specialty })}`,
  });
  return (
    <div className="stack lg">
      <section className="pb-hero">
        <span className="pb-eyebrow">Verified doctors</span>
        <h1>{specialty ? <>{specialty} doctors</> : 'Find a doctor'}{district && <> in <span translate="no">{district}</span></>}</h1>
        <p>Every doctor here is verified by our team. Ratings come only from patients who finished a visit — no paid reviews.</p>
      </section>
      <div className="pb-filters">
        <select className="select" value={specialty} onChange={(e) => set('specialty', e.target.value)} aria-label="Specialty">
          <option value="">All specialties</option>
          {(data?.specialties || []).map((s) => <option key={s.name} value={s.name}>{s.name} ({s.count})</option>)}
        </select>
        {!near.loc && (
          <select className="select" value={district} onChange={(e) => set('district', e.target.value)} aria-label="City or district">
            <option value="">All cities</option>
            {(data?.districts || []).map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
        )}
        <NearMeButton near={near} />
      </div>
      <form className="pb-search" role="search" onSubmit={(e) => { e.preventDefault(); setTerm(q.trim()); }}>
        <Search />
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => setTerm(q.trim())} placeholder="Search by name or language" aria-label="Search doctors" />
      </form>
      {error ? <Note tone="rose">{error.message}</Note> : !data ? <SkeletonList n={3} h={150} /> : data.doctors.length === 0 ? (
        <div className="pb-card pb-empty">No verified doctor matches yet. Try another specialty or city — or <Link to="/find/doctors">see all doctors</Link>.</div>
      ) : (
        <>
          <span className="tiny muted">{data.total} verified doctor{data.total === 1 ? '' : 's'}{district && !near.loc ? <> · video doctors are shown everywhere</> : null}</span>
          <div className="pb-grid two">{data.doctors.map((d) => <DoctorCard key={d.slug} d={d} />)}</div>
        </>
      )}
      <ShareBar title={`${specialty ? `${specialty} doctors` : 'Verified doctors'} on Sehatra`} path={`/find/doctors${qs({ specialty })}`} />
    </div>
  );
}

function DoctorProfile({ slug }) {
  const go = useContinue();
  const near = useNearMe();
  const { data, error } = usePublicJson(`/public/doctors/${encodeURIComponent(slug)}${qs(near.loc || {})}`);
  useSeo(data ? { ...data.seo, path: `/find/doctors/${data.doctor.slug}`, jsonLd: data.jsonLd } : {});
  if (error) return <Note tone="rose">{error.status === 404 ? 'We couldn’t find this doctor — they may no longer be listed.' : error.message} <Link to="/find/doctors">See all doctors</Link></Note>;
  if (!data) return <SkeletonList n={3} h={130} />;
  const d = data.doctor;
  const book = () => go(`/patient/consult${qs({ book: d.id })}`);
  return (
    <div className="pb-layout">
      <div className="stack lg">
        <nav className="pb-crumbs" aria-label="Breadcrumb"><Link to="/find/doctors">Find a doctor</Link><span>/</span>{d.specialty && <><Link to={`/find/doctors${qs({ specialty: d.specialty })}`}>{d.specialty}</Link><span>/</span></>}<span translate="no">{d.name}</span></nav>
        <section className="pb-card">
          <div className="pb-person">
            <span className="pb-avatar" aria-hidden="true">{initials(d.name)}</span>
            <div className="grow">
              <h1 className="serif" style={{ fontSize: '1.5rem', margin: '0 0 4px' }} translate="no">{d.name}</h1>
              <div>{d.specialty}{d.qualification && <span className="muted"> · {d.qualification}</span>}</div>
              <div className="pb-meta">
                <Stars rating={d.rating} count={d.reviewCount} />
                {d.satisfaction != null && <span>{d.satisfaction}% would recommend</span>}
                {d.experience ? <span><GraduationCap /> {d.experience} years&apos; experience</span> : null}
                {d.regNo && <span><Stethoscope /> Reg. no. <span translate="no">{d.regNo}</span></span>}
              </div>
            </div>
          </div>
          <VerifiedBadges v={d.verified} />
          <div className="pb-tags"><Availability a={d.availability} /></div>
        </section>
        <button type="button" className="btn clay pb-mobile-cta" onClick={book}><Clock /> Book a consult <ArrowRight /></button>

        <section className="pb-section">
          <h2>Consult options &amp; fees</h2>
          <div className="pb-grid two">
            {d.modes.video && (
              <div className="pb-card">
                <h3><Video size={16} style={{ verticalAlign: '-3px' }} /> Video, audio or chat</h3>
                <p className="small mb-0"><strong>{money(d.fees.video)}</strong> paid online when you book.</p>
              </div>
            )}
            {d.modes.clinic && (
              <div className="pb-card">
                <h3><Building2 size={16} style={{ verticalAlign: '-3px' }} /> At the clinic</h3>
                <p className="small mb-0"><strong>{money(d.fees.bookingFee)}</strong> online to book your slot, then the doctor&apos;s fee of <strong>{money(d.fees.clinic)}</strong> at the clinic.</p>
                {d.place && <p className="tiny muted mb-0"><span translate="no">{d.place.name}</span>{d.place.district && <> · <span translate="no">{d.place.district}</span></>}</p>}
              </div>
            )}
          </div>
        </section>

        <section className="pb-section">
          <h2>About</h2>
          <div className="pb-card">
            <dl className="pb-kv">
              {d.place && <><dt>Practises at</dt><dd translate="no">{d.place.name}</dd></>}
              {d.district && <><dt>City</dt><dd><span translate="no">{[d.district, d.state].filter(Boolean).join(', ')}</span>{d.distanceKm != null && <> · {d.distanceKm} km from you</>}</dd></>}
              {d.languages.length > 0 && <><dt>Speaks</dt><dd>{d.languages.join(', ')}</dd></>}
            </dl>
            {d.practice !== 'virtual' && <div style={{ marginTop: 10 }}><NearMeButton near={near} /></div>}
          </div>
        </section>

        {d.timings && d.practice !== 'virtual' && (
          <section className="pb-section">
            <h2>Weekly timings</h2>
            <div className="pb-card">
              <dl className="pb-timings">
                {DAYS.map((day) => <div key={day} style={{ display: 'contents' }}><dt>{day}</dt><dd>{d.timings[day]?.length ? d.timings[day].join(', ') : 'Closed'}</dd></div>)}
              </dl>
            </div>
          </section>
        )}

        <section className="pb-section">
          <h2>What patients say</h2>
          <div className="pb-card">
            {data.reviews.length === 0 ? <p className="small muted mb-0">No reviews yet. Reviews appear here after patients finish a visit.</p> : data.reviews.map((r, i) => (
              <div key={i} className="pb-review">
                <div className="row between small"><strong translate="no">{r.name}</strong><span className="pb-stars"><span aria-hidden="true">{'★'.repeat(r.stars)}</span><span className="muted">{'★'.repeat(5 - r.stars)}</span></span></div>
                {r.text && <p className="small mb-0">{r.text}</p>}
                {r.date && <span className="tiny muted">{new Date(r.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
              </div>
            ))}
          </div>
          <p className="tiny muted">Only patients who completed a visit can leave a review. Names are shortened for privacy.</p>
        </section>
      </div>
      <aside className="pb-side stack">
        <div className="pb-cta">
          <h3>Book a consult</h3>
          <p>{d.availability.available ? <>Available now. </> : d.availability.next ? <>Next slot: {d.availability.next}. </> : null}Pick video or clinic, a time, and pay securely.</p>
          <button type="button" className="btn clay" onClick={book}><Clock /> Book a consult <ArrowRight /></button>
        </div>
        <ShareBar title={`${d.name} — ${d.specialty}`} path={`/find/doctors/${d.slug}`} text={`${d.name}, ${d.specialty}${d.district ? `, ${d.district}` : ''} — book on Sehatra:`} />
      </aside>
    </div>
  );
}

export default function Doctors() {
  const { slug } = useParams();
  return <PublicPage>{slug ? <DoctorProfile key={slug} slug={slug} /> : <DoctorList />}</PublicPage>;
}
