import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/tenant";
import { formatMoney, formatDate } from "@/lib/utils";
import { getDict } from "@/i18n/server";

export default async function DashboardPage() {
  const supabase = createServerSupabase();
  const t = getDict().dashboard;
  const org = await getActiveOrg();
  const orgId = org!.id;

  // A few headline numbers. RLS keeps these scoped to the active org.
  const [{ count: openInvoices }, { count: docsPending }, { data: recentRuns }, { data: paid }] =
    await Promise.all([
      supabase.from("invoices").select("id", { count: "exact", head: true }).eq("org_id", orgId).in("status", ["sent", "overdue"]),
      supabase.from("documents").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "pending"),
      supabase.from("agent_runs").select("id,agent,status,started_at").eq("org_id", orgId).order("started_at", { ascending: false }).limit(5),
      supabase.from("invoices").select("total_cents").eq("org_id", orgId).eq("status", "paid"),
    ]);

  const collected = (paid ?? []).reduce((s, r) => s + (r.total_cents ?? 0), 0);

  const stats = [
    { label: t.collected, value: formatMoney(collected) },
    { label: t.openInvoices, value: String(openInvoices ?? 0) },
    { label: t.docsToProcess, value: String(docsPending ?? 0) },
  ];

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">{t.hello}</h1>
      <p className="mt-2 text-ink-muted">{t.sub}</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-ink/10 bg-white/60 p-6">
            <div className="text-sm text-ink-muted">{s.label}</div>
            <div className="mt-2 font-display text-3xl font-semibold">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-10 flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold">{t.recent}</h2>
        <Link href="/agents" className="text-sm text-brass-dark hover:underline">{t.runAgent}</Link>
      </div>
      <div className="mt-4 divide-y divide-ink/10 rounded-2xl border border-ink/10 bg-white/60">
        {(recentRuns ?? []).length === 0 && (
          <div className="p-6 text-sm text-ink-muted">{t.noRuns}</div>
        )}
        {(recentRuns ?? []).map((r) => (
          <div key={r.id} className="flex items-center justify-between p-4 text-sm">
            <span className="font-medium capitalize">{r.agent}</span>
            <span className="text-ink-muted">{formatDate(r.started_at)}</span>
            <span
              className={
                r.status === "succeeded"
                  ? "text-sage"
                  : r.status === "failed"
                    ? "text-red-600"
                    : "text-brass-dark"
              }
            >
              {r.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
