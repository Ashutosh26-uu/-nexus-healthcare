import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FlaskConical, Droplet, Utensils, FileText, MapPin, Home as HomeIcon, BadgeCheck, Landmark, Gift, ArrowRight, Clock } from 'lucide-react';
import { useSeo } from '../../seo';
import { cx } from '../../components/ui';
import { useSupport, telHref } from '../../config';
import { PublicPage, ShareBar, NearMeButton, Note, SkeletonList, Stars } from './PublicShell';
import { useContinue, useNearMe, usePublicJson, money, hours, qs } from './kit';

const SORTS = [{ v: 'price', label: 'Lowest price' }, { v: 'distance', label: 'Nearest' }, { v: 'rating', label: 'Top rated' }, { v: 'report', label: 'Fastest report' }];

export function PackageCard({ k, onBook }) {
  return (
    <div className="pb-card">
      <div className="pb-card-row">
        <div>
          <h3><Gift size={15} style={{ verticalAlign: '-2px' }} /> {k.name}</h3>
          <Link to={`/find/labs/${k.lab.slug}`} className="small" translate="no">{k.lab.name}</Link>
          {k.description && <p className="tiny muted mb-0">{k.description}</p>}
        </div>
        <div className="pb-price">
          <strong>{money(k.price)}</strong>
          {k.savings > 0 ? <span className="tiny pb-save">save {money(k.savings)}</span> : <span className="tiny muted">package</span>}
        </div>
      </div>
      <div className="pb-tests" style={{ marginTop: 8 }}>{k.tests.map((t) => <Link key={t.code} to={`/lab-tests/${t.slug}`}>{t.name}</Link>)}</div>
      <div className="pb-meta">
        <Stars rating={k.lab.rating} count={k.lab.reviewCount} />
        <span><FileText /> Report in {hours(k.reportInHours)}</span>
        {k.lab.distanceKm != null && <span><MapPin /> {k.lab.distanceKm} km</span>}
        {k.lab.homeCollection && <span><HomeIcon /> Home collection</span>}
        {k.lab.nabl && <span><BadgeCheck /> NABL</span>}
      </div>
      <button type="button" className="btn sm clay" style={{ marginTop: 10 }} onClick={onBook}>Book this package <ArrowRight /></button>
    </div>
  );
}

function TestList() {
  const go = useContinue();
  const { data, error } = usePublicJson('/public/lab-tests');
  useSeo({
    title: 'Lab test prices — compare verified labs near you | Sehatra',
    description: 'Compare prices, report times, NABL accreditation and home collection for blood tests, X-ray, ultrasound and ECG at verified labs. Book online with a 20% advance.',
    path: '/lab-tests',
  });
  return (
    <div className="stack lg">
      <section className="pb-hero">
        <span className="pb-eyebrow">Free tool · no sign-in</span>
        <h1>Lab test prices</h1>
        <p>Compare what each verified lab charges, how fast the report comes, NABL accreditation and home sample collection — then book in a minute.</p>
      </section>
      {error ? <Note tone="rose">{error.message}</Note> : !data ? <SkeletonList n={4} h={90} /> : (
        <>
          <div className="pb-grid three">
            {data.tests.map((t) => (
              <Link key={t.code} to={`/lab-tests/${t.slug}`} className="pb-card">
                <div className="pb-card-row">
                  <div><h3>{t.name}</h3><span className="tiny muted">{t.sample}</span></div>
                  <div className="pb-price">{t.fromPrice != null ? <><span className="tiny muted">from</span><strong>{money(t.fromPrice)}</strong></> : <span className="tiny muted">No lab yet</span>}</div>
                </div>
                <div className="pb-meta">
                  <span><Utensils /> {t.prep}</span>
                  <span><FlaskConical /> {t.labs} lab{t.labs === 1 ? '' : 's'}</span>
                </div>
              </Link>
            ))}
          </div>
          {data.packages.length > 0 && (
            <section className="pb-section">
              <h2>Health check-up packages</h2>
              <div className="pb-grid two">{data.packages.map((k) => <PackageCard key={`${k.lab.slug}-${k.id}`} k={k} onBook={() => go(`/patient/tests${qs({ package: k.id })}`)} />)}</div>
            </section>
          )}
        </>
      )}
      <Note tone="sky">Prices are set by each lab and can change. You pay 20% online to confirm a booking and the rest at the lab. Ask your doctor which tests you need.</Note>
      <ShareBar title="Compare lab test prices near you — free" path="/lab-tests" />
    </div>
  );
}

