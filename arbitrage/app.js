/* Flipwise — Marketplace Arbitrage Agent  ("Buy low. List smart.")
 * ---------------------------------------------------------------------------
 * A self-contained, zero-dependency, offline-first command center for
 * resale arbitrage: it sources second-hand listings (Facebook Marketplace,
 * Leboncoin, ...), an AGENT scores each one for profit net of every fee,
 * you approve the winners, and approved deals auto-list on your storefront
 * at a margin-safe, market-competitive price.
 *
 * Everything lives in localStorage. No server, no build step, no accounts.
 * JSON backup/restore so your deal book can never be lost.
 *
 * ── The honest architecture note ───────────────────────────────────────────
 * Facebook Marketplace and Leboncoin have NO public API for reading listings
 * or buying, and their ToS forbid scraping. Fully-automatic *buying* is not
 * possible — a purchase is a human message + handoff. So the sourcing layer
 * is a PLUGGABLE ADAPTER interface (see SOURCES below). Ships with:
 *   - a realistic demo generator so the whole pipeline is usable today,
 *   - CSV / JSON import (paste what your own compliant collector exported),
 *   - a documented `Sources.register()` hook for a real feed you supply.
 * The profitability agent, pricing, pipeline and storefront are all real and
 * work the moment listings arrive from any source.
 * ===========================================================================
 */
"use strict";

const STORE_KEY = "flipwise_v1";

/* ============================================================
 * State + persistence
 * ============================================================ */
function defaultSettings() {
  return {
    currency: "EUR",          // EUR (Leboncoin) or USD/GBP — display only
    // Resale economics (all as fractions unless noted)
    resaleFeePct: 0.10,       // marketplace/payment cut on YOUR sale price
    fixedFeePerSale: 0.35,    // fixed payment fee per sale
    undercutPct: 0.08,        // list this far under estimated market to sell fast
    negotiationPct: 0.05,     // assumed haggle discount off asking price
    // Deal gates — the agent only flags deals clearing BOTH
    minMarginPct: 0.35,       // net profit / total cost must be >= this
    minProfitAbs: 25,         // and absolute net profit >= this (in currency)
    // Default per-deal overheads if a category has none
    defaultLogistics: 8,      // pickup / transport
    autoList: false,          // auto-move APPROVED deals straight to storefront
    // Source priority — points added to a deal's opportunity score based on
    // where it came from, so preferred channels rank first. Facebook
    // Marketplace is boosted by default (more casual, more mispriced sellers).
    sourcePriority: { "Facebook Marketplace": 15, "Leboncoin": 0 },
    // Live store (Stripe) — the customer website in ./store. Leave blank to
    // stay fully offline; set both to sync listed deals to the real shop.
    storeUrl: "",             // e.g. http://localhost:4242  (no trailing slash)
    adminToken: "",           // must match ADMIN_TOKEN on the store server
  };
}

/* Reference resale catalog: per category the median resale of a GOOD-condition
 * unit, typical refurb spend, demand (0-1 → sell-through speed), and a flat
 * logistics cost (bulky = pricier to move). Tune these to your market. */
function defaultCatalog() {
  return [
    { cat: "Phones",        resale: 260, refurb: 12, demand: 0.90, logistics: 4 },
    { cat: "Laptops",       resale: 380, refurb: 25, demand: 0.82, logistics: 6 },
    { cat: "Game consoles", resale: 210, refurb: 10, demand: 0.88, logistics: 6 },
    { cat: "Cameras",       resale: 300, refurb: 15, demand: 0.70, logistics: 5 },
    { cat: "Power tools",   resale: 120, refurb: 8,  demand: 0.75, logistics: 8 },
    { cat: "Bikes",         resale: 240, refurb: 30, demand: 0.72, logistics: 18 },
    { cat: "Furniture",     resale: 180, refurb: 20, demand: 0.55, logistics: 35 },
    { cat: "Appliances",    resale: 150, refurb: 18, demand: 0.60, logistics: 30 },
    { cat: "Instruments",   resale: 220, refurb: 15, demand: 0.58, logistics: 14 },
    { cat: "Sneakers",      resale: 110, refurb: 6,  demand: 0.80, logistics: 4 },
    { cat: "Baby gear",     resale: 90,  refurb: 10, demand: 0.66, logistics: 12 },
    { cat: "Home decor",    resale: 70,  refurb: 5,  demand: 0.50, logistics: 10 },
  ];
}

/* Condition multiplies both resale value and expected refurb. */
const CONDITIONS = {
  "New":        { resaleMul: 1.15, refurbMul: 0.0 },
  "Like new":   { resaleMul: 1.00, refurbMul: 0.2 },
  "Good":       { resaleMul: 0.85, refurbMul: 1.0 },
  "Fair":       { resaleMul: 0.65, refurbMul: 1.8 },
  "For parts":  { resaleMul: 0.40, refurbMul: 3.0 },
};

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      s.settings = Object.assign(defaultSettings(), s.settings || {});
      if (!Array.isArray(s.catalog) || !s.catalog.length) s.catalog = defaultCatalog();
      if (!Array.isArray(s.deals)) s.deals = [];
      if (typeof s.seq !== "number") s.seq = s.deals.length;
      return s;
    }
  } catch (e) { /* corrupt store → fresh; user can Restore from backup */ }
  return { settings: defaultSettings(), catalog: defaultCatalog(), deals: [], seq: 0,
           source: "demo", log: [] };
}

let state = load();
let ui = { tab: "console", filter: "all", search: "", editing: null };

