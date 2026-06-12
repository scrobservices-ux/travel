"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useDict } from "@/i18n/client";

export function AuthCard({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const t = useDict().auth;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    // Created here (not at render) so static prerender never needs env vars.
    const supabase = createClient();
    const fn =
      mode === "signup"
        ? supabase.auth.signUp({ email, password })
        : supabase.auth.signInWithPassword({ email, password });
    const { error } = await fn;
    setLoading(false);
    if (error) return setError(error.message);
    router.push(mode === "signup" ? "/onboarding" : "/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-weave px-6">
      <div className="w-full max-w-sm rounded-2xl border border-ink/10 bg-white/80 p-8 shadow-xl shadow-ink/5">
        <Link href="/" className="font-display text-2xl font-semibold">
          Orderly<span className="text-brass">.</span>
        </Link>
        <h1 className="mt-6 font-display text-2xl font-semibold">
          {mode === "signup" ? t.signupTitle : t.loginTitle}
        </h1>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <input
            type="email"
            required
            placeholder={t.email}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-ink/15 bg-white px-4 py-2.5 text-sm outline-none focus:border-brass"
          />
          <input
            type="password"
            required
            minLength={8}
            placeholder={t.password}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-ink/15 bg-white px-4 py-2.5 text-sm outline-none focus:border-brass"
          />
          {error && <p className="rounded-lg bg-red-50 p-2.5 text-sm text-red-700">{error}</p>}
          <button
            disabled={loading}
            className="w-full rounded-full bg-ink py-3 text-sm font-medium text-ivory transition hover:bg-ink-soft disabled:opacity-50"
          >
            {loading ? "…" : mode === "signup" ? t.create : t.signin}
          </button>
        </form>
        <p className="mt-5 text-center text-sm text-ink-muted">
          {mode === "signup" ? (
            <>{t.haveAccount} <Link href="/login" className="text-brass-dark hover:underline">{t.signin}</Link></>
          ) : (
            <>{t.noAccount} <Link href="/signup" className="text-brass-dark hover:underline">{t.createOne}</Link></>
          )}
        </p>
      </div>
    </div>
  );
}