function TestDetail({ code }) {
  const support = useSupport();
  const near = useNearMe();
  const go = useContinue();
  const [sort, setSort] = useState('');
  const { data, error } = usePublicJson(`/public/lab-tests/${encodeURIComponent(code)}${qs({ ...(near.loc || {}), sort })}`);
  useSeo(data ? { ...data.seo, path: `/lab-tests/${data.test.slug}`, jsonLd: data.jsonLd } : {});
  if (error) return <Note tone="rose">{error.status === 404 ? 'We couldn’t find that test.' : error.message} <Link to="/lab-tests">See all tests</Link></Note>;
  if (!data) return <SkeletonList n={3} h={110} />;
  const t = data.test;
  const book = (labSlug) => go(`/patient/tests${qs({ book: t.code, lab: labSlug })}`);
  const current = sort || data.sort;
  return (
    <div className="pb-layout">
      <div className="stack lg">
        <section className="pb-hero">
          <nav className="pb-crumbs" aria-label="Breadcrumb"><Link to="/lab-tests">Lab test prices</Link><span>/</span><span>{t.name}</span></nav>
          <h1>{t.name} test price</h1>
          <p>{data.priceRange ? <>From <strong>{money(data.priceRange.min)}</strong>{data.priceRange.max !== data.priceRange.min && <> to <strong>{money(data.priceRange.max)}</strong></>} at {data.labs.length} verified lab{data.labs.length === 1 ? '' : 's'}.</> : 'No verified lab offers this test on Sehatra yet.'}</p>
        </section>
        <div className="pb-card">
          <dl className="pb-kv">
            <dt><Droplet size={14} /> Sample</dt><dd>{t.sample}</dd>
            <dt><Utensils size={14} /> Preparation</dt><dd>{t.prep}</dd>
            <dt><Clock size={14} /> Usual report time</dt><dd>about {hours(t.tatHours)}</dd>
          </dl>
        </div>
        {data.labs.length > 0 && <button type="button" className="btn clay pb-mobile-cta" onClick={() => book()}>Book this test <ArrowRight /></button>}

        <section className="pb-section">
          <h2>Labs offering this test</h2>
          <div className="pb-filters" style={{ marginBottom: 10 }}>
            <NearMeButton near={near} />
            {SORTS.filter((s) => s.v !== 'distance' || near.loc).map((s) => (
              <button key={s.v} type="button" className={cx('chip', current === s.v && 'on')} onClick={() => setSort(s.v)}>{s.label}</button>
            ))}
          </div>
          {data.labs.length === 0 ? <div className="pb-card pb-empty">No lab offers this test yet. Ask your doctor{support.phone ? <>, or call <a href={telHref(support.phone)} translate="no">{support.phone}</a> — we&apos;ll help arrange it</> : null}.</div> : (
            <div className="stack">
              {data.labs.map((l) => (
                <div key={l.slug} className="pb-card">
                  <div className="pb-card-row">
                    <div>
                      <h3><Link to={`/find/labs/${l.slug}`} translate="no">{l.name}</Link></h3>
                      <span className="tiny muted">{l.kind} · <span translate="no">{l.district}</span></span>
                    </div>
                    <div className="pb-price"><strong>{money(l.price)}</strong><span className="tiny muted">at the lab</span></div>
                  </div>
                  <div className="pb-meta">
                    <Stars rating={l.rating} count={l.reviewCount} />
                    <span><FileText /> Report in {hours(l.reportInHours)}</span>
                    {l.distanceKm != null && <span><MapPin /> {l.distanceKm} km</span>}
                  </div>
                  <div className="pb-tags">
                    {l.nabl && <span className="badge green"><BadgeCheck /> NABL</span>}
                    {l.homeCollection && <span className="badge sky"><HomeIcon /> Home collection</span>}
                    {l.government && <span className="badge clay"><Landmark /> Government</span>}
                  </div>
                  <button type="button" className="btn sm clay" style={{ marginTop: 10 }} onClick={() => book(l.slug)}>Book this test <ArrowRight /></button>
                </div>
              ))}
            </div>
          )}
        </section>

        {data.packages.length > 0 && (
          <section className="pb-section">
            <h2>Packages that include {t.name}</h2>
            <div className="stack">{data.packages.map((k) => <PackageCard key={`${k.lab.slug}-${k.id}`} k={k} onBook={() => go(`/patient/tests${qs({ package: k.id })}`)} />)}</div>
          </section>
        )}
        <Note tone="sky">Prices are set by each lab and can change. Home collection adds {money(data.homeFee)}. Ask your doctor which tests you need — this page explains, it doesn&apos;t diagnose.</Note>
      </div>
      <aside className="pb-side stack">
        <div className="pb-cta">
          <h3>Book {t.name}</h3>
          <p>Choose a lab, home collection and a time. Pay {Math.round(data.advanceShare * 100)}% online to confirm — the rest at the lab. Report on your phone.</p>
          <button type="button" className="btn clay" onClick={() => book()} disabled={!data.labs.length}>Book this test <ArrowRight /></button>
        </div>
        <ShareBar title={`${t.name} test price — compare labs`} path={`/lab-tests/${t.slug}`} text={data.priceRange ? `${t.name} from ${money(data.priceRange.min)} at verified labs —` : `${t.name} test —`} />
      </aside>
    </div>
  );
}

export default function LabTests() {
  const { code } = useParams();
  return <PublicPage>{code ? <TestDetail key={code} code={code} /> : <TestList />}</PublicPage>;
}