function save() { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
function nextId() { state.seq += 1; return "d" + state.seq; }
function catOf(name) { return state.catalog.find(c => c.cat === name) || null; }

/* Source priority: extra opportunity-score points for preferred channels.
 * Applied live at ranking/display time so changing the weight re-ranks the
 * whole pipeline immediately (no re-scan needed). */
function sourceBoost(source) { return Number((state.settings.sourcePriority || {})[source] || 0); }
function effScore(d) { return Math.max(0, Math.min(100, Math.round(d.econ.score + sourceBoost(d.source)))); }

/* Deterministic timestamp helper (avoids Date.now noise in tests is not a
 * concern here — this is a live UI). */
function now() { return new Date().toISOString(); }

/* ============================================================
 * Money / formatting
 * ============================================================ */
const CUR_SYMBOL = { EUR: "€", USD: "$", GBP: "£" };
function money(n) {
  const s = CUR_SYMBOL[state.settings.currency] || "";
  const v = Math.round((n + Number.EPSILON) * 100) / 100;
  return s + v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
function pct(f) { return Math.round(f * 100) + "%"; }
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ============================================================
 * THE AGENT — profitability engine
 * ------------------------------------------------------------
 * Given a raw listing, compute the full unit economics and a verdict.
 * A listing is: { title, cat, condition, asking, location, source, url, img }
 * ============================================================ */
const Agent = {
  /* Estimated market resale for this specific unit. */
  estResale(listing) {
    const c = catOf(listing.cat);
    const cond = CONDITIONS[listing.condition] || CONDITIONS["Good"];
    const base = (c ? c.resale : listing.asking * 1.5);
    return Math.max(1, base * cond.resaleMul);
  },

  /* Full economics for a candidate deal. Returns numbers + a verdict. */
  evaluate(listing) {
    const S = state.settings;
    const c = catOf(listing.cat);
    const cond = CONDITIONS[listing.condition] || CONDITIONS["Good"];

    const estResale   = this.estResale(listing);
    const negotiated  = listing.asking * (1 - S.negotiationPct);
    const refurb      = (c ? c.refurb : 10) * cond.refurbMul;
    const logistics   = (c ? c.logistics : S.defaultLogistics);
    const costBase    = negotiated + refurb + logistics;   // all-in to own it, resale-ready

    // Price we can realistically list at and still move it (just under market).
    const marketSell  = estResale * (1 - S.undercutPct);

    // Minimum sale price to clear the margin gate, net of resale fees.
    //   net(sell) = sell*(1-feePct) - fixedFee - costBase
    //   require net >= minMargin * costBase  ⇒ solve for sell
    const feePct = S.resaleFeePct;
    const requiredSell = (costBase * (1 + S.minMarginPct) + S.fixedFeePerSale) / (1 - feePct);

    // Recommended list price: capture the most margin the market allows, but
    // never below what the gate requires (if it can't, it's a rejected deal).
    const listPrice = Math.max(marketSell, requiredSell);

    const netAt = (sell) => sell * (1 - feePct) - S.fixedFeePerSale - costBase;
    const netMarket = netAt(marketSell);
    const marginMarket = costBase > 0 ? netMarket / costBase : 0;

    // Verdict: is it profitable to list AT a market-competitive price?
    const profitable =
      marketSell >= requiredSell &&
      netMarket >= S.minProfitAbs &&
      marginMarket >= S.minMarginPct;

    const discountVsMarket = estResale > 0 ? (estResale - negotiated) / estResale : 0;
    const sellThroughDays = c ? Math.round(4 + (1 - c.demand) * 40) : 25;
    const score = this.score({ marginMarket, netMarket, demand: c ? c.demand : 0.5, discountVsMarket });

    return {
      estResale, negotiated, refurb, logistics, costBase,
      marketSell, requiredSell, listPrice,
      netMarket, marginMarket, discountVsMarket, sellThroughDays, score, profitable,
    };
  },

  /* 0–100 opportunity score. Rewards margin, absolute cash, demand and how
   * far below market you're buying — penalizes thin/negative deals. */
  score({ marginMarket, netMarket, demand, discountVsMarket }) {
    if (netMarket <= 0) return Math.max(0, Math.round(10 + marginMarket * 20));
    const m = Math.min(1, marginMarket / 1.0);        // margin, capped at 100%
    const cash = Math.min(1, netMarket / 150);         // €150 net ≈ full marks
    const disc = Math.min(1, Math.max(0, discountVsMarket / 0.6));
    const raw = 0.40 * m + 0.28 * cash + 0.18 * disc + 0.14 * demand;
    return Math.max(0, Math.min(100, Math.round(raw * 100)));
  },

  /* Run a full scan: pull listings from the active source, evaluate each,
   * and file the profitable ones into the pipeline as NEW deals. Returns a
   * summary of what happened. */
  scan(count) {
    const src = Sources.active();
    const raw = src.fetch(count || 12) || [];
    let added = 0, rejected = 0, best = null, bestEff = -1;
    raw.forEach(listing => {
      const ev = this.evaluate(listing);
      if (ev.profitable) {
        const deal = this.toDeal(listing, ev);
        state.deals.unshift(deal);
        added++;
        const eff = ev.score + sourceBoost(listing.source);
        if (eff > bestEff) { best = deal; bestEff = eff; }
      } else {
        rejected++;
      }
    });
    const entry = { t: now(), scanned: raw.length, added, rejected,
                    source: src.name, best: best ? best.title : null };
    state.log.unshift(entry);
    state.log = state.log.slice(0, 40);
    save();
    return entry;
  },

  toDeal(listing, ev) {
    return {
      id: nextId(),
      title: listing.title,
      cat: listing.cat,
      condition: listing.condition,
      asking: listing.asking,
      location: listing.location || "",
      source: listing.source || Sources.active().name,
      url: listing.url || "",
      img: listing.img || "",
      found: now(),
      status: "new",           // new → approved → listed → sold  (or archived)
      econ: ev,                // snapshot of the economics at discovery
      listPrice: Math.round(ev.listPrice * 100) / 100,
    };
  },
};

/* ============================================================
 * SOURCES — pluggable sourcing adapters
 * ------------------------------------------------------------
 * Each adapter: { name, label, note, fetch(count) -> [listing] }.
 * Register a real one from the console or another script:
 *   Sources.register({ name:'leboncoin', label:'Leboncoin (my feed)',
 *                       fetch: n => myCollector.pull(n) });
 * then Flipwise.setSource('leboncoin').
 * ============================================================ */
const Sources = {
  _all: {},
  register(adapter) { this._all[adapter.name] = adapter; return adapter; },
  list() { return Object.values(this._all); },
  active() { return this._all[state.source] || this._all["demo"]; },
};

/* --- Demo generator: realistic Marketplace/Leboncoin-style listings ------- */
Sources.register({
  name: "demo",
  label: "Demo generator",
  note: "Synthetic listings so you can drive the whole pipeline today.",
  _titles: {
    "Phones": ["iPhone 12 128Go", "Samsung Galaxy S21", "Pixel 6", "iPhone SE 2020", "OnePlus 9"],
    "Laptops": ["MacBook Air M1", "ThinkPad X1", "Dell XPS 13", "HP Envy", "Asus ZenBook"],
    "Game consoles": ["PS5 Slim", "Xbox Series S", "Nintendo Switch OLED", "PS4 Pro", "Steam Deck"],
    "Cameras": ["Canon EOS 200D", "Sony A6000", "Nikon D3500", "Fujifilm X-T20", "GoPro Hero 9"],
    "Power tools": ["Bosch perceuse", "Makita visseuse", "Dewalt meuleuse", "Ryobi kit", "Festool ponceuse"],
    "Bikes": ["VTT Rockrider", "Vélo route Btwin", "Vélo ville vintage", "BMX Mongoose", "Gravel Triban"],
    "Furniture": ["Canapé 3 places", "Table chêne massif", "Buffet scandinave", "Fauteuil cuir", "Bibliothèque"],
    "Appliances": ["Lave-linge Bosch", "Réfrigérateur", "Robot Thermomix", "Aspirateur Dyson", "Micro-ondes"],
    "Instruments": ["Guitare Fender", "Clavier Yamaha", "Violon 4/4", "Batterie électronique", "Ukulélé"],
    "Sneakers": ["Nike Air Max", "Adidas Samba", "New Balance 550", "Jordan 1", "Asics Gel"],
    "Baby gear": ["Poussette Yoyo", "Siège auto Cybex", "Lit parapluie", "Chaise haute", "Porte-bébé"],
    "Home decor": ["Lampe design", "Miroir doré", "Tapis berbère", "Cadre vintage", "Vase céramique"],
  },
  _cities: ["Paris 11e", "Lyon", "Marseille", "Lille", "Bordeaux", "Nantes", "Toulouse", "St-Witz 95"],
  _pick(arr, i) { return arr[i % arr.length]; },
  fetch(count) {
    const cats = state.catalog.map(c => c.cat);
    const conds = Object.keys(CONDITIONS);
    const out = [];
    // Use a rotating counter so the demo feels fresh each scan without RNG.
    const base = (state.log.length + state.seq + 1) * 7;
    for (let i = 0; i < count; i++) {
      const k = base + i * 3;
      const cat = this._pick(cats, k);
      const c = catOf(cat);
      const cond = this._pick(conds, k + 1);
      const condDef = CONDITIONS[cond];
      const est = c.resale * condDef.resaleMul;
      // Asking spread: some are steals (~35% of resale), some overpriced (~95%).
      const spread = [0.30, 0.42, 0.55, 0.68, 0.80, 0.95][k % 6];
      const asking = Math.max(5, Math.round(est * spread));
      const title = this._pick(this._titles[cat] || [cat], k + 2);
      out.push({
        title, cat, condition: cond, asking,
        location: this._pick(this._cities, k),
        source: (k % 2 === 0) ? "Facebook Marketplace" : "Leboncoin",
        url: "", img: "",
      });
    }
    return out;
  },
});

/* --- Import adapter: whatever you paste (CSV or JSON) ---------------------- */
Sources.register({
  name: "import",
  label: "Imported batch",
  note: "Evaluates the listings you last imported (CSV or JSON).",
  _batch: [],
  fetch() { const b = this._batch; this._batch = []; return b; },
});

/* Parse a pasted CSV/JSON payload into listings, evaluate all, keep winners.
 * CSV header (flexible order): title,category,condition,asking,location,source,url */
function importListings(text) {
  text = (text || "").trim();
  if (!text) return { error: "Nothing to import." };
  let rows = [];
  try {
    if (text[0] === "[" || text[0] === "{") {
      const j = JSON.parse(text);
      rows = Array.isArray(j) ? j : (j.listings || []);
    } else {
      rows = parseCsv(text);
    }
  } catch (e) { return { error: "Could not parse: " + e.message }; }

  const listings = rows.map(r => ({
    title: r.title || r.name || "Untitled",
    cat: normalizeCat(r.category || r.cat),
    condition: normalizeCond(r.condition),
    asking: parseFloat(r.asking || r.price || 0) || 0,
    location: r.location || "",
    source: r.source || "Import",
    url: r.url || "", img: r.img || "",
  })).filter(l => l.asking > 0);

  if (!listings.length) return { error: "No usable rows (need at least a price)." };
  Sources._all.import._batch = listings;
  state.source = "import";
  const summary = Agent.scan(listings.length);
  return { summary, total: listings.length };
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const head = lines[0].split(",").map(h => h.trim().toLowerCase());
  return lines.slice(1).map(line => {
    const cells = splitCsvLine(line);
    const o = {};
    head.forEach((h, i) => o[h] = (cells[i] || "").trim());
    return o;
  });
}
function splitCsvLine(line) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { q = !q; }
    else if (ch === "," && !q) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur); return out;
}
function normalizeCat(v) {
  if (!v) return "Home decor";
  const hit = state.catalog.find(c => c.cat.toLowerCase() === String(v).toLowerCase());
  return hit ? hit.cat : (state.catalog.find(c =>
    String(v).toLowerCase().includes(c.cat.toLowerCase().split(" ")[0])) || {}).cat || "Home decor";
}
function normalizeCond(v) {
  if (!v) return "Good";
  const hit = Object.keys(CONDITIONS).find(k => k.toLowerCase() === String(v).toLowerCase());
  return hit || "Good";
}

