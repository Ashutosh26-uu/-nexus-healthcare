import { Link, useParams, useSearchParams } from 'react-router-dom';
import { MapPin, Home as HomeIcon, BadgeCheck, Landmark, Clock, FileText, Smartphone, ArrowRight, FlaskConical } from 'lucide-react';
import { useSeo } from '../../seo';
import { PublicPage, ShareBar, NearMeButton, Note, SkeletonList, Stars } from './PublicShell';
import { useContinue, useNearMe, usePublicJson, money, hours, qs } from './kit';
import { PackageCard } from './LabTests';

function LabBadges({ l }) {
  return (
    <div className="pb-tags">
      <span className="badge green"><BadgeCheck /> Verified by Nexus</span>
      {l.nabl && <span className="badge sky"><BadgeCheck /> NABL accredited</span>}
      {l.homeCollection && <span className="badge"><HomeIcon /> Home collection</span>}
      {l.government && <span className="badge clay"><Landmark /> Government</span>}
    </div>
  );
}

function LabList() {
  const [params, setParams] = useSearchParams();
  const near = useNearMe();
  const district = params.get('district') || '';
  const { data, error } = usePublicJson(`/public/labs${qs({ district: near.loc ? '' : district, ...(near.loc || {}) })}`);
  useSeo({
    title: `Verified labs & diagnostic centres${district ? ` in ${district}` : ''} | Nexus Healthcare`,
    description: 'Verified labs with test prices, NABL accreditation, home sample collection and real patient ratings. Book a test online.',
    path: '/find/labs',
  });
  return (
    <div className="stack lg">
      <section className="pb-hero">
        <span className="pb-eyebrow">Verified labs</span>
        <h1>Labs &amp; diagnostic centres</h1>
        <p>Every lab here is verified by our team. See prices for each test, report times and home collection — then book online.</p>
      </section>
      <div className="pb-filters">
        {!near.loc && (
          <select className="select" value={district} onChange={(e) => { const p = new URLSearchParams(params); if (e.target.value) p.set('district', e.target.value); else p.delete('district'); setParams(p, { replace: true }); }} aria-label="City or district">
            <option value="">All cities</option>
            {(data?.districts || []).map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
        )}
        <NearMeButton near={near} />
        <Link to="/lab-tests" className="chip">Compare test prices</Link>
      </div>
      {error ? <Note tone="rose">{error.message}</Note> : !data ? <SkeletonList n={3} h={120} /> : data.labs.length === 0 ? <div className="pb-card pb-empty">No verified lab here yet.</div> : (
        <div className="pb-grid two">
          {data.labs.map((l) => (
            <Link key={l.slug} to={`/find/labs/${l.slug}`} className="pb-card">
              <h3 translate="no">{l.name}</h3>
              <span className="tiny muted">{l.kind} · <span translate="no">{[l.district, l.state].filter(Boolean).join(', ')}</span></span>
              <div className="pb-meta">
                <Stars rating={l.rating} count={l.reviewCount} />
                <span><FlaskConical /> {l.testsOffered} tests</span>
                {l.hours && <span><Clock /> {l.hours}</span>}
                {l.distanceKm != null && <span><MapPin /> {l.distanceKm} km</span>}
              </div>
              <LabBadges l={l} />
            </Link>
          ))}
        </div>
      )}
      <ShareBar title="Verified labs near you — compare prices" path="/find/labs" />
    </div>
  );
}

function LabProfile({ slug }) {
  const go = useContinue();
  const near = useNearMe();
  const { data, error } = usePublicJson(`/public/labs/${encodeURIComponent(slug)}${qs(near.loc || {})}`);
  useSeo(data ? { ...data.seo, path: `/find/labs/${data.lab.slug}`, jsonLd: data.jsonLd } : {});
  if (error) return <Note tone="rose">{error.status === 404 ? 'We couldn’t find this lab — it may no longer be listed.' : error.message} <Link to="/find/labs">See all labs</Link></Note>;
  if (!data) return <SkeletonList n={3} h={130} />;
  const l = data.lab;
  const book = (code) => go(`/patient/tests${qs({ book: code, lab: l.slug })}`);
  return (
    <div className="pb-layout">
      <div className="stack lg">
        <nav className="pb-crumbs" aria-label="Breadcrumb"><Link to="/find/labs">Labs</Link><span>/</span><span translate="no">{l.name}</span></nav>
        <section className="pb-card">
          <h1 className="serif" style={{ fontSize: '1.5rem', margin: '0 0 4px' }} translate="no">{l.name}</h1>
          <div className="small muted">{l.kind} · <span translate="no">{[l.district, l.state].filter(Boolean).join(', ')}</span>{l.distanceKm != null && <> · {l.distanceKm} km from you</>}</div>
          <div className="pb-meta">
            <Stars rating={l.rating} count={l.reviewCount} />
            {l.hours && <span><Clock /> {l.hours}</span>}
            <span><Smartphone /> Reports via {l.reportVia.join(', ')}</span>
          </div>
          <LabBadges l={l} />
          <div style={{ marginTop: 10 }}><NearMeButton near={near} /></div>
        </section>
        <a className="btn clay pb-mobile-cta" href="#lab-tests-list">Choose a test to book <ArrowRight /></a>

        <section className="pb-section" id="lab-tests-list">
          <h2>Tests &amp; prices</h2>
          <div className="stack">
            {data.tests.map((t) => (
              <div key={t.code} className="pb-card">
                <div className="pb-card-row">
                  <div>
                    <h3><Link to={`/lab-tests/${t.slug}`}>{t.name}</Link></h3>
                    <span className="tiny muted">{t.sample} · {t.prep}</span>
                  </div>
                  <div className="pb-price"><strong>{money(t.price)}</strong><span className="tiny muted"><FileText size={11} /> {hours(t.reportInHours)}</span></div>
                </div>
                <button type="button" className="btn sm secondary" style={{ marginTop: 8 }} onClick={() => book(t.code)}>Book this test <ArrowRight /></button>
              </div>
            ))}
          </div>
        </section>

        {data.packages.length > 0 && (
          <section className="pb-section">
            <h2>Health check-up packages</h2>
            <div className="stack">{data.packages.map((k) => <PackageCard key={k.id} k={k} onBook={() => go(`/patient/tests${qs({ package: k.id })}`)} />)}</div>
          </section>
        )}
        <Note tone="sky">Prices are set by the lab and can change. Home collection adds {money(data.homeFee)} where offered. You pay {Math.round(data.advanceShare * 100)}% online to confirm and the rest at the lab.</Note>
      </div>
      <aside className="pb-side stack">
        <div className="pb-cta">
          <h3>Book a test here</h3>
          <p>Choose the test, home collection and a time. Pay {Math.round(data.advanceShare * 100)}% online to confirm. Your report comes to your phone.</p>
          <a className="btn clay" href="#lab-tests-list">Choose a test <ArrowRight /></a>
        </div>
        <ShareBar title={`${l.name} — test prices`} path={`/find/labs/${l.slug}`} text={`${l.name}${l.district ? `, ${l.district}` : ''} — test prices on Nexus Healthcare:`} />
      </aside>
    </div>
  );
}

export default function Labs() {
  const { slug } = useParams();
  return <PublicPage>{slug ? <LabProfile key={slug} slug={slug} /> : <LabList />}</PublicPage>;
}
