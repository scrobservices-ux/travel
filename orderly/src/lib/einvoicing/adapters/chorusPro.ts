import type { PlatformAdapter, TransmitPayload, TransmitResult } from "../types";

/**
 * Chorus Pro adapter (B2G — invoicing the French public sector).
 *
 * Chorus Pro is reached through the state API gateway PISTE (OAuth2 client
 * credentials) + a Chorus Pro technical account. The deposit endpoint accepts a
 * base64 Factur-X/CII document. This adapter implements the OAuth + deposit
 * shape; it activates once the PISTE credentials are configured.
 *
 * Env: CHORUSPRO_PISTE_CLIENT_ID, CHORUSPRO_PISTE_CLIENT_SECRET,
 *      CHORUSPRO_LOGIN, CHORUSPRO_PASSWORD  (sandbox vs prod via CHORUSPRO_BASE_URL)
 */
export class ChorusProAdapter implements PlatformAdapter {
  platform = "chorus_pro" as const;

  isConfigured(): boolean {
    return Boolean(
      process.env.CHORUSPRO_PISTE_CLIENT_ID &&
        process.env.CHORUSPRO_PISTE_CLIENT_SECRET &&
        process.env.CHORUSPRO_LOGIN,
    );
  }

  private async pisteToken(): Promise<string> {
    const res = await fetch("https://oauth.piste.gouv.fr/api/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: process.env.CHORUSPRO_PISTE_CLIENT_ID ?? "",
        client_secret: process.env.CHORUSPRO_PISTE_CLIENT_SECRET ?? "",
        scope: "openid",
      }),
    });
    if (!res.ok) throw new Error(`PISTE auth failed: ${await res.text()}`);
    return (await res.json()).access_token as string;
  }

  async transmit(payload: TransmitPayload): Promise<TransmitResult> {
    if (!this.isConfigured()) {
      throw new Error(
        "Chorus Pro not configured. Set CHORUSPRO_PISTE_* credentials to transmit B2G invoices.",
      );
    }
    const base = process.env.CHORUSPRO_BASE_URL ?? "https://sandbox-api.piste.gouv.fr/cpro";
    const token = await this.pisteToken();
    const cpAuth = Buffer.from(
      `${process.env.CHORUSPRO_LOGIN}:${process.env.CHORUSPRO_PASSWORD ?? ""}`,
    ).toString("base64");

    // Chorus Pro "soumettre une facture" — base64 Factur-X document.
    const res = await fetch(`${base}/factures/v1/deposer/flux`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        cpro_account: cpAuth,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fichierFlux: Buffer.from(payload.pdf).toString("base64"),
        nomFichier: `${payload.invoiceNumber}-facturx.pdf`,
        syntaxeFlux: "IN_DP_E2_FACTURX",
      }),
    });
    if (!res.ok) throw new Error(`Chorus Pro deposit failed: ${await res.text()}`);
    const data = (await res.json().catch(() => ({}))) as { numeroFluxDepot?: string };

    return {
      externalId: data.numeroFluxDepot ?? `cpro-${Date.now()}`,
      status: "submitted",
      note: "Deposited to Chorus Pro.",
    };
  }
}
