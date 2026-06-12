import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookieToSet = { name: string; value: string; options: CookieOptions };
import { createClient as createAdminBase } from "@supabase/supabase-js";

/**
 * Server Supabase client bound to the request's auth cookie. RLS applies, so
 * this is the safe client for anything triggered by a logged-in user.
 */
export function createServerSupabase() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet: CookieToSet[]) => {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // called from a Server Component — safe to ignore, middleware refreshes
          }
        },
      },
    },
  );
}

/**
 * Service-role client. BYPASSES RLS. Only use in trusted server contexts
 * (agent runtime, Stripe webhooks) and always scope queries to an org_id you
 * have independently authorized. Never import this into client code.
 */
export function createAdminSupabase() {
  return createAdminBase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
