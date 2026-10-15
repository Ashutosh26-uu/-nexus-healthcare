# Nexus Healthcare

> **Launching?** See **[DEPLOY.md](DEPLOY.md)** — one-container deploy (Docker / Render / Railway / VPS with Postgres + HTTPS), clean live-mode database, installable phone app (PWA), and the go-live checklist.

A full-stack Nexus Healthcare national health network (spec: *Nexus Healthcare — Product & Build Specification*, Oct 2026, Reasonate AI Pvt. Ltd.).

8 portals + the dispatch app on one shared backend, with real authentication, role-based access, live updates across portals, and the **Saathi** patient chat assistant.

## Run it

Requires Node.js 22.13+ (built-in SQLite).

```bash
npm run install:all
```

```bash
npm run dev
```

- Web app: http://localhost:5173
- API: http://localhost:4000

Data is stored in a real database: **SQLite** by default (`server/data/omnicare.db`, created and seeded with demo data on first start — pilot district Barabanki, UP) or **PostgreSQL** in production (set `DATABASE_URL` — the driver is included). Every change is written within milliseconds in a transaction, and everything survives restarts. Uploaded reports and photos are stored in the database too. To start fresh, stop the server and run:

```bash
npm run reset-data
```

### Configure the server

Copy `server/.env.example` to `server/.env`. Everything is optional for a local demo.

**Real OTP delivery.** With no provider configured, the server runs in demo mode and shows codes on screen. To send real codes, add one of these:
- **Twilio Verify** (SMS + WhatsApp, worldwide): `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`
- **MSG91** (cheapest in India; needs a DLT-approved template): `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`
- **Email codes** over any SMTP service: `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`

Once a provider is set, codes stop appearing on screen. Codes are random, stored only as salted hashes, expire in 5 minutes, allow 5 attempts, have a 30-second resend cooldown and are rate-limited per number and per IP. International numbers are supported, with a country picker covering 190+ countries.

**Every language.** The app ships with 71 languages: all 22 official Indian languages, regional ones (Bhojpuri, Awadhi, Tulu, Mizo…) and 40+ world languages, including right-to-left scripts (Urdu, Arabic, Persian, Sindhi, Kashmiri). Pick one from the globe button on any screen. The translations bundled in `server/i18n/seed/` work offline. To fill in every other language automatically, set `ANTHROPIC_API_KEY` (or `GOOGLE_TRANSLATE_API_KEY` / `LIBRETRANSLATE_URL`). Each string is translated once and stored in the database. Only the app's own interface text is ever sent for translation — never patient names, notes or results. Dates and numbers follow the chosen language, and the Saathi chat replies in it.

```bash
npm run i18n:status
```

## Demo accounts

All passwords: `Demo@123` — the sign-in page lists them all; click one to fill it in.

| Portal | Login | Route |
|---|---|---|
| Patient App | patient@omnicare.in (or mobile OTP: 9876500001) | `/patient` |
| E-Clinic Kiosk | kiosk@omnicare.in | `/kiosk` |
| Doctor Portal | doctor@omnicare.in | `/doctor` |
| Hospital Portal | hospital@omnicare.in | `/hospital` |
| Lab Portal | lab@omnicare.in | `/lab` |
| Pharmacy Portal | pharmacy@omnicare.in | `/pharmacy` |
| Supply (distributor) | distributor@omnicare.in | `/supply` |
| Dispatch App | rider@omnicare.in | `/dispatch` |
| Command Center (district) | official@omnicare.in | `/command` |
| Command Center (national) | national@omnicare.in | `/command` |
| Super Admin | admin@omnicare.in | `/admin` |

New patients can sign up with any mobile number (any country) or email. Until an SMS/email provider is configured, the code is shown on screen.

## Try the end-to-end flows (spec §5)

Open two browser windows side by side — updates appear live in both.

- **Flow A — Health Passport:** `/signup` → OTP → 5-step passport wizard → QR health card.
- **Flow B — Kiosk visit:** sign in as the kiosk operator → language → identify `OC-2041-5521` → read vitals → triage → teleconsult. In the doctor window, the patient appears in the queue → start → write the e-prescription → complete. The kiosk moves on to print & pickup, and the pharmacy inbox gets the prescription.
- **Flow D — Medicine shortage:** prescribe a drug that isn't stocked nearby → a transfer request appears for the warehouse/pharmacy → dispatch → the rider delivers with an OTP.
- **Flow E — Outbreak:** in the lab, report a *Dengue NS1 = positive* → the outbreak engine creates or updates an alert → the official confirms it in the Command Center → pharmacies and doctors are notified and stock pre-positioning starts.
- **Flow F — Break-glass:** in the doctor portal, look up a patient without consent → Emergency access with a reason → you see critical data only, for 60 minutes. The patient is notified and the admin reviews it in Audit.
- **Flow G — Consent:** the doctor requests access → the patient approves (scope + duration) or denies in Consent Manager → access expires automatically.

## Architecture

```
client/  React 19 + Vite + React Router — all portals, design system, Saathi chat widget
server/  Node + Express — JWT auth (bcrypt), role-based routes, SSE live updates
  storage/    SQLite (built-in) / PostgreSQL persistence with write-through cache
  otp.js      real OTP over Twilio Verify, Twilio SMS/WhatsApp, MSG91 or SMTP email
  i18n/       translation engine + bundled language packs
  engines.js  rule-based AI engines (spec §6): triage, routing, supply grid, outbreak detection, Rx safety checks
  chat.js     Saathi assistant (Claude streaming + offline fallback)
  seed.js     demo data
```

Still simulated: video calls (swap in a WebRTC provider), kiosk devices (real drivers), ABHA/HMIS/LIS integrations. The datastore keeps a working copy in memory, so run a single API instance — or move to per-request SQL queries before scaling out horizontally. API shapes are kept simple so each piece can be replaced on its own.

Production build (Express serves the built client on port 4000):

```bash
npm run build && npm start
```

> This is a proof of concept. Triage output is decision support, not a diagnosis. Don't use it with real patient data until the security, compliance and clinical-validation work in spec §7 and §9 is done.
