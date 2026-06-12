import { headers } from "next/headers";
import { createServerSupabase } from "./supabase/server";

/**
 * Resolve the active tenant (organization) for the current request.
 *
 * Resolution order:
 *   1. Subdomain  ({slug}.orderly.app) — set by middleware in the x-org-slug header.
 *   2. The user's first membership (fallback for the apex domain / localhost).
 *
 * Returns null when there is no authenticated user or no org.
 */
export async function getActiveOrg() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const slug = headers().get("x-org-slug");

  if (slug) {
    const { data } = await supabase
      .from("organizations")
      .select("*")
      .eq("slug", slug)
      .single();
    if (data) return data;
  }

  // Fallback: first org the user belongs to.
  const { data } = await supabase
    .from("memberships")
    .select("organizations(*)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  return (data as any)?.organizations ?? null;
}

/** Extract a tenant slug from a host header, or null for the apex/localhost. */
export function slugFromHost(host: string | null): string | null {
  if (!host) return null;
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
  const bare = host.split(":")[0];
  const rootBare = root.split(":")[0];
  if (bare === rootBare || bare === `www.${rootBare}`) return null;
  if (bare.endsWith(`.${rootBare}`)) {
    return bare.slice(0, -1 * (rootBare.length + 1));
  }
  return null;
}
