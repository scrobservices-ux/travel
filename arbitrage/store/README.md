# Flipwise Store — website + Stripe Checkout backend

The customer-facing shop for the Flipwise arbitrage agent. A small Express
server serves the storefront and runs **real Stripe Checkout**. It is the
**source of truth for prices** — the browser only names *which* product, the
server sets the amount charged, so a tampered request can't buy a €300 item
for €1.

Runs in two modes automatically:

- **LIVE** — `STRIPE_SECRET_KEY` set → real Stripe Checkout Sessions.
- **MOCK** — no key → a clearly-labeled *simulated* checkout (no card, no
  charge) so the whole buy → success → "sold" flow works with zero setup.

## Quick start (MOCK, no keys)

```bash
cd arbitrage/store
npm install
npm run seed      # optional: load 4 sample products
npm start         # → http://localhost:4242
```

Open http://localhost:4242, click **Buy now** — it simulates payment, marks
the item sold, and shows the confirmation page. Run the tests with `npm test`.

## Going LIVE with Stripe

1. Create a Stripe account and grab your **secret key** (`sk_test_…` while
   testing) at <https://dashboard.stripe.com/apikeys>.
2. `cp .env.example .env` and fill in:
   ```ini
   STRIPE_SECRET_KEY=sk_test_...
   PUBLIC_URL=https://shop.yourdomain.com   # this server's public URL
   ADMIN_TOKEN=<a long random string>
   ```
3. Forward webhooks so paid orders get marked sold reliably:
   ```bash
   stripe listen --forward-to localhost:4242/api/webhook
   # copy the whsec_... it prints into STRIPE_WEBHOOK_SECRET in .env
   ```
   In production, add a webhook endpoint (`/api/webhook`, event
   `checkout.session.completed`) in the Stripe Dashboard and use that signing
   secret. (Even without the webhook, the success page confirms the paid
   session as a fallback — but the webhook is the reliable path.)
4. `npm start`. Test cards: `4242 4242 4242 4242`, any future expiry/CVC.

## Connecting the agent app

In the Flipwise **admin app** (`../index.html`) → **Settings → Live store**,
paste this server's URL and the same `ADMIN_TOKEN`. Then on the **Storefront**
tab click **Sync to live store** — every listed deal is pushed to the shop.

The bridge is two protected endpoints:

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /api/products` | `x-admin-token` | upsert listed deals into the shop |
| `DELETE /api/products/:id` | `x-admin-token` | unpublish a product |
| `GET /api/products` | — | available products (storefront) |
| `POST /api/checkout` | — | start Checkout for a product (price from server) |
| `POST /api/webhook` | Stripe sig | mark sold on `checkout.session.completed` |

Sold products are never re-priced or resurrected by a later sync.

## Deploy

Any Node host (Railway, Render, Fly.io, a VPS, etc.):

- Set the env vars from `.env.example` in the host's dashboard.
- Point `PUBLIC_URL` at the deployed HTTPS URL (Stripe needs https for live).
- Product data persists in `data/products.json`; on ephemeral hosts mount a
  volume or swap `store-lib.js`'s file store for a database (the functions are
  isolated for exactly this).
- Register the production webhook endpoint in the Stripe Dashboard.

## Files

```
server.js            Express app + Stripe + admin sync
store-lib.js         pure product-store logic (unit-tested)
test.js              unit + live MOCK-mode HTTP tests  (npm test)
public/              storefront (index, success, cancel) + JS/CSS
data/                products.sample.json (seed) → products.json (runtime)
.env.example         config template
```
