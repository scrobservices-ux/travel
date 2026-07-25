/* Flipwise Store — smoke tests for the pure store logic + a live MOCK-mode
 * HTTP round-trip (no Stripe keys needed). Run: `npm test`. */
"use strict";
const assert = require("assert");
const http = require("http");
const path = require("path");
const fs = require("fs");
const os = require("os");
const L = require("./store-lib");

let pass = 0;
const ok = (name) => { console.log("  ✓ " + name); pass++; };

/* ---- unit: pure logic ---- */
(function unit() {
  assert.strictEqual(L.toMinorUnits(219, "EUR"), 21900);
  assert.strictEqual(L.toMinorUnits(10, "JPY"), 10);       // zero-decimal
  assert.strictEqual(L.toMinorUnits(9.99, "USD"), 999);
  ok("toMinorUnits handles decimal + zero-decimal currencies");

  const n = L.normalize({ id: 7, title: "x", listPrice: 12.5, currency: "eur" });
  assert.strictEqual(n.id, "7");
  assert.strictEqual(n.price, 12.5);
  assert.strictEqual(n.currency, "EUR");
  ok("normalize coerces id/price/currency and reads listPrice");

  let r = L.upsert([], [{ id: "a", title: "A", price: 10 }], "T0");
  assert.strictEqual(r.added, 1);
  r = L.upsert(r.products, [{ id: "a", title: "A2", price: 20 }], "T1");
  assert.strictEqual(r.updated, 1);
  assert.strictEqual(L.findById(r.products, "a").price, 20);
  ok("upsert adds then updates by id");

  let sold = L.markSold(r.products, "a", "TS", "sess_1");
  assert.strictEqual(sold.product.status, "sold");
  const r2 = L.upsert(sold.products, [{ id: "a", title: "A3", price: 5 }], "T2");
  assert.strictEqual(r2.skipped, 1);
  assert.strictEqual(L.findById(r2.products, "a").price, 20); // price NOT changed after sold
  assert.strictEqual(L.findById(r2.products, "a").status, "sold");
  ok("sold products are never re-priced or resurrected by a sync");

  assert.strictEqual(L.listAvailable(r2.products).length, 0);
  ok("listAvailable hides sold items");
})();

/* ---- integration: boot server in MOCK mode, drive the buy flow ---- */
(function integration() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "flipwise-"));
  const dataFile = path.join(tmp, "products.json");
  process.env.DATA_FILE = dataFile;
  process.env.ADMIN_TOKEN = "test-token";
  process.env.PORT = "0"; // ephemeral
  delete process.env.STRIPE_SECRET_KEY; // force MOCK

  const app = require("./server.js");
  const server = app.listen(0, () => {
    const port = server.address().port;
    const base = "http://127.0.0.1:" + port;

    const req = (method, p, body, headers) => new Promise((res, rej) => {
      const data = body ? JSON.stringify(body) : null;
      const r = http.request(base + p, { method, headers: Object.assign(
        { "Content-Type": "application/json" }, headers || {}) }, resp => {
        let b = ""; resp.on("data", c => b += c);
        resp.on("end", () => res({ status: resp.statusCode, body: b, loc: resp.headers.location }));
      });
      r.on("error", rej); if (data) r.write(data); r.end();
    });

    (async () => {
      // config → MOCK
      let c = JSON.parse((await req("GET", "/api/config")).body);
      assert.strictEqual(c.mode, "MOCK"); ok("server boots in MOCK mode");

      // admin sync rejected without token
      let bad = await req("POST", "/api/products", { products: [{ id: "d1", title: "Deal", price: 100, currency: "EUR" }] });
      assert.strictEqual(bad.status, 401); ok("admin sync requires token");

      // admin sync with token
      let good = await req("POST", "/api/products",
        { products: [{ id: "d1", title: "Deal", listPrice: 100, currency: "EUR", glyph: "📦" }] },
        { "x-admin-token": "test-token" });
      assert.strictEqual(JSON.parse(good.body).added, 1); ok("admin sync publishes a product");

      // product appears in the shop
      let prods = JSON.parse((await req("GET", "/api/products")).body).products;
      assert.strictEqual(prods.length, 1); ok("published product is listed");

      // checkout returns a mock-pay URL
      let co = JSON.parse((await req("POST", "/api/checkout", { productId: "d1" })).body);
      assert.ok(co.url && co.url.includes("/api/mock-pay")); ok("checkout returns mock-pay URL");

      // hit mock-pay → marks sold, redirects to success
      let pay = await req("GET", "/api/mock-pay?id=d1");
      assert.strictEqual(pay.status, 302); ok("mock-pay redirects (302) to success");

      // now sold → gone from shop, checkout 409
      let after = JSON.parse((await req("GET", "/api/products")).body).products;
      assert.strictEqual(after.length, 0); ok("sold product leaves the shop");
      let co2 = await req("POST", "/api/checkout", { productId: "d1" });
      assert.strictEqual(co2.status, 409); ok("cannot re-buy a sold product");

      // unknown product → 404
      let nf = await req("POST", "/api/checkout", { productId: "nope" });
      assert.strictEqual(nf.status, 404); ok("unknown product → 404");

      server.close();
      fs.rmSync(tmp, { recursive: true, force: true });
      console.log(`\n  ${pass} checks passed. STORE OK\n`);
    })().catch(e => { console.error("TEST FAILED:", e); server.close(); process.exit(1); });
  });
})();
