-- ===========================================================================
-- Orderly — multi-tenant schema (Postgres / Supabase)
--
-- Tenancy model: SHARED DATABASE, SHARED SCHEMA, ROW-LEVEL SECURITY.
-- Every business-owned row carries an `org_id`. RLS policies guarantee a user
-- can only ever read/write rows belonging to an organization they are a member
-- of. This gives us "different instances for different companies" with a single
-- operational footprint — cheap to onboard a new client, hard to leak data.
--
-- Apply with:  psql "$DATABASE_URL" -f supabase/schema.sql
-- (or paste into the Supabase SQL editor)
-- ===========================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Organizations (tenants) + membership
-- ---------------------------------------------------------------------------
create table if not exists organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,            -- used for subdomain: {slug}.orderly.app
  plan          text not null default 'starter', -- starter | growth | scale
  stripe_customer_id      text,
  stripe_subscription_id  text,
  subscription_status     text default 'trialing',
  settings      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create type member_role as enum ('owner', 'admin', 'member');

create table if not exists memberships (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        member_role not null default 'member',
  created_at  timestamptz not null default now(),
  unique (org_id, user_id)
);

-- Helper: which orgs does the current authenticated user belong to?
create or replace function auth_org_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select org_id from memberships where user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Clients / contacts (CRM-lite, powers scheduling + invoicing)
-- ---------------------------------------------------------------------------
create table if not exists clients (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text not null,
  email       text,
  phone       text,
  company     text,
  notes       text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Invoicing & payments
-- ---------------------------------------------------------------------------
create type invoice_status as enum ('draft', 'sent', 'paid', 'overdue', 'void');

create table if not exists invoices (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  client_id     uuid references clients(id) on delete set null,
  number        text not null,
  status        invoice_status not null default 'draft',
  currency      text not null default 'USD',
  issue_date    date not null default current_date,
  due_date      date,
  subtotal_cents  bigint not null default 0,
  tax_cents       bigint not null default 0,
  total_cents     bigint not null default 0,
  notes         text,
  -- audit trail of what an agent did to this invoice
  agent_log     jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  unique (org_id, number)
);

create table if not exists invoice_line_items (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  invoice_id    uuid not null references invoices(id) on delete cascade,
  description   text not null,
  quantity      numeric not null default 1,
  unit_cents    bigint not null default 0,
  amount_cents  bigint not null default 0
);

-- ---------------------------------------------------------------------------
-- Bookkeeping & expenses
-- ---------------------------------------------------------------------------
create type txn_direction as enum ('income', 'expense');

create table if not exists transactions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  direction     txn_direction not null,
  description   text not null,
  amount_cents  bigint not null,
  currency      text not null default 'USD',
  occurred_on   date not null default current_date,
  category      text,                 -- assigned by the bookkeeping agent
  category_confidence numeric,        -- 0..1, how sure the agent was
  source        text default 'manual',-- manual | receipt | bank | invoice
  raw           jsonb,                -- original parsed payload (e.g. receipt OCR)
  reconciled    boolean not null default false,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Documents & email
-- ---------------------------------------------------------------------------
create table if not exists documents (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  title         text not null,
  kind          text,                 -- invoice | receipt | contract | email | other (agent-classified)
  storage_path  text,                 -- path in Supabase Storage
  summary       text,                 -- agent-generated summary
  extracted     jsonb,                -- structured fields the agent pulled out
  status        text not null default 'pending', -- pending | processed | filed
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Scheduling & client comms
-- ---------------------------------------------------------------------------
create table if not exists appointments (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  client_id     uuid references clients(id) on delete set null,
  title         text not null,
  starts_at     timestamptz not null,
  ends_at       timestamptz,
  location      text,
  notes         text,
  reminder_sent boolean not null default false,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Agents: definitions + run history (the audit log that builds trust)
-- ---------------------------------------------------------------------------
create table if not exists agent_runs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  agent         text not null,        -- invoicing | bookkeeping | documents | scheduling
  trigger       text not null default 'manual', -- manual | scheduled | webhook
  status        text not null default 'running', -- running | succeeded | failed
  input         jsonb,
  steps         jsonb not null default '[]'::jsonb, -- tool calls + results (full trace)
  result        jsonb,
  error         text,
  tokens_in     integer default 0,
  tokens_out    integer default 0,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz
);

-- ===========================================================================
-- Row-level security
-- ===========================================================================
alter table organizations      enable row level security;
alter table memberships        enable row level security;
alter table clients            enable row level security;
alter table invoices           enable row level security;
alter table invoice_line_items enable row level security;
alter table transactions       enable row level security;
alter table documents          enable row level security;
alter table appointments       enable row level security;
alter table agent_runs         enable row level security;

-- Organizations: members can see their org; owners/admins can update it.
create policy org_select on organizations for select
  using (id in (select auth_org_ids()));
create policy org_update on organizations for update
  using (id in (select org_id from memberships
                where user_id = auth.uid() and role in ('owner','admin')));

-- Memberships: you can see memberships of orgs you belong to.
create policy mem_select on memberships for select
  using (org_id in (select auth_org_ids()));

-- Generic per-tenant policy applied to every org-scoped table.
do $$
declare t text;
begin
  foreach t in array array[
    'clients','invoices','invoice_line_items','transactions',
    'documents','appointments','agent_runs'
  ] loop
    execute format(
      'create policy %1$s_tenant_rw on %1$s
         for all
         using (org_id in (select auth_org_ids()))
         with check (org_id in (select auth_org_ids()));', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Helpful indexes
-- ---------------------------------------------------------------------------
create index if not exists idx_memberships_user on memberships(user_id);
create index if not exists idx_invoices_org_status on invoices(org_id, status);
create index if not exists idx_txn_org_date on transactions(org_id, occurred_on);
create index if not exists idx_appointments_org_start on appointments(org_id, starts_at);
create index if not exists idx_agent_runs_org on agent_runs(org_id, started_at desc);
