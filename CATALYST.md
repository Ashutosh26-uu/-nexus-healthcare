# Deploying Nexus Healthcare on Zoho Catalyst (AppSail)

Nexus runs on **Catalyst AppSail** as one Node.js service: the Express API also serves the built React app.

## What you need first
1. A Catalyst account and project — https://catalyst.zoho.com (pick the data centre nearest your users, e.g. India).
2. The Catalyst CLI: `npm install -g zcatalyst-cli`, then `catalyst login`.
3. **An external PostgreSQL database** — this project uses **Neon** (project `cold-waterfall-95831485`, Singapore). Branch `production` is for the live app; branch `dev` is what your local `server/.env` uses for development and tests. AppSail's disk is temporary, so the
   built-in SQLite file would be wiped on every restart — the server refuses to start in production on
   Catalyst without `DATABASE_URL`.

## One-time setup
```bash
npm run catalyst:build          # builds the PWA and assembles ./catalyst-build
cd catalyst-build
catalyst init                   # choose your project; pick AppSail → "Catalyst-managed runtime" → Node.js 22
```
When asked for the app's source / build directory, point it at this `catalyst-build` folder and use
`node server/index.js` as the startup command. Re-running `npm run catalyst:build` keeps the
`app-config.json`, `catalyst.json` and `.catalystrc` the CLI wrote.

## Environment variables (Catalyst console → AppSail → your app → Configuration)
Set these as **secrets in the console**, never in files:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATA_MODE` | `live` (clean network) — `demo` only for investor demos |
| `DATABASE_URL` | Neon **production** branch, pooled: run `neon connection-string production --pooled --project-id cold-waterfall-95831485` and change `sslmode=require` to `sslmode=verify-full`. Paste it only into the Catalyst console. |
| `JWT_SECRET` | 64+ random characters (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | first super-admin |
| `CORS_ORIGIN` | your app URL, e.g. `https://nexus-xxxx.development.catalystappsail.in` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | email codes, visit reminders and "prescription ready" notes |
| `APP_URL` | the app's public URL, used as the link in reminder emails (default: this Catalyst URL) |
| `REMINDER_EMAILS` | optional — `true` sends reminder emails outside `DATA_MODE=live` (in-app reminders always run) |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | real payments (leave unset → demo payments are blocked in live mode) |
| `UPI_VPA` | optional UPI QR |
| `BOOKING_FEE` | optional, default `100` |
| `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET` | optional — send events to n8n (see [AUTOMATIONS.md](AUTOMATIONS.md)) |
| `N8N_API_KEY`, `N8N_SHARE_CONTACT`, `N8N_EVENTS` | optional — let n8n workflows call Nexus; include patient contact for reminders; limit which events are sent |
| `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` | optional but recommended — TURN relay for video/audio calls (some mobile networks can't connect peer-to-peer with STUN alone). `TURN_URL` may list several URLs, comma-separated |

The listening port is read automatically from `X_ZOHO_CATALYST_LISTEN_PORT`.

## Every release
```bash
npm run catalyst:deploy         # = catalyst:build + catalyst deploy
```
Check `https://<your-app-url>/api/health` returns `{"ok":true}`. Attach a custom domain from the AppSail console.

## Scaling notes
- Start with 1 GB memory (`memory` in `app-config.json`).
- Today the API keeps its working set in memory and writes changes to PostgreSQL, so run **one instance**.
  Running several instances behind a load balancer needs the data layer to read/write PostgreSQL per
  request — that's the next step before very large traffic.
