import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import type { EInvoiceStatus } from "@/lib/einvoicing/types";

export const runtime = "nodejs";

const VALID: EInvoiceStatus[] = [
  "submitted", "received", "approved", "refused", "rejected", "payment_received",
];

/**
 * POST /api/einvoicing/webhook  { external_id, status, note? }
 * Life-cycle status callbacks from the PDP / Chorus Pro. Authenticated with a
 * shared secret (header x-einvoice-secret = EINVOICE_WEBHOOK_SECRET). Appends to
 * the submission's history and reflects the latest status on the invoice.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.EINVOICE_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-einvoice-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { external_id, status, note } = (await req.json().catch(() => ({}))) as {
    external_id?: string;
    status?: EInvoiceStatus;
    note?: string;
  };
  if (!external_id || !status || !VALID.includes(status)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const db = createAdminSupabase();
  const { data: sub } = await db
    .from("einvoice_submissions")
    .select("id,org_id,invoice_id,lifecycle")
    .eq("external_id", external_id)
    .maybeSingle();
  if (!sub) return NextResponse.json({ error: "Submission not found" }, { status: 404 });

  const lifecycle = [...(sub.lifecycle ?? []), { status, at: new Date().toISOString(), note }];
  await db
    .from("einvoice_submissions")
    .update({ status, lifecycle, updated_at: new Date().toISOString() })
    .eq("id", sub.id);
  await db
    .from("invoices")
    .update({ einvoice_status: status })
    .eq("org_id", sub.org_id)
    .eq("id", sub.invoice_id);

  return NextResponse.json({ ok: true });
}
