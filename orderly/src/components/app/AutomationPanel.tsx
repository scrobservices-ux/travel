"use client";

import { useState } from "react";

interface ActionMeta {
  key: string;
  label: string;
  hint: string;
}

export function AutomationPanel({
  actions,
  policy,
}: {
  actions: ActionMeta[];
  policy: Record<string, "review" | "auto">;
}) {
  const [state, setState] = useState(policy);
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(action: string) {
    const mode = state[action] === "auto" ? "review" : "auto";
    setBusy(action);
    setState((p) => ({ ...p, [action]: mode })); // optimistic
    try {
      const res = await fetch("/api/settings/automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, mode }),
      });
      if (!res.ok) setState((p) => ({ ...p, [action]: mode === "auto" ? "review" : "auto" })); // revert
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-3">
      {actions.map((a) => {
        const auto = state[a.key] === "auto";
        return (
          <div key={a.key} className="flex items-center justify-between rounded-xl border border-ink/10 bg-white/60 p-4">
            <div>
              <div className="font-medium">{a.label}</div>
              <p className="mt-1 text-sm text-ink-muted">{a.hint}</p>
            </div>
            <button
              onClick={() => toggle(a.key)}
              disabled={busy === a.key}
              aria-pressed={auto}
              className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50 ${auto ? "bg-sage" : "bg-ink/15"}`}
            >
              <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${auto ? "left-6" : "left-1"}`} />
            </button>
          </div>
        );
      })}
      <p className="mt-1 text-xs text-ink-muted">
        Off = Orderly prepares the action and holds it in Approvals for you (the default).
        On = the agent completes it automatically.
      </p>
    </div>
  );
}
