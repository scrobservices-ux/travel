import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/tenant";
import { getConnector } from "@/connectors/registry";
import { oauthConfigured } from "@/connectors/types";

export const runtime = "nodejs";

/**
 * POST /api/connections/connect  { provider }
 * For OAuth providers, returns the authorize URL to redirect the user to.
 * For non-OAuth providers (e.g. bank aggregator), provisions the connection.
 * The org is taken from the session, never the body.
 */
export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await getActiveOrg();
  if (!org) return NextResponse.json({ error: "No active organization" }, { status: 403 });

  const { provider } = (await req.json()) as { provider: string };
  let connector;
  try {
    connector = getConnector(provider);
  } catch {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const redirectUri = `${appUrl}/api/connections/callback`;

  if (connector.oauth) {
    if (!oauthConfigured("google")) {
      return NextResponse.json(
        { error: "This provider isn't configured yet. Set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET." },
        { status: 503 },
      );
    }
    // State binds the flow to this org + provider; membership is re-verified on callback.
    const state = Buffer.from(JSON.stringify({ orgId: org.id, provider })).toString("base64url");
    return NextResponse.json({ url: connector.oauth.authorizeUrl(state, redirectUri) });
  }

  // Non-OAuth provider: create/mark the connection. (A real bank aggregator
  // widget would complete linking client-side and post tokens to metadata.)
  const admin = createAdminSupabase();
  await admin
    .from("connections")
    .upsert(
      { org_id: org.id, provider, status: "connected", metadata: {} },
      { onConflict: "org_id,provider" },
    );
  return NextResponse.json({ connected: true });
}
