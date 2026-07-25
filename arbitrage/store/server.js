/* Flipwise Store — Express + Stripe backend.
 * ---------------------------------------------------------------------------
 * Serves the customer storefront and runs real Stripe Checkout. The server is
 * the source of truth for products and PRICES — the client never sets the
 * amount charged, so a tampered request can't buy a €300 item for €1.
 *
 * Runs in two modes:
 *   - LIVE  : STRIPE_SECRET_KEY set → real Stripe Checkout Sessions.
 *   - MOCK  : no key set → a clearly-labeled simulated checkout so the whole
 *             flow (buy → success → product marked sold) works with no keys.
 *
 * Env (see .env.example):
 *   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, ADMIN_TOKEN, PUBLIC_URL, PORT
 * ===========================================================================
 */
"use strict";

const path = require("path");
const express = require("express");
const L = require("./store-lib");

// Load .env if present (optional dependency — falls back silently).
try { require("dotenv").config(); } catch (e) { /* dotenv optional */ }

const PORT = process.env.PORT || 4242;
const PUBLIC_URL = process.env.PUBLIC_URL || ("http://localhost:" + PORT);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "changeme-admin-token";
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data", "products.json");
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || "";
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const LIVE = Boolean(STRIPE_KEY);

let stripe = null;
if (LIVE) {
  try { stripe = require("stripe")(STRIPE_KEY); }
  catch (e) { console.error("stripe module missing — run `npm install`. Falling back to MOCK."); }
}
const MODE = stripe ? "LIVE" : "MOCK";

const app = express();
const nowIso = () => new Date().toISOString();
const readAll = () => L.loadProducts(DATA_FILE);
const writeAll = (p) => L.saveProducts(DATA_FILE, p);

/* --- CORS: the admin app may run from file:// or another port ------------- */
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, x-admin-token");
  res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

/* --- Stripe webhook needs the RAW body for signature verification, so it is
 *     mounted BEFORE the JSON parser. ---------------------------------------- */
app.post("/api/webhook", express.raw({ type: "application/json" }), (req, res) => {
  if (!stripe || !WEBHOOK_SECRET) return res.json({ received: true, mode: "MOCK" });
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send("Webhook signature verification failed: " + err.message);
  }
  if (event.type === "checkout.session.completed") {
    const s = event.data.object;
    const id = s.metadata && s.metadata.productId;
    if (id) {
      const { products, product } = L.markSold(readAll(), id, nowIso(), s.id);
      if (product) writeAll(products);
    }
  }
  res.json({ received: true });
});

app.use(express.json({ limit: "1mb" }));

/* ------------------------------------------------------------------ */
/* Customer API                                                       */
/* ------------------------------------------------------------------ */

// Storefront config (mode + currency hint for the client).
app.get("/api/config", (req, res) => {
  res.json({ mode: MODE, publicUrl: PUBLIC_URL });
});

// Available products for the shop.
app.get("/api/products", (req, res) => {
  res.json({ products: L.listAvailable(readAll()), mode: MODE });
});

// Create a Checkout Session for one product. Price is taken from the SERVER's
// record — the request only names which product.
app.post("/api/checkout", async (req, res) => {
  const id = req.body && req.body.productId;
  const products = readAll();
  const p = L.findById(products, id);
  if (!p) return res.status(404).json({ error: "Product not found" });
  if (p.status === "sold") return res.status(409).json({ error: "Already sold" });

  const success = `${PUBLIC_URL}/success.html?id=${encodeURIComponent(p.id)}&session={CHECKOUT_SESSION_ID}`;
  const cancel = `${PUBLIC_URL}/cancel.html?id=${encodeURIComponent(p.id)}`;

  if (!stripe) {
    // MOCK: hand back a local simulated-checkout URL (no card, no charge).
    const url = `${PUBLIC_URL}/api/mock-pay?id=${encodeURIComponent(p.id)}`;
    return res.json({ url, mode: "MOCK" });
  }
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        quantity: 1,
        price_data: {
          currency: p.currency.toLowerCase(),
          unit_amount: L.toMinorUnits(p.price, p.currency),
          product_data: {
            name: p.title,
            description: `${p.cat} · ${p.condition}`,
          },
        },
      }],
      success_url: success,
      cancel_url: cancel,
      metadata: { productId: p.id },
    });
    res.json({ url: session.url, mode: "LIVE" });
  } catch (err) {
    res.status(500).json({ error: "Stripe error: " + err.message });
  }
});

// MOCK checkout: simulate a successful payment, mark sold, bounce to success.
app.get("/api/mock-pay", (req, res) => {
  if (stripe) return res.status(404).send("Not in mock mode");
  const id = req.query.id;
  const { products, product } = L.markSold(readAll(), id, nowIso(), "mock_" + Date.now());
  if (product) writeAll(products);
  res.redirect(`/success.html?id=${encodeURIComponent(id)}&mock=1`);
});

// Confirm an order for the success page (also a safety net if the webhook is
// not configured in dev: mark sold on confirmed Checkout Session).
app.get("/api/order", async (req, res) => {
  const id = req.query.id;
  const products = readAll();
  const p = L.findById(products, id);
  if (!p) return res.status(404).json({ error: "Not found" });
  if (stripe && req.query.session && req.query.session !== "{CHECKOUT_SESSION_ID}") {
    try {
      const s = await stripe.checkout.sessions.retrieve(req.query.session);
      if (s && s.payment_status === "paid" && p.status !== "sold") {
        const r = L.markSold(products, id, nowIso(), s.id);
        writeAll(r.products);
      }
    } catch (e) { /* ignore — webhook remains the authority */ }
  }
  res.json({ product: L.findById(readAll(), id) });
});

/* ------------------------------------------------------------------ */
/* Admin API (protected by ADMIN_TOKEN) — the bridge from the agent   */
/* ------------------------------------------------------------------ */
function requireAdmin(req, res, next) {
  if ((req.headers["x-admin-token"] || "") !== ADMIN_TOKEN)
    return res.status(401).json({ error: "Bad admin token" });
  next();
}

// Sync listed deals from the admin app into the store.
app.post("/api/products", requireAdmin, (req, res) => {
  const batch = (req.body && req.body.products) || [];
  const r = L.upsert(readAll(), batch, nowIso());
  writeAll(r.products);
  res.json({ ok: true, added: r.added, updated: r.updated, skipped: r.skipped, total: r.products.length });
});

// Unpublish a product.
app.delete("/api/products/:id", requireAdmin, (req, res) => {
  writeAll(L.remove(readAll(), req.params.id));
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* Static storefront                                                  */
/* ------------------------------------------------------------------ */
app.use(express.static(path.join(__dirname, "public")));

// Auto-start only when run directly (`node server.js`), not when required by tests.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n  Flipwise Store — ${MODE} mode`);
    console.log(`  ${PUBLIC_URL}`);
    if (MODE === "MOCK") console.log(`  (no STRIPE_SECRET_KEY — checkout is simulated, no real charges)`);
    console.log(`  admin token: ${ADMIN_TOKEN === "changeme-admin-token" ? "DEFAULT — set ADMIN_TOKEN!" : "set"}\n`);
  });
}

module.exports = app; // for tests
