import type { createAdminSupabase } from "@/lib/supabase/server";
import { determineRecipientType, requiresEReporting } from "./routing";

type Db = ReturnType<typeof createAdminSupabase>;

export interface EReportingRow {
  date: string;
  number: string;
  recipient_type: string;
  buyer_country: string;
  currency: string;
  total_ht: number;
  total_vat: number;
  total_ttc: number;
}

/**
 * Build the e-reporting dataset for a period: the B2C and cross-border sales a
 * French business must report (since they aren't transmitted as e-invoices).
 * Classification is derived from each invoice's buyer, so it works whether or
 * not the invoice was ever "transmitted". Producing this data needs no
 * accreditation — only the eventual transmission to a PDP/PPF would.
 */
export async function buildEReportingDataset(
  db: Db,
  org: { id: string; country?: string },
  from: string,
  to: string,
): Promise<EReportingRow[]> {
  const { data: invoices } = await db
    .from("invoices")
    .select("number,issue_date,currency,subtotal_cents,tax_cents,total_cents,buyer_country,buyer_vat_number")
    .eq("org_id", org.id)
    .gte("issue_date", from)
    .lte("issue_date", to)
    .neq("status", "void")
    .order("issue_date", { ascending: true });

  const rows: EReportingRow[] = [];
  for (const inv of invoices ?? []) {
    const recipient = determineRecipientType({
      sellerCountry: org.country ?? "FR",
      buyerCountry: inv.buyer_country,
      buyerVatNumber: inv.buyer_vat_number,
    });
    if (!requiresEReporting(recipient)) continue;
    rows.push({
      date: inv.issue_date,
      number: inv.number,
      recipient_type: recipient,
      buyer_country: (inv.buyer_country ?? "FR").toUpperCase(),
      currency: inv.currency,
      total_ht: (inv.subtotal_cents ?? 0) / 100,
      total_vat: (inv.tax_cents ?? 0) / 100,
      total_ttc: (inv.total_cents ?? 0) / 100,
    });
  }
  return rows;
}

export function toCsv(rows: EReportingRow[]): string {
  const header = "date;number;recipient_type;buyer_country;currency;total_ht;total_vat;total_ttc";
  const lines = rows.map((r) =>
    [r.date, r.number, r.recipient_type, r.buyer_country, r.currency, r.total_ht.toFixed(2), r.total_vat.toFixed(2), r.total_ttc.toFixed(2)].join(";"),
  );
  return [header, ...lines].join("\n");
}
