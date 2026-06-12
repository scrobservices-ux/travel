"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const AGENTS = [
  { key: "invoicing", label: "Invoicing & Payments", example: "Invoice Acme Co for 10 hours of design work at $120/hour, due in 14 days." },
  { key: "bookkeeping", label: "Bookkeeping & Expenses", example: "Record a $54.20 expense for 'Figma subscription' and categorize it." },
  { key: "documents", label: "Documents & Email", example: "Summarize and classify the latest uploaded document." },
  { key: "scheduling", label: "Scheduling & Clients", example: "Draft reminder messages for everyone with an appointment this week." },
] as const;

interface RunStep {
  type: string;
  tool?: string;
  text?: string;
  input?: unknown;
  output?: unknown;
}

export function AgentRunner() {
  const [agent, setAgent] = useState<(typeof AGENTS)[number]["key"]>("invoicing");
  const [task, setTask] = useState("");
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [steps, setSteps] = useState<RunStep[]>([]);
  const [error, setError] = useState<string | null>(null);

  const current = AGENTS.find((a) => a.key === agent)!;

  async function run() {
    setLoading(true);
    setError(null);
    setSummary(null);
    setSteps([]);
    try {
      const res = await fetch("/api/agents/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent, task: task || current.example }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Run failed");
      setSummary(data.summary);
      setSteps(data.steps ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
      <div>
        <div className="flex flex-col gap-2">
          {AGENTS.map((a) => (
            <button
              key={a.key}
              onClick={() => setAgent(a.key)}
              className={cn(
                "rounded-xl border px-4 py-3 text-left text-sm transition",
                agent === a.key
                  ? "border-brass bg-ink text-ivory"
                  : "border-ink/10 bg-white/60 hover:border-brass/40",
              )}
            >
              {a.label}
            </button>
          ))}
        </div>

        <textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder={current.example}
          rows={4}
          className="mt-5 w-full rounded-xl border border-ink/15 bg-white/80 p-4 text-sm outline-none focus:border-brass"
        />
        <button
          onClick={run}
          disabled={loading}
          className="mt-3 w-full rounded-full bg-ink py-3 text-sm font-medium text-ivory transition hover:bg-ink-soft disabled:opacity-50"
        >
          {loading ? "Working…" : "Run agent"}
        </button>
        <p className="mt-2 text-xs text-ink-muted">
          Tip: leave blank to run the example task.
        </p>
      </div>

      <div className="rounded-2xl border border-ink/10 bg-white/60 p-6">
        <h3 className="font-display text-lg font-semibold">Run trace</h3>
        {!summary && !error && steps.length === 0 && (
          <p className="mt-3 text-sm text-ink-muted">
            The agent&apos;s reasoning and every tool it calls will appear here, fully auditable.
          </p>
        )}
        {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {steps.length > 0 && (
          <ol className="mt-4 space-y-3">
            {steps.map((s, i) => (
              <li key={i} className="rounded-lg border border-ink/10 bg-ivory/60 p-3 text-sm">
                {s.type === "message" && <p className="text-ink">{s.text}</p>}
                {s.type === "tool_call" && (
                  <p className="text-brass-dark">
                    → called <span className="font-mono font-medium">{s.tool}</span>
                  </p>
                )}
                {s.type === "tool_result" && (
                  <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs text-ink-muted">
                    {JSON.stringify(s.output, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ol>
        )}

        {summary && (
          <div className="mt-5 rounded-xl bg-ink p-4 text-sm text-ivory">
            <div className="mb-1 text-xs uppercase tracking-widest text-brass-light">Summary</div>
            {summary}
          </div>
        )}
      </div>
    </div>
  );
}
