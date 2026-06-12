import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/tenant";
import { runAgent } from "@/agents/core/runtime";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  agent: z.enum(["invoicing", "bookkeeping", "documents", "scheduling"]),
  task: z.string().min(3),
});

/**
 * POST /api/agents/run — run a specialist agent for the caller's active org.
 * Authorization: the user must be authenticated AND a member of the org. The
 * org id comes from the server session, never from the request body, so a
 * caller can't run agents against someone else's data.
 */
export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await getActiveOrg();
  if (!org) return NextResponse.json({ error: "No active organization" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const result = await runAgent({
    agentKey: parsed.data.agent,
    orgId: org.id,
    task: parsed.data.task,
    trigger: "manual",
  });

  return NextResponse.json(result);
}
