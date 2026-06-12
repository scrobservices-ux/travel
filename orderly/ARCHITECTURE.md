# Orderly — Architecture

## 1. Tenancy model

**Shared database, shared schema, row-level security (RLS).**

Every business-owned row carries an `org_id`. Postgres RLS policies (see
`supabase/schema.sql`) ensure a signed-in user can only touch rows for
organizations they belong to (`memberships`). This gives "a separate instance
per company" with one cheap operational footprint — onboarding a client is a
single `INSERT` into `organizations` + `memberships`.

```
auth.users ──< memberships >── organizations
                                   │
        ┌──────────┬───────────┬───┴────┬───────────┬─────────────┐
     clients   invoices   transactions documents appointments  agent_runs
```

Tenant resolution at request time (`src/middleware.ts` + `src/lib/tenant.ts`):
1. Subdomain `{slug}.orderly.app` → `x-org-slug` header → org lookup.
2. Fallback to the user's first membership (apex domain / localhost).

## 2. The agent runtime

`src/agents/core/`:

- **`types.ts`** — `AgentTool`, `AgentDefinition`, `ToolContext`, `RunStep`.
- **`tools.ts`** — the shared tool library. Each tool's handler is **scoped to
  `ctx.orgId`**, which the runtime sets from an authorized session. The model
  never chooses the tenant.
- **`registry.ts`** — the four agents: each is a system prompt + a granted
  subset of tools, behind shared guardrails (money precision, human-in-the-loop
  on outbound comms, single-org scope).
- **`runtime.ts`** — a standard Claude **tool-use loop**:
  1. Open an `agent_runs` row (`status: running`).
  2. Call `messages.create` with the agent's tools.
  3. For every `tool_use`, run the tool against the tenant's data, append the
     result, persist the step trace.
  4. Repeat until the model stops calling tools (max 8 turns).
  5. Close the run with the summary, full step trace, and token usage.

Because every step is persisted, the business gets a complete **audit trail** of
what each agent did — essential for trust in financial automation.

### Authorization boundary

```
Browser ──(session cookie)──> /api/agents/run
                                  │  verifies user + membership
                                  │  derives org_id from session (NOT body)
                                  ▼
                              runAgent({ orgId, ... })
                                  │  tools run with service-role client
                                  ▼  but always .eq("org_id", ctx.orgId)
                              Postgres
```

The service-role client bypasses RLS, so the *application* is responsible for
scoping — which is why `orgId` is threaded explicitly through `ToolContext` and
every query filters on it.

## 3. Billing

`src/lib/stripe.ts` defines three plans. `/api/stripe/checkout` creates/links a
Stripe customer **per organization** and starts a subscription Checkout.
`/api/stripe/webhook` keeps `organizations.subscription_status` / `plan` in sync.

## 4. Landing page

`src/app/(marketing)/page.tsx` with a procedural React Three Fiber hero
(`components/landing/TextileScene.tsx`) — a rippling, brass, woven "textile"
mesh, loaded client-only with a graceful gradient fallback. Premium serif
display type (Fraunces), warm ivory/ink/brass palette, scroll reveals.

## 5. Security posture

- Per-tenant isolation via RLS at the row level.
- Service-role key is server-only (never imported into client code).
- Human-in-the-loop: agents *draft* outbound messages; sending is a separate,
  explicit, gated action.
- Full agent audit trail in `agent_runs`.

## 6. Extending Orderly

- **New tool**: add to `tools.ts` (scope to `ctx.orgId`), grant it in `registry.ts`.
- **New agent**: add an `AgentDefinition` to `AGENTS` with a focused system prompt.
- **New connector** (bank/email/calendar): ingest into `transactions` /
  `documents` / `appointments`, then let the relevant agent process it.
- **Scheduled runs**: call `runAgent` from a cron route with `trigger: "scheduled"`.
