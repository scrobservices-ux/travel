import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/tenant";
import { parseEInvoiceFile } from "@/lib/einvoicing/parse";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  filename: z.string().optional(),
  media_type: z.string(),
  data: z.string().min(10), // base64
  record_expense: z.boolean().optional().default(false),
});

/**
 * POST /api/einvoicing/inbound — receive a supplier e-invoice (Factur-X PDF, or
 * CII/UBL XML), parse the structured data, and store it. Optionally records it
 * as a bookkeeping expense. No accreditation needed — this is reception.
 */
export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await getActiveOrg();
  if (!org) return NextResponse.json({ error: "No active organization" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  let inv;
  try {
    inv = parseEInvoiceFile(parsed.data.data, parsed.data.media_type);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Could not parse e-invoice" }, { status: 422 });
  }

  const admin = createAdminSupabase();

  let transactionId: string | null = null;
  if (parsed.data.record_expense && inv.total_ttc_cents) {
    const { data: txn } = await admin
      .from("transactions")
      .insert({
        org_id: org.id,
        direction: "expense",
        description: `${inv.supplier_name ?? "Fournisseur"} — facture ${inv.number ?? ""}`.trim(),
        amount_cents: inv.total_ttc_cents,
        currency: inv.currency ?? "EUR",
        occurred_on: inv.issue_date ?? new Date().toISOString().slice(0, 10),
        source: "einvoice",
      })
      .select("id")
      .single();
    transactionId = txn?.id ?? null;
  }

  const { data: stored, error } = await admin
    .from("received_invoices")
    .insert({
      org_id: org.id,
      source: "upload",
      format: inv.format,
      supplier_name: inv.supplier_name,
      supplier_vat: inv.supplier_vat,
      number: inv.number,
      issue_date: inv.issue_date,
      currency: inv.currency ?? "EUR",
      total_ht_cents: inv.total_ht_cents,
      total_vat_cents: inv.total_vat_cents,
      total_ttc_cents: inv.total_ttc_cents,
      status: transactionId ? "recorded" : "received",
      transaction_id: transactionId,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ received: stored, parsed: inv });
}
