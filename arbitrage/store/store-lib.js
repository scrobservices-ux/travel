/* Flipwise Store — pure product-store logic (no network, no framework).
 * The server's source of truth for what is for sale lives in a JSON file;
 * these helpers load/merge/mutate it. Kept dependency-free so it can be
 * unit-tested directly with node.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "XAF", "XOF"]);

/* Stripe wants the smallest currency unit as an integer. Most currencies are
 * 2-decimal (cents); a few are zero-decimal. */
function toMinorUnits(amount, currency) {
  const cur = String(currency || "EUR").toUpperCase();
  if (ZERO_DECIMAL.has(cur)) return Math.round(Number(amount) || 0);
  return Math.round((Number(amount) || 0) * 100);
}

function loadProducts(file) {
  try {
    const raw = fs.readFileSync(file, "utf8");
    const j = JSON.parse(raw);
    return Array.isArray(j) ? j : (j.products || []);
  } catch (e) {
    return []; // no file yet → empty catalog
  }
}

function saveProducts(file, products) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(products, null, 2));
  return products;
}

/* Normalize an incoming deal (from the admin app) into a store product.
 * Only fields the store needs — never trust a client-supplied status/soldAt. */
function normalize(incoming) {
  const price = Number(incoming.price != null ? incoming.price : incoming.listPrice) || 0;
  return {
    id: String(incoming.id),
    title: String(incoming.title || "Untitled").slice(0, 140),
    cat: String(incoming.cat || "Other").slice(0, 60),
    condition: String(incoming.condition || "Good").slice(0, 40),
    price: Math.max(0, Math.round(price * 100) / 100),
    currency: String(incoming.currency || "EUR").toUpperCase().slice(0, 3),
    glyph: String(incoming.glyph || "📦").slice(0, 8),
  };
}

/* Merge a batch of incoming products into the existing catalog by id.
 * - Sold products are never resurrected or re-priced by a sync.
 * - Available products get their title/price/etc. refreshed.
 * - New ids are added as available.
 * Returns { products, added, updated, skipped }. */
function upsert(existing, incomingBatch, nowIso) {
  const byId = new Map(existing.map(p => [p.id, p]));
  let added = 0, updated = 0, skipped = 0;
  for (const raw of incomingBatch || []) {
    if (!raw || raw.id == null) { skipped++; continue; }
    const n = normalize(raw);
    const prev = byId.get(n.id);
    if (prev && prev.status === "sold") { skipped++; continue; }
    if (prev) {
      byId.set(n.id, Object.assign({}, prev, n, { status: "available" }));
      updated++;
    } else {
      byId.set(n.id, Object.assign({}, n, { status: "available", createdAt: nowIso }));
      added++;
    }
  }
  return { products: Array.from(byId.values()), added, updated, skipped };
}

function listAvailable(products) {
  return products.filter(p => p.status === "available");
}

function findById(products, id) {
  return products.find(p => p.id === String(id)) || null;
}

/* Mark a product sold (idempotent). Returns the updated array + the product. */
function markSold(products, id, nowIso, orderRef) {
  const p = findById(products, id);
  if (!p) return { products, product: null };
  if (p.status !== "sold") {
    p.status = "sold";
    p.soldAt = nowIso;
    if (orderRef) p.orderRef = orderRef;
  }
  return { products, product: p };
}

/* Remove a product entirely (admin unpublish). */
function remove(products, id) {
  return products.filter(p => p.id !== String(id));
}

module.exports = {
  toMinorUnits, loadProducts, saveProducts, normalize, upsert,
  listAvailable, findById, markSold, remove, ZERO_DECIMAL,
};
