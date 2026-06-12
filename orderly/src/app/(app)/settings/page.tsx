import { createServerSupabase } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/tenant";
import { PLANS, type PlanKey } from "@/lib/stripe";
import { AUTOMATABLE_ACTIONS, getPolicy } from "@/lib/automation";
import { CONNECTOR_LIST } from "@/connectors/registry";
import { ConnectionsPanel } from "@/components/app/ConnectionsPanel";
import { AutomationPanel } from "@/components/app/AutomationPanel";
import { TaxProfilePanel } from "@/components/app/TaxProfilePanel";
import { getDict } from "@/i18n/server";

export default async function SettingsPage() {
  const supabase = createServerSupabase();
  const t = getDict().settings;
  const org = await getActiveOrg();
  const plan = (org!.plan ?? "starter") as PlanKey;

  const { data: connections } = await supabase
    .from("connections")
    .select("provider,status,external_account,last_synced_at")
    .eq("org_id", org!.id);

  const policy = getPolicy(org!);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold">{t.title}</h1>

      <section className="rounded-2xl border border-ink/10 bg-white/60 p-6">
        <h2 className="font-display text-lg font-semibold">{t.org}</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-ink-muted">{t.name}</dt><dd className="font-medium">{org!.name}</dd></div>
          <div><dt className="text-ink-muted">{t.workspace}</dt><dd className="font-medium">{org!.slug}.orderly.app</dd></div>
          <div><dt className="text-ink-muted">{t.plan}</dt><dd className="font-medium">{PLANS[plan]?.name ?? plan}</dd></div>
          <div><dt className="text-ink-muted">{t.subscription}</dt><dd className="font-medium capitalize">{org!.subscription_status ?? "trialing"}</dd></div>
        </dl>
      </section>

      <section className="rounded-2xl border border-ink/10 bg-white/60 p-6">
        <h2 className="font-display text-lg font-semibold">{t.tax}</h2>
        <p className="mt-1 mb-4 text-sm text-ink-muted">{t.taxSub}</p>
        <TaxProfilePanel
          country={org!.country ?? "FR"}
          currency={org!.currency ?? "EUR"}
          profile={org!.tax_profile ?? {}}
        />
      </section>

      <section className="rounded-2xl border border-ink/10 bg-white/60 p-6">
        <h2 className="font-display text-lg font-semibold">{t.connections}</h2>
        <p className="mt-1 mb-4 text-sm text-ink-muted">{t.connectionsSub}</p>
        <ConnectionsPanel connectors={CONNECTOR_LIST} connections={connections ?? []} />
      </section>

      <section className="rounded-2xl border border-ink/10 bg-white/60 p-6">
        <h2 className="font-display text-lg font-semibold">{t.automation}</h2>
        <p className="mt-1 mb-4 text-sm text-ink-muted">{t.automationSub}</p>
        <AutomationPanel actions={[...AUTOMATABLE_ACTIONS]} policy={policy} />
      </section>

      <section className="rounded-2xl border border-ink/10 bg-white/60 p-6">
        <h2 className="font-display text-lg font-semibold">{t.billing}</h2>
        <p className="mt-2 text-sm text-ink-muted">{t.billingSub}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          {(Object.keys(PLANS) as PlanKey[]).map((k) => (
            <span
              key={k}
              className={`rounded-full border px-5 py-2 text-sm ${k === plan ? "border-brass bg-brass/10 text-brass-dark" : "border-ink/15 text-ink-muted"}`}
            >
              {PLANS[k].name} · {PLANS[k].monthly} €/mois{k === plan ? ` (${t.current})` : ""}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
