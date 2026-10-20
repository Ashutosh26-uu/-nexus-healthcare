# Launching Sehatra

Sehatra is a **full-stack application**: a React web app (installable as a phone/desktop app — PWA) served by a Node/Express API, with SQLite or PostgreSQL storage. In production everything runs as **one service on one port**.

```
Browser / installed app ──HTTPS──▶  Node (Express)  ──▶  PostgreSQL  (or SQLite on a volume)
                                     ├─ /api/*   REST + live updates (SSE)
                                     └─ /*       the built React app, service worker, manifest
```

---

## 1. Before you launch — checklist

| | What | Why |
|---|---|---|
| ☐ | **A domain + HTTPS** (e.g. `app.nexushealthcare.in`) | Required for the installable app, device location and secure cookies. |
| ☐ | `JWT_SECRET` — 48+ random characters | The server refuses to start in production without it. |
| ☐ | `DATA_MODE=live`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Starts a **clean network** with only your admin — no demo accounts. |
| ☐ | SMTP (your Gmail app password works) | One-time codes by email — works on day one. |
| ☐ | **SMS provider** — MSG91 (India, needs DLT template) or Twilio | So patients without email get codes by SMS. Until then email is used automatically. |
| ☐ | **Payments** — Razorpay keys (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`) and/or your UPI ID (`UPI_VPA`) | Consult bookings and home-delivery orders are paid before they're confirmed. Without keys a live site can't take bookings online. |
| ☐ | PostgreSQL + daily backups | Use the included `docker-compose.yml`, or a managed Postgres (Neon, Supabase, RDS). |
| ☐ | Change the admin password after first login | |
| ☐ | Privacy policy & terms pages, DPDP Act consent text reviewed by counsel | Health data — legal requirement before real patients. |

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

---

## 2. Fastest: a managed platform (Render / Railway / Fly.io)

1. Push this folder to a private GitHub repo.
2. Create a new **Web Service from the Dockerfile** (it's in the repo root).
3. Add a **PostgreSQL** database and copy its URL into `DATABASE_URL`.
4. Add the environment variables from [`.env.production.example`](.env.production.example).
5. Attach a **persistent disk at `/app/server/data`** (uploaded reports live there).
6. Add your custom domain — the platform provides HTTPS.

Health check path: `/api/health`.

## 3. Your own server (VPS) with Docker — includes Postgres + automatic HTTPS

```bash
cp .env.production.example .env.production      # fill it in
export DOMAIN=app.yourdomain.com                 # DNS A-record → this server
export POSTGRES_PASSWORD=$(openssl rand -hex 24)
docker compose up -d --build
```

Caddy obtains and renews the HTTPS certificate automatically. Logs: `docker compose logs -f app`.

Backups (run daily from cron):

```bash
docker compose exec -T db pg_dump -U nexus nexus | gzip > backup-$(date +%F).sql.gz
```

## 4. Run production mode on your own computer

```bash
npm run install:all
npm run prod:local        # builds the web app, starts on http://localhost:4000 in production mode
```

(`server/.env` must contain a strong `JWT_SECRET` (32+ random characters). Demo data needs `DATA_MODE=demo` plus `ALLOW_DEMO_IN_PRODUCTION=true` — never on a public URL.)

---

## 5. The app on phones

* **Android / desktop Chrome & Edge:** visitors see an **“Install Sehatra”** prompt; the app gets its own icon and opens full-screen.
* **iPhone:** Safari → Share → *Add to Home Screen* (the app shows these steps automatically).
* **Google Play Store:** wrap the live site as a Trusted Web Activity with [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) — `bubblewrap init --manifest https://YOUR-DOMAIN/manifest.webmanifest`. No separate codebase needed.
* **Apple App Store:** needs a native shell (e.g. Capacitor) — plan this after launch.

The service worker caches only the app shell (code, icons, fonts) so the app opens instantly and offline. **Health data (`/api/*`) is never cached on the device.**

---

## 6. After launch — first steps in the Admin portal

1. Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` → change the password.
2. **Kiosk fleet → Add E-Clinic** for each Sehatra-owned clinic.
3. **Users & roles** → create E-Clinic operator accounts (one per clinic).
4. Share `https://YOUR-DOMAIN/join` with doctors, clinics, hospitals, labs and pharmacies — their applications arrive in **Onboarding** for verification.
5. Patients sign up themselves at `https://YOUR-DOMAIN/signup`.

## 7. Environment variables

See [`.env.production.example`](.env.production.example) for the full, commented list. The essentials:

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV=production` | yes | |
| `JWT_SECRET` | yes | 48+ random chars |
| `DATA_MODE` | yes | `live` for real users. `demo` is refused in production (public demo passwords) unless `ALLOW_DEMO_IN_PRODUCTION=true` for a private investor demo |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | first start | creates the first super-admin |
| `DATABASE_URL` | recommended | PostgreSQL; omit to use SQLite on the volume |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | yes | email one-time codes |
| `MSG91_*` or `TWILIO_*` | soon | SMS one-time codes |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | for launch | online payments for bookings & delivery (signature-verified) |
| `UPI_VPA` | optional | your UPI ID for the scan-to-pay QR |
| `CORS_ORIGIN` | if needed | only if another origin calls the API |
| `ANTHROPIC_API_KEY` | optional | smarter Saathi assistant & translations |
