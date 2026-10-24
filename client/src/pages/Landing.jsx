import { useEffect, useState } from 'react';
import { openCookieSettings } from '../consent';
import { Link, useLocation } from 'react-router-dom';
import {
  ArrowRight, ShieldCheck, Languages, MapPin, Stethoscope, Pill, Building2, FlaskConical, Landmark,
  HeartPulse, QrCode, Truck, Activity, ChevronDown, Lock, Eye, Users, Menu, X, Video, Clock, Check,
} from 'lucide-react';
import Logo from '../components/Logo';
import LanguagePicker from '../components/LanguagePicker';
import { useAuth, ROLE_HOME } from '../auth';
import { cx, fmtNum } from '../components/ui';
import './landing.css';
import { usePublicConfig, useSupport, telHref } from '../config';
import LanguageStrip from '../components/LanguageStrip';

const FAQS = [
  { q: 'I live in a village and don\'t have a smartphone. Can I still use Sehatra?', a: 'Yes. A family member can book for you from their phone, and you can speak your symptoms instead of typing. Sehatra E-Clinics — at your PHC, railway station or panchayat bhawan, with a health worker who checks your BP, sugar and oxygen — are coming soon.' },
  { q: 'Is my health data safe? Who can see it?', a: 'Only people you allow. Every request to see your records comes to you first, and you choose what they see and for how long. Every single view is written to an access log you can read anytime. Government officers only ever see anonymous totals — never your name. Your data is encrypted in storage and in transit.' },
  { q: 'What does a consult cost?', a: 'Booking a visit at a doctor\'s hospital or clinic costs ₹100 online — that confirms your slot and keeps fake bookings away. You pay the doctor\'s own fee at the clinic. Video consults are paid online in full — you see each doctor\'s fee before you book.' },
  { q: 'Are the doctors real and verified?', a: 'Before a doctor can see patients, our team checks their registration number on the official medical register and reviews their degree. You can see their qualification, languages and real patient reviews before you book.' },
  { q: 'Which languages are supported?', a: 'All 22 official Indian languages — from Hindi, Bengali and Tamil to Santali, Dogri and Manipuri — plus regional ones like Bhojpuri and Awadhi, and 40+ world languages including Arabic, Spanish and Swahili. Pick yours from the globe button at the top. You can also speak your symptoms instead of typing.' },
  { q: 'What happens in an emergency?', a: 'If the symptom checker spots danger signs like chest pain or breathlessness, it skips the queue entirely: it tells you to call 108 straight away and shows the nearest hospital with its phone number, so you can get help without waiting.' },
];

const PORTALS = [
  { icon: HeartPulse, title: 'Patients & families', text: 'Your Health Passport, doctors on video, medicines at your door — for you, your kids and your parents.', to: '/signup', cta: 'Create your passport' },
  { icon: Stethoscope, title: 'Doctors', text: 'Run your own clinic, work at one, or consult by video in your free hours. Patients within 20 km find you with your reviews and timings.', to: '/join?track=doctor', cta: 'Join as a doctor' },
  { icon: Building2, title: 'Hospitals & clinics', text: 'List your hospital or clinic for free. Show live beds to the network and accept referrals with a patient summary.', to: '/join?track=facility', cta: 'List your facility' },
  { icon: Pill, title: 'Pharmacies & distributors', text: 'E-prescriptions straight to your counter, live stock, and transfers when a district runs short.', to: '/login', cta: 'Pharmacy sign in' },
  { icon: FlaskConical, title: 'Labs', text: 'Orders in, structured reports out — and critical values reach the doctor in seconds.', to: '/login', cta: 'Lab sign in' },
  { icon: Landmark, title: 'Health officials', text: 'One live picture of beds, doctors, medicines and outbreaks — district to nation.', to: '/login', cta: 'Command center' },
];

const FREE_TOOLS = [
  { icon: Pill, title: 'Medicine price checker', text: 'See the salt, indicative price and cheaper same-salt generics or Jan Aushadhi options — and which chemists near you have it.', to: '/medicines', cta: 'Check a medicine' },
  { icon: FlaskConical, title: 'Lab test prices', text: 'Compare CBC, HbA1c, lipid profile and more across verified labs — price, report time, NABL and home collection.', to: '/lab-tests', cta: 'Compare test prices' },
  { icon: Stethoscope, title: 'Find a doctor', text: 'Verified doctors by specialty and city, with fees, languages, live availability and genuine patient reviews.', to: '/find/doctors', cta: 'Find a doctor' },
];

