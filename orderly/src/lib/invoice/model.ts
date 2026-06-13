import type { createAdminSupabase } from "@/lib/supabase/server";
import type { FacturxInvoice } from "./facturx-xml";

type AnyClient = ReturnType<typeof createAdminSupabase>;

/**
 * Load an invoice (scoped to org) and shape it into the FacturxInvoice model
 * used by the PDF/XML generators. Works with either the RLS server client or
 * the admin client — pass whichever the caller is authorized to use.
 */
export async function loadFacturxModel(
  db: AnyClient,
  orgId: string,
  invoiceId: string,
  orgName?: string,
  orgCountry?: string,
): Promise<FacturxInvoice | null> {
  const { data: inv } = await db
    .from("invoices")
    .select(
      "id,number,issue_date,currency,vat_treatment,tax_rate_bps,subtotal_cents,tax_cents,total_cents,buyer_country,buyer_vat_number,legal_mentions,seller_snapshot,clients(name)",
    )
    .eq("org_id", orgId)
    .eq("id", invoiceId)
    .maybeSingle();
  if (!inv) return null;

  const { data: lines } = await db
    .from("invoice_line_items")
    .select("description,quantity,unit_cents,amount_cents,tax_rate_bps")
    .eq("org_id", orgId)
    .eq("invoice_id", invoiceId);

  const seller = (inv.seller_snapshot ?? {}) as Record<string, any>;
  return {
    number: inv.number,
    issue_date: inv.issue_date,
    currency: inv.currency,
    vat_treatment: inv.vat_treatment,
    tax_rate_bps: inv.tax_rate_bps,
    subtotal_cents: inv.subtotal_cents,
    tax_cents: inv.tax_cents,
    total_cents: inv.total_cents,
    buyer_country: inv.buyer_country,
    buyer_vat_number: inv.buyer_vat_number,
    buyer_name: (inv as any).clients?.name ?? null,
    legal_mentions_text: inv.legal_mentions,
    seller: {
      legal_name: seller.legal_name ?? orgName,
      vat_number: seller.vat_number,
      siret: seller.siret,
      address: seller.address,
      country: seller.country ?? orgCountry ?? "FR",
    },
    lines: (lines ?? []).map((l) => ({
      description: l.description,
      quantity: Number(l.quantity),
      unit_cents: l.unit_cents,
      amount_cents: l.amount_cents,
      tax_rate_bps: l.tax_rate_bps ?? inv.tax_rate_bps,
    })),
  };
}
