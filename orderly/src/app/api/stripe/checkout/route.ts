import { NextRequest, NextResponse } from "next/server";
import { getStripe, PLANS, type PlanKey } from "@/lib/stripe";
import { createServerSupabase } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/tenant";

export const runtime = "nodejs";

/**
 * POST /api/stripe/checkout — start a Checkout session to subscribe the active
 * org to a plan. Creates/links a Stripe customer per organization.
 */
export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await getActiveOrg();
  if (!org) return NextResponse.json({ error: "No active organization" }, { status: 403 });

  const { plan } = (await req.json()) as { plan: PlanKey };
  const priceId = PLANS[plan]?.priceId;
  if (!priceId) return NextResponse.json({ error: "Unknown plan" }, { status: 400 });

  const stripe = getStripe();
  let customerId = org.stripe_customer_id as string | null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: org.name,
      email: user.email ?? undefined,
      metadata: { org_id: org.id },
    });
    customerId = customer.id;
    // Persist via service role through a dedicated admin client is also fine;
    // here RLS allows owners/admins to update their own org.
    await supabase.from("organizations").update({ stripe_customer_id: customerId }).eq("id", org.id);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/dashboard?checkout=success`,
    cancel_url: `${appUrl}/dashboard?checkout=cancelled`,
    metadata: { org_id: org.id, plan },
    subscription_data: { metadata: { org_id: org.id, plan } },
  });

  return NextResponse.json({ url: session.url });
}
