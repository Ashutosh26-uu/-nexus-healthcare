import { Link } from 'react-router-dom';
import { ShieldCheck, Cookie } from 'lucide-react';
import { PublicPage } from './public/PublicShell';
import { useSeo } from '../seo';
import { usePublicConfig } from '../config';
import { openCookieSettings } from '../consent';

// The privacy and cookie policies. Every statement here describes what the app actually does today — when the
// product changes (a payment gateway, SMS codes, the AI scribe assistant), update the matching line and the date.
const UPDATED = '19 October 2026';

function Contact() {
  const support = usePublicConfig()?.support;
  if (support?.email) return <>write to <a href={`mailto:${support.email}`} translate="no">{support.email}</a>{support.phone ? <> or call <a href={`tel:${support.phone}`} translate="no">{support.phone}</a></> : null}</>;
  return <>use <strong>Ask Saathi</strong> (bottom right of every page) or the Help section of the app</>;
}

export function PrivacyPolicy() {
  useSeo({ title: 'Privacy policy · Sehatra', description: 'What Sehatra collects, who can see it, where it is stored and the choices you have — written in plain language.', path: '/privacy' });
  return (
    <PublicPage>
      <article className="pb-legal">
        <section className="pb-hero">
          <span className="pb-eyebrow">Sehatra</span>
          <h1 className="row" style={{ gap: 10 }}><ShieldCheck size={30} /> Privacy policy</h1>
          <p className="muted">Last updated {UPDATED}. Plain language, no surprises: this describes what the app does today.</p>
        </section>

        <h2>1. Who we are</h2>
        <p>Sehatra is an independent health-technology startup based in India. We run the Sehatra website and app, which connect patients with doctors, hospitals, laboratories, medical stores and village E-Clinics (kiosks). When we say “we” or “Sehatra” we mean Sehatra; when we say “you” we mean anyone using the service, whether as a patient, a caregiver or a health worker.</p>
        <p>This policy follows India’s Digital Personal Data Protection Act, 2023 and the Telemedicine Practice Guidelines, 2020. We only collect what the service needs, and you decide who sees your health information.</p>

        <h2>2. What we collect</h2>
        <h3>Your account</h3>
        <ul>
          <li>Name, email address, mobile number (optional), age or date of birth, gender, preferred language and country.</li>
          <li>Your password, stored only as a one-way hash — we cannot read it. Sign-in codes are sent by email and expire quickly.</li>
          <li>Aadhaar is <strong>optional for everyone</strong>. If you choose to add it, we keep only the last four digits (and, when verified, a one-way reference hash) — never the full number.</li>
          <li>For doctors and facilities: registration number, qualification, clinic details and the documents needed to verify them.</li>
        </ul>
        <h3>Your health information</h3>
        <ul>
          <li>Symptoms and triage answers, consult notes, prescriptions, lab orders and reports, home readings (blood pressure, sugar, weight and the like), allergies, conditions and your emergency card.</li>
          <li>Family members you add to your Health Passport, with the same protections.</li>
          <li>Your daily recovery check-ins (how you feel, whether you took your medicines, any danger signs) while a short course of medicines runs. They go only to the doctor who wrote that prescription, and stop when the course ends or you say you’ve recovered.</li>
          <li>When a doctor uses voice notes or the ambient scribe during a consult, the recording is turned into text by <strong>your browser’s own speech service</strong> (for example Google’s on Android/Chrome or Apple’s on iPhone) and only the text reaches Sehatra. The AI assistant that drafts notes from that text is <strong>off by default</strong> and is used only when the doctor turns it on and you agree during the consult.</li>
        </ul>
        <h3>Your location</h3>
        <ul>
          <li>Only with your permission. Live location is rounded to about 100 metres before it is stored, and is used solely to show doctors, hospitals, labs and chemists near you. You can type a town instead at any time, and switch live location off under <button type="button" className="link" onClick={openCookieSettings}>Cookie preferences</button>.</li>
          <li><strong>Address from your location:</strong> when you have shared your location, Sehatra can fill in your address for you (profile, delivery, store setup). To do this our server sends only the map coordinates — never your name or any health information — to OpenStreetMap’s public address service, and you can edit the result before saving.</li>
          <li><strong>SOS:</strong> when you press and hold SOS, your exact location (if you allow it) is saved with that alert and shown to your family on a private link. The link works only for 24 hours, or until you mark yourself safe, and every opening is counted so you can see it. Your emergency contacts who use Sehatra are alerted in the app and by email. A hospital gets your name, age, blood group, allergies and conditions only if you tap “Tell them I’m coming” for that hospital.</li>
          <li><strong>Emergency circle:</strong> people you invite with a one-time link, who accept from their own Sehatra account. They get your SOS alerts (location and nearest hospitals) — never your health records. You can remove anyone, and they can leave, at any time.</li>
          <li><strong>Pregnancy care:</strong> if you turn it on, we keep the due date and the check-ups, injections and readings you record, to remind you what is due. A doctor sees it only with your consent to view your history, and it is deleted with your account.</li>
        </ul>
        <h3>Payments</h3>
        <ul>
          <li>The amount, purpose and time of each payment, and the reference you give us: the UPI transaction reference (UTR) when you pay our UPI QR, or the order and payment IDs when a payment gateway is used.</li>
          <li>We never see or store card numbers, UPI PINs or bank passwords — those stay with your payment app or the gateway.</li>
        </ul>
        <h3>Technical information</h3>
        <ul>
          <li>Your IP address and basic request details, kept briefly for security (such as limiting repeated sign-in attempts) and to keep the service running.</li>
          <li>We run <strong>no analytics or advertising trackers</strong> and set no tracking cookies. See the <Link to="/cookies">cookie policy</Link>.</li>
          <li>Questions you type to Saathi, our help assistant, so that it can answer them. Health questions are sent to DxGPT (see below) without anything from your record; please don’t type your name or ID numbers into the chat.</li>
        </ul>

        <h2>3. How we use it</h2>
        <ul>
          <li>To provide the service: bookings, consults, prescriptions, lab tests, medicine orders, deliveries and your Health Passport.</li>
          <li>To keep you safe: medicine recall alerts, reminders, and monitoring alerts from your home readings that go only to doctors you have given access to.</li>
          <li>To verify health workers before they can see patients, and to investigate misuse.</li>
          <li>To give health officials district-level counts (for example, how many fever cases or how much stock) — <strong>as anonymous totals only, never names</strong>.</li>
          <li>To send you notifications about your care by email and inside the app. We do not send marketing messages.</li>
        </ul>

        <h2>4. Who can see your health information</h2>
        <ul>
          <li><strong>You decide.</strong> A doctor, hospital, lab or chemist sees your records only with your consent, for the scope and time you allow. Booking a doctor gives that doctor time-limited access for the visit. You can revoke any consent from the Consents screen.</li>
          <li><strong>Every view is logged.</strong> Your access log shows who looked at what, when and why.</li>
          <li><strong>Emergencies.</strong> A doctor can use “break-glass” access to see critical information (blood group, allergies, conditions, current medicines) without consent. It lasts one hour, you are notified, and every use is reviewed by our team.</li>
          <li><strong>Printed documents.</strong> The QR code on a prescription or lab report opens a verification page that shows only whether the document is genuine, the date and the doctor — never your medical details.</li>
          <li><strong>Our team</strong> sees personal data only when needed for support, verification, payment confirmation or audit, and every such action is logged.</li>
        </ul>

        <h2>5. Service providers we rely on</h2>
        <p>We do not sell personal data and we do not share it with advertisers. These providers process data for us under their own security commitments:</p>
        <ul>
          <li><strong>Zoho Catalyst</strong> runs the application (India).</li>
          <li><strong>Neon</strong> hosts our database in its Singapore region. It only ever holds data we have already encrypted.</li>
          <li>An <strong>email delivery service</strong> sends your one-time sign-in codes and notifications.</li>
          <li><strong>DxGPT</strong> (by Foundation29, a non-profit) answers health questions you type to Saathi. Only the message you type is sent — never your name, Health Passport, records or medicines — and DxGPT removes any personal details it still finds. If DxGPT is busy or out of capacity, the same question goes to <strong>Corti</strong> (a medical AI company, servers in the EU) under the same rule — only what you typed. Questions about using Sehatra are answered by Saathi itself.</li>
          <li><strong>Razorpay</strong>, only if card or net-banking payments are switched on for the network — it then handles those payments on its own secure pages.</li>
          <li>Your <strong>browser’s speech service</strong> when you use voice input, as described above — including when you speak to Saathi. When Saathi reads a reply aloud, your device’s own voice is used where one is installed for that language; otherwise the browser’s online voice (for example Google’s in Chrome) receives the reply’s text to speak it.</li>
          <li>An <strong>AI provider</strong> for the consult scribe assistant, only when a doctor switches it on and you agree. It is currently off.</li>
        </ul>

        <h2>6. How long we keep it</h2>
        <ul>
          <li>Your account and Health Passport: for as long as your account is open.</li>
          <li>Medical records a doctor has issued (prescriptions, reports, consult notes) are kept for the period Indian medical-record rules require, even after a deletion request, and then removed.</li>
          <li>Unpaid bookings expire after 30 minutes. Visit-pass codes change every 30 seconds. Emergency access expires after one hour.</li>
          <li>Access and audit logs are kept so that you can always see who looked at your record.</li>
        </ul>

        <h2>7. Your rights and choices</h2>
        <ul>
          <li><strong>See and correct</strong> your information from your Health Passport and profile.</li>
          <li><strong>Download</strong> prescriptions and reports as PDF from the app.</li>
          <li><strong>Withdraw consent</strong> for any doctor or facility from the Consents screen, and switch off location sharing at any time.</li>
          <li><strong>Delete your account</strong> from Settings. It is carried out automatically 90 days after you ask (cancel any time before then): your identifying details, uploads and sign-in are erased, and only the de-identified visit, prescription and payment entries that medical and tax rules require are kept.</li>
          <li><strong>Raise a concern.</strong> To ask a question or make a complaint, <Contact />. If you are not satisfied with our response, you may approach the Data Protection Board of India.</li>
        </ul>

        <h2>8. Children</h2>
        <p>Children use Sehatra through a parent’s or caregiver’s account, who adds them as a family member and manages consent on their behalf.</p>

        <h2>9. Security</h2>
        <p>Everything travels over HTTPS. Every record and upload is encrypted by us (AES-256) before it is stored, with a key kept outside the database, on top of our database provider's own encryption. Chat messages with your doctor are end-to-end encrypted once everyone in the chat turns it on: they are locked on your device and only the people in that chat can open them — not Sehatra, and not our administrators. Video and audio calls are encrypted end to end by your browser. Passwords are hashed, sign-in codes expire, requests are rate-limited, access is role-based and logged. No system is perfectly secure; if we ever learn of a breach that affects you, we will tell you and the authorities as the law requires.</p>

        <h2>10. Changes</h2>
        <p>When this policy changes, we update the date at the top and, for significant changes, tell you in the app. This policy applies alongside the <Link to="/cookies">cookie policy</Link>.</p>
        <p className="muted small">Sehatra gives guidance, not diagnosis. In an emergency, call 108.</p>
      </article>
    </PublicPage>
  );
}

