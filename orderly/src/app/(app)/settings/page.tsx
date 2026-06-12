import { createServerSupabase } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/tenant";
import { PLANS, type PlanKey } from "@/lib/stripe";
import { AUTOMATABLE_ACTIONS, getPolicy } from "@/lib/automation";
import { CONNECTOR_LIST } from "@/connectors/registry";
import { ConnectionsPanel } from "@/components/app/ConnectionsPanel";
import { AutomationPanel } from "@/components/app/AutomationPanel";
import { TaxProfilePanel } from "@/components/app/TaxProfilePanel";

export default async function SettingsPage() {
  const supabase = createServerSupabase();
  const org = await getActiveOrg();
  const plan = (org!.plan ?? "starter") as PlanKey;

  const { data: connections } = await supabase
    .from("connections")
    .select("provider,status,external_account,last_synced_at")
    .eq("org_id", org!.id);

  const policy = getPolicy(org!);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold">Settings</h1>

      <section className="rounded-2xl border border-ink/10 bg-white/60 p-6">
        <h2 className="font-display text-lg font-semibold">Organization</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-ink-muted">Name</dt><dd className="font-medium">{org!.name}</dd></div>
          <div><dt className="text-ink-muted">Workspace</dt><dd className="font-medium">{org!.slug}.orderly.app</dd></div>
          <div><dt className="text-ink-muted">Plan</dt><dd className="font-medium">{PLANS[plan]?.name ?? plan}</dd></div>
          <div><dt className="text-ink-muted">Subscription</dt><dd className="font-medium capitalize">{org!.subscription_status ?? "trialing"}</dd></div>
        </dl>
      </section>

      <section className="rounded-2xl border border-ink/10 bg-white/60 p-6">
        <h2 className="font-display text-lg font-semibold">Tax &amp; legal profile</h2>
        <p className="mt-1 mb-4 text-sm text-ink-muted">
          Your seller identity for compliant French/EU invoices — SIREN/SIRET, TVA number,
          and default VAT rate. The invoicing agent uses these on every invoice.
        </p>
        <TaxProfilePanel
          country={org!.country ?? "FR"}
          currency={org!.currency ?? "EUR"}
          profile={org!.tax_profile ?? {}}
        />
      </section>

      <section className="rounded-2xl border border-ink/10 bg-white/60 p-6">
        <h2 className="font-display text-lg font-semibold">Connections</h2>
        <p className="mt-1 mb-4 text-sm text-ink-muted">
          Connect your tools so the agents have data to work with. Orderly only ever reads what it needs.
        </p>
        <ConnectionsPanel connectors={CONNECTOR_LIST} connections={connections ?? []} />
      </section>

      <section className="rounded-2xl border border-ink/10 bg-white/60 p-6">
        <h2 className="font-display text-lg font-semibold">Automation</h2>
        <p className="mt-1 mb-4 text-sm text-ink-muted">
          By default Orderly prepares actions for your review. Turn on auto for anything you trust the agents to do on their own.
        </p>
        <AutomationPanel actions={[...AUTOMATABLE_ACTIONS]} policy={policy} />
      </section>

      <section className="rounded-2xl border border-ink/10 bg-white/60 p-6">
        <h2 className="font-display text-lg font-semibold">Billing</h2>
        <p className="mt-2 text-sm text-ink-muted">
          Manage your plan and payment method. Each business is billed for its own instance.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {(Object.keys(PLANS) as PlanKey[]).map((k) => (
            <span
              key={k}
              className={`rounded-full border px-5 py-2 text-sm ${k === plan ? "border-brass bg-brass/10 text-brass-dark" : "border-ink/15 text-ink-muted"}`}
            >
              {PLANS[k].name} · ${PLANS[k].monthly}/mo{k === plan ? " (current)" : ""}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink-muted">
          Upgrade via Checkout — POST the plan key to <code>/api/stripe/checkout</code> and redirect to the returned URL.
        </p>
      </section>
    </div>
  );
}
