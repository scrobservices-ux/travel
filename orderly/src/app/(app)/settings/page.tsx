import { getActiveOrg } from "@/lib/tenant";
import { PLANS, type PlanKey } from "@/lib/stripe";

export default async function SettingsPage() {
  const org = await getActiveOrg();
  const plan = (org!.plan ?? "starter") as PlanKey;

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Settings</h1>

      <section className="mt-8 rounded-2xl border border-ink/10 bg-white/60 p-6">
        <h2 className="font-display text-lg font-semibold">Organization</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-ink-muted">Name</dt><dd className="font-medium">{org!.name}</dd></div>
          <div><dt className="text-ink-muted">Workspace</dt><dd className="font-medium">{org!.slug}.orderly.app</dd></div>
          <div><dt className="text-ink-muted">Plan</dt><dd className="font-medium">{PLANS[plan]?.name ?? plan}</dd></div>
          <div><dt className="text-ink-muted">Subscription</dt><dd className="font-medium capitalize">{org!.subscription_status ?? "trialing"}</dd></div>
        </dl>
      </section>

      <section className="mt-6 rounded-2xl border border-ink/10 bg-white/60 p-6">
        <h2 className="font-display text-lg font-semibold">Billing</h2>
        <p className="mt-2 text-sm text-ink-muted">
          Manage your plan and payment method. Each business is billed for its own instance.
        </p>
        <form action="/api/stripe/checkout" method="post" className="mt-4 flex flex-wrap gap-3">
          {(Object.keys(PLANS) as PlanKey[]).map((k) => (
            <button
              key={k}
              formAction={`/api/stripe/checkout`}
              name="plan"
              value={k}
              className="rounded-full border border-ink/15 px-5 py-2 text-sm hover:border-brass disabled:opacity-50"
              disabled={k === plan}
            >
              {k === plan ? `Current: ${PLANS[k].name}` : `Switch to ${PLANS[k].name}`}
            </button>
          ))}
        </form>
        <p className="mt-3 text-xs text-ink-muted">
          (Wire this form to a small client action that POSTs JSON to /api/stripe/checkout and redirects to the returned URL.)
        </p>
      </section>
    </div>
  );
}
