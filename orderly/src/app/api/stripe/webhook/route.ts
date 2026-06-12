import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createAdminSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Stripe webhook. Keeps each organization's subscription state in sync. Uses
 * the service-role client (no user session here) but only ever writes the org
 * referenced in the event metadata.
 */
export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const payload = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(payload, sig, secret);
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook signature failed: ${err.message}` }, { status: 400 });
  }

  const db = createAdminSupabase();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orgId = session.metadata?.org_id;
      if (orgId) {
        await db
          .from("organizations")
          .update({
            stripe_subscription_id: session.subscription as string,
            subscription_status: "active",
            plan: session.metadata?.plan ?? "growth",
          })
          .eq("id", orgId);
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const orgId = sub.metadata?.org_id;
      if (orgId) {
        await db
          .from("organizations")
          .update({ subscription_status: sub.status })
          .eq("id", orgId);
      }
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
