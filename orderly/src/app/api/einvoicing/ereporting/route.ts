import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/tenant";
import { buildEReportingDataset, toCsv } from "@/lib/einvoicing/ereporting";

export const runtime = "nodejs";

/**
 * GET /api/einvoicing/ereporting?from=YYYY-MM-DD&to=YYYY-MM-DD&format=csv|json
 * The B2C + cross-border sales to declare via e-reporting for the period.
 * Preparing/exporting this needs no accreditation.
 */
export async function GET(req: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await getActiveOrg();
  if (!org) return NextResponse.json({ error: "No active organization" }, { status: 403 });

  const url = new URL(req.url);
  const now = new Date();
  const from = url.searchParams.get("from") ?? new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to = url.searchParams.get("to") ?? now.toISOString().slice(0, 10);
  const format = url.searchParams.get("format") ?? "csv";

  const rows = await buildEReportingDataset(createAdminSupabase(), { id: org.id, country: org.country }, from, to);

  if (format === "json") return NextResponse.json({ from, to, count: rows.length, rows });

  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ereporting-${from}_${to}.csv"`,
    },
  });
}