// Header, footer and the phone "Get started" bar, shared by the home page and the About page.
function Shell({ children, onHome }) {
  const { user } = useAuth();
  const support = useSupport();
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [deep, setDeep] = useState(false); // past the hero: show the sticky bar on phones
  const home = user ? ROLE_HOME[user.role] : null;
  const at = onHome ? '' : '/'; // same-page anchors on the home page, links back to it elsewhere

  useEffect(() => {
    // Scrolling closes the phone menu: it's a fixed panel, so otherwise it would sit over the page while the page moved.
    const onScroll = () => { setScrolled(window.scrollY > 12); setDeep(window.scrollY > 520); setMenu(false); };
    window.addEventListener('scroll', onScroll, { passive: true });
    // Sign-in and sign-up are the next click for most visitors — fetch their code while the page is idle.
    const warm = setTimeout(() => (window.requestIdleCallback || setTimeout)(() => { import('./Login').catch(() => {}); import('./Signup').catch(() => {}); }), 2000);
    return () => { clearTimeout(warm); window.removeEventListener('scroll', onScroll); };
  }, []);
  // The sticky bar lifts the Saathi button above it.
  useEffect(() => {
    document.body.classList.toggle('l-has-cta', deep);
    return () => document.body.classList.remove('l-has-cta');
  }, [deep]);

  return (
    <div className="landing">
      <header className={cx('l-nav', scrolled && 'scrolled')}>
        <div className="l-container l-nav-inner">
          <Logo />
          <nav className={cx('l-links', menu && 'open')} onClick={() => setMenu(false)}>
            <a href={`${at}#tools`}>Free tools</a>
            <Link to="/about">How it works</Link>
            <a href="/about#partners">For doctors &amp; clinics</a>
            <Link to="/testimonials">Testimonials</Link>
            <a href={`${at}#faq`}>FAQ</a>
            <div className="l-links-cta" onClick={(e) => e.stopPropagation()}>
              <LanguagePicker />
              {home ? <Link className="btn" to={home}>Go to dashboard</Link> : (
                <>
                  <Link className="btn ghost" to="/login">Sign in</Link>
                  <Link className="btn" to="/signup">Get started</Link>
                </>
              )}
            </div>
          </nav>
          <button className="icon-btn l-burger" onClick={() => setMenu((v) => !v)} aria-label="Menu">{menu ? <X /> : <Menu />}</button>
        </div>
      </header>

      {children}

      <footer className="l-footer">
        <div className="l-container l-footer-grid">
          <div>
            <Logo />
            <p className="muted small" style={{ marginTop: 12, maxWidth: 300 }}>An independent health-tech startup. Built in India, for every Indian.</p>
            <div className="l-social">
              <a href="https://www.linkedin.com/company/nexus-healthcare-official/" target="_blank" rel="noopener noreferrer" aria-label="Sehatra on LinkedIn" title="Follow us on LinkedIn">
                {/* LinkedIn mark (brand icons aren't in our icon set) */}
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor"><path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z" /></svg>
                <span>LinkedIn</span>
              </a>
            </div>
          </div>
          <div>
            <h4>Product</h4>
            <Link to="/medicines">Medicine price checker</Link><Link to="/lab-tests">Lab test prices</Link><Link to="/find/doctors">Find a doctor</Link><Link to="/find/labs">Labs near you</Link>
            <Link to="/about">How it works</Link><a href="/about#kiosk">E-Clinics</a><Link to="/testimonials">Testimonials</Link><Link to="/privacy">Privacy policy</Link><Link to="/cookies">Cookie policy</Link><button type="button" className="l-footer-link" onClick={openCookieSettings}>Cookie preferences</button>
          </div>
          <div>
            <h4>Partners</h4>
            <Link to="/join?track=doctor">Doctors — join Sehatra</Link><Link to="/join?track=facility">List your clinic or hospital</Link><Link to="/join?track=pharmacy">Medical stores</Link><Link to="/join?track=facility">Labs</Link><Link to="/login">Partner sign in</Link>
          </div>
          <div>
            <h4>Help</h4>
            {support.phone && <a href={telHref(support.phone)} translate="no">{support.phone}</a>}{support.email && <a href={`mailto:${support.email}`} translate="no">{support.email}</a>}{support.hours && <span className="muted small">{support.hours}</span>}<a href="tel:108">Emergency: 108</a>
          </div>
        </div>
        <div className="l-container l-footer-bottom">
          <span>© {new Date().getFullYear()} Sehatra · Made in India</span>
          <span>Sehatra gives guidance, not diagnosis. In an emergency, call 108.</span>
        </div>
      </footer>

      {/* Phones: once past the hero, the next step is always one tap away. */}
      <div className={cx('l-sticky-cta', deep && 'show')} aria-hidden={!deep}>
        <Link to={home || '/signup'} className="btn clay block" tabIndex={deep ? 0 : -1}>{home ? 'Open my dashboard' : 'Get started — it’s free'} <ArrowRight size={18} /></Link>
      </div>
    </div>
  );
}

