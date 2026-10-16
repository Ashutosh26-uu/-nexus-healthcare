# Automations with n8n

Nexus Healthcare connects to [n8n](https://n8n.io) in two directions:

- **Nexus → n8n (events).** When something happens, for example a booking is paid or a lab report is uploaded, the server POSTs a small signed JSON event to your n8n webhook. Sending happens in the background, so the app never waits for n8n. If n8n is down, Nexus retries for about 45 minutes (after 10 s, 30 s, 2 min, 10 min and 30 min).
- **n8n → Nexus (API).** Workflows call `/api/automation/*` with their own key. They can read a daily summary, upcoming visits and low stock, mark reminders as sent, and post in-app notices. The key can't open patient records, act as a user, or reach any admin route.

Everything is **off** until you set the environment variables below. Super Admin → **Automations (n8n)** shows the status, recent deliveries and a **Send test event** button.

## 1. Run n8n

Use [n8n Cloud](https://n8n.io/cloud) or self-host it (Docker: `docker run -it -p 5678:5678 -v n8n_data:/home/node/.n8n docker.n8n.io/n8nio/n8n`). Self-hosted n8n must be reachable over **https** from your Nexus server.

## 2. Set the Nexus environment variables

Catalyst console → AppSail → your app → Configuration (or `server/.env` locally):

| Variable | What it does |
|---|---|
| `N8N_WEBHOOK_URL` | Production URL of the Webhook node in workflow 01, e.g. `https://your-n8n.example.com/webhook/nexus-events` |
| `N8N_WEBHOOK_SECRET` | 24+ random characters. Signs every event and is sent as `X-Nexus-Token`. |
| `N8N_API_KEY` | 32+ random characters. Workflows send it as `Authorization: Bearer …`. |
| `N8N_SHARE_CONTACT` | `true` adds the patient's first name, mobile and email to events, which the WhatsApp reminders need. Default `false`. |
| `N8N_EVENTS` | Optional comma-separated allow-list, e.g. `booking.confirmed,lab.report_ready`. Default: all events. |

To generate a secret, run:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Restart the app after changing these settings.

## 3. Import the starter workflows

In n8n go to **Workflows → Import from file** and import each file in [`automations/n8n/`](automations/n8n):

| File | What it does | Credentials it needs |
|---|---|---|
| `01-nexus-events.json` | Receives every event. Critical lab result, new doctor/chemist awaiting verification, and refund due → email to ops. Booking confirmed, lab booked/sample collected/report ready, and medicine order updates → WhatsApp to the patient. | Header Auth, SMTP, Twilio |
| `02-appointment-reminders.json` | Every 30 min, sends a WhatsApp reminder for doctor visits and lab slots in the next 24 h, once each (adds a fasting note for fasting tests). | Header Auth (API key), Twilio |
| `03-daily-report.json` | 8:00 IST every day, emails yesterday's numbers: patients, bookings, tests, medicine orders, payments, refunds, pending verifications. | Header Auth (API key), SMTP |
| `04-low-stock-alert.json` | 9:00 IST every day, emails which chemists are below safety stock or holding stock that expires within 30 days. | Header Auth (API key), SMTP |

Then:

1. **Create the credentials** in n8n (Credentials → New):
   - **Nexus webhook token**: type *Header Auth*, name `X-Nexus-Token`, value = your `N8N_WEBHOOK_SECRET`.
   - **Nexus automation key**: type *Header Auth*, name `Authorization`, value = `Bearer <your N8N_API_KEY>`.
   - **SMTP (alerts)**: your mail server (a Gmail app password works).
   - **Twilio (WhatsApp)**: your Twilio account SID and auth token, with a WhatsApp-enabled sender.
2. **Edit the Config node** in each workflow: your Nexus URL (`baseUrl`), who receives alerts (`alertEmail`), the sender address and the WhatsApp sender number.
3. **Activate** the workflows. Copy the webhook's *Production URL* from workflow 01 into `N8N_WEBHOOK_URL`.
4. In Nexus go to Super Admin → Automations (n8n) → **Send test event** and check that it shows *Delivered*.

> WhatsApp messages are only sent for events from **live** data (`"mode": "live"`). Demo data uses made-up phone numbers that might belong to real people, so it is never messaged.

## Event format

```json
{
  "id": "evt_1f3a…",
  "event": "lab.report_ready",
  "occurredAt": "2026-10-16T05:03:07.737Z",
  "source": "nexus-healthcare",
  "mode": "live",
  "data": {
    "labOrderId": "lab_305", "patientId": "OC-2041-7783", "labId": "fac_l1", "labName": "Barabanki Diagnostics",
    "doctorId": "doc_1", "doctorName": "Dr. Meera Iyer", "critical": false,
    "contact": { "firstName": "Sunita", "mobile": "98765xxxxx", "email": null, "language": "Hindi" }
  }
}
```

`contact` is only present when `N8N_SHARE_CONTACT=true`.

**Medical details are never sent.** Events contain no symptoms, diagnoses, medicine names, test names or results. Workflows that need more should link to the record in Nexus rather than copy it.

| Event | When |
|---|---|
| `patient.registered` | A new Health Passport is created (app or kiosk) |
| `booking.confirmed` | A doctor booking is paid |
| `consult.completed` | The doctor finishes the consult |
| `prescription.issued` | A prescription is issued |
| `followup.scheduled` | The doctor books a follow-up |
| `lab.booked` | The patient pays the 20 % lab advance |
| `lab.sample_collected` | The lab collects the sample (`reportDueAt` included) |
| `lab.report_ready` | The report is uploaded (`critical` true/false) |
| `medicine_order.placed` | An order reaches the chemist(s) |
| `medicine_order.updated` | A chemist accepts, declines, packs or hands over an order |
| `medicine_order.delivered` | A rider or the store delivers it |
| `care.transferred` | A patient moves to another doctor |
| `onboarding.submitted` | A doctor, chemist or facility signs up or completes their profile |
| `payment.refund_due` | Money was captured for something no longer payable |
| `test.ping` | The admin's test button |

### Verifying the signature (optional)

The Header Auth check on the Webhook node is enough for most setups. For stronger checks, every request also carries these headers:

- `X-Nexus-Timestamp`: unix seconds.
- `X-Nexus-Signature`: `sha256=HMAC_SHA256(N8N_WEBHOOK_SECRET, "<timestamp>.<raw body>")`.

Reject requests that are older than 5 minutes or don't match. Each event has a unique `id`, so you can de-duplicate retries.

## API for workflows

All calls need the header `Authorization: Bearer <N8N_API_KEY>`. The API allows 120 calls per minute.

| Call | Returns / does |
|---|---|
| `GET /api/automation/ping` | Checks the key; lists event names |
| `GET /api/automation/summary?date=YYYY-MM-DD\|today` | One day's numbers (default: yesterday, IST) |
| `GET /api/automation/upcoming?hours=24&include=all` | Scheduled doctor visits and paid lab slots in the window. Already-reminded items are skipped unless `include=all`. |
| `POST /api/automation/reminded` `{ kind: "consult"\|"lab", id, channel }` | Marks a reminder as sent |
| `GET /api/automation/low-stock` | Chemists below safety stock, and stock expiring within 30 days |
| `POST /api/automation/notify` `{ patientId \| userId, title, body }` | Posts an in-app notification (title up to 80 characters, body up to 300) |

Every `notify` call is written to the audit log as "n8n automation".
