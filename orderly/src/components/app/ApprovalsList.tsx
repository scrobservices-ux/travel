"use client";

import { useState } from "react";
import { useDict } from "@/i18n/client";

interface OutboxItem {
  id: string;
  channel: string;
  to_address: string | null;
  subject: string | null;
  body: string;
  status: string;
  agent: string | null;
  related_type: string | null;
  created_at: string;
}

export function ApprovalsList({ initial }: { initial: OutboxItem[] }) {
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const t = useDict().approvals;

  async function act(id: string, action: "approve" | "discard") {
    setBusy(id);
    try {
      const res = await fetch("/api/outbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (res.ok) setItems((prev) => prev.filter((i) => i.id !== id));
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-ink/20 bg-white/40 p-10 text-center text-ink-muted">
        {t.empty}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.id} className="rounded-2xl border border-ink/10 bg-white/60 p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-ink-muted">
              <span className="rounded-full bg-brass/15 px-2.5 py-0.5 capitalize text-brass-dark">
                {item.agent ?? "agent"}
              </span>
              <span className="uppercase tracking-widest">{item.channel}</span>
              {item.to_address && <span>→ {item.to_address}</span>}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => act(item.id, "discard")}
                disabled={busy === item.id}
                className="rounded-full border border-ink/15 px-4 py-1.5 text-sm hover:border-ink/40 disabled:opacity-50"
              >
                {t.discard}
              </button>
              <button
                onClick={() => act(item.id, "approve")}
                disabled={busy === item.id}
                className="rounded-full bg-ink px-4 py-1.5 text-sm text-ivory hover:bg-ink-soft disabled:opacity-50"
              >
                {busy === item.id ? "…" : t.approve}
              </button>
            </div>
          </div>
          {item.subject && <p className="mt-4 font-medium">{item.subject}</p>}
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">{item.body}</p>
        </div>
      ))}
    </div>
  );
}
