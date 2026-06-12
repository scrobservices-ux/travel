"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client. Uses the anon key — every query is constrained by
 * the row-level-security policies defined in supabase/schema.sql, so the
 * browser can only ever touch rows for orgs the signed-in user belongs to.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
