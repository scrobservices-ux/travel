import type { createAdminSupabase } from "@/lib/supabase/server";

export interface ConnectorContext {
  orgId: string;
  db: ReturnType<typeof createAdminSupabase>;
}

/** A stored connection row (subset of the `connections` table). */
export interface Connection {
  id: string;
  org_id: string;
  provider: string;
  status: string;
  external_account: string | null;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  metadata: Record<string, unknown>;
  last_synced_at: string | null;
}

export interface SyncResult {
  ingested: number;
  detail?: string;
}

export interface Connector {
  provider: string;
  label: string;
  description: string;
  /** OAuth providers implement these; non-OAuth (e.g. file upload) leave oauth undefined. */
  oauth?: {
    scopes: string[];
    /** Build the provider authorize URL to redirect the user to. */
    authorizeUrl: (state: string, redirectUri: string) => string;
    /** Exchange an authorization code for tokens. */
    exchangeCode: (code: string, redirectUri: string) => Promise<{
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      external_account?: string;
    }>;
  };
  /** Pull new data from the provider and write it into the tenant's tables. */
  sync: (ctx: ConnectorContext, connection: Connection) => Promise<SyncResult>;
}

/** Whether a provider has the env config it needs to run its OAuth flow. */
export function oauthConfigured(provider: string): boolean {
  const id = process.env[`${provider.toUpperCase()}_CLIENT_ID`];
  const secret = process.env[`${provider.toUpperCase()}_CLIENT_SECRET`];
  return Boolean(id && secret);
}
