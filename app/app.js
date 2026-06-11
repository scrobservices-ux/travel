/* Tamarun — Njangi / Tontine / Trouble Fund ledger.
 * Offline-first: all data lives in localStorage on the treasurer's phone.
 * Works for small groups (5 members) and big ones (200+): bulk import,
 * search filters, and bulk actions everywhere a list can grow.
 * The transaction log is append-only: mistakes are fixed with reversal
 * entries, never by editing history. That is the trust guarantee.
 */
"use strict";

const STORE_KEY = "tamarun_v1";

let state = load();
// Transient UI state (not persisted)
let ui = { tab: "dashboard", sittingId: null, levyId: null };

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* corrupted store: start fresh, user can Restore from backup */ }
  return { groups: [], activeGroupId: null, lang: "en" };
}

function save() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

/* ---------- helpers ---------- */

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const todayISO = () => new Date().toISOString().slice(0, 10);

function fmt(n) {
  return new Intl.NumberFormat("fr-FR").format(Math.round(n)) + " FCFA";
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function activeGroup() {
  return state.groups.find(g => g.id === state.activeGroupId) || null;
}

function member(g, id) {
  return g.members.find(m => m.id === id);
}

function memberName(g, id) {
  const m = member(g, id);
  return m ? m.name : "(removed member)";
}

/* ---------- derived figures ---------- */

// Sum of a member's contributions for one sitting (reversals net out).
function paidForSitting(g, sittingId, memberId) {
  return g.transactions
    .filter(t => t.sittingId === sittingId && t.memberId === memberId &&
                 (t.type === "contribution" || t.type === "reversal-contribution"))
    .reduce((s, t) => s + t.amount, 0);
}

function sittingTotal(g, sittingId) {
  return g.transactions
    .filter(t => t.sittingId === sittingId &&
                 (t.type === "contribution" || t.type === "reversal-contribution" || t.type === "fine"))
    .reduce((s, t) => s + t.amount, 0);
}

function mainFundBalance(g) {
  return g.transactions
    .filter(t => ["contribution", "reversal-contribution", "fine", "payout"].includes(t.type))
    .reduce((s, t) => s + t.amount, 0);
}

function troubleBalance(g) {
  return g.transactions
    .filter(t => ["levy-payment", "reversal-levy", "trouble-payout"].includes(t.type))
    .reduce((s, t) => s + t.amount, 0);
}

function levyPaid(g, levyId, memberId) {
  return g.transactions
    .filter(t => t.levyId === levyId && t.memberId === memberId &&
                 (t.type === "levy-payment" || t.type === "reversal-levy"))
    .reduce((s, t) => s + t.amount, 0);
}

function memberYearTotal(g, memberId) {
  const year = new Date().getFullYear();
  return g.transactions
    .filter(t => t.memberId === memberId && t.date.startsWith(String(year)) &&
                 ["contribution", "reversal-contribution", "levy-payment", "reversal-levy"].includes(t.type))
    .reduce((s, t) => s + t.amount, 0);
}

function activeMembers(g) {
  return g.members.filter(m => m.active);
}

function currentBeneficiary(g) {
  const order = g.rotation.filter(id => { const m = member(g, id); return m && m.active; });
  if (!order.length) return null;
  return member(g, order[g.rotationIndex % order.length]);
}

/* ---------- transactions (append-only) ---------- */

function addTx(g, tx) {
  g.transactions.push(Object.assign({
    id: uid(),
    date: todayISO(),
    ts: Date.now(),
  }, tx));
  save();
}

/* ---------- receipts ---------- */

const RECEIPTS = {
  en: (p) => `TAMARUN RECEIPT — ${p.group}\n${p.name} paid ${p.amount} (${p.method}) for ${p.what} on ${p.date}.\nTotal paid this year: ${p.yearTotal}.\nThank you!`,
  fr: (p) => `REÇU TAMARUN — ${p.group}\n${p.name} a payé ${p.amount} (${p.method}) pour ${p.what} le ${p.date}.\nTotal payé cette année : ${p.yearTotal}.\nMerci !`,
  pcm: (p) => `TAMARUN RECEIPT — ${p.group}\n${p.name} don pay ${p.amount} (${p.method}) for ${p.what} on ${p.date}.\nTotal weh you don pay dis year na: ${p.yearTotal}.\nTank you plenty!`,
};

function receiptText(g, tx) {
  const what =
    tx.type === "levy-payment" ? (state.lang === "fr" ? "levée du fonds de secours" : "trouble fund levy") :
    tx.sittingId ? (state.lang === "fr" ? "la séance" : "di sitting / the sitting") :
    (state.lang === "fr" ? "cotisation" : "contribution");
  return RECEIPTS[state.lang || "en"]({
    group: g.name,
    name: memberName(g, tx.memberId),
    amount: fmt(tx.amount),
    method: tx.method || "cash",
    what,
    date: tx.date,
    yearTotal: fmt(memberYearTotal(g, tx.memberId)),
  });
}

/* ---------- rendering ---------- */

function render() {
  renderSidebar();
  const g = activeGroup();
  const main = document.getElementById("main");
  if (!g) {
    main.innerHTML = `
      <div class="empty">
        <h2>Welcome to Tamarun</h2>
        <p>The digital book for your njangi house — small family njangi or big association, same tool.</p>
        <button class="btn" onclick="App.showNewGroup()">Create your first group</button>
      </div>`;
    return;
  }
  const tabs = [
    ["dashboard", "Dashboard"],
    ["members", `Members (${activeMembers(g).length})`],
    ["sittings", "Sittings & Pot"],
    ["trouble", "Trouble Fund"],
    ["ledger", "Ledger"],
    ["settings", "Settings"],
  ];
  let html = `<div class="tabs">` + tabs.map(([id, label]) =>
    `<button class="${ui.tab === id ? "active" : ""}" onclick="App.tab('${id}')">${label}</button>`
  ).join("") + `</div>`;

  if (ui.tab === "dashboard") html += viewDashboard(g);
  else if (ui.tab === "members") html += viewMembers(g);
  else if (ui.tab === "sittings") html += viewSittings(g);
  else if (ui.tab === "trouble") html += viewTrouble(g);
  else if (ui.tab === "ledger") html += viewLedger(g);
  else if (ui.tab === "settings") html += viewSettings(g);

  main.innerHTML = html;
}

function renderSidebar() {
  const ul = document.getElementById("groupList");
  ul.innerHTML = state.groups.map(g => `
    <li class="${g.id === state.activeGroupId ? "active" : ""}" onclick="App.selectGroup('${g.id}')">
      <span class="gname">${esc(g.name)}</span>
      <span class="gmeta">${activeMembers(g).length} members · ${fmt(g.contribution)}/${esc(g.frequency)}</span>
    </li>`).join("") || `<li class="muted" style="cursor:default">No groups yet</li>`;
  document.getElementById("langSelect").value = state.lang || "en";
}

/* ----- dashboard ----- */

function viewDashboard(g) {
  const ben = currentBeneficiary(g);
  const lastTx = g.transactions.slice(-8).reverse();
  return `
  <div class="statgrid">
    <div class="stat green"><div class="label">Main fund balance</div><div class="value">${fmt(mainFundBalance(g))}</div></div>
    <div class="stat gold"><div class="label">Trouble fund</div><div class="value">${fmt(troubleBalance(g))}</div></div>
    <div class="stat blue"><div class="label">Active members</div><div class="value">${activeMembers(g).length}</div></div>
    <div class="stat red"><div class="label">Next pot goes to</div><div class="value">${ben ? esc(ben.name) : "—"}</div></div>
  </div>
  <div class="card mt">
    <h3>Recent activity</h3>
    ${lastTx.length ? `<table><thead><tr><th>Date</th><th>Member</th><th>Type</th><th class="num">Amount</th></tr></thead><tbody>` +
      lastTx.map(t => `<tr><td>${t.date}</td><td>${esc(memberName(g, t.memberId))}</td><td>${esc(txLabel(t))}</td><td class="num">${fmt(t.amount)}</td></tr>`).join("") +
      `</tbody></table>` : `<p class="muted">No transactions yet. Open a sitting to start collecting.</p>`}
  </div>`;
}

function txLabel(t) {
  return {
    "contribution": "Contribution",
    "reversal-contribution": "Reversal (contribution)",
    "fine": "Fine collected",
    "payout": "Pot payout",
    "levy-payment": "Trouble levy",
    "reversal-levy": "Reversal (levy)",
    "trouble-payout": "Trouble payout",
  }[t.type] || t.type;
}

/* ----- members ----- */

function viewMembers(g) {
  const rows = g.members.map(m => `
    <tr data-search="${esc(m.name.toLowerCase())} ${esc(m.phone || "")}">
      <td>${esc(m.name)} ${m.active ? "" : '<span class="pill grey">left</span>'}</td>
      <td>${esc(m.phone || "—")}</td>
      <td class="num">${fmt(memberYearTotal(g, m.id))}</td>
      <td class="right row-actions">
        ${m.active
          ? `<button class="btn small ghost" onclick="App.toggleMember('${m.id}')">Deactivate</button>`
          : `<button class="btn small ghost" onclick="App.toggleMember('${m.id}')">Reactivate</button>`}
      </td>
    </tr>`).join("");

  return `
  <div class="card">
    <h3>Add one member</h3>
    <div class="formrow">
      <label class="field"><span>Name</span><input type="text" id="mName" placeholder="e.g. Ngwa Divine"></label>
      <label class="field"><span>Phone (MoMo/OM, optional)</span><input type="tel" id="mPhone" placeholder="6 7X XX XX XX"></label>
    </div>
    <button class="btn" onclick="App.addMember()">Add member</button>
  </div>
  <div class="card">
    <h3>Bulk add (for big groups)</h3>
    <p class="muted">Paste one member per line: <b>Name, phone</b> (phone optional). 200 members paste in seconds.</p>
    <textarea id="mBulk" placeholder="Mary Fon, 677000001&#10;Tabi Roland, 699000002&#10;Che Emmanuella"></textarea>
    <button class="btn mt" onclick="App.bulkAddMembers()">Add all</button>
  </div>
  <div class="card">
    <h3>Member list (${g.members.length})</h3>
    <div class="searchbar"><input type="text" placeholder="Search name or phone…" oninput="App.filterRows(this)"></div>
    <div class="scrollwrap">
      <table><thead><tr><th>Name</th><th>Phone</th><th class="num">Paid this year</th><th></th></tr></thead>
      <tbody>${rows || ""}</tbody></table>
    </div>
  </div>`;
}

/* ----- sittings ----- */

function viewSittings(g) {
  const sittings = g.sittings.slice().reverse();
  const sel = g.sittings.find(s => s.id === ui.sittingId) || sittings[0] || null;
  if (sel) ui.sittingId = sel.id;

  let html = `
  <div class="card">
    <h3>Open a new sitting</h3>
    <div class="formrow">
      <label class="field"><span>Date</span><input type="date" id="sitDate" value="${todayISO()}"></label>
      <label class="field"><span>Label (optional)</span><input type="text" id="sitLabel" placeholder="e.g. Sitting #12 — at Mama Becky's"></label>
    </div>
    <button class="btn" onclick="App.addSitting()">Open sitting</button>
  </div>`;

  if (!sel) return html + `<div class="card"><p class="muted">No sittings yet.</p></div>`;

  html += `<div class="card"><h3>Sitting</h3>
    <select onchange="App.selectSitting(this.value)">` +
    sittings.map(s => `<option value="${s.id}" ${s.id === sel.id ? "selected" : ""}>${s.date} ${esc(s.label || "")} ${s.closed ? "(closed)" : ""}</option>`).join("") +
    `</select></div>`;

  const ben = currentBeneficiary(g);
  const members = activeMembers(g);
  const paidCount = members.filter(m => paidForSitting(g, sel.id, m.id) >= g.contribution).length;

  const rows = members.map(m => {
    const paid = paidForSitting(g, sel.id, m.id);
    const done = paid >= g.contribution;
    return `
    <tr class="${done ? "paid" : ""}" data-search="${esc(m.name.toLowerCase())}">
      <td>${esc(m.name)}</td>
      <td>${done ? '<span class="pill green">Paid</span>' : (paid > 0 ? `<span class="pill gold">Part: ${fmt(paid)}</span>` : '<span class="pill red">Unpaid</span>')}</td>
      <td class="right row-actions">
        ${sel.closed ? "" : `
          <button class="btn small" ${done ? "disabled" : ""} onclick="App.pay('${sel.id}','${m.id}','cash')">Cash</button>
          <button class="btn small gold" ${done ? "disabled" : ""} onclick="App.pay('${sel.id}','${m.id}','MoMo/OM')">MoMo</button>
          ${paid > 0 ? `<button class="btn small warn" onclick="App.reverse('${sel.id}','${m.id}')">Reverse</button>` : ""}`}
        ${paid > 0 ? `<button class="btn small blue" onclick="App.receiptFor('${sel.id}','${m.id}')">Receipt</button>` : ""}
      </td>
    </tr>`;
  }).join("");

  html += `
  <div class="statgrid">
    <div class="stat green"><div class="label">Collected this sitting</div><div class="value">${fmt(sittingTotal(g, sel.id))}</div></div>
    <div class="stat blue"><div class="label">Paid up</div><div class="value">${paidCount} / ${members.length}</div></div>
    <div class="stat gold"><div class="label">Pot beneficiary</div><div class="value">${ben ? esc(ben.name) : "—"}</div></div>
  </div>
  <div class="card mt">
    <h3>Contributions — ${fmt(g.contribution)} each</h3>
    <div class="searchbar"><input type="text" placeholder="Search member… (big groups)" oninput="App.filterRows(this)"></div>
    ${sel.closed ? `<p class="muted">This sitting is closed.</p>` : `
    <div class="row-actions" style="margin-bottom:10px">
      <button class="btn ghost small" onclick="App.payAllUnpaid('${sel.id}','cash')">Mark ALL unpaid as paid (cash)</button>
      <button class="btn ghost small" onclick="App.fineUnpaid('${sel.id}')">Fine all unpaid (${fmt(g.fineLate || 0)})</button>
    </div>`}
    <div class="scrollwrap">
      <table><thead><tr><th>Member</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    </div>
  </div>
  <div class="card">
    <h3>Close & disburse</h3>
    <p class="muted">Pot for this sitting: <b>${fmt(sittingTotal(g, sel.id))}</b> → goes to <b>${ben ? esc(ben.name) : "—"}</b> (rotation ${g.rotationMode === "ballot" ? "by ballot" : "fixed order"}).</p>
    ${sel.closed
      ? `<span class="pill grey">Closed${sel.disbursedTo ? " — pot paid to " + esc(memberName(g, sel.disbursedTo)) : ""}</span>`
      : `<div class="row-actions">
           <button class="btn" ${ben ? "" : "disabled"} onclick="App.disburse('${sel.id}')">Disburse pot & close sitting</button>
           <button class="btn ghost" onclick="App.closeSittingOnly('${sel.id}')">Close without payout (savings round)</button>
         </div>`}
  </div>`;
  return html;
}

/* ----- trouble fund ----- */

function viewTrouble(g) {
  const levies = g.levies.slice().reverse();
  const sel = g.levies.find(l => l.id === ui.levyId) || levies[0] || null;
  if (sel) ui.levyId = sel.id;

  let html = `
  <div class="statgrid">
    <div class="stat gold"><div class="label">Trouble fund balance</div><div class="value">${fmt(troubleBalance(g))}</div></div>
  </div>
  <div class="card mt">
    <h3>Raise an emergency levy</h3>
    <p class="muted">A death or emergency: every member owes a fixed amount, right now. This is the 48-hour promise.</p>
    <div class="formrow">
      <label class="field"><span>Reason</span><input type="text" id="levyReason" placeholder="e.g. Death of Pa Tanyi — burial support"></label>
      <label class="field"><span>Amount per member</span><input type="number" id="levyAmount" placeholder="5000"></label>
    </div>
    <button class="btn warn" onclick="App.addLevy()">Launch levy</button>
  </div>
  <div class="card">
    <h3>Pay out from trouble fund</h3>
    <div class="formrow">
      <label class="field"><span>Beneficiary member</span>
        <select id="tpMember">${activeMembers(g).map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join("")}</select>
      </label>
      <label class="field"><span>Amount</span><input type="number" id="tpAmount" placeholder="150000"></label>
      <label class="field"><span>Reason</span><input type="text" id="tpReason" placeholder="Burial benefit per constitution"></label>
    </div>
    <button class="btn gold" onclick="App.troublePayout()">Record payout</button>
  </div>`;

  if (!sel) return html + `<div class="card"><p class="muted">No levies yet.</p></div>`;

  html += `<div class="card"><h3>Levy</h3>
    <select onchange="App.selectLevy(this.value)">` +
    levies.map(l => `<option value="${l.id}" ${l.id === sel.id ? "selected" : ""}>${l.date} — ${esc(l.reason)} (${fmt(l.amount)}/member)</option>`).join("") +
    `</select></div>`;

  const members = activeMembers(g);
  const paidCount = members.filter(m => levyPaid(g, sel.id, m.id) >= sel.amount).length;
  const collected = g.transactions
    .filter(t => t.levyId === sel.id && (t.type === "levy-payment" || t.type === "reversal-levy"))
    .reduce((s, t) => s + t.amount, 0);

  const rows = members.map(m => {
    const paid = levyPaid(g, sel.id, m.id);
    const done = paid >= sel.amount;
    return `
    <tr class="${done ? "paid" : ""}" data-search="${esc(m.name.toLowerCase())}">
      <td>${esc(m.name)}</td>
      <td>${done ? '<span class="pill green">Paid</span>' : '<span class="pill red">Owing</span>'}</td>
      <td class="right row-actions">
        ${done
          ? `<button class="btn small blue" onclick="App.levyReceiptFor('${sel.id}','${m.id}')">Receipt</button>`
          : `<button class="btn small" onclick="App.payLevy('${sel.id}','${m.id}','cash')">Cash</button>
             <button class="btn small gold" onclick="App.payLevy('${sel.id}','${m.id}','MoMo/OM')">MoMo</button>`}
      </td>
    </tr>`;
  }).join("");

  html += `
  <div class="card">
    <h3>${esc(sel.reason)} — ${fmt(sel.amount)} per member</h3>
    <p class="muted">Collected: <b>${fmt(collected)}</b> · ${paidCount}/${members.length} members paid.</p>
    <div class="searchbar"><input type="text" placeholder="Search member…" oninput="App.filterRows(this)"></div>
    <div class="scrollwrap">
      <table><thead><tr><th>Member</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    </div>
  </div>`;
  return html;
}

/* ----- ledger ----- */

function viewLedger(g) {
  const txs = g.transactions.slice().reverse();
  const rows = txs.map(t => `
    <tr data-search="${esc(memberName(g, t.memberId).toLowerCase())} ${esc(txLabel(t).toLowerCase())}">
      <td>${t.date}</td>
      <td>${esc(memberName(g, t.memberId))}</td>
      <td>${esc(txLabel(t))}</td>
      <td>${esc(t.method || "")}</td>
      <td>${esc(t.note || "")}</td>
      <td class="num">${fmt(t.amount)}</td>
    </tr>`).join("");
  return `
  <div class="card">
    <h3>Full ledger — append-only (${txs.length} entries)</h3>
    <p class="muted">Nobody can edit or delete history; corrections appear as reversal entries. That is the point.</p>
    <div class="row-actions" style="margin-bottom:10px">
      <button class="btn ghost small" onclick="App.exportCSV()">Export CSV</button>
    </div>
    <div class="searchbar"><input type="text" placeholder="Filter by member or type…" oninput="App.filterRows(this)"></div>
    <div class="scrollwrap">
      <table><thead><tr><th>Date</th><th>Member</th><th>Type</th><th>Method</th><th>Note</th><th class="num">Amount</th></tr></thead>
      <tbody>${rows || ""}</tbody></table>
    </div>
  </div>`;
}

/* ----- settings ----- */

function viewSettings(g) {
  const order = g.rotation
    .map(id => member(g, id)).filter(m => m && m.active);
  const orderRows = order.map((m, i) => `
    <tr class="${i === (g.rotationIndex % (order.length || 1)) ? "paid" : ""}">
      <td>${i + 1}</td><td>${esc(m.name)}</td>
      <td class="right row-actions">
        <button class="btn small ghost" ${i === 0 ? "disabled" : ""} onclick="App.moveRotation('${m.id}',-1)">↑</button>
        <button class="btn small ghost" ${i === order.length - 1 ? "disabled" : ""} onclick="App.moveRotation('${m.id}',1)">↓</button>
      </td>
    </tr>`).join("");

  return `
  <div class="card">
    <h3>Group settings</h3>
    <div class="formrow">
      <label class="field"><span>Group name</span><input type="text" id="gName" value="${esc(g.name)}"></label>
      <label class="field"><span>Contribution per sitting</span><input type="number" id="gContribution" value="${g.contribution}"></label>
    </div>
    <div class="formrow">
      <label class="field"><span>Frequency</span>
        <select id="gFrequency">
          ${["weekly", "bi-weekly", "monthly"].map(f => `<option ${g.frequency === f ? "selected" : ""}>${f}</option>`).join("")}
        </select></label>
      <label class="field"><span>Late fine</span><input type="number" id="gFine" value="${g.fineLate || 0}"></label>
    </div>
    <button class="btn" onclick="App.saveSettings()">Save settings</button>
  </div>
  <div class="card">
    <h3>Rotation order (who chops the pot next)</h3>
    <p class="muted">Highlighted row = next beneficiary. Use ballot draw to shuffle fairly in front of everyone.</p>
    <button class="btn ghost small" onclick="App.shuffleRotation()">🎲 Ballot draw (shuffle)</button>
    <div class="scrollwrap mt">
      <table><thead><tr><th>#</th><th>Member</th><th></th></tr></thead><tbody>${orderRows}</tbody></table>
    </div>
  </div>
  <div class="card">
    <h3>Data</h3>
    <div class="row-actions">
      <button class="btn ghost" onclick="App.exportGroup()">Export this group (JSON)</button>
      <button class="btn warn" onclick="App.deleteGroup()">Delete group</button>
    </div>
    <p class="muted mt">Groups can always leave with their full books. Back up after every sitting.</p>
  </div>`;
}

/* ---------- modal ---------- */

function openModal(html) {
  document.getElementById("modalBox").innerHTML = html;
  document.getElementById("modalOverlay").classList.remove("hidden");
}

/* ---------- App: actions wired to the UI ---------- */

const App = {

  /* navigation */
  tab(t) { ui.tab = t; render(); },
  selectGroup(id) { state.activeGroupId = id; ui = { tab: "dashboard", sittingId: null, levyId: null }; save(); render(); },
  selectSitting(id) { ui.sittingId = id; render(); },
  selectLevy(id) { ui.levyId = id; render(); },
  setLang(l) { state.lang = l; save(); },
  closeModal() { document.getElementById("modalOverlay").classList.add("hidden"); },

  /* live search filter on any table (no re-render, keeps keyboard focus) */
  filterRows(input) {
    const q = input.value.trim().toLowerCase();
    const card = input.closest(".card");
    card.querySelectorAll("tbody tr").forEach(tr => {
      const hay = tr.getAttribute("data-search") || "";
      tr.style.display = !q || hay.includes(q) ? "" : "none";
    });
  },

  /* group lifecycle */
  showNewGroup() {
    openModal(`
      <h3>New group</h3>
      <label class="field"><span>Group name</span><input type="text" id="ngName" placeholder="e.g. Mankon Family Njangi"></label>
      <div class="formrow">
        <label class="field"><span>Contribution per sitting (FCFA)</span><input type="number" id="ngContribution" value="5000"></label>
        <label class="field"><span>Frequency</span>
          <select id="ngFrequency"><option>weekly</option><option>bi-weekly</option><option selected>monthly</option></select>
        </label>
      </div>
      <label class="field"><span>Late fine (FCFA, 0 = none)</span><input type="number" id="ngFine" value="500"></label>
      <button class="btn" onclick="App.createGroup()">Create group</button>`);
  },

  createGroup() {
    const name = document.getElementById("ngName").value.trim();
    if (!name) return alert("Give the group a name.");
    const g = {
      id: uid(),
      name,
      contribution: Number(document.getElementById("ngContribution").value) || 0,
      frequency: document.getElementById("ngFrequency").value,
      fineLate: Number(document.getElementById("ngFine").value) || 0,
      rotationMode: "fixed",
      rotationIndex: 0,
      members: [],
      rotation: [],
      sittings: [],
      levies: [],
      transactions: [],
    };
    state.groups.push(g);
    state.activeGroupId = g.id;
    ui = { tab: "members", sittingId: null, levyId: null };
    save(); this.closeModal(); render();
  },

  saveSettings() {
    const g = activeGroup();
    g.name = document.getElementById("gName").value.trim() || g.name;
    g.contribution = Number(document.getElementById("gContribution").value) || g.contribution;
    g.frequency = document.getElementById("gFrequency").value;
    g.fineLate = Number(document.getElementById("gFine").value) || 0;
    save(); render();
  },

  deleteGroup() {
    const g = activeGroup();
    if (!confirm(`Delete "${g.name}" and its entire ledger from this phone? Export a backup first!`)) return;
    state.groups = state.groups.filter(x => x.id !== g.id);
    state.activeGroupId = state.groups.length ? state.groups[0].id : null;
    save(); render();
  },

  /* members */
  addMember() {
    const g = activeGroup();
    const name = document.getElementById("mName").value.trim();
    if (!name) return alert("Enter a name.");
    const m = { id: uid(), name, phone: document.getElementById("mPhone").value.trim(), active: true };
    g.members.push(m);
    g.rotation.push(m.id);
    save(); render();
  },

  bulkAddMembers() {
    const g = activeGroup();
    const lines = document.getElementById("mBulk").value.split("\n").map(l => l.trim()).filter(Boolean);
    if (!lines.length) return alert("Paste at least one line.");
    for (const line of lines) {
      const [name, phone] = line.split(",").map(s => (s || "").trim());
      if (!name) continue;
      const m = { id: uid(), name, phone: phone || "", active: true };
      g.members.push(m);
      g.rotation.push(m.id);
    }
    save(); render();
  },

  toggleMember(id) {
    const g = activeGroup();
    const m = member(g, id);
    m.active = !m.active;
    save(); render();
  },

  /* sittings & contributions */
  addSitting() {
    const g = activeGroup();
    const s = {
      id: uid(),
      date: document.getElementById("sitDate").value || todayISO(),
      label: document.getElementById("sitLabel").value.trim(),
      closed: false,
      disbursedTo: null,
    };
    g.sittings.push(s);
    ui.sittingId = s.id;
    save(); render();
  },

  pay(sittingId, memberId, method) {
    const g = activeGroup();
    const remaining = g.contribution - paidForSitting(g, sittingId, memberId);
    if (remaining <= 0) return;
    addTx(g, { type: "contribution", memberId, sittingId, amount: remaining, method });
    render();
  },

  payAllUnpaid(sittingId, method) {
    const g = activeGroup();
    const unpaid = activeMembers(g).filter(m => paidForSitting(g, sittingId, m.id) < g.contribution);
    if (!unpaid.length) return alert("Everyone has paid.");
    if (!confirm(`Mark ${unpaid.length} members as paid (${method})?`)) return;
    for (const m of unpaid) {
      addTx(g, { type: "contribution", memberId: m.id, sittingId, amount: g.contribution - paidForSitting(g, sittingId, m.id), method });
    }
    render();
  },

  reverse(sittingId, memberId) {
    const g = activeGroup();
    const paid = paidForSitting(g, sittingId, memberId);
    if (paid <= 0) return;
    if (!confirm(`Reverse ${fmt(paid)} recorded for ${memberName(g, memberId)}? A correction entry will be added (history is never deleted).`)) return;
    addTx(g, { type: "reversal-contribution", memberId, sittingId, amount: -paid, note: "Correction" });
    render();
  },

  fineUnpaid(sittingId) {
    const g = activeGroup();
    if (!g.fineLate) return alert("Set a late fine amount in Settings first.");
    const unpaid = activeMembers(g).filter(m => paidForSitting(g, sittingId, m.id) < g.contribution);
    if (!unpaid.length) return alert("Everyone has paid — nobody to fine.");
    if (!confirm(`Record a ${fmt(g.fineLate)} fine (collected) for ${unpaid.length} unpaid members?`)) return;
    for (const m of unpaid) {
      addTx(g, { type: "fine", memberId: m.id, sittingId, amount: g.fineLate, method: "cash", note: "Late fine" });
    }
    render();
  },

  disburse(sittingId) {
    const g = activeGroup();
    const ben = currentBeneficiary(g);
    if (!ben) return;
    const pot = sittingTotal(g, sittingId);
    if (!confirm(`Pay the pot of ${fmt(pot)} to ${ben.name} and close this sitting?`)) return;
    addTx(g, { type: "payout", memberId: ben.id, sittingId, amount: -pot, method: "MoMo/OM or cash", note: "Pot disbursement" });
    const s = g.sittings.find(x => x.id === sittingId);
    s.closed = true;
    s.disbursedTo = ben.id;
    g.rotationIndex += 1;
    save(); render();
  },

  closeSittingOnly(sittingId) {
    const g = activeGroup();
    const s = g.sittings.find(x => x.id === sittingId);
    s.closed = true;
    save(); render();
  },

  /* trouble fund */
  addLevy() {
    const g = activeGroup();
    const reason = document.getElementById("levyReason").value.trim();
    const amount = Number(document.getElementById("levyAmount").value);
    if (!reason || !amount) return alert("Enter a reason and an amount per member.");
    const l = { id: uid(), date: todayISO(), reason, amount };
    g.levies.push(l);
    ui.levyId = l.id;
    save(); render();
  },

  payLevy(levyId, memberId, method) {
    const g = activeGroup();
    const l = g.levies.find(x => x.id === levyId);
    const remaining = l.amount - levyPaid(g, levyId, memberId);
    if (remaining <= 0) return;
    addTx(g, { type: "levy-payment", memberId, levyId, amount: remaining, method, note: l.reason });
    render();
  },

  troublePayout() {
    const g = activeGroup();
    const memberId = document.getElementById("tpMember").value;
    const amount = Number(document.getElementById("tpAmount").value);
    const reason = document.getElementById("tpReason").value.trim();
    if (!amount) return alert("Enter an amount.");
    const bal = troubleBalance(g);
    if (amount > bal && !confirm(`Payout ${fmt(amount)} is more than the fund balance (${fmt(bal)}). Record anyway?`)) return;
    addTx(g, { type: "trouble-payout", memberId, amount: -amount, note: reason || "Trouble fund benefit" });
    render();
  },

  /* receipts */
  receiptFor(sittingId, memberId) {
    const g = activeGroup();
    const tx = g.transactions.slice().reverse()
      .find(t => t.sittingId === sittingId && t.memberId === memberId && t.type === "contribution");
    if (!tx) return;
    this.showReceipt(receiptText(g, tx));
  },

  levyReceiptFor(levyId, memberId) {
    const g = activeGroup();
    const tx = g.transactions.slice().reverse()
      .find(t => t.levyId === levyId && t.memberId === memberId && t.type === "levy-payment");
    if (!tx) return;
    this.showReceipt(receiptText(g, tx));
  },

  showReceipt(text) {
    openModal(`
      <h3>Receipt</h3>
      <pre class="receipt" id="receiptText">${esc(text)}</pre>
      <div class="row-actions">
        <button class="btn" onclick="App.copyReceipt()">Copy for WhatsApp/SMS</button>
        <button class="btn ghost" onclick="App.closeModal()">Close</button>
      </div>`);
  },

  copyReceipt() {
    const text = document.getElementById("receiptText").innerText;
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
      .then(() => alert("Copied! Paste it in WhatsApp or SMS."))
      .catch(() => prompt("Copy the receipt below:", text));
  },

  /* rotation */
  shuffleRotation() {
    const g = activeGroup();
    if (!confirm("Shuffle the rotation order (ballot draw)? Do this in front of the members!")) return;
    for (let i = g.rotation.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [g.rotation[i], g.rotation[j]] = [g.rotation[j], g.rotation[i]];
    }
    g.rotationIndex = 0;
    save(); render();
  },

  moveRotation(memberId, dir) {
    const g = activeGroup();
    const i = g.rotation.indexOf(memberId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= g.rotation.length) return;
    [g.rotation[i], g.rotation[j]] = [g.rotation[j], g.rotation[i]];
    save(); render();
  },

  /* import / export */
  exportAll() { downloadJSON(state, "tamarun-backup-" + todayISO() + ".json"); },

  exportGroup() {
    const g = activeGroup();
    downloadJSON(g, "tamarun-" + g.name.replace(/\W+/g, "-").toLowerCase() + "-" + todayISO() + ".json");
  },

  importAll(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (data.groups) {
          if (!confirm("Replace ALL data on this phone with the backup?")) return;
          state = data;
        } else if (data.id && data.members) {
          state.groups.push(data); // single-group file: add it
          state.activeGroupId = data.id;
        } else {
          throw new Error("unrecognized");
        }
        save(); render();
        alert("Restore complete.");
      } catch (e) {
        alert("That file is not a valid Tamarun backup.");
      }
      input.value = "";
    };
    reader.readAsText(file);
  },

  exportCSV() {
    const g = activeGroup();
    const head = "date,member,type,method,note,amount\n";
    const body = g.transactions.map(t =>
      [t.date, csv(memberName(g, t.memberId)), t.type, csv(t.method), csv(t.note), t.amount].join(",")
    ).join("\n");
    const blob = new Blob([head + body], { type: "text/csv" });
    triggerDownload(blob, "tamarun-ledger-" + todayISO() + ".csv");
  },
};

function csv(s) {
  s = String(s == null ? "" : s);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  triggerDownload(blob, filename);
}

function triggerDownload(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

window.App = App;
render();
