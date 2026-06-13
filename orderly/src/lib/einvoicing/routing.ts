import { isEu } from "@/lib/tax/eu";
import type { Channel, RecipientType } from "./types";

export interface RoutingInput {
  sellerCountry: string; // usually "FR"
  buyerCountry?: string | null;
  buyerVatNumber?: string | null;
  /** Set when the buyer is a French public entity (B2G → Chorus Pro). */
  isPublicSector?: boolean;
}

/**
 * Classify the recipient to decide how the invoice must be transmitted.
 *  - French public body            → b2g
 *  - French business (has a VAT id)→ b2b_fr
 *  - French individual             → b2c
 *  - other EU                      → intra_eu
 *  - rest of world                 → export
 */
export function determineRecipientType(input: RoutingInput): RecipientType {
  const seller = input.sellerCountry.toUpperCase();
  const buyer = (input.buyerCountry ?? seller).toUpperCase();
  if (input.isPublicSector && buyer === "FR") return "b2g";
  if (buyer === "FR") return input.buyerVatNumber ? "b2b_fr" : "b2c";
  if (isEu(buyer)) return "intra_eu";
  return "export";
}

/**
 * Channel for a recipient type. Only domestic B2B (PDP) and B2G (Chorus Pro)
 * fall under the e-invoicing obligation; B2C and cross-border are covered by
 * e-reporting, not transmitted through a platform.
 */
export function channelFor(recipient: RecipientType): Channel {
  switch (recipient) {
    case "b2g":
      return "chorus_pro";
    case "b2b_fr":
      return "pdp";
    default:
      return "none";
  }
}

/** Whether a recipient type must be declared via e-reporting (B2C / cross-border). */
export function requiresEReporting(recipient: RecipientType): boolean {
  return recipient === "b2c" || recipient === "intra_eu" || recipient === "export";
}
