import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, ShieldCheck, Languages, MapPin, Stethoscope, Pill, Building2, FlaskConical, Landmark,
  HeartPulse, QrCode, Truck, Activity, ChevronDown, Lock, Eye, Users, Menu, X, Video, Clock, Check,
} from 'lucide-react';
import Logo from '../components/Logo';
import LanguagePicker from '../components/LanguagePicker';
import { useAuth, ROLE_HOME } from '../auth';
import { cx, fmtNum } from '../components/ui';
import './landing.css';
import { usePublicConfig } from '../config';

const FAQS = [
  { q: 'I live in a village and don\'t have a smartphone. Can I still use Nexus Healthcare?', a: 'Yes. A family member can book for you from their phone, and you can speak your symptoms instead of typing. Nexus Healthcare E-Clinics — at your PHC, railway station or panchayat bhawan, with a health worker who checks your BP, sugar and oxygen — are coming soon.' },
  { q: 'Is my health data safe? Who can see it?', a: 'Only people you allow. Every request to see your records comes to you first, and you choose what they see and for how long. Every single view is written to an access log you can read anytime. Government officers only ever see anonymous totals — never your name. All data is stored in India under the DPDP Act, 2023.' },
  { q: 'What does a consult cost?', a: 'Booking a visit at a doctor\'s hospital or clinic costs ₹100 online — that confirms your slot and keeps fake bookings away. You pay the doctor\'s own fee at the clinic. Video consults are paid online in full (most cost ₹150–₹500).' },
  { q: 'Are the doctors real and verified?', a: 'Every doctor\'s registration number is checked against the national medical registry before they can see a single patient. You can see their qualification, languages and rating before you book.' },
  { q: 'Which languages are supported?', a: 'All 22 official Indian languages — from Hindi, Bengali and Tamil to Santali, Dogri and Manipuri — plus regional ones like Bhojpuri and Awadhi, and 40+ world languages including Arabic, Spanish and Swahili. Pick yours from the globe button at the top. Speak in your language — your doctor sees the notes translated into theirs.' },
  { q: 'What happens in an emergency?', a: 'If the symptom checker spots danger signs like chest pain or breathlessness, it skips the queue entirely: it tells you to call 108 and alerts the nearest hospital that has a free bed, along with your critical health information.' },
];

const PORTALS = [
  { icon: HeartPulse, title: 'Patients & families', text: 'Your Health Passport, doctors on video, medicines at your door — for you, your kids and your parents.', to: '/signup', cta: 'Create your passport' },
  { icon: Stethoscope, title: 'Doctors', text: 'Run your own clinic, work at one, or consult by video in your free hours. Patients within 20 km find you with your reviews and timings.', to: '/join?track=doctor', cta: 'Join as a doctor' },
  { icon: Building2, title: 'Hospitals & clinics', text: 'List your hospital or clinic for free. Show live beds to the network, accept referrals with ETA and a summary.', to: '/join?track=facility', cta: 'List your facility' },
  { icon: Pill, title: 'Pharmacies & distributors', text: 'E-prescriptions straight to your counter, live stock, and transfers when a district runs short.', to: '/login', cta: 'Pharmacy sign in' },
  { icon: FlaskConical, title: 'Labs', text: 'Orders in, structured reports out — and critical values reach the doctor in seconds.', to: '/login', cta: 'Lab sign in' },
  { icon: Landmark, title: 'Health officials', text: 'One live picture of beds, doctors, medicines and outbreaks — district to nation.', to: '/login', cta: 'Command center' },
];

