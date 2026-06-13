import type { createAdminSupabase } from "@/lib/supabase/server";
import { loadFacturxModel } from "@/lib/invoice/model";
import { buildFacturxPdf } from "@/lib/invoice/pdf";
import { buildFacturxXml } from "@/lib/invoice/facturx-xml";
import { determineRecipientType, channelFor, requiresEReporting } from "./routing";
import { GenericPdpAdapter } from "./adapters/pdp";
import { ChorusProAdapter } from "./adapters/chorusPro";
import type { PlatformAdapter } from "./types";

type Db = ReturnType<typeof createAdminSupabase>;

const ADAPTERS: Record<"pdp" | "chorus_pro", PlatformAdapter> = {
  pdp: new GenericPdpAdapter(),
  chorus_pro: new ChorusProAdapter(),
};

export interface TransmitOptions {
  isPublicSector?: boolean;
}

export interface TransmitOutcome {
  channel: string;
  recipientType: string;
  status: string;
  externalId?: string;
  eReporting?: boolean;
  note: string;
}

/**
 * Transmit an invoice over the correct French channel:
 *  - B2B FR → PDP, B2G → Chorus Pro, otherwise e-reporting only (no transmission).
 * Builds the Factur-X payload, calls the platform adapter, records a submission
 * with life-cycle history, and updates the invoice's transmission state.
 */
export async function transmitInvoice(
  db: Db,
  org: { id: string; name: string; country?: string },
  invoiceId: string,
  opts: TransmitOptions = {},
): Promise<TransmitOutcome> {
  const model = await loadFacturxModel(db, org.id, invoiceId, org.name, org.country);
  if (!model) throw new Error("Invoice not found");

  const recipient = determineRecipientType({
    sellerCountry: org.country ?? "FR",
    buyerCountry: model.buyer_country,
    buyerVatNumber: model.buyer_vat_number,
    isPublicSector: opts.isPublicSector,
  });
  const channel = channelFor(recipient);

  // Out-of-scope for platform transmission → flag for e-reporting instead.
  if (channel === "none") {
    await db
      .from("invoices")
      .update({ recipient_type: recipient, einvoice_channel: "none", einvoice_status: "not_required" })
      .eq("org_id", org.id)
      .eq("id", invoiceId);
    return {
      channel: "none",
      recipientType: recipient,
      status: "not_required",
      eReporting: requiresEReporting(recipient),
      note:
        recipient === "b2c"
          ? "B2C sale — covered by e-reporting, not platform transmission."
          : "Cross-border — covered by e-reporting, not the French e-invoicing channel.",
    };
  }

  const adapter = ADAPTERS[channel];
  const pdf = await buildFacturxPdf(model);
  const xml = buildFacturxXml(model);

  const result = await adapter.transmit({
    invoiceNumber: model.number,
    recipientType: recipient,
    pdf,
    xml,
    buyerSiret: (model.seller as any)?.buyer_siret ?? null,
    buyerVat: model.buyer_vat_number,
  });

  const now = new Date().toISOString();
  await db.from("einvoice_submissions").insert({
    org_id: org.id,
    invoice_id: invoiceId,
    platform: adapter.platform,
    channel,
    recipient_type: recipient,
    status: result.status,
    external_id: result.externalId,
    lifecycle: [{ status: result.status, at: now, note: result.note }],
  });

  await db
    .from("invoices")
    .update({
      recipient_type: recipient,
      einvoice_channel: channel,
      einvoice_status: result.status,
      einvoice_external_id: result.externalId,
      transmitted_at: now,
    })
    .eq("org_id", org.id)
    .eq("id", invoiceId);

  return {
    channel,
    recipientType: recipient,
    status: result.status,
    externalId: result.externalId,
    note: result.note ?? "Transmitted.",
  };
}
