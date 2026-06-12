/**
 * France / EU VAT (TVA) engine.
 *
 * Handles the rules an SMB invoicing in France & the EU needs:
 *  - French TVA rates (20 / 10 / 5.5 / 2.1 %).
 *  - Treatment selection: domestic VAT, intra-EU B2B reverse charge
 *    (autoliquidation), VAT-exempt export outside the EU.
 *  - VAT number format validation + optional live VIES check.
 *  - The mandatory French legal mentions (mentions obligatoires) for invoices.
 *
 * Amounts are integer cents. Rates are basis points (bps): 2000 = 20.00%.
 */

// ---- EU member states (ISO 3166-1 alpha-2; note EU VAT uses EL for Greece) --
export const EU_COUNTRIES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE",
] as const;

export function isEu(country?: string | null): boolean {
  if (!country) return false;
  const c = country.toUpperCase();
  return (EU_COUNTRIES as readonly string[]).includes(c === "EL" ? "GR" : c);
}

// ---- French TVA rates ------------------------------------------------------
export const FR_VAT_RATES = {
  standard: 2000, // 20%   — most goods & services
  reduced: 1000, //  10%   — restauration, transport, travaux…
  super_reduced: 550, // 5.5% — food, books, energy…
  particular: 210, // 2.1%  — press, certain medicines
  zero: 0,
} as const;

export type VatTreatment = "standard" | "reverse_charge" | "exempt" | "export";

// ---- VAT number validation -------------------------------------------------
// Pragmatic per-country format checks (structure, not checksum). The VIES call
// below is the authoritative existence check.
const VAT_FORMATS: Record<string, RegExp> = {
  FR: /^FR[0-9A-Z]{2}[0-9]{9}$/,
  DE: /^DE[0-9]{9}$/,
  ES: /^ES[0-9A-Z][0-9]{7}[0-9A-Z]$/,
  IT: /^IT[0-9]{11}$/,
  BE: /^BE0[0-9]{9}$/,
  NL: /^NL[0-9]{9}B[0-9]{2}$/,
  LU: /^LU[0-9]{8}$/,
  PT: /^PT[0-9]{9}$/,
  IE: /^IE[0-9]{7}[A-W][A-I]?$/,
};

export function normalizeVat(vat: string): string {
  return vat.replace(/[\s.-]/g, "").toUpperCase();
}

/** Structural validity check for an EU VAT number (no network call). */
export function isValidVatFormat(vat?: string | null): boolean {
  if (!vat) return false;
  const v = normalizeVat(vat);
  const cc = v.slice(0, 2);
  const re = VAT_FORMATS[cc];
  if (re) return re.test(v);
  // Generic fallback for EU countries we don't have a precise pattern for.
  return isEu(cc) && /^[A-Z]{2}[0-9A-Z]{2,12}$/.test(v);
}

/**
 * Live existence check against the EU VIES REST service. Best-effort: returns
 * { valid:false, checked:false } on network/timeout so callers never block.
 */
export async function viesCheck(vat: string): Promise<{ valid: boolean; checked: boolean; name?: string }> {
  const v = normalizeVat(vat);
  const country = v.slice(0, 2);
  const number = v.slice(2);
  try {
    const res = await fetch(
      `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${country}/vat/${number}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return { valid: false, checked: false };
    const data = (await res.json()) as { isValid?: boolean; name?: string };
    return { valid: Boolean(data.isValid), checked: true, name: data.name };
  } catch {
    return { valid: false, checked: false };
  }
}

// ---- Treatment selection ---------------------------------------------------
export interface TreatmentInput {
  sellerCountry: string; // e.g. "FR"
  buyerCountry?: string | null;
  buyerVatNumber?: string | null;
}

/**
 * Decide how VAT applies to a sale:
 *  - same country            → "standard" (domestic VAT)
 *  - EU + valid buyer VAT    → "reverse_charge" (autoliquidation, 0%)
 *  - EU + no buyer VAT (B2C) → "standard" (seller-country VAT; OSS may apply)
 *  - outside the EU          → "export" (exonération, 0%)
 */
export function determineTreatment(input: TreatmentInput): VatTreatment {
  const seller = input.sellerCountry.toUpperCase();
  const buyer = (input.buyerCountry ?? seller).toUpperCase();
  if (buyer === seller) return "standard";
  if (isEu(buyer)) {
    return isValidVatFormat(input.buyerVatNumber) ? "reverse_charge" : "standard";
  }
  return "export";
}

// ---- Computation -----------------------------------------------------------
export interface TaxLine {
  amount_cents: number; // HT line amount
  tax_rate_bps: number;
}

export interface InvoiceTax {
  subtotal_cents: number; // total HT
  tax_cents: number; // total TVA
  total_cents: number; // total TTC
  effective_rate_bps: number; // 0 for reverse_charge / export
}

/** Compute HT / TVA / TTC for an invoice given its treatment. */
export function computeInvoiceTax(lines: TaxLine[], treatment: VatTreatment): InvoiceTax {
  const subtotal = lines.reduce((s, l) => s + Math.round(l.amount_cents), 0);
  const taxable = treatment === "standard";
  const tax = taxable
    ? lines.reduce((s, l) => s + Math.round((l.amount_cents * l.tax_rate_bps) / 10000), 0)
    : 0;
  const effective = subtotal > 0 && taxable ? Math.round((tax / subtotal) * 10000) : 0;
  return {
    subtotal_cents: subtotal,
    tax_cents: tax,
    total_cents: subtotal + tax,
    effective_rate_bps: effective,
  };
}

// ---- French legal mentions -------------------------------------------------
export interface SellerProfile {
  legal_name?: string;
  legal_form?: string; // SARL, SAS, EI, auto-entrepreneur…
  siren?: string;
  siret?: string;
  vat_number?: string;
  share_capital_cents?: number;
  address?: string;
  vat_registered?: boolean;
  late_penalty_rate_bps?: number; // pénalités de retard
  recovery_indemnity_cents?: number; // indemnité forfaitaire (default €40)
}

/**
 * Build the mandatory French invoice mentions for a given treatment. Returns a
 * ready-to-print block. Defaults follow French law (e.g. €40 recovery indemnity,
 * ECB-rate-based late penalties when unspecified).
 */
export function frenchLegalMentions(seller: SellerProfile, treatment: VatTreatment): string {
  const lines: string[] = [];

  if (treatment === "reverse_charge") {
    lines.push("TVA non applicable — autoliquidation par le preneur (art. 283-2 du CGI).");
  } else if (treatment === "export") {
    lines.push("Exonération de TVA — exportation hors UE (art. 262 I du CGI).");
  } else if (seller.vat_registered === false) {
    lines.push("TVA non applicable, art. 293 B du CGI.");
  }

  const indemnity = seller.recovery_indemnity_cents ?? 4000; // €40
  lines.push(
    `En cas de retard de paiement, application de pénalités de retard` +
      (seller.late_penalty_rate_bps
        ? ` au taux de ${(seller.late_penalty_rate_bps / 100).toFixed(2)} %`
        : ` (taux légal — 3 fois le taux d'intérêt légal)`) +
      ` et d'une indemnité forfaitaire pour frais de recouvrement de ${(indemnity / 100).toFixed(2)} €.`,
  );
  lines.push("Pas d'escompte pour paiement anticipé.");

  return lines.join("\n");
}

/** A short HT/TVA/TTC currency formatter for the configured locale. */
export function formatTaxAmount(cents: number, currency = "EUR", locale = "fr-FR"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}
