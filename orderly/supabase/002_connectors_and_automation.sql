-- ===========================================================================
-- Orderly — migration 002: connectors + automation/approval system
-- Apply AFTER schema.sql.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Per-tenant automation policy.
-- Default behavior everywhere is "review": agents PREPARE actions for a human
-- to approve. A tenant can opt specific actions into "auto" to let agents act
-- without review. Stored as { "<action>": "review" | "auto" }.
-- ---------------------------------------------------------------------------
alter table organizations
  add column if not exists automation jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- Connections: a tenant's link to an external provider (Gmail, Google
-- Calendar, a bank feed, etc.). Tokens are written/read only by trusted
-- server code via the service role — never sent to the browser.
-- ---------------------------------------------------------------------------
create table if not exists connections (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  provider        text not null,                 -- gmail | google_calendar | bank | documents
  status          text not null default 'disconnected', -- connected | disconnected | error
  external_account text,                          -- e.g. the connected email address
  access_token    text,
  refresh_token   text,
  expires_at      timestamptz,
  metadata        jsonb not null default '{}'::jsonb,
  last_synced_at  timestamptz,
  created_at      timestamptz not null default now(),
  unique (org_id, provider)
);

-- ---------------------------------------------------------------------------
-- Outbox: every client-facing message an agent prepares lands here. Nothing
-- leaves Orderly until it is either approved by a human OR auto-send is enabled
-- for that action in the org's automation policy.
-- ---------------------------------------------------------------------------
create table if not exists outbox (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  channel       text not null default 'email',   -- email | sms
  to_address    text,
  subject       text,
  body          text not null,
  status        text not null default 'draft',   -- draft | approved | scheduled | sent | failed | discarded
  scheduled_for timestamptz,
  sent_at       timestamptz,
  related_type  text,                            -- invoice | appointment | document | ...
  related_id    uuid,
  created_by    text not null default 'agent',   -- agent | user
  agent         text,                            -- which agent drafted it
  error         text,
  created_at    timestamptz not null default now()
);

-- RLS
alter table connections enable row level security;
alter table outbox      enable row level security;

create policy connections_tenant_rw on connections
  for all using (org_id in (select auth_org_ids()))
  with check (org_id in (select auth_org_ids()));

create policy outbox_tenant_rw on outbox
  for all using (org_id in (select auth_org_ids()))
  with check (org_id in (select auth_org_ids()));

create index if not exists idx_outbox_org_status on outbox(org_id, status);
create index if not exists idx_connections_org on connections(org_id);