export default function Landing() {
  const { user } = useAuth();
  const config = usePublicConfig();
  const [stats, setStats] = useState(null);
  const [faq, setFaq] = useState(0);
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    fetch('/api/public/stats').then((r) => r.json()).then(setStats).catch(() => {});
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const home = user ? ROLE_HOME[user.role] : null;

  return (
    <div className="landing">
      <header className={cx('l-nav', scrolled && 'scrolled')}>
        <div className="l-container l-nav-inner">
          <Logo />
          <nav className={cx('l-links', menu && 'open')} onClick={() => setMenu(false)}>
            <a href="#how">How it works</a>
            <a href="#kiosk">E-Clinics</a>
            <a href="#partners">For partners</a>
            <Link to="/join">Join us</Link>
            <a href="#privacy">Privacy</a>
            <a href="#faq">FAQ</a>
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

      {/* ---------- hero ---------- */}
      <section className="l-hero">
        <div className="l-container l-hero-grid">
          <div className="l-hero-copy fade-in">
            <span className="l-kicker"><span className="dot green pulse" /> Now live in Barabanki, Uttar Pradesh</span>
            <h1>
              A good doctor shouldn&apos;t depend on your{' '}
              <span className="l-underline">pin code.
                <svg viewBox="0 0 220 18" preserveAspectRatio="none" aria-hidden="true"><path d="M3 12 C 40 4, 90 4, 120 9 S 190 15, 217 6" stroke="#d9734e" strokeWidth="5" fill="none" strokeLinecap="round" /></svg>
              </span>
            </h1>
            <p className="l-lead">
              Nexus Healthcare connects every Indian — in a metro or a village — to the same verified doctors, one lifelong
              health record, and the medicines they need. On your phone, or at an E-Clinic down the road.
            </p>
            <div className="row wrap" style={{ gap: 12 }}>
              <Link to={home || '/signup'} className="btn lg clay">{home ? 'Open my dashboard' : 'Check my symptoms'} <ArrowRight /></Link>
              <a href="#kiosk" className="btn lg secondary"><MapPin /> Find an E-Clinic</a>
            </div>
            <div className="l-trust">
              <span><ShieldCheck size={16} /> DPDP Act compliant</span>
              <span><Languages size={16} /> 70+ languages, every Indian one</span>
              <span><Lock size={16} /> Data stays in India</span>
            </div>
          </div>

          <div className="l-hero-art" aria-hidden="true">
            <div className="blob" />
            <div className="art-card art-call">
              <div className="row" style={{ gap: 10 }}>
                <div className="art-ava">MI</div>
                <div className="grow">
                  <div className="small" style={{ fontWeight: 700 }}>Dr. Meera Iyer</div>
                  <div className="tiny muted">General Medicine · Hindi, Tamil</div>
                </div>
                <span className="badge green"><Video size={12} /> Live</span>
              </div>
              <div className="art-video">
                <div className="art-video-inner">
                  <Stethoscope size={34} />
                  <span>“Namaste Ramesh-ji, I can see your oxygen is a little low…”</span>
                </div>
              </div>
            </div>
            <div className="art-card art-vitals">
              <div className="tiny muted" style={{ fontWeight: 700, letterSpacing: '.05em' }}>FROM DEWA E-CLINIC</div>
              <div className="art-vitals-grid">
                <div><span>BP</span><strong>132/84</strong></div>
                <div><span>SpO₂</span><strong className="warn">93%</strong></div>
                <div><span>Temp</span><strong>100.2°</strong></div>
                <div><span>Pulse</span><strong>96</strong></div>
              </div>
            </div>
            <div className="art-card art-passport">
              <div className="row between">
                <span className="tiny" style={{ fontWeight: 700, letterSpacing: '.08em', opacity: .8 }}>HEALTH PASSPORT</span>
                <QrCode size={22} />
              </div>
              <div className="serif" style={{ fontSize: '1.15rem', marginTop: 8 }}>Sunita Devi</div>
              <div className="tiny" style={{ opacity: .8 }}>OC-2041-7783 · B+ · Allergic: Penicillin</div>
            </div>
            <div className="art-pill"><Clock size={14} /> Avg. wait today: 7 min</div>
          </div>
        </div>

        <div className="l-container">
          <div className="l-stats">
            <div><strong>{stats ? fmtNum(stats.passports) : '48,000+'}</strong><span>Health Passports</span></div>
            <div><strong>{stats ? fmtNum(stats.doctorsOnline) : '1,300+'}</strong><span>doctors online now</span></div>
            <div><strong>{stats ? stats.kiosks : 45}</strong><span>E-Clinics</span></div>
            <div><strong>{stats ? stats.states : 8}</strong><span>states connected</span></div>
          </div>
        </div>
      </section>

      {/* ---------- story / how it works ---------- */}
      <section className="l-section" id="how">
        <div className="l-container">
          <div className="l-section-head">
            <span className="eyebrow">How it works</span>
            <h2>From “I don&apos;t feel well” to medicine in hand.</h2>
            <p className="muted">Here&apos;s Ramesh-ji, 55, a farmer in Dewa. He has COPD and a cough that won&apos;t go away. The nearest chest specialist is 30 km away in Lucknow.</p>
          </div>
          <ol className="l-journey">
            {[
              { icon: MapPin, t: 'He walks into the E-Clinic', d: 'Pooja, the ASHA worker, scans his Health Passport QR. The kiosk already knows his history and that he\'s on an inhaler.' },
              { icon: Activity, t: 'Vitals in two minutes', d: 'BP, oxygen, temperature and weight are read straight from the devices. His oxygen is 93% — a little low.' },
              { icon: HeartPulse, t: 'Triage in his own language', d: 'Saathi asks him a few questions in Hindi. Result: see a doctor now. No chest pain, so not an emergency.' },
              { icon: Video, t: 'A doctor in 7 minutes', d: 'Dr. Meera in Lucknow already has his notes and live vitals. She prescribes an antibiotic and checks it against his allergies.' },
              { icon: Pill, t: 'Medicine, sorted', d: 'The slip prints at the kiosk. The pharmacy 1 km away has it in stock and packs it before he arrives.' },
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

      {/* ---------- capabilities ---------- */}
      <section className="l-section tint">
        <div className="l-container">
          <div className="l-section-head">
            <span className="eyebrow">One network, four promises</span>
            <h2>What changes when every clinic is connected</h2>
          </div>
          <div className="l-caps">
            <div className="l-cap">
              <div className="l-cap-icon green"><Stethoscope /></div>
              <h3>The nearest free doctor — even in another state</h3>
              <p className="muted">Our triage checks how urgent it is and routes you to a doctor who speaks your language. If your district is full, a doctor in another state picks up.</p>
            </div>
            <div className="l-cap">
              <div className="l-cap-icon clay"><QrCode /></div>
              <h3>One Health Passport for life</h3>
              <p className="muted">Allergies, prescriptions, reports, vaccinations — in one place, readable by any doctor you allow, in their language. Linked with your ABHA ID.</p>
            </div>
            <div className="l-cap">
              <div className="l-cap-icon sky"><Truck /></div>
              <h3>Medicines that find you</h3>
              <p className="muted">We see stock across pharmacies and warehouses. If your local store is out, we find it in the next district and send it over.</p>
            </div>
            <div className="l-cap">
              <div className="l-cap-icon sun"><Activity /></div>
              <h3>Outbreaks spotted early</h3>
              <p className="muted">Anonymous lab results by pin code reveal dengue or flu spikes days earlier — so pharmacies stock up and officials act before hospitals fill.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- kiosk ---------- */}
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
              <li><Check /> Touchscreen with voice guidance in 12+ languages</li>
              <li><Check /> BP, SpO₂, temperature, weight and sugar — read automatically</li>
              <li><Check /> HD video consult with a verified doctor</li>
              <li><Check /> Prescription printed on the spot, sent to the nearest pharmacy</li>
              <li><Check /> Keeps working offline for a full day and syncs later</li>
            </ul>
            <div className="l-kiosk-list">
              {['Dewa PHC', 'Barabanki Railway Station', 'Haidergarh', 'Ramnagar'].map((k) => (
                <span key={k} className="badge"><MapPin size={12} /> {k}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- partners ---------- */}
      <section className="l-section tint" id="partners">
        <div className="l-container">
          <div className="l-section-head">
            <span className="eyebrow">Built for everyone in the chain</span>
            <h2>Eight portals. One shared record.</h2>
            <p className="muted">Each role sees exactly what it needs — nothing more. Everything flows through one secure platform, so no hospital, lab or pharmacy becomes an island again.</p>
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
              <p className="muted mb-0">List your facility on the network for free — or consult at Nexus Healthcare-owned E-Clinics and earn on your own schedule.</p>
            </div>
            <div className="row wrap" style={{ gap: 10 }}>
              <Link to="/join?track=facility" className="btn secondary"><Building2 size={17} /> List my facility</Link>
              <Link to="/join?track=doctor" className="btn clay"><Stethoscope size={17} /> Join as a doctor</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- privacy ---------- */}
      <section className="l-section" id="privacy">
        <div className="l-container l-privacy">
          <div>
            <span className="eyebrow">Your data, your say</span>
            <h2>We built privacy in first — not bolted on later.</h2>
            <p className="muted">Health data is personal. So the patient holds the keys, and everyone else has to ask.</p>
          </div>
          <div className="l-privacy-grid">
            <div className="card flat"><Users className="l-pv-icon" /><h4>Consent for every view</h4><p className="muted small mb-0">Doctors and hospitals request access. You approve what they see, and for how long. Revoke anytime.</p></div>
            <div className="card flat"><Eye className="l-pv-icon" /><h4>See who looked</h4><p className="muted small mb-0">Every view and edit lands in an access log on your phone — with who, when and why.</p></div>
            <div className="card flat"><ShieldCheck className="l-pv-icon" /><h4>Emergencies, carefully</h4><p className="muted small mb-0">“Break-glass” access shows only critical info, expires in an hour, notifies you, and is reviewed by our team.</p></div>
            <div className="card flat"><Lock className="l-pv-icon" /><h4>Encrypted, in India</h4><p className="muted small mb-0">AES-256 at rest, TLS in transit, stored in India. Officials see anonymous totals, never names.</p></div>
          </div>
        </div>
      </section>

      {/* ---------- faq ---------- */}
      <section className="l-section tint" id="faq">
        <div className="l-container l-faq-wrap">
          <div>
            <span className="eyebrow">Questions</span>
            <h2>Things people ask us</h2>
            <p className="muted">Can&apos;t find your answer? Tap <strong>Ask Saathi</strong> at the bottom right — or call us free on 1800-200-4455.</p>
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

      {/* ---------- cta ---------- */}
      <section className="l-section">
        <div className="l-container">
          <div className="l-cta">
            <div>
              <h2>Create your family&apos;s Health Passport today.</h2>
              <p>Takes two minutes with your mobile number. Free, forever.</p>
            </div>
            <div className="row wrap" style={{ gap: 12 }}>
              <Link to="/signup" className="btn lg clay">Get started <ArrowRight /></Link>
              {config?.demo !== false ? <Link to="/login" className="btn lg l-cta-ghost">Try the demo accounts</Link> : <Link to="/join" className="btn lg l-cta-ghost">Join as a doctor or clinic</Link>}
            </div>
          </div>
        </div>
      </section>

      <footer className="l-footer">
        <div className="l-container l-footer-grid">
          <div>
            <Logo />
            <p className="muted small" style={{ marginTop: 12, maxWidth: 300 }}>A national health network by Reasonate AI Pvt. Ltd. Built in India, for every Indian.</p>
          </div>
          <div>
            <h4>Product</h4>
            <a href="#how">How it works</a><a href="#kiosk">E-Clinics</a><a href="#privacy">Privacy &amp; consent</a>
          </div>
          <div>
            <h4>Partners</h4>
            <Link to="/join?track=doctor">Doctors — join Nexus</Link><Link to="/join?track=facility">List your clinic or hospital</Link><Link to="/join?track=pharmacy">Medical stores</Link><Link to="/join?track=facility">Labs</Link><Link to="/login">Partner sign in</Link>
          </div>
          <div>
            <h4>Help</h4>
            <a href="tel:18002004455">1800-200-4455</a><a href="mailto:care@nexushealthcare.in">care@nexushealthcare.in</a><a href="tel:108">Emergency: 108</a>
          </div>
        </div>
        <div className="l-container l-footer-bottom">
          <span>© {new Date().getFullYear()} Reasonate AI Pvt. Ltd. · Proof of concept</span>
          <span>Nexus Healthcare gives guidance, not diagnosis. In an emergency, call 108.</span>
        </div>
      </footer>
    </div>
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
