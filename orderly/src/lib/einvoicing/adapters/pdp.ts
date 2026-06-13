import type { PlatformAdapter, TransmitPayload, TransmitResult } from "../types";

/**
 * Generic PDP adapter.
 *
 * Each accredited PDP exposes its own API, but they all accept an EN 16931
 * payload (Factur-X / CII / UBL) and return a submission id + an initial
 * life-cycle status. This adapter speaks a simple, configurable REST contract:
 *
 *   POST {PDP_API_URL}/invoices
 *   Authorization: Bearer {PDP_API_KEY}
 *   multipart/form-data: file=<factur-x.pdf>, recipientSiret, recipientVat
 *
 * Swap the body/headers to match your contracted PDP. Real transmission is only
 * possible once you have a PDP contract + credentials (and, to act AS a PDP,
 * the DGFiP/AFNOR accreditation — a legal step, not code).
 */
export class GenericPdpAdapter implements PlatformAdapter {
  platform = "pdp" as const;

  isConfigured(): boolean {
    return Boolean(process.env.PDP_API_URL && process.env.PDP_API_KEY);
  }

  async transmit(payload: TransmitPayload): Promise<TransmitResult> {
    if (!this.isConfigured()) {
      throw new Error(
        "No PDP configured. Set PDP_API_URL + PDP_API_KEY for your accredited partner platform.",
      );
    }

    const form = new FormData();
    form.append(
      "file",
      new Blob([payload.pdf as BlobPart], { type: "application/pdf" }),
      `${payload.invoiceNumber}-facturx.pdf`,
    );
    form.append("format", "facturx");
    if (payload.buyerSiret) form.append("recipientSiret", payload.buyerSiret);
    if (payload.buyerVat) form.append("recipientVat", payload.buyerVat);

    const res = await fetch(`${process.env.PDP_API_URL}/invoices`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.PDP_API_KEY}` },
      body: form,
    });
    if (!res.ok) throw new Error(`PDP transmission failed: ${await res.text()}`);
    const data = (await res.json().catch(() => ({}))) as { id?: string; status?: string };

    return {
      externalId: data.id ?? `pdp-${Date.now()}`,
      status: "submitted",
      note: `Transmitted to PDP${data.status ? ` (${data.status})` : ""}.`,
    };
  }
}
