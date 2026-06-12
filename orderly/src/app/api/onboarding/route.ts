import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

const schema = z.object({ name: z.string().min(2), slug: z.string().min(2).optional() });

function slugify(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

/**
 * Create a new organization (tenant) and make the current user its owner.
 * Uses the service-role client to create the rows, but only ever for the
 * authenticated user's own new org.
 */
export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const admin = createAdminSupabase();
  let slug = parsed.data.slug ? slugify(parsed.data.slug) : slugify(parsed.data.name);

  // Ensure slug uniqueness.
  const { data: clash } = await admin.from("organizations").select("id").eq("slug", slug).maybeSingle();
  if (clash) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

  const { data: org, error } = await admin
    .from("organizations")
    .insert({ name: parsed.data.name, slug })
    .select("id,slug")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const { error: memErr } = await admin
    .from("memberships")
    .insert({ org_id: org.id, user_id: user.id, role: "owner" });
  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 400 });

  return NextResponse.json({ org });
}
