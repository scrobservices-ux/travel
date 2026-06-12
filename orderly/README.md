# Orderly

**AI agents that handle the repetitive administrative work of small & medium businesses** — so owners can focus on what matters.

Orderly embeds a team of specialist AI agents inside each business and quietly puts its numbers, documents, and paperwork in order:

| Agent | What it does |
|---|---|
| **Invoicing & Payments** | Creates invoices from a sentence, chases overdue ones, reconciles payments. |
| **Bookkeeping & Expenses** | Categorizes transactions, keeps the ledger clean, flags anomalies. |
| **Documents & Email** | Reads, classifies, summarizes and files documents and inbox clutter. |
| **Scheduling & Client comms** | Manages appointments, reminders and follow-ups; drafts outreach. |

It's **multi-tenant**: every client gets an isolated instance (one Postgres database, strict row-level security), so you can onboard many businesses and sell them their own private workspace.

---

## Stack

- **Next.js 14** (App Router) + **TypeScript** + **Tailwind CSS**
- **React Three Fiber** — the premium 3D "textile" hero on the landing page
- **Supabase / Postgres** — data + auth + storage, multi-tenant via **row-level security**
- **Anthropic Claude** — the agent runtime (tool-use loop with a full audit trail)
- **Stripe Billing** — per-client subscriptions (Starter / Growth / Scale)

## Project layout

```
orderly/
├─ supabase/
│  ├─ schema.sql            # multi-tenant schema + RLS policies
│  └─ seed.sql              # demo data
├─ src/
│  ├─ app/
│  │  ├─ (marketing)/       # premium 3D landing page
│  │  ├─ (app)/             # authenticated dashboard (agents, invoices, books, docs, scheduling, settings)
│  │  ├─ login | signup | onboarding
│  │  └─ api/               # agents/run, onboarding, stripe/checkout, stripe/webhook
│  ├─ agents/
│  │  └─ core/              # runtime (Claude loop), tool library, agent registry
│  ├─ components/           # landing/, app/, auth/
│  ├─ lib/                  # supabase clients, tenant resolution, stripe, utils
│  └─ middleware.ts         # subdomain tenant resolution + auth gate
└─ scripts/extract-to-own-repo.sh
```

## Getting started

```bash
cd orderly
cp .env.example .env.local      # fill in Supabase, Anthropic, Stripe keys
npm install

# Create the database, in order:
#   1) supabase/schema.sql
#   2) supabase/002_connectors_and_automation.sql
#   3) supabase/003_france_eu_tax.sql
#   4) supabase/seed.sql   (optional demo data)
# Paste into the Supabase SQL editor, or psql "$DATABASE_URL" -f <file>

npm run dev                      # http://localhost:3000
```

### Required services
1. **Supabase project** — copy URL + anon key + service-role key into `.env.local`, run `schema.sql`.
2. **Anthropic API key** — for the agent runtime.
3. **Stripe** — create three recurring prices and put their ids in `.env.local`; point a webhook at `/api/stripe/webhook`.

## How the agents work

See [`ARCHITECTURE.md`](./ARCHITECTURE.md). In short: each agent is a system prompt + a set of tenant-scoped tools. The runtime (`src/agents/core/runtime.ts`) runs a Claude tool-use loop, executes each tool against the active org's data only, and records every step to the `agent_runs` table so the business has a complete, reviewable trail. Outbound client messages are always *drafted* for human approval, never sent silently.

## Connectors (data in)

Connect a tenant's tools so the agents have something to work on. Each connector
(`src/connectors/`) implements a common interface — an optional OAuth flow plus a
`sync()` that pulls provider data into the tenant's tables, after which the
matching agent processes it:

| Connector | Pulls | Feeds | Then runs |
|---|---|---|---|
| **Gmail** | recent inbox messages | `documents` (kind: email) | Documents agent |
| **Google Calendar** | upcoming events | `appointments` | Scheduling agent |
| **Bank feed** | transactions (via aggregator/CSV) | `transactions` | Bookkeeping agent |
| **Document upload** | extracted text (`/api/documents/upload`) | `documents` | Documents agent |

