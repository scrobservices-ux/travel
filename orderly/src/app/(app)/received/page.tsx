import { createServerSupabase } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/tenant";
import { formatMoney, formatDate } from "@/lib/utils";
import { getDict } from "@/i18n/server";
import { InboundUpload } from "@/components/app/InboundUpload";

export default async function ReceivedPage() {
  const supabase = createServerSupabase();
  const t = getDict().received;
  const org = await getActiveOrg();
  const { data: rows } = await supabase
    .from("received_invoices")
    .select("id,supplier_name,number,issue_date,currency,total_ttc_cents,format,status")
    .eq("org_id", org!.id)
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="font-display text-3xl font-semibold">{t.title}</h1>
          <p className="mt-2 text-ink-muted">{t.sub}</p>
        </div>
        <InboundUpload />
      </div>

      <div className="mt-6 flex justify-end">
        <a
          href="/api/einvoicing/ereporting"
          className="rounded-full border border-ink/15 px-4 py-1.5 text-xs text-brass-dark hover:border-brass"
        >
          {t.ereporting} ↓
        </a>
      </div>

      <div className="mt-3 overflow-hidden rounded-2xl border border-ink/10 bg-white/60">
        <table className="w-full text-sm">
          <thead className="border-b border-ink/10 text-left text-xs uppercase tracking-widest text-ink-muted">
            <tr>
              <th className="p-4">{t.supplier}</th>
              <th className="p-4">{t.number}</th>
              <th className="p-4">{t.date}</th>
              <th className="p-4">Format</th>
              <th className="p-4 text-right">{t.ttc}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {(rows ?? []).length === 0 && (
              <tr><td colSpan={5} className="p-8 text-center text-ink-muted">{t.empty}</td></tr>
            )}
            {(rows ?? []).map((r) => (
              <tr key={r.id} className="hover:bg-ink/[0.02]">
                <td className="p-4 font-medium">{r.supplier_name ?? "—"}</td>
                <td className="p-4 text-ink-muted">{r.number ?? "—"}</td>
                <td className="p-4 text-ink-muted">{r.issue_date ? formatDate(r.issue_date) : "—"}</td>
                <td className="p-4"><span className="rounded-full bg-brass/15 px-2 py-0.5 text-xs uppercase text-brass-dark">{r.format ?? "?"}</span></td>
                <td className="p-4 text-right font-medium">{r.total_ttc_cents != null ? formatMoney(r.total_ttc_cents, r.currency) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
