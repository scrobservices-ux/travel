# Flipwise — Marketplace Arbitrage Agent

**Buy low. List smart.** An offline-first command center for resale arbitrage:
an agent **sources** second-hand listings (Facebook Marketplace, Leboncoin, …),
**scores** each one for profit *net of every fee*, you **approve** the winners,
and approved deals **auto-list on your storefront** at a margin-safe,
market-competitive price.

Zero dependencies, no build step, no server, no account. Everything lives in
your browser's `localStorage`, with JSON backup/restore.

## Run it

Open `arbitrage/index.html` in any browser. Or serve it:

```bash
cd arbitrage && python3 -m http.server 8080   # → http://localhost:8080
```

Check the engine: `node --check arbitrage/app.js`

## How the loop works

1. **Agent console** → pick a source → **Run scan**. The agent pulls listings,
   computes the full unit economics of each, and files only the profitable ones
   into the pipeline. Everything below your margin/profit floor is auto-rejected.
2. **Pipeline** → review each deal (buy price, estimated resale, list price, net
   profit, margin, opportunity score, expected days-to-sell). **Approve** the
   ones you want → **Publish to store**.
3. **Storefront** → the public sale side. Listed items show your computed
   price. In preview mode the *Buy* button is simulated; once you connect the
   **live store** (below) it starts a real Stripe Checkout. Mark a deal
   **sold** to bank the realized profit.
4. **Settings** → tune the economics (fee %, fixed fee, margin/profit gates,
   undercut, assumed haggle, per-category resale/refurb/logistics/demand) and
   connect the **live store** (URL + admin token).

## Selling for real — the storefront website + Stripe

The customer website with **real Stripe Checkout** lives in [`store/`](store/).
It's a small Node/Express backend that serves the shop and creates Checkout
Sessions server-side (so prices can't be tampered with client-side). It runs in
**MOCK mode** with zero config (simulated checkout, no charges) and flips to
**LIVE** the moment you add a Stripe key.

```bash
cd arbitrage/store
npm install
npm run seed     # optional sample products
npm start        # → http://localhost:4242   (MOCK mode, no keys needed)
```

Then in this app: **Settings → Live store** → paste `http://localhost:4242` and
the server's `ADMIN_TOKEN` → **Storefront → Sync to live store**. Your listed
deals appear on the real shop; *Buy* opens Stripe Checkout. Full Stripe setup
(keys, webhooks, deploy) is in [`store/README.md`](store/README.md).

The two apps stay cleanly separated: the agent is offline-first and never needs
a server; the store is only involved when you want real payments.

## The profitability model (what "the agent" actually computes)

For each listing the agent works out, in order:

| Quantity | Formula |
|---|---|
| **Estimated resale** | `catalog.resale × conditionMultiplier` |
| **Negotiated buy** | `asking × (1 − haggle%)` |
| **Cost base** (all-in, resale-ready) | `negotiatedBuy + refurb + logistics` |
| **Market list price** | `estResale × (1 − undercut%)` — just under market to sell fast |
| **Required list price** (to clear the gate) | `(costBase × (1 + minMargin) + fixedFee) / (1 − feePct)` |
| **Net profit @ market** | `listPrice × (1 − feePct) − fixedFee − costBase` |

A deal is flagged **profitable** only when the market-competitive price clears
**both** gates: `netProfit ≥ minProfitAbs` **and** `margin ≥ minMarginPct`.
An **opportunity score (0–100)** blends margin, absolute cash, how far below
market you're buying, and category demand — so the best deals float to the top.

## Sourcing: the honest part

**Facebook Marketplace and Leboncoin have no public API** for reading listings
or buying, and their Terms of Service forbid scraping. Fully-automatic *buying*
isn't possible either — a purchase is a human message and an in-person handoff.
So Flipwise keeps sourcing behind a **pluggable adapter** and ships three ways
to feed it:

- **Demo generator** — realistic synthetic listings so the whole pipeline is
  usable today, out of the box.
- **Import (CSV / JSON)** — paste what *your own* compliant collector exported.
  CSV header: `title,category,condition,asking,location,source,url`.
- **Your own live feed** — register an adapter and the agent evaluates it exactly
  like the others.

### Wiring a real source

Bring your own compliant data acquisition (an official partner feed, a manual
export, or your own collector run under the platform's terms), then:

```js
Flipwise.Sources.register({
  name: "leboncoin",
  label: "Leboncoin — my feed",
  note: "My compliant collector",
  fetch(count) {
    // Return an array of listings:
    // { title, cat, condition, asking, location, source, url, img }
    // `cat` must match a category in Settings; `condition` one of
    // New / Like new / Good / Fair / For parts.
    return myCollector.pull(count);
  },
});
Flipwise.setSource("leboncoin");
Flipwise.scan(20);   // agent evaluates and files the winners
```

That's the only integration point. Everything downstream — scoring, pricing,
pipeline, storefront, realized-profit accounting — already works.

## Data & privacy

All state (deals, settings, catalog, scan history) stays in your browser.
**Settings → Export backup** writes a JSON file; **Restore** loads it on any
device. **Reset all** wipes local data (export first).
