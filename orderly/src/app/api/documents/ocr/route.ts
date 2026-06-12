import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/tenant";
import { extractText } from "@/lib/ocr";
import { runAgent } from "@/agents/core/runtime";

export const runtime = "nodejs";
export const maxDuration = 120;

const schema = z.object({
  title: z.string().min(1),
  media_type: z.string(),
  data: z.string().min(10), // base64 (no data: prefix)
  process: z.boolean().optional().default(true),
});

/**
 * POST /api/documents/ocr  { title, media_type, data(base64), process? }
 * Runs OCR on an uploaded image/PDF, stores the document, and lets the
 * Documents agent classify/summarize/extract from the transcribed text.
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

  let text: string;
  try {
    text = await extractText(parsed.data.data, parsed.data.media_type);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "OCR failed" }, { status: 422 });
  }

  const admin = createAdminSupabase();
  const { data: doc, error } = await admin
    .from("documents")
    .insert({
      org_id: org.id,
      title: parsed.data.title,
      status: "pending",
      extracted: { text, ocr: true, media_type: parsed.data.media_type },
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
      task: `Analyze the document titled "${parsed.data.title}" (id ${doc.id}). Transcribed text:\n\n${text.slice(0, 8000)}\n\nClassify it, summarize it, extract key fields, and file it with save_document_analysis.`,
    });
  }

  return NextResponse.json({ document: doc, chars: text.length, agentRun });
}
