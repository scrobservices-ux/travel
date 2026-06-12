import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/tenant";
import { getConnector } from "@/connectors/registry";
import { runAgent } from "@/agents/core/runtime";

export const runtime = "nodejs";
export const maxDuration = 120;

// Which agent processes the data each connector ingests.
const PROCESSOR: Record<string, string> = {
  gmail: "documents",
  google_calendar: "scheduling",
  bank: "bookkeeping",
};

/**
 * POST /api/connections/sync  { provider, process?: boolean }
 * Pulls fresh data from the provider into the tenant's tables, then (optionally)
 * lets the matching agent process what just arrived.
 */
export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await getActiveOrg();
  if (!org) return NextResponse.json({ error: "No active organization" }, { status: 403 });

  const { provider, process = true } = (await req.json()) as { provider: string; process?: boolean };
  const connector = getConnector(provider);
  const admin = createAdminSupabase();

  const { data: connection } = await admin
    .from("connections")
    .select("*")
    .eq("org_id", org.id)
    .eq("provider", provider)
    .maybeSingle();
  if (!connection || connection.status !== "connected") {
    return NextResponse.json({ error: "Provider not connected" }, { status: 400 });
  }

  let result;
  try {
    result = await connector.sync({ orgId: org.id, db: admin }, connection as any);
  } catch (e: any) {
    await admin.from("connections").update({ status: "error" }).eq("id", connection.id);
    return NextResponse.json({ error: e?.message ?? "Sync failed" }, { status: 502 });
  }

  await admin
    .from("connections")
    .update({ last_synced_at: new Date().toISOString(), status: "connected" })
    .eq("id", connection.id);

  // Hand off to the matching agent to process the freshly ingested data.
  let agentRun = null;
  const agentKey = PROCESSOR[provider];
  if (process && result.ingested > 0 && agentKey) {
    agentRun = await runAgent({
      agentKey,
      orgId: org.id,
      trigger: "webhook",
      task:
        agentKey === "documents"
          ? "New emails were imported as pending documents. Classify, summarize and extract key fields for each, then file them."
          : agentKey === "scheduling"
            ? "New calendar events were imported. Review upcoming appointments and draft any reminders that are due (queued for approval)."
            : "New bank transactions were imported uncategorized. Categorize each with a confidence score and record it.",
    });
  }

  return NextResponse.json({ sync: result, agentRun });
}
