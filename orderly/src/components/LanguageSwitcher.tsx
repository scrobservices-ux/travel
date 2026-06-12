"use client";

import { useRouter } from "next/navigation";
import { useLocale } from "@/i18n/client";
import type { Locale } from "@/i18n/dictionaries";

/** Compact FR/EN toggle. Persists the choice in a cookie and refreshes. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const router = useRouter();
  const locale = useLocale();

  function set(next: Locale) {
    if (next === locale) return;
    document.cookie = `orderly_locale=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  return (
    <div className={`flex items-center gap-1 text-xs ${className ?? ""}`}>
      {(["fr", "en"] as Locale[]).map((l) => (
        <button
          key={l}
          onClick={() => set(l)}
          className={`rounded px-1.5 py-0.5 uppercase transition ${
            locale === l ? "font-semibold text-ink" : "text-ink-muted hover:text-ink"
          }`}
          aria-current={locale === l}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
