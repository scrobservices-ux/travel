/**
 * French e-invoicing transmission model.
 *
 * Channels:
 *  - "pdp"        : accredited Plateforme de Dématérialisation Partenaire (B2B).
 *  - "chorus_pro" : public-sector portal (B2G).
 *  - "none"       : outside the French mandate's e-invoicing scope (handled by
 *                   e-reporting instead, for B2C / cross-border).
 *
 * NOTE: the PPF is the national directory + concentrator, never a send target,
 * so it is intentionally not a channel here.
 */

export type RecipientType = "b2g" | "b2b_fr" | "b2c" | "intra_eu" | "export";
export type Channel = "pdp" | "chorus_pro" | "none";

/** Invoice life-cycle statuses mandated/recommended by the reform. */
export type EInvoiceStatus =
  | "draft"
  | "submitted" // déposée
  | "received" // reçue / mise à disposition
  | "approved" // approuvée
  | "refused" // refusée par le destinataire
  | "rejected" // rejetée par la plateforme
  | "payment_received" // encaissée
  | "not_required"; // hors périmètre (e-reporting only)

export const STATUS_LABEL_FR: Record<EInvoiceStatus, string> = {
  draft: "Brouillon",
  submitted: "Déposée",
  received: "Reçue",
  approved: "Approuvée",
  refused: "Refusée",
  rejected: "Rejetée",
  payment_received: "Encaissée",
  not_required: "Hors périmètre",
};

export const STATUS_LABEL_EN: Record<EInvoiceStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  received: "Received",
  approved: "Approved",
  refused: "Refused",
  rejected: "Rejected",
  payment_received: "Paid",
  not_required: "Out of scope",
};

export interface TransmitPayload {
  invoiceNumber: string;
  recipientType: RecipientType;
  /** The Factur-X PDF (PDF with embedded CII XML). */
  pdf: Uint8Array;
  /** The raw CII XML, for platforms that ingest XML directly. */
  xml: string;
  buyerSiret?: string | null;
  buyerVat?: string | null;
  /** Chorus Pro service code / engagement number for B2G, when applicable. */
  chorusServiceCode?: string | null;
}

export interface TransmitResult {
  externalId: string;
  status: EInvoiceStatus;
  note?: string;
}

export interface PlatformAdapter {
  platform: "pdp" | "chorus_pro";
  /** True when the platform has the credentials/config it needs to transmit. */
  isConfigured(): boolean;
  transmit(payload: TransmitPayload): Promise<TransmitResult>;
}
