import type { createAdminSupabase } from "@/lib/supabase/server";
import { freshGoogleToken } from "@/connectors/util";

type Db = ReturnType<typeof createAdminSupabase>;

export interface EmailMessage {
  to: string;
  subject: string;
  body: string; // plain text
}

export interface EmailResult {
  provider: "resend" | "gmail";
  id?: string;
}

/**
 * Send a real email for an org. Resolution order:
 *   1. Resend (RESEND_API_KEY) — transactional, simplest to operate.
 *   2. The org's connected Gmail mailbox (requires the gmail.send scope).
 * Throws if no channel is configured so the outbox marks the item failed rather
 * than silently "sending" nothing.
 */
export async function sendEmail(db: Db, orgId: string, msg: EmailMessage): Promise<EmailResult> {
  if (!msg.to) throw new Error("No recipient address on the message.");

  // 1) Resend
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (resendKey && from) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: msg.to, subject: msg.subject, text: msg.body }),
    });
    if (!res.ok) throw new Error(`Resend send failed: ${await res.text()}`);
    const data = (await res.json()) as { id?: string };
    return { provider: "resend", id: data.id };
  }

  // 2) Connected Gmail mailbox
  const { data: conn } = await db
    .from("connections")
    .select("*")
    .eq("org_id", orgId)
    .eq("provider", "gmail")
    .eq("status", "connected")
    .maybeSingle();
  if (conn) {
    const token = await freshGoogleToken({ orgId, db }, conn as any);
    const mime = [
      `To: ${msg.to}`,
      `Subject: ${msg.subject ?? ""}`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="UTF-8"',
      "",
      msg.body,
    ].join("\r\n");
    const raw = Buffer.from(mime).toString("base64url");
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    });
    if (!res.ok) throw new Error(`Gmail send failed: ${await res.text()}`);
    const data = (await res.json()) as { id?: string };
    return { provider: "gmail", id: data.id };
  }

  throw new Error(
    "No email channel configured. Set RESEND_API_KEY + EMAIL_FROM, or connect a Gmail mailbox with send permission.",
  );
}
