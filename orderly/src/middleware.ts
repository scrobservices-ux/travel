import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { slugFromHost } from "@/lib/tenant";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Middleware does two jobs:
 *  1. Resolve the tenant from the subdomain ({slug}.orderly.app) and forward it
 *     to the app as the `x-org-slug` request header.
 *  2. Refresh the Supabase auth session cookie so Server Components see a valid
 *     user, and gate the authenticated /dashboard area.
 */
export async function middleware(req: NextRequest) {
  const res = NextResponse.next({ request: req });

  const slug = slugFromHost(req.headers.get("host"));
  if (slug) res.headers.set("x-org-slug", slug);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (toSet: CookieToSet[]) => {
          toSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAppArea =
    req.nextUrl.pathname.startsWith("/dashboard") ||
    req.nextUrl.pathname.startsWith("/invoices") ||
    req.nextUrl.pathname.startsWith("/received") ||
    req.nextUrl.pathname.startsWith("/bookkeeping") ||
    req.nextUrl.pathname.startsWith("/documents") ||
    req.nextUrl.pathname.startsWith("/scheduling") ||
    req.nextUrl.pathname.startsWith("/agents") ||
    req.nextUrl.pathname.startsWith("/approvals") ||
    req.nextUrl.pathname.startsWith("/settings");

  if (isAppArea && !user) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
