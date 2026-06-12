import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/tenant";
import { dispatchOutbox } from "@/lib/outbox";

export const runtime = "nodejs";

/**
 * POST /api/outbox  { id, action: "approve" | "discard" }
 * Human-in-the-loop control over what agents prepared. "approve" sends it.
 */
export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await getActiveOrg();
  if (!org) return NextResponse.json({ error: "No active organization" }, { status: 403 });

  const { id, action } = (await req.json()) as { id: string; action: "approve" | "discard" };
  const admin = createAdminSupabase();

  // Confirm the item belongs to the active org before touching it.
  const { data: item } = await admin
    .from("outbox")
    .select("id,status")
    .eq("org_id", org.id)
    .eq("id", id)
    .maybeSingle();
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (action === "discard") {
    await admin.from("outbox").update({ status: "discarded" }).eq("id", id);
    return NextResponse.json({ status: "discarded" });
  }

  if (action === "approve") {
    await admin.from("outbox").update({ status: "approved" }).eq("id", id);
    const sent = await dispatchOutbox(admin, org.id, id);
    return NextResponse.json({ status: sent?.status ?? "sent" });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
