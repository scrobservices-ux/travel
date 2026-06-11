# Kola

Digitized njangi / tontines & funeral (trouble) funds for Cameroon.

| What | Where |
|---|---|
| Full business model (market, revenue, regulation, $1M path) | [BUSINESS_MODEL.md](BUSINESS_MODEL.md) |
| Lean "start small, then scale" pilot plan with go/no-go gates | [PILOT_PLAN.md](PILOT_PLAN.md) |
| **Working MVP app** — the treasurer's digital ledger | [`app/`](app/) |

## The MVP app

A zero-install, offline-first ledger for the group president/treasurer. No server, no
account, no data plan needed after first load — everything is stored on the phone
(localStorage), with JSON backup/restore so the books can never be lost or held hostage.

**Works for small AND big groups:**

- 5-member family njangi: add members one by one, tap Cash/MoMo per person.
- 200-member association: **bulk-paste the member list**, **search filters** on every
  table, **"mark ALL unpaid as paid"** in one tap, **"fine all unpaid"** in one tap.

**Features (all smoke-tested):**

- Rotating njangi: contributions per sitting (cash or MoMo/OM), automatic pot total,
  one-tap disbursement to the next beneficiary, fixed or ballot-drawn rotation order.
- Savings rounds: close a sitting without payout (caisse / year-end share-out style).
- Trouble/funeral fund: launch an emergency levy (amount per member), track who has
  paid, record benefit payouts, separate fund balance.
- Fines engine: configurable late fine, applied to all unpaid members at once.
- **Append-only ledger**: history can never be edited or deleted — corrections appear
  as reversal entries. This is the anti-"njangi don break" guarantee.
- **Receipts in English, French, and Pidgin**, one tap to copy into WhatsApp/SMS.
- Export: full ledger as CSV, group or full backup as JSON; restore on any phone.

### Run it

Open `app/index.html` in any browser — that's it. Or serve it:

```bash
cd app && python3 -m http.server 8080
# then open http://localhost:8080
```

### Test it

```bash
node --check app/app.js
```

A headless smoke test (small group lifecycle + 120-member bulk flow) is described in
the repo history; the app has no build step and no dependencies by design — it must
run on a cheap Android phone's browser over a weak connection.

### What this MVP deliberately is

This is the **Phase 0/1 tool** from [PILOT_PLAN.md](PILOT_PLAN.md): the treasurer-side
ledger. Money still moves through the group's own MoMo/OM accounts (keeping Kola
regulatory-clean); the app is the shared book and receipt machine. Automated payment
collection, the WhatsApp bot, USSD and the diaspora bridge come after Gate 1 is passed.
