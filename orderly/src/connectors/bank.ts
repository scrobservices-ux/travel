import type { Connector } from "./types";

/**
 * Bank feed connector.
 *
 * In production this links via a bank-aggregation provider (e.g. Plaid /
 * TrueLayer): the OAuth-style link flow returns an item/access token, and sync
 * pulls transactions. To keep the platform provider-agnostic, the connector
 * ingests any transactions staged on the connection's metadata under
 * `pending_transactions` — which is exactly the shape an aggregator webhook or
 * a CSV import would drop there. Each becomes a `transactions` row for the
 * Bookkeeping agent to categorize.
 */
export const bankConnector: Connector = {
  provider: "bank",
  label: "Bank feed",
  description: "Stream transactions in for the Bookkeeping agent to categorize.",
  // No first-party OAuth here — the aggregator owns that flow. Linking is done
  // via the aggregator's widget, which writes the access token to metadata.
  sync: async (ctx, conn) => {
    const pending = (conn.metadata?.pending_transactions as any[]) ?? [];
    let ingested = 0;
    for (const t of pending) {
      const amountCents = Math.round(Math.abs(Number(t.amount)) * 100);
      await ctx.db.from("transactions").insert({
        org_id: ctx.orgId,
        direction: Number(t.amount) < 0 ? "expense" : "income",
        description: t.description ?? t.name ?? "Bank transaction",
        amount_cents: amountCents,
        currency: t.currency ?? "USD",
        occurred_on: t.date ?? new Date().toISOString().slice(0, 10),
        source: "bank",
        raw: t,
        // Left uncategorized on purpose — the Bookkeeping agent assigns category.
      });
      ingested++;
    }
    // Clear the staged batch once ingested.
    if (ingested > 0) {
      await ctx.db
        .from("connections")
        .update({ metadata: { ...conn.metadata, pending_transactions: [] } })
        .eq("id", conn.id);
    }
    return { ingested, detail: `Ingested ${ingested} bank transaction(s) for categorization.` };
  },
};