/* ============================================================
 * Pipeline actions
 * ============================================================ */
function dealById(id) { return state.deals.find(d => d.id === id); }

function setStatus(id, status) {
  const d = dealById(id); if (!d) return;
  d.status = status;
  if (status === "listed" && !d.listedAt) d.listedAt = now();
  if (status === "sold" && !d.soldAt) { d.soldAt = now(); if (!d.soldPrice) d.soldPrice = d.listPrice; }
  save(); render();
}
function approve(id) {
  const d = dealById(id); if (!d) return;
  d.status = state.settings.autoList ? "listed" : "approved";
  if (d.status === "listed") d.listedAt = now();
  save(); render();
}
function archive(id) { setStatus(id, "archived"); }
function deleteDeal(id) {
  state.deals = state.deals.filter(d => d.id !== id);
  save(); render();
}
function markSold(id) {
  const d = dealById(id); if (!d) return;
  const p = prompt("Sold price (" + (CUR_SYMBOL[state.settings.currency] || "") + "):", d.listPrice);
  if (p === null) return;
  d.soldPrice = parseFloat(p) || d.listPrice;
  setStatus(id, "sold");
}
function relistPrice(id) {
  const d = dealById(id); if (!d) return;
  const p = prompt("New list price:", d.listPrice);
  if (p === null) return;
  d.listPrice = parseFloat(p) || d.listPrice;
  save(); render();
}

