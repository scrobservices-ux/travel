-- ===========================================================================
-- Orderly — demo seed data. Run AFTER schema.sql against a dev database.
-- Replace the org id / membership user id with real values for a live test.
-- ===========================================================================

insert into organizations (id, name, slug, plan, subscription_status, country, currency, locale, tax_profile)
values (
  '00000000-0000-0000-0000-000000000001', 'Acme Studio', 'acme', 'growth', 'active',
  'FR', 'EUR', 'fr-FR',
  jsonb_build_object(
    'legal_name', 'Acme Studio SARL',
    'legal_form', 'SARL',
    'siren', '912345678',
    'siret', '91234567800019',
    'vat_number', 'FR40912345678',
    'address', '12 rue de la Paix, 75002 Paris, France',
    'vat_registered', true,
    'default_vat_rate_bps', 2000
  )
)
on conflict (id) do nothing;

insert into clients (org_id, name, email, company) values
  ('00000000-0000-0000-0000-000000000001', 'Jordan Vale', 'jordan@northwind.co', 'Northwind Co'),
  ('00000000-0000-0000-0000-000000000001', 'Mira Okonkwo', 'mira@brightleaf.io', 'Brightleaf')
on conflict do nothing;

-- INV-0001: domestic FR sale, 20% TVA.  INV-0002: intra-EU B2B reverse charge (0%).
insert into invoices (org_id, number, status, subtotal_cents, tax_cents, total_cents, tax_rate_bps, vat_treatment, buyer_country, currency, issue_date, due_date)
values
  ('00000000-0000-0000-0000-000000000001', 'INV-0001', 'paid',    120000, 24000, 144000, 2000, 'standard',       'FR', 'EUR', current_date - 20, current_date - 6),
  ('00000000-0000-0000-0000-000000000001', 'INV-0002', 'overdue',  84000,     0,  84000,    0, 'reverse_charge', 'DE', 'EUR', current_date - 40, current_date - 12)
on conflict do nothing;

insert into transactions (org_id, direction, description, amount_cents, currency, category, category_confidence, occurred_on) values
  ('00000000-0000-0000-0000-000000000001', 'expense', 'Abonnement annuel Figma', 14400, 'EUR', 'Logiciels', 0.97, current_date - 5),
  ('00000000-0000-0000-0000-000000000001', 'income', 'Acompte Northwind', 250000, 'EUR', 'Ventes', 0.99, current_date - 3),
  ('00000000-0000-0000-0000-000000000001', 'expense', 'Déjeuner client — à vérifier', 8650, 'EUR', 'Repas', 0.42, current_date - 2)
on conflict do nothing;

insert into documents (org_id, title, kind, summary, status) values
  ('00000000-0000-0000-0000-000000000001', 'Northwind_MSA_signed.pdf', 'contract',
   'Master services agreement with Northwind. 12-month term, net-14 payment, auto-renew. Action: diary renewal 30 days before expiry.', 'processed')
on conflict do nothing;

insert into appointments (org_id, title, starts_at, location) values
  ('00000000-0000-0000-0000-000000000001', 'Brightleaf kickoff call', now() + interval '2 days', 'Google Meet')
on conflict do nothing;
