import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getConnector } from "@/connectors/registry";
import { runAgent } from "@/agents/core/runtime";

export const runtime = "nodejs";
export const maxDuration = 300;

const PROCESSOR: Record<string, string> = {
  gmail: "documents",
  google_calendar: "scheduling",
  bank: "bookkeeping",
};

/**
 * Scheduled jobs. Protected by CRON_SECRET (Authorization: Bearer, or ?key=).
 * Wire it to a scheduler (Vercel Cron config in vercel.json) so connectors pull
 * automatically and overdue invoices get chased without anyone clicking sync.
 *
 *   ?job=sync       (default) — sync every connected connection across all orgs
 *   ?job=reminders  — run the invoicing agent for orgs with overdue invoices
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided =
    req.headers.get("authorization")?.replace("Bearer ", "") ??
    req.nextUrl.searchParams.get("key");
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const job = req.nextUrl.searchParams.get("job") ?? "sync";
  const db = createAdminSupabase();
  const results: unknown[] = [];

  if (job === "sync") {
    const { data: connections } = await db
      .from("connections")
      .select("*")
      .eq("status", "connected")
      .limit(500);

    for (const conn of connections ?? []) {
      try {
        const connector = getConnector(conn.provider);
        const sync = await connector.sync({ orgId: conn.org_id, db }, conn as any);
        await db
          .from("connections")
          .update({ last_synced_at: new Date().toISOString() })
          .eq("id", conn.id);

        const agentKey = PROCESSOR[conn.provider];
        if (sync.ingested > 0 && agentKey) {
          await runAgent({
            agentKey,
            orgId: conn.org_id,
            trigger: "scheduled",
            task:
              agentKey === "documents"
                ? "New emails were imported as pending documents. Classify, summarize and file each."
                : agentKey === "scheduling"
                  ? "New calendar events were imported. Draft any reminders that are due (queued for approval)."
                  : "New bank transactions were imported uncategorized. Categorize and record each.",
          });
        }
        results.push({ org: conn.org_id, provider: conn.provider, ingested: sync.ingested });
      } catch (e: any) {
        await db.from("connections").update({ status: "error" }).eq("id", conn.id);
        results.push({ org: conn.org_id, provider: conn.provider, error: e?.message ?? String(e) });
      }
    }
  } else if (job === "reminders") {
    // Orgs that currently have at least one overdue invoice.
    const { data: overdue } = await db
      .from("invoices")
      .select("org_id")
      .eq("status", "overdue")
      .limit(1000);
    const orgIds = Array.from(new Set((overdue ?? []).map((r) => r.org_id)));
    for (const orgId of orgIds) {
      try {
        const run = await runAgent({
          agentKey: "invoicing",
          orgId,
          trigger: "scheduled",
          task: "Review overdue invoices and draft a polite, firm payment reminder for each (action: send_payment_reminder). Honor the org's auto-send policy.",
        });
        results.push({ org: orgId, status: run.status });
      } catch (e: any) {
        results.push({ org: orgId, error: e?.message ?? String(e) });
      }
    }
  } else {
    return NextResponse.json({ error: "Unknown job" }, { status: 400 });
  }

  return NextResponse.json({ job, count: results.length, results });
}