/* Realized net profit for a sold deal (uses actual sold price). */
function realizedNet(d) {
  const S = state.settings;
  const sell = d.soldPrice || d.listPrice;
  return sell * (1 - S.resaleFeePct) - S.fixedFeePerSale - d.econ.costBase;
}

/* ============================================================
 * Portfolio metrics
 * ============================================================ */
function metrics() {
  const active = state.deals.filter(d => d.status !== "archived");
  const listed = state.deals.filter(d => d.status === "listed");
  const sold = state.deals.filter(d => d.status === "sold");
  const pipelineNet = state.deals
    .filter(d => ["new", "approved", "listed"].includes(d.status))
    .reduce((s, d) => s + d.econ.netMarket, 0);
  const capitalOut = state.deals
    .filter(d => ["approved", "listed"].includes(d.status))
    .reduce((s, d) => s + d.econ.costBase, 0);
  const realized = sold.reduce((s, d) => s + realizedNet(d), 0);
  const inventoryValue = listed.reduce((s, d) => s + d.listPrice, 0);
  return {
    activeCount: active.length,
    newCount: state.deals.filter(d => d.status === "new").length,
    listedCount: listed.length,
    soldCount: sold.length,
    pipelineNet, capitalOut, realized, inventoryValue,
  };
}

/* ============================================================
 * Rendering
 * ============================================================ */
const $ = sel => document.querySelector(sel);

function render() {
  renderTabs();
  const el = $("#view");
  if (ui.tab === "console")   el.innerHTML = viewConsole();
  else if (ui.tab === "pipeline") el.innerHTML = viewPipeline();
  else if (ui.tab === "store") el.innerHTML = viewStore();
  else if (ui.tab === "settings") el.innerHTML = viewSettings();
  bindDynamic();
}

function renderTabs() {
  const m = metrics();
  const tabs = [
    ["console", "Agent console", ""],
    ["pipeline", "Pipeline", m.newCount ? String(m.newCount) : ""],
    ["store", "Storefront", m.listedCount ? String(m.listedCount) : ""],
    ["settings", "Settings", ""],
  ];
  $("#tabs").innerHTML = tabs.map(([id, label, badge]) =>
    `<button class="tab ${ui.tab === id ? "active" : ""}" data-tab="${id}">${label}` +
    (badge ? ` <span class="badge">${badge}</span>` : "") + `</button>`).join("");
}

