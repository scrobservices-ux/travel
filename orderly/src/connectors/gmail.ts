import type { Connector } from "./types";
import { googleAuthorizeUrl, googleExchangeCode } from "./google";
import { freshGoogleToken } from "./util";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  // Lets approved outbox messages be sent from the connected mailbox.
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
];

function header(headers: any[], name: string): string | undefined {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value;
}

/**
 * Gmail connector. Pulls recent inbox messages and files them as `documents`
 * (kind: email, status: pending) so the Documents & Email agent can classify,
 * summarize and extract action items from them.
 */
export const gmailConnector: Connector = {
  provider: "gmail",
  label: "Gmail",
  description: "Bring your inbox in so the Documents & Email agent can triage and file it.",
  oauth: {
    scopes: SCOPES,
    authorizeUrl: googleAuthorizeUrl(SCOPES),
    exchangeCode: googleExchangeCode,
  },
  sync: async (ctx, conn) => {
    const token = await freshGoogleToken(ctx, conn);
    const auth = { Authorization: `Bearer ${token}` };

    // Only pull messages newer than the last sync to stay incremental.
    const afterClause = conn.last_synced_at
      ? `&q=after:${Math.floor(new Date(conn.last_synced_at).getTime() / 1000)}`
      : "";
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15${afterClause}`,
      { headers: auth },
    );
    if (!listRes.ok) throw new Error(`Gmail list failed: ${await listRes.text()}`);
    const { messages = [] } = (await listRes.json()) as { messages?: { id: string }[] };

    let ingested = 0;
    for (const m of messages) {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
        { headers: auth },
      );
      if (!msgRes.ok) continue;
      const msg = await msgRes.json();
      const subject = header(msg.payload?.headers, "Subject") ?? "(no subject)";
      const from = header(msg.payload?.headers, "From") ?? "";

      // Idempotent on the provider message id.
      const { data: exists } = await ctx.db
        .from("documents")
        .select("id")
        .eq("org_id", ctx.orgId)
        .eq("kind", "email")
        .contains("extracted", { gmail_id: m.id })
        .maybeSingle();
      if (exists) continue;

      await ctx.db.from("documents").insert({
        org_id: ctx.orgId,
        title: subject,
        kind: "email",
        status: "pending",
        summary: msg.snippet ?? null,
        extracted: { gmail_id: m.id, from },
      });
      ingested++;
    }

    return { ingested, detail: `Pulled ${ingested} new email(s) into Documents.` };
  },
};
