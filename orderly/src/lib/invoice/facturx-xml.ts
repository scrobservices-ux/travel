/**
 * Factur-X / ZUGFeRD CII XML generator (EN 16931, BASIC profile).
 *
 * Produces the structured invoice XML that gets embedded inside the PDF to make
 * it a Factur-X hybrid invoice — readable by humans and by accounting software
 * across the EU. Profile URN: factur-x.eu:1p0:basic.
 *
 * Amounts are integer cents; rates are basis points. We map Orderly's VAT
 * treatment to the EN 16931 tax category codes:
 *   standard       -> S  (standard rate)
 *   reverse_charge -> AE (VAT reverse charge / autoliquidation)
 *   export         -> G  (export outside the EU, zero-rated)
 *   exempt         -> E  (exempt)
 */

export interface FacturxLine {
  description: string;
  quantity: number;
  unit_cents: number;
  amount_cents: number;
  tax_rate_bps: number;
}

export interface FacturxInvoice {
  number: string;
  issue_date: string; // ISO date
  currency: string;
  vat_treatment: "standard" | "reverse_charge" | "exempt" | "export";
  tax_rate_bps: number;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  buyer_country?: string | null;
  buyer_vat_number?: string | null;
  buyer_name?: string | null;
  /** French legal mentions printed on the PDF (not part of the CII XML). */
  legal_mentions_text?: string | null;
  seller: {
    legal_name?: string;
    vat_number?: string;
    siret?: string;
    address?: string;
    country?: string;
  };
  lines: FacturxLine[];
}

const CATEGORY: Record<FacturxInvoice["vat_treatment"], string> = {
  standard: "S",
  reverse_charge: "AE",
  exempt: "E",
  export: "G",
};

const EXEMPTION_REASON: Partial<Record<FacturxInvoice["vat_treatment"], string>> = {
  reverse_charge: "Autoliquidation",
  export: "Exonération TVA - export hors UE",
  exempt: "Exonéré",
};

const money = (cents: number) => (cents / 100).toFixed(2);
const pct = (bps: number) => (bps / 100).toFixed(2);
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function buildFacturxXml(inv: FacturxInvoice): string {
  const category = CATEGORY[inv.vat_treatment];
  const taxable = inv.vat_treatment === "standard";
  const ratePct = taxable ? pct(inv.tax_rate_bps) : "0.00";
  const issue = inv.issue_date.replace(/-/g, "");
  const reason = EXEMPTION_REASON[inv.vat_treatment];

  const lineItems = inv.lines
    .map((l, i) => {
      const lineRate = taxable ? pct(l.tax_rate_bps) : "0.00";
      return `
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument>
        <ram:LineID>${i + 1}</ram:LineID>
      </ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct>
        <ram:Name>${esc(l.description)}</ram:Name>
      </ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice>
          <ram:ChargeAmount>${money(l.unit_cents)}</ram:ChargeAmount>
        </ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="C62">${l.quantity}</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>${category}</ram:CategoryCode>
          <ram:RateApplicablePercent>${lineRate}</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>${money(l.amount_cents)}</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice
    xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
    xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
    xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${esc(inv.number)}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${issue}</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>${lineItems}
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>${esc(inv.seller.legal_name ?? "")}</ram:Name>
        ${inv.seller.siret ? `<ram:SpecifiedLegalOrganization><ram:ID schemeID="0009">${esc(inv.seller.siret)}</ram:ID></ram:SpecifiedLegalOrganization>` : ""}
        <ram:PostalTradeAddress>
          <ram:CountryID>${(inv.seller.country ?? "FR").toUpperCase()}</ram:CountryID>
        </ram:PostalTradeAddress>
        ${inv.seller.vat_number ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(inv.seller.vat_number)}</ram:ID></ram:SpecifiedTaxRegistration>` : ""}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${esc(inv.buyer_name ?? "Client")}</ram:Name>
        ${inv.buyer_country ? `<ram:PostalTradeAddress><ram:CountryID>${inv.buyer_country.toUpperCase()}</ram:CountryID></ram:PostalTradeAddress>` : ""}
        ${inv.buyer_vat_number ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(inv.buyer_vat_number)}</ram:ID></ram:SpecifiedTaxRegistration>` : ""}
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery/>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>${inv.currency}</ram:InvoiceCurrencyCode>
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${money(inv.tax_cents)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        ${reason ? `<ram:ExemptionReason>${esc(reason)}</ram:ExemptionReason>` : ""}
        <ram:BasisAmount>${money(inv.subtotal_cents)}</ram:BasisAmount>
        <ram:CategoryCode>${category}</ram:CategoryCode>
        <ram:RateApplicablePercent>${ratePct}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${money(inv.subtotal_cents)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${money(inv.subtotal_cents)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="${inv.currency}">${money(inv.tax_cents)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${money(inv.total_cents)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${money(inv.total_cents)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
}
