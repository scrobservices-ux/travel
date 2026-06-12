import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/tenant";
import { runAgent } from "@/agents/core/runtime";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  title: z.string().min(1),
  text: z.string().min(1), // already-extracted text (OCR/parse happens upstream)
  process: z.boolean().optional().default(true),
});

/**
 * POST /api/documents/upload  { title, text, process? }
 * Stores a document and (by default) lets the Documents agent classify,
 * summarize and extract fields from it. `text` is the extracted content — wire
 * an OCR/parse step (e.g. for PDFs/images) before this call.
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

  const admin = createAdminSupabase();
  const { data: doc, error } = await admin
    .from("documents")
    .insert({
      org_id: org.id,
      title: parsed.data.title,
      status: "pending",
      extracted: { text: parsed.data.text },
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  let agentRun = null;
  if (parsed.data.process) {
    agentRun = await runAgent({
      agentKey: "documents",
      orgId: org.id,
      trigger: "manual",
      task: `Analyze the document titled "${parsed.data.title}" (id ${doc.id}). Its extracted text is:\n\n${parsed.data.text}\n\nClassify it, summarize it, extract key fields, and file it with save_document_analysis.`,
    });
  }

  return NextResponse.json({ document: doc, agentRun });
}
