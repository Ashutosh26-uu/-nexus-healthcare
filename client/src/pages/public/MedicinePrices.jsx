import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Search, Pill, Store, ShieldAlert, ArrowRight, MapPin, Truck, BadgeIndianRupee } from 'lucide-react';
import { useSeo } from '../../seo';
import { cx } from '../../components/ui';
import { PublicPage, ShareBar, NearMeButton, Note, SkeletonList } from './PublicShell';
import { useContinue, useNearMe, usePublicJson, money, qs } from './kit';

const KIND = { generic: 'Generic', brand: 'Brand', jan_aushadhi: 'Jan Aushadhi' };
const KIND_TONE = { generic: 'sky', brand: 'plum', jan_aushadhi: 'green' };

function KindBadge({ kind }) {
  return <span className={cx('badge', KIND_TONE[kind])}>{KIND[kind] || 'Medicine'}</span>;
}

function Disclaimer() {
  return (
    <Note tone="sky">
      <strong>Prices are indicative</strong>, not live MRPs — the chemist&apos;s bill may differ. Ask your doctor or pharmacist before switching to another brand or generic, and <strong>never switch if your doctor wrote &quot;no substitution&quot;</strong>.
    </Note>
  );
}

// Search with live suggestions (brand, generic or salt name).
function MedicineSearch({ autoFocus }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef(null);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setList([]); return undefined; }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/public/medicines${qs({ q: term })}`, { cache: 'no-store', signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : { results: [] })).then((j) => { setList(j.results || []); setHi(0); setOpen(true); }).catch(() => {});
    }, 180);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);
  useEffect(() => {
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const go = (m) => { setOpen(false); setQ(''); navigate(`/medicines/${m.slug}`); };
  const onKey = (e) => {
    if (!open || !list.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(list.length - 1, h + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    if (e.key === 'Escape') setOpen(false);
  };
  return (
    <form className="pb-search" ref={box} role="search" onSubmit={(e) => { e.preventDefault(); if (list[hi]) go(list[hi]); }}>
      <Search />
      <input className="input" value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => list.length && setOpen(true)} onKeyDown={onKey}
        placeholder="Type a medicine — e.g. Dolo 650, Telma 40, Metformin" aria-label="Search medicines" autoComplete="off" autoFocus={autoFocus}
        role="combobox" aria-expanded={open && list.length > 0} aria-controls="pb-med-suggest" />
      {open && q.trim().length >= 2 && (
        <ul className="pb-suggest" id="pb-med-suggest" role="listbox">
          {list.length === 0 && <li className="tiny muted" style={{ padding: 10 }}>No match yet — try the salt name (e.g. paracetamol).</li>}
          {list.map((m, i) => (
            <li key={m.slug} role="option" aria-selected={i === hi}>
              <button type="button" className={cx(i === hi && 'on')} onMouseEnter={() => setHi(i)} onClick={() => go(m)}>
                <span style={{ minWidth: 0 }}><strong translate="no">{m.name}</strong><span className="tiny block">{[m.salt, m.strength].filter(Boolean).join(' · ') || KIND[m.kind]}</span></span>
                <span className="small">{money(m.price)}<span className="tiny"> /{m.unit}</span></span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

function MedicineList() {
  const { data, error } = usePublicJson('/public/medicines');
  useSeo({
    title: 'Medicine price checker — cheaper generics & Jan Aushadhi | Sehatra',
    description: 'Search any common medicine to see its salt, indicative price and cheaper same-salt generic or Jan Aushadhi options, and how many verified chemists near you have it in stock. Free, no sign-in.',
    path: '/medicines',
  });
  return (
    <div className="stack lg">
      <section className="pb-hero">
        <span className="pb-eyebrow">Free tool · no sign-in</span>
        <h1>Medicine price checker</h1>
        <p>See what your medicine costs, which salt it is, and cheaper options with the same salt and strength — including Jan Aushadhi generics.</p>
        <MedicineSearch autoFocus={false} />
      </section>
      <Disclaimer />
      <section className="pb-section">
        <h2>Common medicines</h2>
        {error ? <Note tone="rose">{error.message}</Note> : !data ? <SkeletonList n={4} h={70} /> : (
          <div className="pb-grid three">
            {data.results.map((m) => (
              <Link key={m.slug} to={`/medicines/${m.slug}`} className="pb-card">
                <div className="pb-card-row">
                  <div><h3 translate="no">{m.name}</h3><span className="tiny muted">{[m.salt, m.strength].filter(Boolean).join(' · ') || 'Generic'}</span></div>
                  <div className="pb-price"><strong>{money(m.price)}</strong><span className="tiny muted">per {m.unit}</span></div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
      <ShareBar title="Check medicine prices and cheaper generics — free" path="/medicines" />
    </div>
  );
}

function MedicineDetail({ slug }) {
  const near = useNearMe();
  const go = useContinue();
  const { data, error } = usePublicJson(`/public/medicines/${encodeURIComponent(slug)}${qs(near.loc || {})}`);
  useSeo(data ? { ...data.seo, path: `/medicines/${data.slug}`, jsonLd: data.jsonLd } : {});
  if (error) {
    return (
      <div className="stack lg">
        <Note tone="rose">{error.status === 404 ? 'We don’t have a price for this medicine yet.' : error.message}</Note>
        <MedicineSearch autoFocus />
      </div>
    );
  }
  if (!data) return <SkeletonList n={3} h={110} />;
  const cheaper = data.options.filter((o) => o.saving > 0);
  const dearer = data.options.filter((o) => o.saving <= 0);
  const orderPath = `/patient/medicines/order${qs({ drug: data.name })}`;
  return (
    <div className="pb-layout">
      <div className="stack lg">
        <section className="pb-hero">
          <nav className="pb-crumbs" aria-label="Breadcrumb"><Link to="/medicines">Medicine prices</Link><span>/</span><span translate="no">{data.name}</span></nav>
          <h1><span translate="no">{data.name}</span> price</h1>
          <div className="row wrap" style={{ gap: 8 }}>
            <KindBadge kind={data.kind} />
            {data.salt && <span className="small"><strong>Salt:</strong> <span translate="no">{data.salt}</span></span>}
            {data.strength && <span className="small"><strong>Strength:</strong> {data.strength}</span>}
          </div>
        </section>

        <div className="pb-card">
          <div className="pb-card-row">
            <div>
              <span className="tiny muted">Indicative price</span>
              <div className="pb-big">{money(data.price)}<span className="small muted"> per {data.unit}</span></div>
              {data.pack ? <span className="tiny muted">Sold as one {data.unit}.</span> : <span className="tiny muted">A 10-{data.unit} strip ≈ {money(Math.round(data.price * 10))}</span>}
            </div>
            <BadgeIndianRupee className="muted" />
          </div>
          {data.bestSaving && !data.noSwap && (
            <p className="small mb-0" style={{ marginTop: 10 }}>
              Same salt &amp; strength from <strong>{money(data.bestSaving.price)}</strong> — <span className="pb-save">save {money(data.bestSaving.saving)} ({data.bestSaving.savingPct}%)</span> per {data.unit}.
            </p>
          )}
        </div>

        <button type="button" className="btn clay pb-mobile-cta" onClick={() => go(orderPath)}><Pill /> Order from a chemist near you</button>

        {data.noSwap && <Note tone="rose"><ShieldAlert size={16} style={{ verticalAlign: '-3px' }} /> {data.noSwap}</Note>}

        {data.options.length > 0 && (
          <section className="pb-section">
            <h2>{data.noSwap ? 'Other products with the same salt' : 'Cheaper options with the same salt & strength'}</h2>
            <div className="stack">
              {[...cheaper, ...dearer].map((o) => (
                <Link key={o.slug} to={`/medicines/${o.slug}`} className="pb-card">
                  <div className="pb-card-row">
                    <div>
                      <h3 translate="no">{o.name}</h3>
                      <KindBadge kind={o.kind} />
                    </div>
                    <div className="pb-price">
                      <strong>{money(o.price)}</strong>
                      <span className="tiny muted">per {data.unit}</span>
                      {!data.noSwap && (o.saving > 0
                        ? <span className="tiny pb-save block">save {money(o.saving)} ({o.savingPct}%)</span>
                        : o.saving < 0 ? <span className="tiny muted block">{money(-o.saving)} more</span> : <span className="tiny muted block">same price</span>)}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
        {data.options.length === 0 && <Note>We don&apos;t list other brands for this medicine yet.</Note>}

        <section className="pb-section">
          <h2>In stock near you</h2>
          <div className="pb-card stack">
            <NearMeButton near={near} />
            {data.stock.scope === 'near' ? (
              <p className="mb-0"><strong>{data.stock.pharmacies}</strong> verified chemist{data.stock.pharmacies === 1 ? '' : 's'} within {data.stock.radiusKm} km {data.stock.pharmacies === 1 ? 'has' : 'have'} this salt in stock right now.</p>
            ) : (
              <p className="mb-0"><strong>{data.stock.pharmacies}</strong> verified chemist{data.stock.pharmacies === 1 ? '' : 's'} on Sehatra {data.stock.pharmacies === 1 ? 'has' : 'have'} this salt in stock right now. Share your location to see the ones near you.</p>
            )}
            {data.stock.stores.length > 0 && (
              <div className="stack" style={{ gap: 8 }}>
                {data.stock.stores.map((s) => (
                  <div key={`${s.name}-${s.distanceKm}`} className="pb-card-row small">
                    <span><Store size={14} style={{ verticalAlign: '-2px' }} /> <strong translate="no">{s.name}</strong>
                      <span className="pb-meta">
                        {s.distanceKm != null && <span><MapPin /> {s.distanceKm} km</span>}
                        {s.janAushadhi && <span className="badge green">Jan Aushadhi</span>}
                        {s.delivery && <span><Truck /> Home delivery</span>}
                      </span>
                    </span>
                    {s.price != null && <span className="pb-price small"><strong>{money(s.price)}</strong><span className="tiny muted">per {data.unit}</span></span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <Disclaimer />
        <MedicineSearch autoFocus={false} />
      </div>

      <aside className="pb-side stack">
        <div className="pb-cta">
          <h3>Order from a chemist near you</h3>
          <p>Pick up at the counter or get it delivered. You choose the chemist and see the price before you pay.</p>
          <button type="button" className="btn clay" onClick={() => go(orderPath)}><Pill /> Order {data.name} <ArrowRight /></button>
        </div>
        <ShareBar title={`${data.name} price and cheaper options`} path={`/medicines/${data.slug}`} text={data.bestSaving ? `${data.name}: same salt from ${money(data.bestSaving.price)} (save ${data.bestSaving.savingPct}%) —` : `${data.name} price —`} />
      </aside>
    </div>
  );
}

export default function MedicinePrices() {
  const { slug } = useParams();
  return <PublicPage>{slug ? <MedicineDetail key={slug} slug={slug} /> : <MedicineList />}</PublicPage>;
}