/* ---------- Console ---------- */
function viewConsole() {
  const m = metrics();
  const src = Sources.active();
  const stat = (label, val, sub) =>
    `<div class="stat"><div class="stat-v">${val}</div><div class="stat-l">${label}</div>` +
    (sub ? `<div class="stat-s">${sub}</div>` : "") + `</div>`;

  const sourceOpts = Sources.list().map(s =>
    `<option value="${s.name}" ${state.source === s.name ? "selected" : ""}>${esc(s.label)}</option>`).join("");

  const logRows = state.log.length ? state.log.map(l =>
    `<tr><td>${new Date(l.t).toLocaleString()}</td><td>${esc(l.source)}</td>
      <td>${l.scanned}</td><td class="pos">${l.added}</td><td class="muted">${l.rejected}</td>
      <td>${l.best ? esc(l.best) : "—"}</td></tr>`).join("")
    : `<tr><td colspan="6" class="muted center">No scans yet — run the agent above.</td></tr>`;

  return `
  <section class="hero">
    <div>
      <h2>Agent console</h2>
      <p class="sub">Scan a source, and the agent files every profitable deal (net of fees) into your pipeline.
      Everything below the <b>${pct(state.settings.minMarginPct)}</b> margin / ${money(state.settings.minProfitAbs)} floor is auto-rejected.</p>
    </div>
    <div class="scan-box">
      <label class="fld"><span>Source</span>
        <select id="srcSel">${sourceOpts}</select>
      </label>
      <div class="src-note">${esc(src.note || "")}</div>
      <div class="row">
        <button class="btn primary" id="scanBtn">▶ Run scan</button>
        <button class="btn ghost" id="importBtn">Import CSV / JSON</button>
      </div>
    </div>
  </section>

  <div class="stats">
    ${stat("Live deals", m.activeCount, m.newCount + " awaiting review")}
    ${stat("Listed", m.listedCount, money(m.inventoryValue) + " at market")}
    ${stat("Projected profit", money(m.pipelineNet), "open pipeline, net")}
    ${stat("Realized profit", money(m.realized), m.soldCount + " sold")}
  </div>

  <h3 class="section-title">Scan history</h3>
  <div class="table-wrap">
    <table class="tbl">
      <thead><tr><th>When</th><th>Source</th><th>Scanned</th><th>Kept</th><th>Rejected</th><th>Top find</th></tr></thead>
      <tbody>${logRows}</tbody>
    </table>
  </div>`;
}

/* ---------- Pipeline ---------- */
function viewPipeline() {
  const order = { new: 0, approved: 1, listed: 2, sold: 3, archived: 4 };
  let deals = state.deals.slice().sort((a, b) =>
    (order[a.status] - order[b.status]) || (effScore(b) - effScore(a)));

  if (ui.filter !== "all") deals = deals.filter(d => d.status === ui.filter);
  if (ui.search) {
    const q = ui.search.toLowerCase();
    deals = deals.filter(d => (d.title + " " + d.cat + " " + d.location).toLowerCase().includes(q));
  }

  const filters = ["all", "new", "approved", "listed", "sold", "archived"].map(f =>
    `<button class="chip ${ui.filter === f ? "active" : ""}" data-filter="${f}">${f}</button>`).join("");

  const cards = deals.length ? deals.map(dealCard).join("")
    : `<div class="empty">No deals here yet. Run a scan in the <b>Agent console</b>.</div>`;

  return `
  <section class="hero">
    <div><h2>Deal pipeline</h2><p class="sub">Approve winners → they list on your storefront → mark sold to bank the profit.</p></div>
    <div class="row">
      <input id="searchBox" class="input" placeholder="Search deals…" value="${esc(ui.search)}">
    </div>
  </section>
  <div class="chips">${filters}</div>
  <div class="deal-grid">${cards}</div>`;
}

function dealCard(d) {
  const e = d.econ;
  const sc = effScore(d);                     // score incl. source priority
  const boost = sourceBoost(d.source);
  const scoreClass = sc >= 70 ? "hot" : sc >= 45 ? "warm" : "cool";
  const badge = { new: "New", approved: "Approved", listed: "Listed", sold: "Sold", archived: "Archived" }[d.status];
  const srcTag = boost > 0
    ? `<span class="src-prio" title="Priority source: +${boost} to score">★ ${esc(d.source)}</span>`
    : esc(d.source);
  const scoreTitle = boost > 0 ? `Opportunity ${e.score} +${boost} priority` : "Opportunity score";

  const actions = [];
  if (d.status === "new") {
    actions.push(`<button class="btn primary sm" data-act="approve" data-id="${d.id}">Approve → list</button>`);
    actions.push(`<button class="btn ghost sm" data-act="archive" data-id="${d.id}">Skip</button>`);
  } else if (d.status === "approved") {
    actions.push(`<button class="btn primary sm" data-act="list" data-id="${d.id}">Publish to store</button>`);
    actions.push(`<button class="btn ghost sm" data-act="archive" data-id="${d.id}">Skip</button>`);
  } else if (d.status === "listed") {
    actions.push(`<button class="btn primary sm" data-act="sold" data-id="${d.id}">Mark sold</button>`);
    actions.push(`<button class="btn ghost sm" data-act="reprice" data-id="${d.id}">Reprice</button>`);
  } else if (d.status === "sold") {
    actions.push(`<span class="realized">+${money(realizedNet(d))} banked</span>`);
    actions.push(`<button class="btn ghost sm" data-act="del" data-id="${d.id}">Remove</button>`);
  } else {
    actions.push(`<button class="btn ghost sm" data-act="restore" data-id="${d.id}">Restore</button>`);
    actions.push(`<button class="btn ghost sm" data-act="del" data-id="${d.id}">Remove</button>`);
  }

  return `
  <article class="deal">
    <div class="deal-top">
      <div class="thumb ${catClass(d.cat)}">${catGlyph(d.cat)}</div>
      <div class="deal-head">
        <div class="deal-title">${esc(d.title)}</div>
        <div class="deal-meta">${esc(d.cat)} · ${esc(d.condition)} · ${esc(d.location || "—")}</div>
        <div class="deal-src">${srcTag}</div>
      </div>
      <div class="score ${scoreClass}" title="${scoreTitle}">${sc}</div>
    </div>
    <div class="econ">
      <div><span>Buy</span><b>${money(d.asking)}</b></div>
      <div><span>Est. resale</span><b>${money(e.estResale)}</b></div>
      <div><span>List at</span><b>${money(d.listPrice)}</b></div>
      <div class="profit"><span>Net profit</span><b>+${money(e.netMarket)}</b></div>
    </div>
    <div class="econ-bar" title="Margin ${pct(e.marginMarket)}">
      <div class="econ-fill" style="width:${Math.max(4, Math.min(100, e.marginMarket * 100))}%"></div>
    </div>
    <div class="deal-foot">
      <span class="status s-${d.status}">${badge}</span>
      <span class="sub2">${pct(e.marginMarket)} margin · sells ~${e.sellThroughDays}d</span>
    </div>
    <div class="deal-actions">${actions.join("")}</div>
  </article>`;
}

