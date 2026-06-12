import type { createAdminSupabase } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send";

type Db = ReturnType<typeof createAdminSupabase>;

/**
 * Dispatch an approved outbox item over its channel.
 *
 * The approval gate (review vs. auto) is the product's core promise and lives in
 * the agent/UI layer; this performs the actual send. Email goes out via Resend
 * or a connected Gmail mailbox (see src/lib/email/send.ts). SMS is not wired yet.
 */
export async function dispatchOutbox(db: Db, orgId: string, id: string) {
  const { data: item, error } = await db
    .from("outbox")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", id)
    .single();
  if (error || !item) throw new Error(error?.message ?? "Outbox item not found");
  if (item.status === "sent") return item;

  try {
    if (item.channel === "sms") {
      throw new Error("SMS channel not configured yet.");
    }
    const result = await sendEmail(db, orgId, {
      to: item.to_address,
      subject: item.subject ?? "",
      body: item.body,
    });
    const { data: updated } = await db
      .from("outbox")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        error: null,
        // record which provider actually sent it
        related_type: item.related_type,
      })
      .eq("id", id)
      .select("*")
      .single();
    void result;
    return updated;
  } catch (e: any) {
    await db.from("outbox").update({ status: "failed", error: e?.message ?? String(e) }).eq("id", id);
    throw e;
  }
}