export function CookiePolicy() {
  useSeo({ title: 'Cookie policy · Sehatra', description: 'Sehatra sets no tracking cookies. Here is exactly what your browser stores for the app, and how to change it.', path: '/cookies' });
  const Row = ({ k, what }) => <tr><td><code translate="no">{k}</code></td><td>{what}</td></tr>;
  return (
    <PublicPage>
      <article className="pb-legal">
        <section className="pb-hero">
          <span className="pb-eyebrow">Sehatra</span>
          <h1 className="row" style={{ gap: 10 }}><Cookie size={30} /> Cookie policy</h1>
          <p className="muted">Last updated {UPDATED}.</p>
        </section>

        <h2>The short version</h2>
        <ul>
          <li>Sehatra <strong>sets no cookies</strong> of its own — not for tracking, not for advertising, not for analytics.</li>
          <li>Like any app, it keeps a small amount of information in your browser’s own storage so that you stay signed in and the app remembers your choices. That storage never leaves your device except to sign your requests to Sehatra.</li>
          <li>The only choice that affects your privacy is <strong>live location</strong>, and it is off until you allow it.</li>
        </ul>

        <h2>What your browser stores for Sehatra</h2>
        <h3>Essential — always on</h3>
        <p>Without these the app cannot work. They are removed when you sign out or clear your browser’s site data.</p>
        <table className="pb-table">
          <tbody>
            <Row k="oc_token" what="Your sign-in, so you do not have to sign in again on every page. It is sent with each request to Sehatra to prove it is you." />
            <Row k="oc_lang · oc_country · oc_i18n_*" what="Your language and country, and a copy of the translated text so pages load fast offline." />
            <Row k="nx_consent" what="The choice you made in the cookie banner, so we do not ask again." />
            <Row k="oc_login_tab · oc_ref · oc_chunk_reload" what="Which sign-in method you last used, the invite code you arrived with, and a one-time guard that reloads the page after an update." />
          </tbody>
        </table>
        <h3>Preferences — yours to change</h3>
        <table className="pb-table">
          <tbody>
            <Row k="nx_location" what="Your live location (rounded to about 100 m) or the town you typed, only after you allow it. Signed-in patients also send it to Sehatra so that searches start from where they are." />
            <Row k="nx_radius_*" what="How far you chose to search for doctors or chemists." />
            <Row k="oc_patient_notifs · oc_pref_place · oc_relations" what="Notification settings, your usual place and the family relationships you use, so forms are pre-filled." />
            <Row k="oc_chat · oc_chat_nudged · oc_chat_voice · oc_install_snooze_until" what="Your Saathi help chat on this device, whether Saathi reads replies aloud, and whether you dismissed the ‘get the app’ prompt." />
            <Row k="oc_kiosk_lang · oc_kiosk_voice · oc_kiosk_flow" what="On an E-Clinic kiosk: the language, voice and the visit in progress." />
            <Row k="oc_kiosk_outbox" what="On an E-Clinic kiosk with no internet: visits recorded offline (name, age, phone, symptoms, vitals), kept only until they reach Sehatra and then deleted — or removed after 72 hours if they never could be sent." />
            <Row k="oc_dr_draft_* · nx_lab_signer" what="For health workers: an unsent prescription draft and the reporting pathologist, so nothing is lost if the page closes." />
          </tbody>
        </table>

        <h2>Third parties</h2>
        <ul>
          <li><strong>Payment gateway.</strong> Only if card or net-banking payments are switched on for the network, Razorpay’s checkout opens during payment and may set its own cookies for that session. Paying our UPI QR involves no third-party page at all.</li>
          <li><strong>Analytics, advertising, social media pixels:</strong> none.</li>
        </ul>

        <h2>Your choices</h2>
        <ul>
          <li>Open <button type="button" className="link" onClick={openCookieSettings}>Cookie preferences</button> (also in the footer and in your account menu) to switch live location on or off.</li>
          <li>Signing out removes your sign-in from this device. Clearing the site’s data in your browser removes everything listed above.</li>
          <li>Blocking storage in your browser will stop you from signing in, because the app has nowhere to keep your session.</li>
        </ul>
        <p>How we use the information itself is covered by the <Link to="/privacy">privacy policy</Link>.</p>
      </article>
    </PublicPage>
  );
}
