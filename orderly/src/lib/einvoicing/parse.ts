import { XMLParser } from "fast-xml-parser";
import { inflateSync, inflateRawSync } from "node:zlib";

/**
 * Inbound e-invoice parsing (reception). No accreditation needed — this just
 * reads the standard formats every French business must be able to receive from
 * 1 Sept 2026: Factur-X (PDF with embedded CII), or raw CII / UBL XML.
 */

export interface ParsedEInvoice {
  format: "cii" | "ubl";
  number: string | null;
  issue_date: string | null; // ISO yyyy-mm-dd
  currency: string | null;
  supplier_name: string | null;
  supplier_vat: string | null;
  buyer_name: string | null;
  total_ht_cents: number | null;
  total_vat_cents: number | null;
  total_ttc_cents: number | null;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true, // drop rsm:/ram:/cbc: prefixes so lookups are simple
});

const toCents = (v: unknown): number | null => {
  if (v == null) return null;
  const n = typeof v === "object" ? (v as any)["#text"] : v;
  const f = parseFloat(String(n));
  return Number.isFinite(f) ? Math.round(f * 100) : null;
};
const txt = (v: unknown): string | null => {
  if (v == null) return null;
  if (typeof v === "object") return String((v as any)["#text"] ?? "") || null;
  return String(v) || null;
};
const ciiDate = (v: any): string | null => {
  const s = txt(v?.DateTimeString ?? v);
  if (!s) return null;
  // format 102 = YYYYMMDD
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return s.slice(0, 10);
};

/** Parse a CrossIndustryInvoice (CII / Factur-X) document object. */
function parseCii(doc: any): ParsedEInvoice {
  const root = doc.CrossIndustryInvoice;
  const head = root?.SupplyChainTradeTransaction?.ApplicableHeaderTradeSettlement;
  const agreement = root?.SupplyChainTradeTransaction?.ApplicableHeaderTradeAgreement;
  const sum = head?.SpecifiedTradeSettlementHeaderMonetarySummation;
  const seller = agreement?.SellerTradeParty;
  const buyer = agreement?.BuyerTradeParty;

  return {
    format: "cii",
    number: txt(root?.ExchangedDocument?.ID),
    issue_date: ciiDate(root?.ExchangedDocument?.IssueDateTime),
    currency: txt(head?.InvoiceCurrencyCode),
    supplier_name: txt(seller?.Name),
    supplier_vat: txt(seller?.SpecifiedTaxRegistration?.ID),
    buyer_name: txt(buyer?.Name),
    total_ht_cents: toCents(sum?.TaxBasisTotalAmount ?? sum?.LineTotalAmount),
    total_vat_cents: toCents(sum?.TaxTotalAmount),
    total_ttc_cents: toCents(sum?.GrandTotalAmount ?? sum?.DuePayableAmount),
  };
}

/** Parse a UBL Invoice document object. */
function parseUbl(doc: any): ParsedEInvoice {
  const inv = doc.Invoice;
  const totals = inv?.LegalMonetaryTotal;
  const supplier = inv?.AccountingSupplierParty?.Party;
  const buyer = inv?.AccountingCustomerParty?.Party;
  return {
    format: "ubl",
    number: txt(inv?.ID),
    issue_date: txt(inv?.IssueDate),
    currency: txt(inv?.DocumentCurrencyCode),
    supplier_name: txt(supplier?.PartyLegalEntity?.RegistrationName ?? supplier?.PartyName?.Name),
    supplier_vat: txt(supplier?.PartyTaxScheme?.CompanyID),
    buyer_name: txt(buyer?.PartyLegalEntity?.RegistrationName ?? buyer?.PartyName?.Name),
    total_ht_cents: toCents(totals?.TaxExclusiveAmount),
    total_vat_cents: toCents(inv?.TaxTotal?.TaxAmount),
    total_ttc_cents: toCents(totals?.TaxInclusiveAmount ?? totals?.PayableAmount),
  };
}

export function parseEInvoiceXml(xml: string): ParsedEInvoice {
  const doc = parser.parse(xml);
  if (doc.CrossIndustryInvoice) return parseCii(doc);
  if (doc.Invoice) return parseUbl(doc);
  throw new Error("Unrecognized e-invoice XML (expected CII CrossIndustryInvoice or UBL Invoice).");
}

/**
 * Extract the embedded factur-x.xml (or zugferd/xrechnung) from a Factur-X PDF.
 * Scans the raw bytes for embedded-file streams and inflates them, then keeps
 * the one that looks like an EN 16931 invoice. Best-effort and dependency-free.
 */
export function extractFacturxXmlFromPdf(pdf: Uint8Array): string | null {
  const buf = Buffer.from(pdf);
  const haystack = buf.toString("latin1");
  const candidates: string[] = [];

  let idx = 0;
  while ((idx = haystack.indexOf("stream", idx)) !== -1) {
    let start = idx + "stream".length;
    if (haystack[start] === "\r") start++;
    if (haystack[start] === "\n") start++;
    const end = haystack.indexOf("endstream", start);
    if (end === -1) break;
    const raw = buf.subarray(start, end);
    idx = end + "endstream".length;

    let text: string | null = null;
    // Try raw, zlib-inflate, and raw-inflate.
    if (raw.slice(0, 5).toString().includes("<?xml") || raw.includes(Buffer.from("CrossIndustryInvoice"))) {
      text = raw.toString("utf8");
    } else {
      for (const fn of [inflateSync, inflateRawSync]) {
        try {
          text = fn(raw).toString("utf8");
          break;
        } catch {
          /* not this encoding */
        }
      }
    }
    if (text && (text.includes("CrossIndustryInvoice") || text.includes("<Invoice"))) {
      candidates.push(text);
    }
  }
  return candidates[0] ?? null;
}

export function parseEInvoiceFile(base64: string, mediaType: string): ParsedEInvoice {
  const bytes = Buffer.from(base64, "base64");
  if (mediaType === "application/pdf") {
    const xml = extractFacturxXmlFromPdf(bytes);
    if (!xml) throw new Error("No embedded e-invoice XML found in this PDF (is it a Factur-X file?).");
    return parseEInvoiceXml(xml);
  }
  // Assume XML (CII or UBL).
  return parseEInvoiceXml(bytes.toString("utf8"));
}
