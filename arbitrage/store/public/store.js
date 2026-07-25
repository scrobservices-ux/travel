/* Flipwise Store — customer storefront.
 * Loads products from the server and starts real Stripe Checkout on Buy.
 * The price shown is informational; the CHARGE is set server-side from the
 * product record, so it can't be tampered with here. */
"use strict";

const CUR = { EUR: "€", USD: "$", GBP: "£" };
const money = (n, c) => (CUR[c] || "") + Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, m =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

const CAT_TILE = { "Phones": "c1", "Laptops": "c2", "Game consoles": "c3", "Cameras": "c4",
  "Power tools": "c5", "Bikes": "c6", "Furniture": "c7", "Appliances": "c8",
  "Instruments": "c9", "Sneakers": "c10", "Baby gear": "c11", "Home decor": "c12" };

async function boot() {
  try {
    const cfg = await fetch("/api/config").then(r => r.json());
    const tag = document.getElementById("modeTag");
    if (cfg.mode === "MOCK") { tag.textContent = "TEST MODE — no real charge"; tag.classList.add("mock"); }
  } catch (e) { /* config optional */ }
  loadProducts();
}

async function loadProducts() {
  const grid = document.getElementById("grid");
  try {
    const { products } = await fetch("/api/products").then(r => r.json());
    if (!products.length) { grid.innerHTML = `<div class="empty">The shop is being restocked — check back soon.</div>`; return; }
    grid.innerHTML = products.map(card).join("");
    grid.querySelectorAll("[data-buy]").forEach(b => b.onclick = () => buy(b.dataset.buy, b));
  } catch (e) {
    grid.innerHTML = `<div class="empty">Couldn't reach the shop. Is the server running?</div>`;
  }
}

function card(p) {
  const tile = CAT_TILE[p.cat] || "c12";
  return `
  <article class="product">
    <div class="p-img ${tile}"><span class="glyph">${esc(p.glyph || "📦")}</span><span class="p-cond">${esc(p.condition)}</span></div>
    <div class="p-body">
      <div class="p-title">${esc(p.title)}</div>
      <div class="p-cat">${esc(p.cat)}</div>
      <div class="p-price">${money(p.price, p.currency)}</div>
      <button class="btn" data-buy="${esc(p.id)}">Buy now</button>
    </div>
  </article>`;
}

async function buy(id, btn) {
  btn.disabled = true; const old = btn.textContent; btn.textContent = "Redirecting…";
  try {
    const res = await fetch("/api/checkout", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: id }),
    });
    const data = await res.json();
    if (data.url) { window.location = data.url; return; }
    alert(data.error || "Could not start checkout.");
  } catch (e) {
    alert("Checkout failed: " + e.message);
  }
  btn.disabled = false; btn.textContent = old;
}

boot();
