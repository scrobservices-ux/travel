import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/tenant";
import { buildFacturxPdf } from "@/lib/invoice/pdf";
import { loadFacturxModel } from "@/lib/invoice/model";

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

  const model = await loadFacturxModel(supabase, org.id, params.id, org.name, org.country);
  if (!model) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const pdf = await buildFacturxPdf(model);

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${model.number}-facturx.pdf"`,
    },
  });
}
