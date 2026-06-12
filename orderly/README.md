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

# Create the database: paste supabase/schema.sql (then seed.sql) into the
# Supabase SQL editor, or psql "$DATABASE_URL" -f supabase/schema.sql

npm run dev                      # http://localhost:3000
```

### Required services
1. **Supabase project** — copy URL + anon key + service-role key into `.env.local`, run `schema.sql`.
2. **Anthropic API key** — for the agent runtime.
3. **Stripe** — create three recurring prices and put their ids in `.env.local`; point a webhook at `/api/stripe/webhook`.

## How the agents work

See [`ARCHITECTURE.md`](./ARCHITECTURE.md). In short: each agent is a system prompt + a set of tenant-scoped tools. The runtime (`src/agents/core/runtime.ts`) runs a Claude tool-use loop, executes each tool against the active org's data only, and records every step to the `agent_runs` table so the business has a complete, reviewable trail. Outbound client messages are always *drafted* for human approval, never sent silently.

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
