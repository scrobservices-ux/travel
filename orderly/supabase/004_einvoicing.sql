-- ===========================================================================
-- Orderly — migration 004: French e-invoicing transmission (PDP / Chorus Pro)
-- Apply AFTER 003_france_eu_tax.sql.
--
-- Context (2026 reform): the Portail Public de Facturation (PPF) is the central
-- DIRECTORY + data concentrator — NOT a send endpoint. B2B invoices are
-- transmitted through an accredited PDP; B2G through Chorus Pro. Orderly models
-- the transmission channel, the EN 16931 payload (Factur-X, already built) and
-- the mandated invoice life-cycle statuses.
-- ===========================================================================

-- Org-level e-invoicing configuration:
--   { pdp_provider, pdp_connected (bool), chorus_pro_enabled (bool),
--     ereporting_enabled (bool) }
alter table organizations
  add column if not exists einvoicing jsonb not null default '{}'::jsonb;

-- Per-invoice transmission state.
alter table invoices
  -- none | pdp | chorus_pro
  add column if not exists einvoice_channel text not null default 'none',
  -- b2g | b2b_fr | b2c | intra_eu | export
  add column if not exists recipient_type text,
  -- draft | submitted | received | approved | refused | rejected | payment_received | not_required
  add column if not exists einvoice_status text not null default 'draft',
  add column if not exists einvoice_external_id text,
  add column if not exists transmitted_at timestamptz;

-- Transmission records + life-cycle history (the reform requires tracking
-- statuses such as déposée / rejetée / refusée / encaissée).
create table if not exists einvoice_submissions (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  invoice_id      uuid not null references invoices(id) on delete cascade,
  platform        text not null,                 -- pdp | chorus_pro
  channel         text not null,
  recipient_type  text,
  status          text not null default 'submitted',
  external_id     text,                          -- id returned by the PDP/Chorus Pro
  lifecycle       jsonb not null default '[]'::jsonb, -- [{status, at, note}]
  error           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table einvoice_submissions enable row level security;
create policy einvoice_sub_tenant_rw on einvoice_submissions
  for all using (org_id in (select auth_org_ids()))
  with check (org_id in (select auth_org_ids()));

create index if not exists idx_einvoice_sub_org on einvoice_submissions(org_id, created_at desc);
create index if not exists idx_einvoice_sub_invoice on einvoice_submissions(invoice_id);