// Live counts in the hero — real numbers only; the row hides if they can't load.
function useStats() {
  const [stats, setStats] = useState(null); // null = loading, false = failed (row hidden)
  useEffect(() => {
    let alive = true;
    // An error page must not render as "0 doctors"; a failed refresh keeps the last real numbers.
    const load = (first) => fetch('/api/public/stats', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject())).then((s) => alive && setStats(s)).catch(() => alive && first && setStats(false));
    load(true);
    // Live: the server pushes new counts the moment one changes. If the stream can't connect, poll every 30 s instead.
    let es = null;
    try {
      es = new EventSource('/api/public/stats/stream');
      es.onmessage = (e) => { try { if (alive) setStats(JSON.parse(e.data)); } catch { /* ignore a bad frame */ } };
    } catch { es = null; }
    const timer = setInterval(() => { if (document.visibilityState === 'visible' && es?.readyState !== 1) load(false); }, 30000);
    return () => { alive = false; es?.close(); clearInterval(timer); };
  }, []);
  return stats;
}

// Up to three real, approved stories from people who used Sehatra — the section hides when there are none.
function useStories() {
  const [stories, setStories] = useState([]);
  useEffect(() => {
    let alive = true;
    fetch('/api/public/stories', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((r) => alive && r && setStories((r.stories || []).slice(0, 3))).catch(() => {});
    return () => { alive = false; };
  }, []);
  return stories;
}

// The home page: what Sehatra is, what you can do right now, what people say, and answers — about four screens.
export default function Landing() {
  const { user } = useAuth();
  const config = usePublicConfig();
  const support = useSupport();
  const stats = useStats();
  const stories = useStories();
  const [faq, setFaq] = useState(0);
  const home = user ? ROLE_HOME[user.role] : null;
  const isPatient = ['patient', 'caregiver'].includes(user?.role);

  return (
    <Shell onHome>
      {/* ---------- hero ---------- */}
      <section className="l-hero">
        <div className="l-container l-hero-grid">
          <div className="l-hero-copy fade-in">
            <LanguageStrip />
            <span className="l-kicker"><span className="dot green pulse" /> v0.1 is live in India</span>
            <h1>
              A good doctor shouldn&apos;t depend on your{' '}
              <span className="l-underline">pin code.
                <svg viewBox="0 0 220 18" preserveAspectRatio="none" aria-hidden="true"><path d="M3 12 C 40 4, 90 4, 120 9 S 190 15, 217 6" stroke="#d9734e" strokeWidth="5" fill="none" strokeLinecap="round" /></svg>
              </span>
            </h1>
            <p className="l-lead">
              Verified doctors, one health record for your family, and medicines near you — in your language, on your phone.
            </p>
            <div className="row wrap" style={{ gap: 12 }}>
              <Link to={isPatient ? '/patient/consult' : '/find/doctors'} className="btn lg clay"><Stethoscope /> Talk to a doctor</Link>
              {home
                ? <Link to={home} className="btn lg secondary">Open my dashboard <ArrowRight /></Link>
                : <Link to="/signup" className="btn lg secondary">Create a free account <ArrowRight /></Link>}
            </div>
            <div className="l-trust">
              <span><ShieldCheck size={16} /> You approve every view</span>
              <span><Languages size={16} /> 70+ languages, every Indian one</span>
              <span><Lock size={16} /> Encrypted health records</span>
            </div>
          </div>

          <div className="l-hero-art" aria-hidden="true">
            <div className="blob" />
            <div className="art-card art-call">
              <div className="row" style={{ gap: 10 }}>
                <div className="art-ava"><Stethoscope size={18} /></div>
                <div className="grow">
                  <div className="small" style={{ fontWeight: 700 }}>Verified doctor</div>
                  <div className="tiny muted">Video, audio or chat · in your language</div>
                </div>
                <span className="badge green"><Video size={12} /> Consult</span>
              </div>
              <div className="art-video">
                <div className="art-video-inner">
                  <Stethoscope size={34} />
                  <span>See a registered doctor from home or a nearby E-Clinic.</span>
                </div>
              </div>
            </div>
            <div className="art-card art-vitals">
              <div className="tiny muted" style={{ fontWeight: 700, letterSpacing: '.05em' }}>VITALS SHARED WITH YOUR DOCTOR</div>
              <div className="art-vitals-grid">
                <div><span>BP</span><strong>✓</strong></div>
                <div><span>SpO₂</span><strong>✓</strong></div>
                <div><span>Temp</span><strong>✓</strong></div>
                <div><span>Pulse</span><strong>✓</strong></div>
              </div>
            </div>
            <div className="art-card art-passport">
              <div className="row between">
                <span className="tiny" style={{ fontWeight: 700, letterSpacing: '.08em', opacity: .8 }}>HEALTH PASSPORT</span>
                <QrCode size={22} />
              </div>
              <div className="serif" style={{ fontSize: '1.15rem', marginTop: 8 }}>One record for your family</div>
              <div className="tiny" style={{ opacity: .8 }}>Prescriptions · reports · allergies · vaccines</div>
            </div>
            <div className="art-pill"><Clock size={14} /> Reminders for visits &amp; medicines</div>
          </div>
        </div>

        {/* Live numbers — only the ones that are already meaningful. A row of zeros on a young network says
            "empty", not "honest"; tiles appear as each number grows. */}
        {(() => {
          if (!stats) return null;
          const tiles = [
            stats.passports >= 50 && [stats.passports, 'Health Passports'],
            stats.doctorsOnline > 0 && [stats.doctorsOnline, stats.doctorsOnline === 1 ? 'doctor online now' : 'doctors online now'],
            stats.kiosks > 0 && [stats.kiosks, stats.kiosks === 1 ? 'E-Clinic' : 'E-Clinics'],
            stats.passports >= 50 && stats.states > 1 && [stats.states, 'states connected'],
          ].filter(Boolean);
          if (!tiles.length) return null;
          return (
            <div className="l-container">
              <div className="l-stats">
                {tiles.map(([n, label]) => <div key={label}><strong>{fmtNum(n)}</strong><span>{label}</span></div>)}
              </div>
            </div>
          );
        })()}
      </section>

      {/* ---------- three things you can do right now (no sign-in) ---------- */}
      <section className="l-section" id="tools">
        <div className="l-container">
          <div className="l-section-head">
            <span className="eyebrow">Free · no sign-in</span>
            <h2>Try it right now.</h2>
          </div>
          <div className="l-portals">
            {FREE_TOOLS.map((p) => (
              <Link key={p.to} to={p.to} className="l-portal">
                <div className="l-portal-icon"><p.icon /></div>
                <h4>{p.title}</h4>
                <p className="muted small">{p.text}</p>
                <span className="l-portal-cta">{p.cta} <ArrowRight size={15} /></span>
              </Link>
            ))}
          </div>
          <p className="center small mt-2"><Link to="/about">How Sehatra works, E-Clinics and privacy <ArrowRight size={14} className="inline-ic" /></Link></p>
        </div>
      </section>

      {/* ---------- real stories (hidden until there are approved ones) ---------- */}
      {stories.length > 0 && (
        <section className="l-section tint">
          <div className="l-container">
            <div className="l-section-head">
              <span className="eyebrow">From people who use it</span>
              <h2>What people say</h2>
            </div>
            <div className="l-stories">
              {stories.map((s) => (
                <figure key={s.id} className="l-story">
                  <blockquote>{s.text}</blockquote>
                  <figcaption><strong translate="no">{s.name}</strong><span className="tiny muted">{[s.role, s.place].filter(Boolean).join(' · ')}</span></figcaption>
                </figure>
              ))}
            </div>
            <p className="center small mt-2"><Link to="/testimonials">Read more stories <ArrowRight size={14} className="inline-ic" /></Link></p>
          </div>
        </section>
      )}

      {/* ---------- faq ---------- */}
      <section className={cx('l-section', stories.length === 0 && 'tint')} id="faq">
        <div className="l-container l-faq-wrap">
          <div>
            <span className="eyebrow">Questions</span>
            <h2>Things people ask us</h2>
            <p className="muted">Can&apos;t find your answer? Tap the <strong>Saathi</strong> chat button{support.phone ? <> — or call us on <a href={telHref(support.phone)} translate="no">{support.phone}</a></> : null}.</p>
          </div>
          <div className="l-faq">
            {FAQS.map((f, i) => (
              <div key={f.q} className={cx('l-faq-item', faq === i && 'open')}>
                <button onClick={() => setFaq(faq === i ? -1 : i)} aria-expanded={faq === i}>
                  <span>{f.q}</span>
                  <ChevronDown size={19} />
                </button>
                <div className="l-faq-a"><p className="muted">{f.a}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <FinalCta demo={config?.demo === true} />
    </Shell>
  );
}

function FinalCta({ demo }) {
  return (
    <section className="l-section">
      <div className="l-container">
        <div className="l-cta">
          <div>
            <h2>Create your family&apos;s Health Passport today.</h2>
            <p>Takes two minutes with your email. Free for patients.</p>
          </div>
          <div className="row wrap" style={{ gap: 12 }}>
            <Link to="/signup" className="btn lg clay">Get started <ArrowRight /></Link>
            {demo ? <Link to="/login" className="btn lg l-cta-ghost">Try the demo accounts</Link> : <Link to="/join" className="btn lg l-cta-ghost">Join as a doctor or clinic</Link>}
          </div>
        </div>
      </div>
    </section>
  );
}

// How it works, E-Clinics, partners and privacy — moved off the home page so it stays short.
export function About() {
  const config = usePublicConfig();
  const { hash } = useLocation();
  // Arriving at /about#partners: the section only exists after this render, so scroll to it here.
  useEffect(() => {
    if (!hash) { window.scrollTo(0, 0); return; }
    const el = document.getElementById(hash.slice(1));
    if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }, [hash]);

  return (
    <Shell>
      <section className="l-section l-about-top" id="how">
        <div className="l-container">
          <div className="l-section-head">
            <span className="eyebrow">How it works</span>
            <h1 className="l-about-title">From “I don&apos;t feel well” to medicine in hand.</h1>
            <p className="muted">Five steps — on your phone, or at an E-Clinic near you.</p>
          </div>
          <ol className="l-journey">
            {[
              { icon: MapPin, t: 'Start anywhere', d: 'Email code on your phone, or your Health Passport QR at the E-Clinic.' },
              { icon: Activity, t: 'Vitals at the E-Clinic', d: 'BP, oxygen, temperature and weight go straight to the doctor.' },
              { icon: HeartPulse, t: 'Check symptoms', d: 'Saathi asks a few questions: see a doctor now, book, or call 108.' },
              { icon: Video, t: 'See a verified doctor', d: 'Near you or online. They see only what you allow.' },
              { icon: Pill, t: 'Medicines and tests', d: 'Nearby chemists, cheaper generics, lab prices upfront.' },
            ].map((s, i) => (
              <li key={s.t} className="l-step">
                <span className="l-step-num">{i + 1}</span>
                <div className="l-step-icon"><s.icon /></div>
                <h4>{s.t}</h4>
                <p className="muted small mb-0">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="l-section tint">
        <div className="l-container">
          <div className="l-section-head">
            <span className="eyebrow">One network, four promises</span>
            <h2>What one connected network gives you</h2>
          </div>
          {/* A walkthrough path, not four paragraphs: one line per promise, joined left to right (top to bottom on phones). */}
          <ol className="l-path">
            {[
              { icon: Stethoscope, tone: 'green', t: 'A doctor near you', d: 'Verified, in your language, free now or booked.' },
              { icon: QrCode, tone: 'clay', t: 'One record for life', d: 'Allergies, prescriptions, reports — shared only with your OK.' },
              { icon: Truck, tone: 'sky', t: 'Medicines that find you', d: 'Nearby chemists, cheaper generics, pickup or delivery.' },
              { icon: Activity, tone: 'sun', t: 'Outbreaks spotted early', d: 'Anonymous pin-code signals for health officials. No names.' },
            ].map((s, i) => (
              <li key={s.t} className="l-path-node">
                <div className={cx('l-cap-icon l-path-icon', s.tone)}><s.icon /><span className="l-path-num">{i + 1}</span></div>
                <h3>{s.t}</h3>
                <p className="muted small mb-0">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="l-section" id="kiosk">
        <div className="l-container l-kiosk">
          <div className="l-kiosk-art" aria-hidden="true">
            <KioskIllustration />
          </div>
          <div>
            <span className="eyebrow">The E-Clinic · coming soon</span>
            <h2>A small white box that brings the city&apos;s doctors to the village.</h2>
            <p className="muted">Placed at PHCs, railway stations, panchayat bhawans and pharmacies. Run by a trained local health worker, so no one needs a smartphone — or needs to read.</p>
            <ul className="l-checks">
              <li><Check /> Touchscreen with voice guidance in your language</li>
              <li><Check /> BP, SpO₂, temperature, weight and sugar checked by the health worker</li>
              <li><Check /> Video consult with a verified doctor</li>
              <li><Check /> Prescription printed on the spot, sent to the nearest pharmacy</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="l-section tint" id="partners">
        <div className="l-container">
          <div className="l-section-head">
            <span className="eyebrow">Built for everyone in the chain</span>
            <h2>Eight portals. One shared record.</h2>
            <p className="muted">Each role sees exactly what it needs — nothing more.</p>
          </div>
          <div className="l-portals">
            {PORTALS.map((p) => (
              <Link key={p.title} to={p.to} className="l-portal">
                <div className="l-portal-icon"><p.icon /></div>
                <h4>{p.title}</h4>
                <p className="muted small">{p.text}</p>
                <span className="l-portal-cta">{p.cta} <ArrowRight size={15} /></span>
              </Link>
            ))}
          </div>
          <div className="l-join">
            <div>
              <h3>Run a clinic or hospital? Or a doctor with free evenings?</h3>
              <p className="muted mb-0">List your facility on the network for free — or consult at Sehatra-owned E-Clinics and earn on your own schedule.</p>
            </div>
            <div className="row wrap" style={{ gap: 10 }}>
              <Link to="/join?track=facility" className="btn secondary"><Building2 size={17} /> List my facility</Link>
              <Link to="/join?track=doctor" className="btn clay"><Stethoscope size={17} /> Join as a doctor</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="l-section" id="privacy">
        <div className="l-container l-privacy">
          <div>
            <span className="eyebrow">Your data, your say</span>
            <h2>We built privacy in first — not bolted on later.</h2>
            <p className="muted">Health data is personal. So the patient holds the keys, and everyone else has to ask. <Link to="/privacy">Read the full privacy policy</Link>.</p>
          </div>
          <div className="l-privacy-grid">
            <div className="card flat"><Users className="l-pv-icon" /><h4>Consent for every view</h4><p className="muted small mb-0">Doctors and hospitals request access. You approve what they see, and for how long. Revoke anytime.</p></div>
            <div className="card flat"><Eye className="l-pv-icon" /><h4>See who looked</h4><p className="muted small mb-0">Every view and edit lands in an access log on your phone — with who, when and why.</p></div>
            <div className="card flat"><ShieldCheck className="l-pv-icon" /><h4>Emergencies, carefully</h4><p className="muted small mb-0">“Break-glass” access shows only critical info, expires in an hour, notifies you, and is reviewed by our team.</p></div>
            <div className="card flat"><Lock className="l-pv-icon" /><h4>Encrypted</h4><p className="muted small mb-0">Encrypted in storage and in transit. Officials see anonymous totals, never names.</p></div>
          </div>
        </div>
      </section>

      <FinalCta demo={config?.demo === true} />
    </Shell>
  );
}

function KioskIllustration() {
  return (
    <svg viewBox="0 0 420 440" className="kiosk-svg">
      <ellipse cx="210" cy="412" rx="150" ry="16" fill="#e8dfd0" />
      {/* body */}
      <rect x="120" y="40" width="180" height="360" rx="26" fill="#fff" stroke="#e1d8c9" strokeWidth="2" />
      <rect x="132" y="52" width="156" height="12" rx="6" fill="#f3eee5" />
      <circle cx="210" cy="58" r="3.5" fill="#2b3a38" />
      {/* screen */}
      <rect x="138" y="76" width="144" height="150" rx="12" fill="#0f5c4d" />
      <text x="152" y="102" fill="#fbf7f0" fontSize="12" fontFamily="Fraunces, serif" fontWeight="600">नमस्ते</text>
      <text x="152" y="118" fill="#bfe0d4" fontSize="8.5">अपनी भाषा चुनें</text>
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={152 + (i % 2) * 62} y={128 + Math.floor(i / 2) * 40} width="56" height="32" rx="7" fill={i === 0 ? '#d9734e' : 'rgba(255,255,255,.12)'} />
      ))}
      <text x="163" y="148" fill="#fff" fontSize="9" fontWeight="700">हिन्दी</text>
      <text x="223" y="148" fill="#e3f0ea" fontSize="9">English</text>
      <text x="163" y="188" fill="#e3f0ea" fontSize="9">বাংলা</text>
      <text x="225" y="188" fill="#e3f0ea" fontSize="9">தமிழ்</text>
      {/* devices shelf */}
      <rect x="138" y="242" width="144" height="58" rx="10" fill="#f6f1e8" />
      <rect x="150" y="254" width="34" height="34" rx="8" fill="#fff" stroke="#e1d8c9" />
      <path d="M160 271h5l3-6 4 12 3-6h5" stroke="#d9734e" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="193" y="254" width="34" height="34" rx="8" fill="#fff" stroke="#e1d8c9" />
      <circle cx="210" cy="271" r="8" fill="none" stroke="#3d7fb8" strokeWidth="2.5" />
      <rect x="236" y="254" width="34" height="34" rx="8" fill="#fff" stroke="#e1d8c9" />
      <rect x="250" y="260" width="6" height="18" rx="3" fill="#f2b544" />
      {/* printer */}
      <rect x="160" y="316" width="100" height="10" rx="5" fill="#2b3a38" />
      <path d="M172 326h76v28c0 3-2 5-5 5h-66c-3 0-5-2-5-5z" fill="#fff" stroke="#e1d8c9" />
      <rect x="182" y="336" width="44" height="3" rx="1.5" fill="#d8cfc0" />
      <rect x="182" y="344" width="30" height="3" rx="1.5" fill="#d8cfc0" />
      {/* camera arm */}
      <rect x="296" y="96" width="44" height="8" rx="4" fill="#e1d8c9" />
      <circle cx="346" cy="100" r="12" fill="#fff" stroke="#e1d8c9" strokeWidth="2" />
      <circle cx="346" cy="100" r="5" fill="#2b3a38" />
      {/* person */}
      <circle cx="78" cy="214" r="22" fill="#c9875f" />
      <path d="M58 206c4-14 34-16 42 0-6-6-34-6-42 0z" fill="#2b2420" />
      <path d="M44 400l8-118c2-22 50-22 52 0l8 118z" fill="#d9734e" />
      <path d="M100 290c18 6 30-6 44-22" stroke="#c9875f" strokeWidth="11" strokeLinecap="round" fill="none" />
      <path d="M52 250c-10 4-26 10-30 34" stroke="#f2b544" strokeWidth="6" strokeLinecap="round" fill="none" opacity=".8" />
      {/* sparkle */}
      <path d="M352 40l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" fill="#f2b544" />
      <path d="M380 170l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5z" fill="#0f5c4d" opacity=".5" />
    </svg>
  );
}
