import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/tenant";
import { AUTOMATABLE_ACTIONS } from "@/lib/automation";

export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(AUTOMATABLE_ACTIONS.map((a) => a.key) as [string, ...string[]]),
  mode: z.enum(["review", "auto"]),
});

/**
 * POST /api/settings/automation  { action, mode }
 * Toggle a single automation action between review (default) and auto-send.
 * Only owners/admins should reach this; RLS lets members update their org but
 * you can tighten this with a role check.
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

  const next = { ...(org.automation ?? {}), [parsed.data.action]: parsed.data.mode };
  const { error } = await supabase.from("organizations").update({ automation: next }).eq("id", org.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ automation: next });
}
