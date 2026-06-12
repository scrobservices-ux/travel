"use client";

import { useState } from "react";
import { useDict } from "@/i18n/client";

interface ConnectorMeta {
  provider: string;
  label: string;
  description: string;
  isOAuth: boolean;
}
interface ConnState {
  provider: string;
  status: string;
  external_account: string | null;
  last_synced_at: string | null;
}

export function ConnectionsPanel({
  connectors,
  connections,
}: {
  connectors: ConnectorMeta[];
  connections: ConnState[];
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const tc = useDict().common;
  const byProvider = Object.fromEntries(connections.map((x) => [x.provider, x]));

  async function connect(provider: string) {
    setBusy(provider);
    setMsg(null);
    try {
      const res = await fetch("/api/connections/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const data = await res.json();
      if (!res.ok) return setMsg(data.error ?? "Could not connect");
      if (data.url) window.location.href = data.url; // OAuth redirect
      else window.location.reload();
    } finally {
      setBusy(null);
    }
  }

  async function sync(provider: string) {
    setBusy(provider);
    setMsg(null);
    try {
      const res = await fetch("/api/connections/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const data = await res.json();
      setMsg(res.ok ? data.sync?.detail ?? "Synced." : data.error ?? "Sync failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      {msg && <p className="mb-4 rounded-lg bg-brass/10 p-3 text-sm text-brass-dark">{msg}</p>}
      <div className="grid gap-3">
        {connectors.map((c) => {
          const conn = byProvider[c.provider];
          const connected = conn?.status === "connected";
          return (
            <div key={c.provider} className="flex items-center justify-between rounded-xl border border-ink/10 bg-white/60 p-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{c.label}</span>
                  {connected && (
                    <span className="rounded-full bg-sage/15 px-2 py-0.5 text-xs text-sage">
                      {tc.connected}{conn?.external_account ? ` · ${conn.external_account}` : ""}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-ink-muted">{c.description}</p>
              </div>
              <div className="flex gap-2">
                {connected ? (
                  <button
                    onClick={() => sync(c.provider)}
                    disabled={busy === c.provider}
                    className="rounded-full bg-ink px-4 py-1.5 text-sm text-ivory hover:bg-ink-soft disabled:opacity-50"
                  >
                    {busy === c.provider ? tc.syncing : tc.syncNow}
                  </button>
                ) : (
                  <button
                    onClick={() => connect(c.provider)}
                    disabled={busy === c.provider}
                    className="rounded-full border border-ink/15 px-4 py-1.5 text-sm hover:border-brass disabled:opacity-50"
                  >
                    {busy === c.provider ? "…" : tc.connect}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