OAuth tokens live on the `connections` table and are only ever handled
server-side. Add a connector by implementing the `Connector` interface and
registering it in `src/connectors/registry.ts`.

## Automation & approvals (human-in-the-loop by default)

Every client-facing message an agent prepares goes to the **Approvals outbox**
(`/approvals`) and is held for human review. It is sent automatically **only**
when the tenant has switched that action to *auto* in **Settings → Automation**
(`src/lib/automation.ts`). The `draft_message` tool enforces this, and
`src/lib/outbox.ts` dispatches approved messages.

## Operations: live sending, scheduled syncs, OCR

- **Live email** — approved/auto outbox items are sent for real via
  **Resend** (`RESEND_API_KEY` + `EMAIL_FROM`) or a **connected Gmail mailbox**
  (`gmail.send` scope). See `src/lib/email/send.ts`.
- **Scheduled jobs** — `/api/cron` (guarded by `CRON_SECRET`) runs
  `?job=sync` (pull every connected connector across all tenants, then let the
  matching agent process) and `?job=reminders` (chase overdue invoices).
  `vercel.json` schedules them hourly / daily via Vercel Cron.
- **OCR** — upload a PDF or image on the **Documents** page; `src/lib/ocr.ts`
  uses Claude's native document/vision understanding to transcribe it, then the
  Documents agent classifies and files it (`/api/documents/ocr`).

## France & EU compliance (launch market)

The platform defaults to **France/EU**: currency **EUR**, locale **fr-FR**, and a
real VAT engine (`src/lib/tax/eu.ts`):

- French **TVA** rates (20 / 10 / 5.5 / 2.1 %).
- Automatic **treatment selection**: domestic TVA, **intra-EU B2B reverse charge
  (autoliquidation, 0%)** when a valid buyer VAT number is supplied, and
  **VAT-exempt export** outside the EU.
- EU **VAT number** format validation + optional live **VIES** check.
- Mandatory **French legal mentions** (pénalités de retard, indemnité €40,
  autoliquidation / exonération wording) added to every invoice.
- Per-business **tax & legal profile** (SIREN/SIRET, TVA number, legal form,
  default rate) in **Settings → Tax & legal profile**, frozen onto each invoice
  as an immutable `seller_snapshot`.

The invoicing agent applies all of this automatically — you just say
"facture Müller GmbH (DE, VAT DE123…) pour 2 000 € de conseil" and it produces a
correct reverse-charge invoice.

**Factur-X e-invoices.** Every invoice can be exported as a **Factur-X** PDF
(`/api/invoices/:id/facturx`, “Factur-X ↓” on the Invoices page): a human-readable
PDF with the **EN 16931 CII XML embedded** as `factur-x.xml`
(`src/lib/invoice/`). VAT treatment maps to the correct EN 16931 category codes
(S / AE / G / E). *Gap to close for the French mandate:* full PDF/A-3 conformance
(output intent + Factur-X XMP) via a post-process — the embedded XML & attachment
relationship already follow the spec.

**Languages.** French by default, English via the in-app switcher
(`src/i18n/`, cookie `orderly_locale`). Covers the landing page and the whole app.

Roadmap for deeper FR/EU: Chorus Pro / PPF transmission for the 2026–2027 French
B2B mandate, OSS for EU B2C.

## Multi-tenancy & selling instances

A new client = one `organizations` row + the owner's `membership`. They reach their instance at `{slug}.orderly.app` (resolved in `middleware.ts`) and are billed via Stripe for their own subscription. RLS guarantees no tenant can ever read another's data.

## Roadmap

- Bank-feed & email (Gmail/Microsoft 365) ingestion connectors
- Scheduled / event-triggered agent runs (cron + webhooks)
- Document upload + OCR pipeline into the documents agent
- Team roles & invitations UI
- Per-tenant agent customization (custom categories, tone, workflows)

---

> Built as an isolated module inside the `travel` repo because this session
> couldn't create a standalone GitHub repo. Run `scripts/extract-to-own-repo.sh`
> to lift it into its own `orderly` repository when you're ready.