/* ---------- Storefront (the public-facing sale side) ---------- */
function viewStore() {
  const listed = state.deals.filter(d => d.status === "listed")
    .sort((a, b) => effScore(b) - effScore(a));
  const grid = listed.length ? listed.map(storeCard).join("")
    : `<div class="empty">Nothing listed yet. Approve deals in the <b>Pipeline</b> and they appear here for buyers.</div>`;

  const connected = state.settings.storeUrl && state.settings.adminToken;
  const bar = connected
    ? `<div class="store-bar connected">
         <span class="dot-on"></span> Connected to live store <code>${esc(state.settings.storeUrl)}</code>
         <div class="row">
           <button class="btn primary sm" id="syncStore">⇧ Sync ${listed.length} to live store</button>
           <a class="btn ghost sm" href="${esc(state.settings.storeUrl)}" target="_blank" rel="noopener">Open live store ↗</a>
         </div>
       </div>`
    : `<div class="store-bar">
         <span class="dot-off"></span> Preview mode — buying is simulated here.
         Connect a Stripe-backed store in <b>Settings → Live store</b> to sell for real.
       </div>`;

  return `
  <section class="store-hero">
    <h2>Flipwise Store</h2>
    <p>Hand-picked second-hand gear, checked and ready. ${listed.length} item${listed.length === 1 ? "" : "s"} available.</p>
  </section>
  ${bar}
  <div class="store-grid">${grid}</div>`;
}
function storeCard(d) {
  const connected = state.settings.storeUrl && state.settings.adminToken;
  const label = connected ? "Buy (Stripe) ↗" : "Buy now (demo)";
  return `
  <article class="product">
    <div class="p-img ${catClass(d.cat)}">${catGlyph(d.cat)}<span class="p-cond">${esc(d.condition)}</span></div>
    <div class="p-body">
      <div class="p-title">${esc(d.title)}</div>
      <div class="p-cat">${esc(d.cat)}</div>
      <div class="p-price">${money(d.listPrice)}</div>
      <button class="btn primary block" data-act="buy" data-id="${d.id}">${label}</button>
    </div>
  </article>`;
}

/* Push every listed deal to the live store's admin sync endpoint. */
async function syncToStore() {
  const S = state.settings;
  if (!S.storeUrl || !S.adminToken) { toast("Set store URL + admin token in Settings first."); return; }
  const products = state.deals.filter(d => d.status === "listed").map(d => ({
    id: d.id, title: d.title, cat: d.cat, condition: d.condition,
    price: d.listPrice, currency: S.currency, glyph: catGlyph(d.cat),
  }));
  try {
    const res = await fetch(S.storeUrl.replace(/\/$/, "") + "/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": S.adminToken },
      body: JSON.stringify({ products }),
    });
    const data = await res.json();
    if (!res.ok) { toast(data.error || ("Sync failed (" + res.status + ")")); return; }
    toast(`Synced — ${data.added} new, ${data.updated} updated (${data.total} live)`);
  } catch (e) {
    toast("Could not reach the store: " + e.message);
  }
}

