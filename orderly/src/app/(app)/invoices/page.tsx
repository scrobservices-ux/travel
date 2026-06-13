import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/tenant";
import { formatMoney, formatDate, cn } from "@/lib/utils";
import { getDict } from "@/i18n/server";
import { TransmitButton } from "@/components/app/TransmitButton";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-ink/10 text-ink-muted",
  sent: "bg-brass/15 text-brass-dark",
  paid: "bg-sage/15 text-sage",
  overdue: "bg-red-100 text-red-700",
  void: "bg-ink/5 text-ink-muted line-through",
};

export default async function InvoicesPage() {
  const supabase = createServerSupabase();
  const t = getDict().invoices;
  const org = await getActiveOrg();
  const { data: invoices } = await supabase
    .from("invoices")
    .select("id,number,status,subtotal_cents,tax_cents,total_cents,currency,vat_treatment,einvoice_status,issue_date,due_date,clients(name)")
    .eq("org_id", org!.id)
    .order("issue_date", { ascending: false });

  const TREATMENT_LABEL: Record<string, string> = {
    standard: "TVA",
    reverse_charge: "Autoliq.",
    export: "Export 0%",
    exempt: "Exonéré",
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-semibold">{t.title}</h1>
        <Link href="/agents" className="rounded-full bg-ink px-5 py-2 text-sm text-ivory hover:bg-ink-soft">
          {t.newViaAgent}
        </Link>
      </div>

      <div className="mt-8 overflow-hidden rounded-2xl border border-ink/10 bg-white/60">
        <table className="w-full text-sm">
          <thead className="border-b border-ink/10 text-left text-xs uppercase tracking-widest text-ink-muted">
            <tr>
              <th className="p-4">{t.number}</th>
              <th className="p-4">{t.client}</th>
              <th className="p-4">{t.issued}</th>
              <th className="p-4 text-right">HT</th>
              <th className="p-4 text-right">{t.vat}</th>
              <th className="p-4 text-right">{t.total}</th>
              <th className="p-4">{t.status}</th>
              <th className="p-4">{t.efacture}</th>
              <th className="p-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {(invoices ?? []).length === 0 && (
              <tr>
                <td colSpan={9} className="p-8 text-center text-ink-muted">
                  {t.empty}
                </td>
              </tr>
            )}
            {(invoices ?? []).map((inv: any) => (
              <tr key={inv.id} className="hover:bg-ink/[0.02]">
                <td className="p-4 font-medium">{inv.number}</td>
                <td className="p-4">{inv.clients?.name ?? "—"}</td>
                <td className="p-4 text-ink-muted">{formatDate(inv.issue_date)}</td>
                <td className="p-4 text-right text-ink-muted">{formatMoney(inv.subtotal_cents ?? 0, inv.currency)}</td>
                <td className="p-4 text-right text-ink-muted">
                  {formatMoney(inv.tax_cents ?? 0, inv.currency)}
                  <span className="ml-1 rounded bg-ink/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-muted">
                    {TREATMENT_LABEL[inv.vat_treatment] ?? "TVA"}
                  </span>
                </td>
                <td className="p-4 text-right font-medium">{formatMoney(inv.total_cents, inv.currency)}</td>
                <td className="p-4">
                  <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium capitalize", STATUS_STYLES[inv.status])}>
                    {inv.status}
                  </span>
                </td>
                <td className="p-4">
                  <TransmitButton invoiceId={inv.id} status={inv.einvoice_status ?? "draft"} />
                </td>
                <td className="p-4 text-right">
                  <a
                    href={`/api/invoices/${inv.id}/facturx`}
                    target="_blank"
                    rel="noopener"
                    className="rounded-full border border-ink/15 px-3 py-1 text-xs text-brass-dark hover:border-brass"
                  >
                    {t.pdf} ↓
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
