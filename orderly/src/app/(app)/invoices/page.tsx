import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/tenant";
import { formatMoney, formatDate, cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-ink/10 text-ink-muted",
  sent: "bg-brass/15 text-brass-dark",
  paid: "bg-sage/15 text-sage",
  overdue: "bg-red-100 text-red-700",
  void: "bg-ink/5 text-ink-muted line-through",
};

export default async function InvoicesPage() {
  const supabase = createServerSupabase();
  const org = await getActiveOrg();
  const { data: invoices } = await supabase
    .from("invoices")
    .select("id,number,status,total_cents,currency,issue_date,due_date,clients(name)")
    .eq("org_id", org!.id)
    .order("issue_date", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-semibold">Invoices</h1>
        <Link href="/agents" className="rounded-full bg-ink px-5 py-2 text-sm text-ivory hover:bg-ink-soft">
          New via agent
        </Link>
      </div>

      <div className="mt-8 overflow-hidden rounded-2xl border border-ink/10 bg-white/60">
        <table className="w-full text-sm">
          <thead className="border-b border-ink/10 text-left text-xs uppercase tracking-widest text-ink-muted">
            <tr>
              <th className="p-4">Number</th>
              <th className="p-4">Client</th>
              <th className="p-4">Issued</th>
              <th className="p-4">Due</th>
              <th className="p-4 text-right">Total</th>
              <th className="p-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {(invoices ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-ink-muted">
                  No invoices yet — ask the invoicing agent to create one.
                </td>
              </tr>
            )}
            {(invoices ?? []).map((inv: any) => (
              <tr key={inv.id} className="hover:bg-ink/[0.02]">
                <td className="p-4 font-medium">{inv.number}</td>
                <td className="p-4">{inv.clients?.name ?? "—"}</td>
                <td className="p-4 text-ink-muted">{formatDate(inv.issue_date)}</td>
                <td className="p-4 text-ink-muted">{inv.due_date ? formatDate(inv.due_date) : "—"}</td>
                <td className="p-4 text-right font-medium">{formatMoney(inv.total_cents, inv.currency)}</td>
                <td className="p-4">
                  <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium capitalize", STATUS_STYLES[inv.status])}>
                    {inv.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