/* ---------- Settings ---------- */
function viewSettings() {
  const S = state.settings;
  const num = (id, label, val, step, sub) =>
    `<label class="fld"><span>${label}${sub ? ` <i>${sub}</i>` : ""}</span>
      <input type="number" id="${id}" value="${val}" step="${step || 1}"></label>`;

  const catRows = state.catalog.map((c, i) => `
    <tr>
      <td>${esc(c.cat)}</td>
      <td><input type="number" data-cat="${i}" data-k="resale" value="${c.resale}" step="5"></td>
      <td><input type="number" data-cat="${i}" data-k="refurb" value="${c.refurb}" step="1"></td>
      <td><input type="number" data-cat="${i}" data-k="logistics" value="${c.logistics}" step="1"></td>
      <td><input type="number" data-cat="${i}" data-k="demand" value="${c.demand}" step="0.05" min="0" max="1"></td>
    </tr>`).join("");

  return `
  <section class="hero"><div><h2>Settings</h2><p class="sub">Tune the agent's economics. Changes apply to the next scan and to displayed pricing.</p></div></section>

  <div class="settings-grid">
    <div class="card">
      <h3>Deal gates</h3>
      ${num("minMarginPct", "Min margin", Math.round(S.minMarginPct * 100), 1, "%")}
      ${num("minProfitAbs", "Min net profit", S.minProfitAbs, 1, CUR_SYMBOL[S.currency])}
      <label class="fld chk"><input type="checkbox" id="autoList" ${S.autoList ? "checked" : ""}>
        <span>Auto-publish approved deals to the store</span></label>
    </div>
    <div class="card">
      <h3>Source priority</h3>
      <p class="sub" style="margin-bottom:12px">Points added to a deal's opportunity score by channel, so preferred sources rank first. Facebook Marketplace is prioritized by default.</p>
      ${num("prioFb", "Facebook Marketplace", (S.sourcePriority || {})["Facebook Marketplace"] || 0, 1, "+ score")}
      ${num("prioLbc", "Leboncoin", (S.sourcePriority || {})["Leboncoin"] || 0, 1, "+ score")}
    </div>
    <div class="card">
      <h3>Resale economics</h3>
      ${num("resaleFeePct", "Resale + payment fee", Math.round(S.resaleFeePct * 100), 1, "%")}
      ${num("fixedFeePerSale", "Fixed fee / sale", S.fixedFeePerSale, 0.05, CUR_SYMBOL[S.currency])}
      ${num("undercutPct", "Undercut market by", Math.round(S.undercutPct * 100), 1, "%")}
      ${num("negotiationPct", "Assumed haggle off asking", Math.round(S.negotiationPct * 100), 1, "%")}
      ${num("defaultLogistics", "Default logistics", S.defaultLogistics, 1, CUR_SYMBOL[S.currency])}
      <label class="fld"><span>Currency</span>
        <select id="currency">
          ${["EUR", "USD", "GBP"].map(c => `<option ${S.currency === c ? "selected" : ""}>${c}</option>`).join("")}
        </select></label>
    </div>
    <div class="card">
      <h3>Live store (Stripe)</h3>
      <p class="sub" style="margin-bottom:12px">The customer website lives in <code>./store</code>. Run it, paste its URL and admin token here, then use <b>Sync to live store</b> on the Storefront tab. Buying then goes through real Stripe Checkout.</p>
      <label class="fld"><span>Store URL <i>(no trailing slash)</i></span>
        <input type="text" id="storeUrl" value="${esc(S.storeUrl)}" placeholder="http://localhost:4242"></label>
      <label class="fld"><span>Admin token <i>(matches ADMIN_TOKEN)</i></span>
        <input type="text" id="adminToken" value="${esc(S.adminToken)}" placeholder="paste the server's ADMIN_TOKEN"></label>
    </div>
  </div>

  <h3 class="section-title">Reference catalog</h3>
  <p class="sub">Median resale (Good condition), typical refurb spend, logistics cost, and demand (0–1 → sell speed).</p>
  <div class="table-wrap">
    <table class="tbl">
      <thead><tr><th>Category</th><th>Resale ${CUR_SYMBOL[S.currency]}</th><th>Refurb</th><th>Logistics</th><th>Demand</th></tr></thead>
      <tbody>${catRows}</tbody>
    </table>
  </div>
  <div class="row spread">
    <button class="btn primary" id="saveSettings">Save settings</button>
    <div class="row">
      <button class="btn ghost" id="exportBtn">Export backup</button>
      <label class="btn ghost file-btn">Restore<input type="file" id="importFile" accept="application/json" hidden></label>
      <button class="btn danger ghost" id="resetBtn">Reset all</button>
    </div>
  </div>`;
}

/* ---------- category glyphs / colors (offline-safe, no images) ---------- */
function catClass(cat) {
  const map = { "Phones": "c1", "Laptops": "c2", "Game consoles": "c3", "Cameras": "c4",
    "Power tools": "c5", "Bikes": "c6", "Furniture": "c7", "Appliances": "c8",
    "Instruments": "c9", "Sneakers": "c10", "Baby gear": "c11", "Home decor": "c12" };
  return map[cat] || "c12";
}
function catGlyph(cat) {
  const map = { "Phones": "📱", "Laptops": "💻", "Game consoles": "🎮", "Cameras": "📷",
    "Power tools": "🛠️", "Bikes": "🚲", "Furniture": "🛋️", "Appliances": "🔌",
    "Instruments": "🎸", "Sneakers": "👟", "Baby gear": "🍼", "Home decor": "🪞" };
  return map[cat] || "📦";
}

/* ============================================================
 * Event binding
 * ============================================================ */
function bindDynamic() {
  // Console
  const scanBtn = $("#scanBtn");
  if (scanBtn) scanBtn.onclick = () => {
    const s = Agent.scan(12);
    toast(`Scanned ${s.scanned} · kept ${s.added} · rejected ${s.rejected}`);
    render();
  };
  const srcSel = $("#srcSel");
  if (srcSel) srcSel.onchange = e => { state.source = e.target.value; save(); render(); };
  const importBtn = $("#importBtn");
  if (importBtn) importBtn.onclick = openImport;

  // Pipeline
  document.querySelectorAll("[data-filter]").forEach(b =>
    b.onclick = () => { ui.filter = b.dataset.filter; render(); });
  const searchBox = $("#searchBox");
  if (searchBox) searchBox.oninput = e => { ui.search = e.target.value;
    // keep focus: re-render list only
    const grid = document.querySelector(".deal-grid");
    if (grid) { render(); const sb = $("#searchBox"); if (sb) { sb.focus(); sb.setSelectionRange(sb.value.length, sb.value.length); } }
  };

  // Storefront sync
  const syncBtn = $("#syncStore");
  if (syncBtn) syncBtn.onclick = syncToStore;

  // Deal + store actions (event delegation)
  document.querySelectorAll("[data-act]").forEach(b => b.onclick = () => {
    const id = b.dataset.id, act = b.dataset.act;
    if (act === "approve") approve(id);
    else if (act === "list") setStatus(id, "listed");
    else if (act === "archive") archive(id);
    else if (act === "restore") setStatus(id, "new");
    else if (act === "sold") markSold(id);
    else if (act === "reprice") relistPrice(id);
    else if (act === "del") deleteDeal(id);
    else if (act === "buy") buyFlow(id);
  });

  // Settings
  bindSettings();
}

