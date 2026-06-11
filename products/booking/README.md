# Booking System

Appointment booking for salons, clinics, barbers, tutors, and tour operators. Customers book on a mobile-first web page; both the customer and the owner get **WhatsApp confirmations**. SQLite storage — one file, zero ops.

**Sells as:** 250,000 FCFA setup + 35,000 FCFA/month.
**Per-client work:** edit `config/business.json` (services, prices, hours). No code changes.

## Client setup

1. Copy `.env.example` → `.env`. WhatsApp credentials are optional — without them the system still works, just without notifications.
2. Copy `config/business.example.json` → `config/business.json`; set services, durations, prices, open days (`0`=Sunday … `6`=Saturday), and hours.
3. `npm install && npm start`. The booking page is served at `/`.
4. Give the client a short link (or QR code on their counter) pointing at the page.

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/config` | Business name + services (used by the page) |
| `GET /api/slots?date=YYYY-MM-DD` | Free slots for a date |
| `POST /api/bookings` | Create booking `{serviceId, date, time, name, phone}` — 409 if slot taken |
| `GET /api/bookings?date=…` | Owner's list for a day |
| `DELETE /api/bookings/:id` | Cancel |

⚠️ The owner endpoints (`GET /api/bookings`, `DELETE`) have no auth — protect them at the reverse proxy (basic auth) or keep them off the public vhost.

## Notes

- One booking per slot (`UNIQUE(date, time)`); concurrency is handled by the DB constraint, returned to the page as "slot just taken".
- Reminders: a cron hitting `GET /api/bookings?date=<tomorrow>` and sending each row through the WhatsApp notify endpoint is the natural v2; left out of v1 to keep the 72-hour delivery promise.
- Back up by copying `bookings.db`.
