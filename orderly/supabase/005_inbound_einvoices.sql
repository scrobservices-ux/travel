-- ===========================================================================
-- Orderly — migration 005: inbound e-invoice reception (no accreditation)
-- Apply AFTER 004_einvoicing.sql.
--
-- Reception is the universal obligation from 1 Sept 2026: every French business
-- must be able to RECEIVE structured e-invoices. Parsing/storing them needs no
-- PDP accreditation. Suppliers' Factur-X / CII / UBL invoices land here.
-- ===========================================================================

create table if not exists received_invoices (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  source          text not null default 'upload',  -- upload | email | api
  format          text,                             -- cii | ubl
  supplier_name   text,
  supplier_vat    text,
  number          text,
  issue_date      date,
  currency        text default 'EUR',
  total_ht_cents  bigint,
  total_vat_cents bigint,
  total_ttc_cents bigint,
  status          text not null default 'received', -- received | recorded | disputed
  -- link to the bookkeeping entry created from this bill, if any
  transaction_id  uuid references transactions(id) on delete set null,
  raw_xml         text,
  created_at      timestamptz not null default now()
);

alter table received_invoices enable row level security;
create policy received_inv_tenant_rw on received_invoices
  for all using (org_id in (select auth_org_ids()))
  with check (org_id in (select auth_org_ids()));

create index if not exists idx_received_inv_org on received_invoices(org_id, created_at desc);