function bindSettings() {
  const save1 = $("#saveSettings");
  if (!save1) return;
  save1.onclick = () => {
    const S = state.settings;
    const g = id => { const el = $("#" + id); return el ? el.value : null; };
    S.minMarginPct = (parseFloat(g("minMarginPct")) || 0) / 100;
    S.minProfitAbs = parseFloat(g("minProfitAbs")) || 0;
    S.resaleFeePct = (parseFloat(g("resaleFeePct")) || 0) / 100;
    S.fixedFeePerSale = parseFloat(g("fixedFeePerSale")) || 0;
    S.undercutPct = (parseFloat(g("undercutPct")) || 0) / 100;
    S.negotiationPct = (parseFloat(g("negotiationPct")) || 0) / 100;
    S.defaultLogistics = parseFloat(g("defaultLogistics")) || 0;
    S.currency = $("#currency").value;
    S.autoList = $("#autoList").checked;
    S.storeUrl = ($("#storeUrl").value || "").trim();
    S.adminToken = ($("#adminToken").value || "").trim();
    S.sourcePriority = Object.assign({}, S.sourcePriority, {
      "Facebook Marketplace": parseFloat(g("prioFb")) || 0,
      "Leboncoin": parseFloat(g("prioLbc")) || 0,
    });
    document.querySelectorAll("[data-cat]").forEach(inp => {
      const c = state.catalog[+inp.dataset.cat];
      if (c) c[inp.dataset.k] = parseFloat(inp.value) || 0;
    });
    save();
    toast("Settings saved");
    render();
  };
  $("#exportBtn").onclick = exportBackup;
  $("#resetBtn").onclick = () => {
    if (confirm("Erase all deals and settings? This cannot be undone (export a backup first).")) {
      localStorage.removeItem(STORE_KEY); state = load(); ui.tab = "console"; render();
    }
  };
  const f = $("#importFile");
  if (f) f.onchange = e => restoreBackup(e.target.files[0]);
}

/* ============================================================
 * Import / buy / backup / toast
 * ============================================================ */
function openImport() {
  const sample = "title,category,condition,asking,location,source\n" +
    "iPhone 12 128Go,Phones,Good,150,Paris,Leboncoin\n" +
    "Canapé cuir,Furniture,Fair,60,Lyon,Facebook Marketplace";
  const modal = document.createElement("div");
  modal.className = "modal-bg";
  modal.innerHTML = `
    <div class="modal">
      <h3>Import listings</h3>
      <p class="sub">Paste CSV (with header) or a JSON array. The agent evaluates every row and keeps the profitable ones.</p>
      <textarea id="importText" rows="9" placeholder="${esc(sample)}"></textarea>
      <div class="row spread">
        <button class="btn ghost" id="sampleBtn">Load sample</button>
        <div class="row">
          <button class="btn ghost" id="cancelImport">Cancel</button>
          <button class="btn primary" id="doImport">Evaluate & import</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  $("#sampleBtn").onclick = () => { $("#importText").value = sample; };
  $("#cancelImport").onclick = () => modal.remove();
  modal.onclick = e => { if (e.target === modal) modal.remove(); };
  $("#doImport").onclick = () => {
    const res = importListings($("#importText").value);
    if (res.error) { toast(res.error); return; }
    modal.remove();
    ui.tab = "pipeline"; ui.filter = "new";
    toast(`Imported ${res.total} · kept ${res.summary.added}`);
    render();
  };
}

async function buyFlow(id) {
  const d = dealById(id); if (!d) return;
  const S = state.settings;
  // Connected to a live Stripe store → start a real Checkout Session there.
  if (S.storeUrl && S.adminToken) {
    try {
      const base = S.storeUrl.replace(/\/$/, "");
      const res = await fetch(base + "/api/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: d.id }),
      });
      const data = await res.json();
      if (data.url) { window.open(data.url, "_blank", "noopener"); return; }
      toast(data.error || "Checkout unavailable — did you Sync to the live store first?");
    } catch (e) { toast("Could not reach the store: " + e.message); }
    return;
  }
  // Offline preview: simulate the sale and bank the profit locally.
  toast(`🛒 Order placed for “${d.title}” at ${money(d.listPrice)} (demo checkout)`);
  markSold(id);
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "flipwise-backup.json";
  a.click();
  URL.revokeObjectURL(a.href);
}
function restoreBackup(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const s = JSON.parse(r.result);
      if (!s || !Array.isArray(s.deals)) throw new Error("Not a Flipwise backup");
      localStorage.setItem(STORE_KEY, JSON.stringify(s));
      state = load(); ui.tab = "console"; render();
      toast("Backup restored");
    } catch (e) { toast("Restore failed: " + e.message); }
  };
  r.readAsText(file);
}

let toastTimer = null;
function toast(msg) {
  let t = $("#toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ============================================================
 * Public API (for wiring real sources from another script/console)
 * ============================================================ */
const Flipwise = {
  Agent, Sources,
  setSource(name) { if (Sources._all[name]) { state.source = name; save(); render(); } },
  evaluate: l => Agent.evaluate(l),
  scan: n => { const s = Agent.scan(n); render(); return s; },
  importListings,
  state: () => state,
};
window.Flipwise = Flipwise;

/* ============================================================
 * Boot
 * ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  $("#tabs").addEventListener("click", e => {
    const b = e.target.closest("[data-tab]");
    if (b) { ui.tab = b.dataset.tab; render(); }
  });
  render();
});
