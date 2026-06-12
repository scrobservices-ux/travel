-- ===========================================================================
-- Orderly — migration 003: France / EU tax & legal compliance
-- Apply AFTER 002_connectors_and_automation.sql.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Organization tax & legal profile (seller identity for compliant invoices).
-- Defaults target France / EU.
-- ---------------------------------------------------------------------------
alter table organizations
  add column if not exists country  text not null default 'FR',
  add column if not exists currency text not null default 'EUR',
  add column if not exists locale   text not null default 'fr-FR',
  -- tax_profile holds: {
  --   legal_name, legal_form, siren, siret, vat_number,
  --   share_capital_cents, address, vat_registered (bool),
  --   default_vat_rate_bps, late_penalty_rate_bps, recovery_indemnity_cents, iban, bic
  -- }
  add column if not exists tax_profile jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- Invoice VAT / legal fields (France & EU).
-- Amounts stay in integer cents; rates are basis points (2000 = 20%).
-- ---------------------------------------------------------------------------
alter table invoices
  add column if not exists tax_rate_bps integer not null default 2000,
  -- standard | reverse_charge | exempt | export
  add column if not exists vat_treatment text not null default 'standard',
  add column if not exists buyer_country text,
  add column if not exists buyer_vat_number text,
  add column if not exists legal_mentions text,
  -- frozen seller identity at issue time (immutable record)
  add column if not exists seller_snapshot jsonb;

-- Per-line VAT rate (lets a single invoice mix rates, e.g. 20% + 5.5%).
alter table invoice_line_items
  add column if not exists tax_rate_bps integer not null default 2000;

-- Default currency to EUR for the France/EU launch.
alter table invoices     alter column currency set default 'EUR';
alter table transactions alter column currency set default 'EUR';
