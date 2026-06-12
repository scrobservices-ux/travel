"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) return setError(data.error ?? "Could not create workspace");
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-weave px-6">
      <div className="w-full max-w-md rounded-2xl border border-ink/10 bg-white/80 p-8 shadow-xl shadow-ink/5">
        <h1 className="font-display text-2xl font-semibold">Name your business</h1>
        <p className="mt-2 text-sm text-ink-muted">
          We&apos;ll spin up a private, isolated instance just for it. You can invite your team later.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <input
            required
            placeholder="e.g. Acme Studio"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-ink/15 bg-white px-4 py-2.5 text-sm outline-none focus:border-brass"
          />
          {error && <p className="rounded-lg bg-red-50 p-2.5 text-sm text-red-700">{error}</p>}
          <button
            disabled={loading}
            className="w-full rounded-full bg-ink py-3 text-sm font-medium text-ivory transition hover:bg-ink-soft disabled:opacity-50"
          >
            {loading ? "Creating…" : "Create my workspace"}
          </button>
        </form>
      </div>
    </div>
  );
}
