import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/tenant";
import { buildFacturxPdf } from "@/lib/invoice/pdf";
import type { FacturxInvoice } from "@/lib/invoice/facturx-xml";

export const runtime = "nodejs";

/**
 * GET /api/invoices/:id/facturx — return the invoice as a Factur-X PDF
 * (human-readable PDF with embedded EN 16931 CII XML). RLS + the org check
 * ensure the caller can only export their own invoices.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await getActiveOrg();
  if (!org) return NextResponse.json({ error: "No active organization" }, { status: 403 });

  const { data: inv } = await supabase
    .from("invoices")
    .select(
      "id,number,issue_date,currency,vat_treatment,tax_rate_bps,subtotal_cents,tax_cents,total_cents,buyer_country,buyer_vat_number,legal_mentions,seller_snapshot,clients(name)",
    )
    .eq("org_id", org.id)
    .eq("id", params.id)
    .maybeSingle();
  if (!inv) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const { data: lines } = await supabase
    .from("invoice_line_items")
    .select("description,quantity,unit_cents,amount_cents,tax_rate_bps")
    .eq("org_id", org.id)
    .eq("invoice_id", params.id);

  const seller = (inv.seller_snapshot ?? {}) as Record<string, any>;
  const model: FacturxInvoice = {
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
      legal_name: seller.legal_name ?? org.name,
      vat_number: seller.vat_number,
      siret: seller.siret,
      address: seller.address,
      country: seller.country ?? org.country ?? "FR",
    },
    lines: (lines ?? []).map((l) => ({
      description: l.description,
      quantity: Number(l.quantity),
      unit_cents: l.unit_cents,
      amount_cents: l.amount_cents,
      tax_rate_bps: l.tax_rate_bps ?? inv.tax_rate_bps,
    })),
  };

  const pdf = await buildFacturxPdf(model);

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${inv.number}-facturx.pdf"`,
    },
  });
}
