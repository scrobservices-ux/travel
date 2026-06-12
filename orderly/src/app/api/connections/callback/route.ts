import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { getConnector } from "@/connectors/registry";

export const runtime = "nodejs";

/**
 * OAuth redirect target. Exchanges the code for tokens and stores them on the
 * org's connection. Re-verifies that the signed-in user is a member of the org
 * encoded in `state`, so a stray callback can't attach tokens to someone else's
 * organization.
 */
export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const back = (msg: string) => NextResponse.redirect(`${appUrl}/settings?connect=${msg}`);

  if (!code || !state) return back("error");

  let decoded: { orgId: string; provider: string };
  try {
    decoded = JSON.parse(Buffer.from(state, "base64url").toString());
  } catch {
    return back("error");
  }

  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return back("unauthorized");

  // Verify membership of the target org.
  const { data: membership } = await supabase
    .from("memberships")
    .select("id")
    .eq("org_id", decoded.orgId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return back("forbidden");

  const connector = getConnector(decoded.provider);
  if (!connector.oauth) return back("error");

  const redirectUri = `${appUrl}/api/connections/callback`;
  try {
    const tokens = await connector.oauth.exchangeCode(code, redirectUri);
    const admin = createAdminSupabase();
    await admin.from("connections").upsert(
      {
        org_id: decoded.orgId,
        provider: decoded.provider,
        status: "connected",
        external_account: tokens.external_account ?? null,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        expires_at: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
          : null,
      },
      { onConflict: "org_id,provider" },
    );
    return back("success");
  } catch {
    return back("error");
  }
}
