import Stripe from "stripe";

// Lazily instantiated so importing PLANS (e.g. on the landing page) never
// requires a Stripe key, and the client isn't constructed during prerender.
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    _stripe = new Stripe(key, { apiVersion: "2025-02-24.acacia", typescript: true });
  }
  return _stripe;
}

export const PLANS = {
  starter: {
    name: "Starter",
    priceId: process.env.STRIPE_PRICE_STARTER,
    blurb: "For solo operators and very small teams getting their admin in order.",
    monthly: 49,
    features: [
      "1 connected business",
      "Invoicing agent",
      "Up to 200 documents / mo",
      "Email support",
    ],
  },
  growth: {
    name: "Growth",
    priceId: process.env.STRIPE_PRICE_GROWTH,
    blurb: "For growing SMBs that want every repetitive task handled.",
    monthly: 149,
    popular: true,
    features: [
      "All four agents (invoicing, books, docs, scheduling)",
      "Unlimited documents",
      "Bank & calendar integrations",
      "Priority support",
    ],
  },
  scale: {
    name: "Scale",
    priceId: process.env.STRIPE_PRICE_SCALE,
    blurb: "For multi-entity businesses and agencies running many books.",
    monthly: 399,
    features: [
      "Multiple business entities",
      "Custom agent workflows",
      "Audit exports & SSO",
      "Dedicated onboarding",
    ],
  },
} as const;

export type PlanKey = keyof typeof PLANS;
