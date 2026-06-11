# Mobile Money Storefront

A mobile-first online shop where customers pay with **MTN Mobile Money** (push prompt to their phone) or **Orange Money** (hosted payment page). No card processing, no PSP middleman fees beyond the operators' own.

**Sells as:** 350,000 FCFA setup + 50,000 FCFA/month.
**Per-client work:** edit `config/catalog.json` + obtain the client's operator merchant credentials.

## Payment flows

- **MTN MoMo (Collections `requestToPay`)** — customer enters their number, gets a USSD-style confirmation prompt on their phone, approves with their MoMo PIN. The page polls `/api/orders/:id/status` until `paid`/`failed`.
- **Orange Money (Web Payment CM)** — customer is redirected to Orange's hosted payment page, then returned to the shop; the page polls the same status endpoint, which verifies against Orange's `transactionstatus` API. The `notif_url` webhook is logged but **status truth always comes from the status API**, never from the redirect alone.

Either provider can be left unconfigured — its button is disabled automatically.

## Client setup

1. **MTN:** register at [momodeveloper.mtn.com](https://momodeveloper.mtn.com), subscribe to *Collections*, create an API user/key. Sandbox uses `MOMO_TARGET_ENV=sandbox` + `MOMO_CURRENCY=EUR`; production Cameroon uses `mtncameroon` + `XAF` (production access requires the client's MTN merchant onboarding — start this on day 1, it's the long pole).
2. **Orange:** register at [developer.orange.com](https://developer.orange.com), subscribe to *Orange Money Web Payment CM*, get client ID/secret + merchant key (requires the client's Orange Money merchant account).
3. Copy `.env.example` → `.env`, `config/catalog.example.json` → `config/catalog.json`.
4. `npm install && npm start`. Shop page at `/`. `BASE_URL` must be the public HTTPS URL (Orange redirects/notifies against it).

## Notes

- Order totals are computed **server-side** from the catalog — the client never trusts prices from the browser.
- Owner gets a WhatsApp alert on every paid order (optional, reuses Cloud API creds).
- Back up by copying `orders.db`.
- Out of scope for v1 (deliberate, protects the 72h delivery): stock tracking, delivery fees, multi-image galleries. All natural retainer upsells.
