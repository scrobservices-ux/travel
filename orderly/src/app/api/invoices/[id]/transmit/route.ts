import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/tenant";
import { transmitInvoice } from "@/lib/einvoicing";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/invoices/:id/transmit  { isPublicSector? }
 * Routes the invoice to the correct French channel (PDP for B2B, Chorus Pro for
 * B2G) or flags it for e-reporting (B2C / cross-border).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await getActiveOrg();
  if (!org) return NextResponse.json({ error: "No active organization" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { isPublicSector?: boolean };

  try {
    const outcome = await transmitInvoice(
      createAdminSupabase(),
      { id: org.id, name: org.name, country: org.country },
      params.id,
      { isPublicSector: body.isPublicSector },
    );
    return NextResponse.json(outcome);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Transmission failed" }, { status: 502 });
  }
}
