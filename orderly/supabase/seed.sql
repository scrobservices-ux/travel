-- ===========================================================================
-- Orderly — demo seed data. Run AFTER schema.sql against a dev database.
-- Replace the org id / membership user id with real values for a live test.
-- ===========================================================================

insert into organizations (id, name, slug, plan, subscription_status)
values ('00000000-0000-0000-0000-000000000001', 'Acme Studio', 'acme', 'growth', 'active')
on conflict (id) do nothing;

insert into clients (org_id, name, email, company) values
  ('00000000-0000-0000-0000-000000000001', 'Jordan Vale', 'jordan@northwind.co', 'Northwind Co'),
  ('00000000-0000-0000-0000-000000000001', 'Mira Okonkwo', 'mira@brightleaf.io', 'Brightleaf')
on conflict do nothing;

insert into invoices (org_id, number, status, total_cents, subtotal_cents, currency, issue_date, due_date)
values
  ('00000000-0000-0000-0000-000000000001', 'INV-0001', 'paid', 120000, 120000, 'USD', current_date - 20, current_date - 6),
  ('00000000-0000-0000-0000-000000000001', 'INV-0002', 'overdue', 84000, 84000, 'USD', current_date - 40, current_date - 12)
on conflict do nothing;

insert into transactions (org_id, direction, description, amount_cents, category, category_confidence, occurred_on) values
  ('00000000-0000-0000-0000-000000000001', 'expense', 'Figma annual subscription', 14400, 'Software', 0.97, current_date - 5),
  ('00000000-0000-0000-0000-000000000001', 'income', 'Northwind retainer', 250000, 'Sales', 0.99, current_date - 3),
  ('00000000-0000-0000-0000-000000000001', 'expense', 'Client lunch — unclear', 8650, 'Meals', 0.42, current_date - 2)
on conflict do nothing;

insert into documents (org_id, title, kind, summary, status) values
  ('00000000-0000-0000-0000-000000000001', 'Northwind_MSA_signed.pdf', 'contract',
   'Master services agreement with Northwind. 12-month term, net-14 payment, auto-renew. Action: diary renewal 30 days before expiry.', 'processed')
on conflict do nothing;

insert into appointments (org_id, title, starts_at, location) values
  ('00000000-0000-0000-0000-000000000001', 'Brightleaf kickoff call', now() + interval '2 days', 'Google Meet')
on conflict do nothing;
