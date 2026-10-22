// Public, no-login acquisition pages: medicine price checker, lab test prices, doctor & lab profiles,
// plus /sitemap.xml, /robots.txt and (in production) per-page <title>/meta/JSON-LD in the HTML shell so
// Google and WhatsApp link previews see real content.
//
// Rules: catalogue and business information about VERIFIED doctors, labs and chemists only — never a
// person's phone, email, address, account id, KYC detail or earnings. Ratings come only from real reviews
// (no reviews → "New"). Every API is rate-limited per IP and computed live on each call (no caching).
const fs = require('fs');
const path = require('path');

const slugify = (s) => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/&/g, ' and ').replace(/\+/g, ' plus ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70).replace(/-+$/, '');
const shortId = (id) => slugify(String(id || '').replace(/^[a-z]+_/i, ''));
// Stable: name-city-shortid. A renamed doctor keeps working because lookups fall back to the id suffix.
const entitySlug = (x) => [slugify(x.name), slugify(x.district), shortId(x.id)].filter(Boolean).join('-');
const slugParam = (s) => String(typeof s === 'string' ? s : '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 200);
function findBySlug(list, raw) {
  const s = slugParam(raw);
  if (!s) return null;
  return list.find((x) => entitySlug(x) === s) || list.find((x) => { const id = shortId(x.id); return id && (s === id || s.endsWith(`-${id}`)); }) || null;
}
const round1 = (n) => Math.round(n * 10) / 10;
const reviewName = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  const first = parts[0] || 'Patient';
  const init = (parts[1] || '').replace(/[^A-Za-z\u0900-\u097F]/g, '')[0];
  return init ? `${first} ${init.toUpperCase()}.` : first;
};
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const rupees = (n) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
// City / state only (never a street address) for JSON-LD.
const placeLd = (district, state) => (district ? { areaServed: { '@type': 'City', name: district, ...(state ? { containedInPlace: { '@type': 'State', name: state } } : {}) } } : {});
const DISCLAIMER ='Prices are indicative, not live MRPs. Ask your doctor or pharmacist before switching medicines, and never switch if your doctor wrote "no substitution".';
// Lab test prices are the Sehatra reference list (labs can't enter their own yet); report times are typical turnaround.
const LAB_DISCLAIMER = 'Test prices are indicative (the Sehatra reference price list, not each lab\'s own rate card) and report times are typical. Package prices are set by each lab.';

module.exports = function registerPublicPages(app, deps) {
  const {
    db, catalog, geo, security, clean, own, publicDoctor, doctorStats, practiceOf, bookingOptions, labQuote, testInfo, stockRow,
    MEDICINE_RADIUS_KM, medRadius, LAB_ADVANCE_SHARE, LAB_HOME_FEE, auth, role, activePatient, store, audit, broadcast, dist,
  } = deps;

  const limiter = security.rateLimit({ windowMs: 60000, max: 120, message: 'Too many requests. Please wait a moment.' });
  const pageLimiter = security.rateLimit({ windowMs: 60000, max: 240, message: 'Too many requests. Please wait a moment.' });
  const noStore = (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); };
  const pub = [limiter, noStore];

  const baseUrl = (req) => {
    const env = String(process.env.APP_URL || process.env.PUBLIC_URL || '').trim().replace(/\/+$/, '');
    if (/^https?:\/\/[^\s/]+/.test(env)) return env;
    const host = String(req.get('host') || 'localhost').replace(/[^A-Za-z0-9.:[\]-]/g, '');
    return `${req.protocol}://${host}`;
  };
  // Where "near you" is measured from: device coordinates (rounded to ~100 m) or a district the visitor picked.
  function originOf(req) {
    const lat = Number(req.query.lat); const lng = Number(req.query.lng);
    if (req.query.lat != null && geo.validCoord(lat, lng)) return { lat: Math.round(lat * 1000) / 1000, lng: Math.round(lng * 1000) / 1000 };
    const district = clean(req.query.district, 60);
    if (district) { const g = geo.byDistrict(district, clean(req.query.state, 60)); if (g) return { lat: g.lat, lng: g.lng }; }
    return null;
  }

  // ---------------- medicines ----------------
  let medIx = null; // built once from the static price catalogue
  function medIndex() {
    if (medIx) return medIx;
    const list = []; const seen = new Set();
    const add = (e) => { const slug = slugify(e.name); if (!slug || seen.has(slug)) return; seen.add(slug); list.push({ ...e, slug }); };
    for (const [key, p] of Object.entries(catalog.DRUG_PRICES)) {
      if (p.unit === 'kit') continue; // test kits aren't medicines
      add({ name: key, kind: 'generic', key });
      for (const o of catalog.substitutesFor(key).options || []) add({ name: o.drug, kind: o.type, key });
    }
    medIx = { list, bySlug: new Map(list.map((e) => [e.slug, e])) };
    return medIx;
  }
  const medSummary = (e) => {
    const s = catalog.substitutesFor(e.name);
    const p = catalog.priceOf(e.name);
    return { name: e.name, slug: e.slug, kind: e.kind, salt: s.salt || null, strength: s.strength || null, unit: s.unit || p?.unit || 'unit', price: s.current?.price ?? p?.mrp ?? null };
  };
  const free = (row) => (row ? Math.max(0, row.qty - (row.safetyStock || 0)) : 0);

  function medicineView(e, origin, base, radiusKm = medRadius()) {
    const d = db();
    const s = catalog.substitutesFor(e.name);
    const p = catalog.priceOf(e.name);
    const price = s.current?.price ?? p?.mrp ?? null;
    const options = (s.options || []).map((o) => ({
      name: o.drug, slug: slugify(o.drug), kind: o.type, price: o.price, saving: o.saving,
      savingPct: price ? Math.round((o.saving / price) * 100) : null,
    }));
    const names = [...new Set([e.key, e.name, ...options.map((o) => o.name)])];
    const stocked = d.facilities.filter((f) => f.type === 'pharmacy' && f.verified && names.some((n) => free(stockRow(d, f.id, n)) > 0))
      .map((f) => ({ f, km: origin ? geo.km(origin, geo.pointOf(f)) : null }));

    const near = origin ? stocked.filter((x) => x.km !== null && x.km <= radiusKm).sort((a, b) => a.km - b.km) : stocked;
    // No "save X%" pitch for medicines that must not be switched at the counter (e.g. insulin).
    const best = s.noSwap ? null : options.filter((o) => o.saving > 0).sort((a, b) => b.saving - a.saving)[0] || null;
    const label = [s.salt, s.strength].filter(Boolean).join(' ');
    const seo = {
      title: `${e.name} price${best ? ' — cheaper generic & Jan Aushadhi options' : ''} | Sehatra`,
      description: `${e.name}${label ? ` (${label})` : ''}: indicative price ${price !== null ? `${rupees(price)} per ${s.unit || p?.unit || 'unit'}` : 'not listed'}.${best ? ` Same salt & strength from ${rupees(best.price)} — save ${best.savingPct}%.` : ''} See verified chemists that have it in stock near you.`,
    };
    return {
      name: e.name, slug: e.slug, kind: e.kind, generic: e.key, salt: s.salt || null, strength: s.strength || null,
      unit: s.unit || p?.unit || 'unit', pack: !!p?.pack, price, noSwap: s.noSwap || null, options, bestSaving: best,
      stock: {
        scope: origin ? 'near' : 'network', radiusKm: origin ? radiusKm : null, pharmacies: near.length,
        // Store names only when the visitor shared a location — and only verified chemists.
        stores: origin ? near.slice(0, 8).map(({ f, km }) => ({
          name: f.name, district: f.district || null, distanceKm: km, janAushadhi: !!f.generic, delivery: !!f.delivery,
          price: p ? Math.round(p.mrp * (f.priceFactor || 1) * 100) / 100 : null,
        })) : [],
      },
      indicative: true, disclaimer: DISCLAIMER, seo,
      jsonLd: {
        '@context': 'https://schema.org', '@type': 'Drug', name: e.name, url: `${base}/medicines/${e.slug}`,
        ...(s.salt ? { activeIngredient: s.salt, nonProprietaryName: s.salt } : {}),
        ...(s.strength ? { availableStrength: { '@type': 'DrugStrength', description: s.strength } } : {}),
        ...(e.kind !== 'generic' ? { isProprietary: e.kind === 'brand' } : {}),
        description: seo.description,
      },
    };
  }

  app.get('/api/public/medicines', pub, (req, res) => {
    const q = clean(req.query.q, 60).toLowerCase().replace(/\s+/g, ' ');
    const { list } = medIndex();
    if (!q) return res.json({ results: list.filter((e) => e.kind === 'generic').map(medSummary), indicative: true });
    const qn = q.replace(/\s+/g, '');
    const hits = list.map((e) => {
      const n = e.name.toLowerCase(); const nn = n.replace(/\s+/g, '');
      const salt = String(catalog.substitutesFor(e.name).salt || '').toLowerCase();
      const score = nn.startsWith(qn) ? 3 : n.split(/[\s-]+/).some((w) => w.startsWith(q)) ? 2 : nn.includes(qn) || salt.includes(q) ? 1 : 0;
      return { e, score };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.e.name.length - b.e.name.length).slice(0, 10);
    res.json({ results: hits.map((x) => medSummary(x.e)), indicative: true });
  });

  app.get('/api/public/medicines/:slug', pub, (req, res) => {
    const e = medIndex().bySlug.get(slugParam(req.params.slug));
    if (!e) return res.status(404).json({ error: 'We don\'t have a price for this medicine yet.' });
    res.json(medicineView(e, originOf(req), baseUrl(req), medRadius(req.query.radiusKm)));
  });

  // ---------------- lab tests & labs ----------------
  const testSlug = (code) => slugify(catalog.TESTS[code]?.name || code);
  const testCodeOf = (raw) => {
    const p = typeof raw === 'string' ? raw.trim() : '';
    if (own(catalog.TESTS, p)) return p;
    const s = slugParam(p);
    return Object.keys(catalog.TESTS).find((c) => testSlug(c) === s || slugify(c) === s) || null;
  };
  const verifiedLabs = (d) => d.facilities.filter((f) => f.type === 'lab' && f.verified);
  const offers = (lab, code) => !lab.tests || lab.tests.includes(code);
  const labRating = (lab) => { const r = lab.reviewStats || { count: 0, sum: 0 }; return r.count ? { rating: round1(r.sum / r.count), reviewCount: r.count } : { rating: null, reviewCount: 0 }; };
  function labCard(lab, origin) {
    return {
      slug: entitySlug(lab), name: lab.name, kind: lab.subtype === 'diagnostic' ? 'Diagnostic centre' : 'Lab', district: lab.district || null, state: lab.state || null,
      hours: lab.hours || null, nabl: !!lab.nabl, government: !!lab.government, homeCollection: !!lab.homeCollection, reportVia: lab.reportVia || ['App'],
      ...labRating(lab), distanceKm: origin ? geo.km(origin, geo.pointOf(lab)) : null,
      testsOffered: Object.keys(catalog.TESTS).filter((c) => offers(lab, c)).length,
    };
  }
  const testCard = (code) => { const t = testInfo({ code }); return { code, slug: testSlug(code), name: t.name, sample: t.sample, prep: t.prep, tatHours: t.tatHours, imaging: !!catalog.TESTS[code]?.imaging }; };
  function packagesOf(labs, origin, { code } = {}) {
    const out = [];
    for (const f of labs) {
      for (const k of f.packages || []) {
        if (!k.active || !Array.isArray(k.codes) || (code && !k.codes.includes(code))) continue;
        const q = labQuote(f, k.codes.map((c) => ({ code: c })), origin);
        if (!q.offersAll) continue;
        out.push({
          id: k.id, name: k.name, description: k.description || '', price: k.price, listPrice: q.total, savings: Math.max(0, q.total - k.price),
          tests: q.lines.map((l) => ({ code: l.code, slug: testSlug(l.code), name: l.name })), reportInHours: q.reportInHours,
          lab: { slug: entitySlug(f), name: f.name, district: f.district || null, nabl: !!f.nabl, homeCollection: !!f.homeCollection, ...labRating(f), distanceKm: q.distanceKm },
        });
      }
    }
    return out.sort((a, b) => (a.lab.distanceKm ?? 1e9) - (b.lab.distanceKm ?? 1e9) || a.price - b.price);
  }
  const sortLabs = (list, sort) => list.sort({
    price: (a, b) => a.price - b.price || (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9),
    distance: (a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9) || a.price - b.price,
    rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.reviewCount - a.reviewCount,
    report: (a, b) => a.reportInHours - b.reportInHours || a.price - b.price,
  }[sort] || ((a, b) => a.price - b.price));

  function testView(code, origin, base, sort) {
    const d = db();
    const t = testCard(code);
    const labs = sortLabs(verifiedLabs(d).filter((f) => offers(f, code)).map((f) => {
      const line = labQuote(f, [{ code }], origin).lines[0];
      return { ...labCard(f, origin), price: line?.price ?? null, reportInHours: line?.tatHours ?? null };
    }).filter((l) => l.price !== null), sort);
    const prices = labs.map((l) => l.price);
    const from = prices.length ? Math.min(...prices) : null;
    const seo = {
      title: `${t.name} test price${labs.length ? ` from ${rupees(from)}` : ''} — compare labs | Sehatra`,
      description: `${t.name}: compare indicative prices at ${labs.length} verified lab${labs.length === 1 ? '' : 's'}${from !== null ? ` from ${rupees(from)}` : ''}. Sample: ${t.sample}. Preparation: ${t.prep}. NABL, home collection and report time shown.`,
    };
    return {
      test: t, labs, priceRange: prices.length ? { min: from, max: Math.max(...prices) } : null,
      packages: packagesOf(verifiedLabs(d), origin, { code }), advanceShare: LAB_ADVANCE_SHARE, homeFee: LAB_HOME_FEE, indicative: true, disclaimer: LAB_DISCLAIMER, seo,
      jsonLd: {
        '@context': 'https://schema.org', '@type': 'MedicalTest', name: t.name, url: `${base}/lab-tests/${t.slug}`,
        description: `Sample: ${t.sample}. Preparation: ${t.prep}. Typical report time: about ${t.tatHours} hours.`,
        ...(t.imaging ? { usesDevice: { '@type': 'MedicalDevice', name: t.name } } : {}),
      },
    };
  }

  app.get('/api/public/lab-tests', pub, (req, res) => {
    const d = db(); const origin = originOf(req);
    const labs = verifiedLabs(d);
    const tests = Object.keys(catalog.TESTS).map((code) => {
      const prices = labs.filter((f) => offers(f, code)).map((f) => labQuote(f, [{ code }], origin).lines[0]?.price).filter((x) => x != null);
      return { ...testCard(code), labs: prices.length, fromPrice: prices.length ? Math.min(...prices) : null };
    });
    res.json({ tests, packages: packagesOf(labs, origin).slice(0, 12), advanceShare: LAB_ADVANCE_SHARE, indicative: true, disclaimer: LAB_DISCLAIMER });
  });

  app.get('/api/public/lab-tests/:code', pub, (req, res) => {
    const code = testCodeOf(req.params.code);
    if (!code) return res.status(404).json({ error: 'We couldn\'t find that test.' });
    const sort = ['price', 'distance', 'rating', 'report'].includes(req.query.sort) ? req.query.sort : (originOf(req) ? 'distance' : 'price');
    res.json({ ...testView(code, originOf(req), baseUrl(req), sort), sort });
  });

  app.get('/api/public/packages', pub, (req, res) => {
    res.json({ packages: packagesOf(verifiedLabs(db()), originOf(req)), advanceShare: LAB_ADVANCE_SHARE, homeFee: LAB_HOME_FEE });
  });

  function labView(lab, origin, base) {
    const card = labCard(lab, origin);
    const tests = Object.keys(catalog.TESTS).filter((c) => offers(lab, c)).map((code) => {
      const line = labQuote(lab, [{ code }], origin).lines[0];
      return { ...testCard(code), price: line?.price ?? null, reportInHours: line?.tatHours ?? null };
    });
    const where = [lab.district, lab.state].filter(Boolean).join(', ');
    const seo = {
      title: `${lab.name}${lab.district ? `, ${lab.district}` : ''} — test prices & reviews | Sehatra`,
      description: `${lab.name}${where ? ` in ${where}` : ''}: ${tests.length} tests with prices${card.nabl ? ', NABL accredited' : ''}${card.homeCollection ? ', home sample collection' : ''}. ${card.rating ? `Rated ${card.rating}/5 by ${card.reviewCount} patients.` : 'New on Sehatra.'} Book online with a ${Math.round(LAB_ADVANCE_SHARE * 100)}% advance.`,
    };
    return {
      lab: card, tests, packages: packagesOf([lab], origin), advanceShare: LAB_ADVANCE_SHARE, homeFee: LAB_HOME_FEE, indicative: true, disclaimer: LAB_DISCLAIMER, seo,
      jsonLd: {
        '@context': 'https://schema.org', '@type': ['MedicalClinic', 'DiagnosticLab'], name: lab.name, url: `${base}/find/labs/${card.slug}`,
        ...placeLd(lab.district, lab.state),
        ...(card.rating ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: card.rating, reviewCount: card.reviewCount, bestRating: 5, worstRating: 1 } } : {}),
        availableService: tests.map((t) => ({ '@type': 'MedicalTest', name: t.name })),
      },
    };
  }

  app.get('/api/public/labs', pub, (req, res) => {
    const origin = originOf(req);
    const district = clean(req.query.district, 60).toLowerCase();
    const all = verifiedLabs(db());
    const labs = all.filter((f) => !district || origin || String(f.district || '').toLowerCase() === district).map((f) => labCard(f, origin))
      .sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9) || (b.rating ?? 0) - (a.rating ?? 0));
    res.json({ labs, districts: facets(all.map((f) => f.district)) });
  });

  app.get('/api/public/labs/:slug', pub, (req, res) => {
    const lab = findBySlug(verifiedLabs(db()), req.params.slug);
    if (!lab) return res.status(404).json({ error: 'We couldn\'t find this lab.' });
    res.json(labView(lab, originOf(req), baseUrl(req)));
  });

  // ---------------- doctors ----------------
  const verifiedDoctors = (d) => d.doctors.filter((x) => x.verified);
  function facets(values) {
    const m = new Map();
    for (const v of values) if (v) m.set(v, (m.get(v) || 0) + 1);
    return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }
  // Only the publicDoctor() allowlist, reshaped — plus two booleans (registry checked, Aadhaar QR verified).
  function doctorCard(d, doc, origin) {
    const p = publicDoctor(doc);
    const stats = doctorStats(doc);
    const fac = doc.facilityId ? d.facilities.find((f) => f.id === doc.facilityId && f.verified) : null;
    const practice = practiceOf(doc, fac);
    const opts = bookingOptions(d, doc);
    const a = p.availability || {};
    return {
      slug: entitySlug(doc), name: p.name, specialty: p.specialty || null, qualification: p.qualification || null, experience: p.experience || null,
      languages: Array.isArray(p.languages) ? p.languages : [], district: p.district || null, state: p.state || null,
      practice, place: practice === 'virtual' ? { name: 'Sehatra virtual clinic', kind: 'Video consults' } : fac ? { name: fac.name, kind: fac.subtype === 'clinic' ? 'Clinic' : 'Hospital', district: fac.district || null } : null,
      modes: { video: !!opts.video, clinic: !!opts.clinic },
      fees: { video: opts.fees.video, clinic: opts.clinic ? (p.fee || 0) : null, bookingFee: opts.fees.bookingFee },
      rating: stats.reviewCount ? stats.rating : null, reviewCount: stats.reviewCount, satisfaction: stats.reviewCount ? stats.satisfaction : null,
      availability: { available: !!a.available, label: a.label || null, next: a.next || null },
      verified: { registry: !!doc.registryCheckedAt, aadhaar: !!doc.kyc?.aadhaarVerification?.verified },
      distanceKm: origin && practice !== 'virtual' ? geo.km(origin, geo.pointOf(fac || doc)) : null,
    };
  }
  function doctorView(d, doc, origin, base) {
    const card = doctorCard(d, doc, origin);
    const p = publicDoctor(doc);
    const reviews = (d.reviews || []).filter((r) => r.doctorId === doc.id && Number(r.stars) >= 1).slice(0, 6)
      .map((r) => ({ name: reviewName(r.name), stars: Number(r.stars), text: clean(r.text, 400) || null, date: String(r.at || '').slice(0, 10) || null }));
    const where = [card.place?.name, card.district].filter(Boolean).join(', ');
    const seo = {
      title: `${card.name} — ${card.specialty || 'Doctor'}${card.district ? ` in ${card.district}` : ''} | Book online · Sehatra`,
      description: `${card.name}, ${[card.qualification, card.specialty].filter(Boolean).join(' · ')}${card.experience ? `, ${card.experience} years' experience` : ''}${where ? ` at ${where}` : ''}. ${card.rating ? `Rated ${card.rating}/5 by ${card.reviewCount} patients. ` : ''}Video consult ${rupees(card.fees.video)}.${card.languages.length ? ` Speaks ${card.languages.join(', ')}.` : ''}`,
    };
    return {
      // `id` (from the publicDoctor allowlist) lets the signed-in app open booking for this doctor.
      doctor: { ...card, id: p.id, regNo: p.regNo || null, timings: p.timings || null, eClinicPartner: !!p.eClinicPartner },
      reviews, seo,
      jsonLd: {
        '@context': 'https://schema.org', '@type': 'Physician', name: card.name, url: `${base}/find/doctors/${card.slug}`,
        ...(card.specialty ? { medicalSpecialty: card.specialty } : {}),
        ...(card.languages.length ? { knowsLanguage: card.languages } : {}),
        ...placeLd(card.district, card.state),
        ...(card.place && card.practice !== 'virtual' ? { hospitalAffiliation: { '@type': card.place.kind === 'Clinic' ? 'MedicalClinic' : 'Hospital', name: card.place.name } } : {}),
        ...(card.rating ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: card.rating, reviewCount: card.reviewCount, bestRating: 5, worstRating: 1 } } : {}),
        ...(reviews.length ? { review: reviews.filter((r) => r.text).slice(0, 3).map((r) => ({ '@type': 'Review', author: { '@type': 'Person', name: r.name }, reviewRating: { '@type': 'Rating', ratingValue: r.stars, bestRating: 5 }, reviewBody: r.text, ...(r.date ? { datePublished: r.date } : {}) })) } : {}),
      },
    };
  }

  app.get('/api/public/doctors', pub, (req, res) => {
    const d = db(); const origin = originOf(req);
    const specialty = clean(req.query.specialty, 60);
    const district = clean(req.query.district, 60).toLowerCase();
    const q = clean(req.query.q, 60).toLowerCase();
    const all = verifiedDoctors(d);
    const docDistrict = (doc) => { const f = doc.facilityId && d.facilities.find((x) => x.id === doc.facilityId && x.verified); return (f?.district || doc.district || '').toLowerCase(); };
    const list = all.filter((doc) => (!specialty || doc.specialty === specialty)
      && (!district || docDistrict(doc) === district || String(doc.district || '').toLowerCase() === district || doc.engagement === 'eclinic_partner')
      && (!q || `${doc.name} ${doc.specialty} ${(doc.languages || []).join(' ')}`.toLowerCase().includes(q)))
      .map((doc) => doctorCard(d, doc, origin))
      .sort((a, b) => Number(b.availability.available) - Number(a.availability.available)
        || (origin ? (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9) : 0)
        || (b.rating ?? 0) - (a.rating ?? 0) || b.reviewCount - a.reviewCount);
    const page = Math.max(0, Math.min(50, parseInt(req.query.page, 10) || 0));
    res.json({
      doctors: list.slice(page * 24, page * 24 + 24), total: list.length, page, pageSize: 24,
      specialties: facets(all.map((x) => x.specialty)), districts: facets(all.filter((x) => x.engagement !== 'eclinic_partner').map((x) => x.district)),
    });
  });

  app.get('/api/public/doctors/:slug', pub, (req, res) => {
    const d = db();
    const doc = findBySlug(verifiedDoctors(d), req.params.slug);
    if (!doc) return res.status(404).json({ error: 'We couldn\'t find this doctor.' });
    res.json(doctorView(d, doc, originOf(req), baseUrl(req)));
  });

  // ---------------- "Book this test" without a prescription ----------------
  // A signed-in patient picked a test on the public price page: create (or reuse) a self-booked lab order for it,
  // then the app opens the usual lab booking flow (choose lab → collection → 20% advance) on that order.
  app.post('/api/patient/tests/self-order', auth, role('patient', 'caregiver'), (req, res) => {
    const d = db();
    const p = activePatient(req);
    const code = testCodeOf(clean(req.body?.code, 80));
    if (!code) return res.status(400).json({ error: 'Choose a test from the list.' });
    // The public pages know a lab by its slug; the app may also send its id.
    const labs = verifiedLabs(d).filter((f) => offers(f, code));
    const lab = req.body?.labId ? labs.find((f) => f.id === clean(req.body.labId, 40)) || null : req.body?.lab ? findBySlug(labs, clean(req.body.lab, 200)) : null;
    const open = d.labOrders.find((o) => o.patientId === p.id && o.selfBooked && !o.packageId && o.status === 'ordered' && !o.booking?.paidAt && o.tests.length === 1 && o.tests[0].code === code);
    let o = open;
    if (!o) {
      const mine = d.labOrders.filter((x) => x.patientId === p.id && x.selfBooked && x.status === 'ordered' && !x.booking?.paidAt).length;
      if (mine >= 10) return res.status(429).json({ error: 'You have several unpaid test bookings. Finish or remove one first.' });
      o = { id: store.id('lab'), patientId: p.id, doctorId: null, labId: lab?.id || null, tests: [{ code, name: catalog.nameOfTest(code) }], status: 'ordered', pincode: p.pincode, createdAt: new Date().toISOString(), critical: false, results: [], rxId: null, referredByDoctor: false, sharedRx: null, sharedBy: null, needsBooking: true, selfBooked: true };
      d.labOrders.unshift(o);
      audit(req.user, 'self_ordered_test', p.id, 'lab', `${o.id} · ${o.tests[0].name}`);
    } else if (lab) o.labId = lab.id;
    store.save();
    broadcast('records');
    res.json({ ok: true, order: { id: o.id, tests: o.tests, labId: o.labId, selfBooked: true, status: o.status } });
  });

  // ---------------- sitemap & robots ----------------
  app.get('/sitemap.xml', pageLimiter, (req, res) => {
    const d = db(); const base = baseUrl(req);
    const urls = ['/', '/about', '/medicines', '/lab-tests', '/find/doctors', '/find/labs', '/signup', '/join', '/testimonials'];
    for (const e of medIndex().list) urls.push(`/medicines/${e.slug}`);
    for (const code of Object.keys(catalog.TESTS)) urls.push(`/lab-tests/${testSlug(code)}`);
    const docs = verifiedDoctors(d);
    for (const s of facets(docs.map((x) => x.specialty))) urls.push(`/find/doctors?specialty=${encodeURIComponent(s.name)}`);
    for (const doc of docs) urls.push(`/find/doctors/${entitySlug(doc)}`);
    for (const lab of verifiedLabs(d)) urls.push(`/find/labs/${entitySlug(lab)}`);
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...new Set(urls)].map((u) => `  <url><loc>${esc(base + u)}</loc></url>`).join('\n')}\n</urlset>\n`;
    res.set('Cache-Control', 'no-cache').type('application/xml').send(body);
  });

  app.get('/robots.txt', (req, res) => {
    const portals = ['/api/', '/patient', '/doctor/', '/kiosk', '/hospital', '/lab/', '/pharmacy', '/supply', '/dispatch', '/command', '/admin', '/rx/', '/lab-report/', '/lab-label/', '/invoice/', '/statement/', '/display/'];
    const body = ['User-agent: *', 'Allow: /$', 'Allow: /medicines', 'Allow: /lab-tests', 'Allow: /find/', 'Allow: /signup', 'Allow: /join', ...portals.map((p) => `Disallow: ${p}`), '', `Sitemap: ${baseUrl(req)}/sitemap.xml`, ''].join('\n');
    res.set('Cache-Control', 'no-cache').type('text/plain').send(body);
  });

  // ---------------- production: real <title>/meta/JSON-LD in the HTML shell ----------------
  // WhatsApp/Facebook previews don't run JavaScript, so the public pages are served with their meta filled in.
  if (!dist || !fs.existsSync(path.join(dist, 'index.html'))) return;
  const shell = { html: '', mtime: 0 };
  const readShell = () => {
    const f = path.join(dist, 'index.html');
    const st = fs.statSync(f);
    if (st.mtimeMs !== shell.mtime) { shell.html = fs.readFileSync(f, 'utf8'); shell.mtime = st.mtimeMs; }
    return shell.html;
  };
  const STATIC_META = {
    // Home: the brand page. Title leads with the name (brand searches) and then what people actually type.
    '/': { title: 'Sehatra — Online doctor consultation, lab tests & medicines near you', description: 'Sehatra (sehat + yatra) brings care to every village and city: consult verified doctors by video or in clinic, book lab tests, compare medicine prices and keep your family\'s records in one Health Passport.' },
    '/medicines': { title: 'Medicine price checker — cheaper generics & Jan Aushadhi | Sehatra', description: 'Search any common medicine to see its salt, indicative price and cheaper same-salt generic or Jan Aushadhi options, and how many verified chemists near you have it in stock. Free, no sign-in.' },
    '/lab-tests': { title: 'Lab test prices — compare verified labs near you | Sehatra', description: 'Compare prices, report times, NABL accreditation and home collection for blood tests, X-ray, ultrasound and ECG at verified labs. Book online with a 20% advance.' },
    '/find/doctors': { title: 'Find a verified doctor — book video or clinic consults | Sehatra', description: 'Verified doctors by specialty and city with real patient ratings, languages, fees and live availability. Book a video or clinic consult online.' },
    '/find/labs': { title: 'Verified labs & diagnostic centres near you | Sehatra', description: 'Verified labs with test prices, NABL accreditation, home sample collection and real patient ratings. Book a test online.' },
  };
  function metaFor(req) {
    const base = baseUrl(req); const d = db();
    const p = req.path.replace(/\/+$/, '') || '/';
    // Organization + WebSite for the home page: lets search engines show the Sehatra name and logo for brand searches.
    if (p === '/') {
      return { ...STATIC_META['/'], canonical: `${base}/`, jsonLd: { '@context': 'https://schema.org', '@graph': [
        { '@type': 'MedicalOrganization', '@id': `${base}/#org`, name: 'Sehatra', alternateName: ['Sehatra Health', 'Sehatra Healthcare'], url: `${base}/`, logo: `${base}/icons/icon-512.png`, description: STATIC_META['/'].description, medicalSpecialty: 'PrimaryCare', areaServed: 'IN' },
        { '@type': 'WebSite', '@id': `${base}/#site`, name: 'Sehatra', url: `${base}/`, publisher: { '@id': `${base}/#org` }, inLanguage: 'en-IN' },
      ] } };
    }
    if (STATIC_META[p]) return { ...STATIC_META[p], canonical: base + p + (p === '/find/doctors' && req.query.specialty ? `?specialty=${encodeURIComponent(clean(req.query.specialty, 60))}` : '') };
    let m;
    if ((m = p.match(/^\/medicines\/([^/]+)$/))) { const e = medIndex().bySlug.get(slugParam(m[1])); if (e) { const v = medicineView(e, null, base); return { ...v.seo, jsonLd: v.jsonLd, canonical: `${base}/medicines/${e.slug}` }; } }
    if ((m = p.match(/^\/lab-tests\/([^/]+)$/))) { const c = testCodeOf((() => { try { return decodeURIComponent(m[1]); } catch { return ''; } })()); if (c) { const v = testView(c, null, base, 'price'); return { ...v.seo, jsonLd: v.jsonLd, canonical: `${base}/lab-tests/${v.test.slug}` }; } }
    if ((m = p.match(/^\/find\/doctors\/([^/]+)$/))) { const doc = findBySlug(verifiedDoctors(d), m[1]); if (doc) { const v = doctorView(d, doc, null, base); return { ...v.seo, jsonLd: v.jsonLd, canonical: `${base}/find/doctors/${v.doctor.slug}` }; } }
    if ((m = p.match(/^\/find\/labs\/([^/]+)$/))) { const lab = findBySlug(verifiedLabs(d), m[1]); if (lab) { const v = labView(lab, null, base); return { ...v.seo, jsonLd: v.jsonLd, canonical: `${base}/find/labs/${v.lab.slug}` }; } }
    return null;
  }
  const inject = (html, meta) => {
    const tags = [
      `<link rel="canonical" href="${esc(meta.canonical)}" />`,
      `<meta property="og:type" content="website" />`, // og:site_name is already in the shell
      `<meta property="og:title" content="${esc(meta.title)}" />`, `<meta property="og:description" content="${esc(meta.description)}" />`,
      `<meta property="og:url" content="${esc(meta.canonical)}" />`, `<meta name="twitter:card" content="summary" />`,
      meta.jsonLd ? `<script type="application/ld+json" data-seo="1">${JSON.stringify(meta.jsonLd).replace(/</g, '\\u003c')}</script>` : '',
    ].join('');
    return html.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${esc(meta.title)}</title>`)
      .replace(/<meta name="description"[^>]*>/, () => `<meta name="description" content="${esc(meta.description)}" />`)
      .replace('</head>', () => `${tags}</head>`);
  };
  app.get(['/', '/medicines', '/medicines/:slug', '/lab-tests', '/lab-tests/:code', '/find/doctors', '/find/doctors/:slug', '/find/labs', '/find/labs/:slug'], pageLimiter, (req, res) => {
    let html;
    try { html = readShell(); } catch { return res.status(500).send('Not built'); }
    const meta = metaFor(req);
    res.set('Cache-Control', 'no-cache').type('html');
    if (!meta) return res.status(404).send(html); // the SPA shows its own "not found"
    res.send(inject(html, meta));
  });
};

module.exports.slugify = slugify;
