import { createServerSupabase } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/tenant";
import { formatMoney, formatDate } from "@/lib/utils";

export default async function BookkeepingPage() {
  const supabase = createServerSupabase();
  const org = await getActiveOrg();
  const { data: txns } = await supabase
    .from("transactions")
    .select("id,direction,description,amount_cents,currency,category,category_confidence,occurred_on,reconciled")
    .eq("org_id", org!.id)
    .order("occurred_on", { ascending: false })
    .limit(100);

  const income = (txns ?? []).filter((t) => t.direction === "income").reduce((s, t) => s + t.amount_cents, 0);
  const expense = (txns ?? []).filter((t) => t.direction === "expense").reduce((s, t) => s + t.amount_cents, 0);

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Bookkeeping</h1>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-ink/10 bg-white/60 p-6">
          <div className="text-sm text-ink-muted">Income</div>
          <div className="mt-2 font-display text-2xl font-semibold text-sage">{formatMoney(income)}</div>
        </div>
        <div className="rounded-2xl border border-ink/10 bg-white/60 p-6">
          <div className="text-sm text-ink-muted">Expenses</div>
          <div className="mt-2 font-display text-2xl font-semibold text-brass-dark">{formatMoney(expense)}</div>
        </div>
        <div className="rounded-2xl border border-ink/10 bg-white/60 p-6">
          <div className="text-sm text-ink-muted">Net</div>
          <div className="mt-2 font-display text-2xl font-semibold">{formatMoney(income - expense)}</div>
        </div>
      </div>

      <div className="mt-8 overflow-hidden rounded-2xl border border-ink/10 bg-white/60">
        <table className="w-full text-sm">
          <thead className="border-b border-ink/10 text-left text-xs uppercase tracking-widest text-ink-muted">
            <tr>
              <th className="p-4">Date</th>
              <th className="p-4">Description</th>
              <th className="p-4">Category</th>
              <th className="p-4">Confidence</th>
              <th className="p-4 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {(txns ?? []).length === 0 && (
              <tr><td colSpan={5} className="p-8 text-center text-ink-muted">No transactions yet — the bookkeeping agent will fill this in.</td></tr>
            )}
            {(txns ?? []).map((t) => (
              <tr key={t.id} className="hover:bg-ink/[0.02]">
                <td className="p-4 text-ink-muted">{formatDate(t.occurred_on)}</td>
                <td className="p-4">{t.description}</td>
                <td className="p-4">{t.category ?? "—"}</td>
                <td className="p-4 text-ink-muted">
                  {t.category_confidence != null ? `${Math.round(t.category_confidence * 100)}%` : "—"}
                </td>
                <td className={`p-4 text-right font-medium ${t.direction === "income" ? "text-sage" : "text-ink"}`}>
                  {t.direction === "expense" ? "−" : "+"}{formatMoney(t.amount_cents, t.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
