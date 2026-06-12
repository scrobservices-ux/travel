import { googleRefresh } from "./google";
import type { Connection, ConnectorContext } from "./types";

/**
 * Return a non-expired Google access token for a connection, refreshing and
 * persisting it if needed. Tokens are only ever handled server-side.
 */
export async function freshGoogleToken(ctx: ConnectorContext, conn: Connection): Promise<string> {
  const stillValid =
    conn.expires_at && new Date(conn.expires_at).getTime() > Date.now() + 60_000;
  if (stillValid && conn.access_token) return conn.access_token;
  if (!conn.refresh_token) {
    if (!conn.access_token) throw new Error("Connection has no token");
    return conn.access_token;
  }
  const refreshed = await googleRefresh(conn.refresh_token);
  const expires_at = new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000).toISOString();
  await ctx.db
    .from("connections")
    .update({ access_token: refreshed.access_token, expires_at })
    .eq("id", conn.id);
  return refreshed.access_token;
}
