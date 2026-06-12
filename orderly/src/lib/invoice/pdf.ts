import { PDFDocument, StandardFonts, rgb, AFRelationship } from "pdf-lib";
import { buildFacturxXml, type FacturxInvoice } from "./facturx-xml";

/**
 * Build a Factur-X invoice: a human-readable A4 PDF with the EN 16931 CII XML
 * embedded as `factur-x.xml` (AFRelationship: Alternative). The embedded XML is
 * the machine-readable twin that accounting tools across the EU can ingest.
 *
 * NOTE on conformance: the embedded XML + attachment relationship follow the
 * Factur-X spec. Full PDF/A-3 conformance (output intent, ICC profile, Factur-X
 * XMP extension schema) requires a post-process step (e.g. Ghostscript/veraPDF);
 * this is the documented gap to close before relying on it for the French
 * e-invoicing mandate.
 */
export async function buildFacturxPdf(inv: FacturxInvoice): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Facture ${inv.number}`);
  doc.setProducer("Orderly");
  doc.setCreator("Orderly");

  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.05, 0.04, 0.03);
  const muted = rgb(0.42, 0.39, 0.35);
  const brass = rgb(0.69, 0.55, 0.34);

  const fmt = (cents: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: inv.currency }).format(cents / 100);

  let y = 800;
  const left = 50;
  const right = 545;
  const text = (s: string, x: number, yy: number, opts: { size?: number; f?: typeof font; color?: typeof ink } = {}) =>
    page.drawText(s, { x, y: yy, size: opts.size ?? 10, font: opts.f ?? font, color: opts.color ?? ink });
  const rtext = (s: string, xRight: number, yy: number, opts: { size?: number; f?: typeof font; color?: typeof ink } = {}) => {
    const f = opts.f ?? font;
    const size = opts.size ?? 10;
    text(s, xRight - f.widthOfTextAtSize(s, size), yy, opts);
  };

  // Header
  text("Orderly", left, y, { size: 22, f: bold });
  rtext("FACTURE", right, y, { size: 22, f: bold, color: brass });
  y -= 16;
  rtext(`N° ${inv.number}`, right, y, { size: 11, color: muted });
  y -= 14;
  rtext(`Date : ${inv.issue_date}`, right, y, { size: 10, color: muted });

  // Seller
  y -= 30;
  text("Émetteur", left, y, { size: 9, f: bold, color: muted });
  y -= 14;
  text(inv.seller.legal_name ?? "—", left, y, { f: bold });
  for (const lineStr of [
    inv.seller.address,
    inv.seller.siret ? `SIRET ${inv.seller.siret}` : null,
    inv.seller.vat_number ? `TVA ${inv.seller.vat_number}` : null,
  ].filter(Boolean) as string[]) {
    y -= 13;
    text(lineStr, left, y, { size: 9, color: muted });
  }

  // Buyer
  let by = y + 27;
  const bx = 320;
  text("Client", bx, by, { size: 9, f: bold, color: muted });
  by -= 14;
  text(inv.buyer_name ?? "Client", bx, by, { f: bold });
  if (inv.buyer_country) { by -= 13; text(`Pays : ${inv.buyer_country.toUpperCase()}`, bx, by, { size: 9, color: muted }); }
  if (inv.buyer_vat_number) { by -= 13; text(`TVA ${inv.buyer_vat_number}`, bx, by, { size: 9, color: muted }); }

  // Table header
  y -= 36;
  page.drawRectangle({ x: left, y: y - 4, width: right - left, height: 20, color: rgb(0.96, 0.95, 0.93) });
  text("Désignation", left + 6, y + 2, { size: 9, f: bold });
  rtext("Qté", left + 330, y + 2, { size: 9, f: bold });
  rtext("PU HT", left + 410, y + 2, { size: 9, f: bold });
  rtext("TVA", left + 460, y + 2, { size: 9, f: bold });
  rtext("Montant HT", right - 6, y + 2, { size: 9, f: bold });
  y -= 22;

  const taxable = inv.vat_treatment === "standard";
  for (const l of inv.lines) {
    text(l.description.slice(0, 60), left + 6, y, { size: 9 });
    rtext(String(l.quantity), left + 330, y, { size: 9 });
    rtext(fmt(l.unit_cents), left + 410, y, { size: 9 });
    rtext(taxable ? `${(l.tax_rate_bps / 100).toFixed(1)}%` : "0%", left + 460, y, { size: 9 });
    rtext(fmt(l.amount_cents), right - 6, y, { size: 9 });
    y -= 16;
  }

  // Totals
  y -= 8;
  page.drawLine({ start: { x: 360, y: y + 4 }, end: { x: right, y: y + 4 }, color: rgb(0.85, 0.83, 0.8) });
  y -= 10;
  text("Total HT", 360, y, { size: 10, color: muted }); rtext(fmt(inv.subtotal_cents), right - 6, y, { size: 10 });
  y -= 16;
  text("TVA", 360, y, { size: 10, color: muted }); rtext(fmt(inv.tax_cents), right - 6, y, { size: 10 });
  y -= 18;
  text("Total TTC", 360, y, { size: 12, f: bold }); rtext(fmt(inv.total_cents), right - 6, y, { size: 12, f: bold });

  // Legal mentions
  if (inv.legal_mentions_text) {
    y -= 36;
    for (const lineStr of inv.legal_mentions_text.split("\n")) {
      text(lineStr.slice(0, 110), left, y, { size: 8, color: muted });
      y -= 11;
    }
  }

  // Footer
  text("Facture Factur-X — XML EN 16931 intégré (factur-x.xml).", left, 40, { size: 7, color: muted });

  // Embed the CII XML as the Factur-X attachment.
  const xml = buildFacturxXml(inv);
  await doc.attach(new TextEncoder().encode(xml), "factur-x.xml", {
    mimeType: "text/xml",
    description: "Factur-X invoice data",
    creationDate: new Date(),
    modificationDate: new Date(),
    afRelationship: AFRelationship.Alternative,
  });

  // Save uncompressed so the embedded-file structures (/AF, EmbeddedFiles name
  // tree, Filespec) stay plainly present — friendlier to Factur-X / PDF-A tools.
  return doc.save({ useObjectStreams: false });
}
