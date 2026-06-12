import type { createAdminSupabase } from "@/lib/supabase/server";

type Db = ReturnType<typeof createAdminSupabase>;

/**
 * Dispatch an approved outbox item over its channel.
 *
 * The approval gate (review vs. auto) is the product's core promise, so it
 * lives in the agent/UI layer. This function performs the actual send and is
 * the single extension point for wiring real channels:
 *   - email: send via the org's connected mailbox (Gmail/M365) or an ESB
 *     (Resend/SES). Requires send scope/credentials.
 *   - sms: Twilio / Vonage.
 * Until a live channel is configured it records the send as completed so the
 * workflow is observable end-to-end; swap the marked section for a real call.
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
    // ---- channel dispatch extension point -------------------------------
    // await sendEmailViaConnectedMailbox(db, orgId, item)  // when configured
    // ---------------------------------------------------------------------
    const { data: updated } = await db
      .from("outbox")
      .update({ status: "sent", sent_at: new Date().toISOString(), error: null })
      .eq("id", id)
      .select("*")
      .single();
    return updated;
  } catch (e: any) {
    await db.from("outbox").update({ status: "failed", error: e?.message ?? String(e) }).eq("id", id);
    throw e;
  }
}
