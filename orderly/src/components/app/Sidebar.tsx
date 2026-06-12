"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Overview", glyph: "◧" },
  { href: "/agents", label: "Agents", glyph: "✦" },
  { href: "/approvals", label: "Approvals", glyph: "✓" },
  { href: "/invoices", label: "Invoices", glyph: "₣" },
  { href: "/bookkeeping", label: "Bookkeeping", glyph: "∑" },
  { href: "/documents", label: "Documents", glyph: "❧" },
  { href: "/scheduling", label: "Scheduling", glyph: "◷" },
  { href: "/settings", label: "Settings", glyph: "⚙" },
];

export function Sidebar({ orgName }: { orgName: string }) {
  const pathname = usePathname();
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-ink/10 bg-white/50 p-4">
      <Link href="/dashboard" className="px-3 py-2 font-display text-xl font-semibold">
        Orderly<span className="text-brass">.</span>
      </Link>
      <div className="mt-1 px-3 text-xs uppercase tracking-widest text-ink-muted">{orgName}</div>
      <nav className="mt-6 flex flex-col gap-1">
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
                active ? "bg-ink text-ivory" : "text-ink-muted hover:bg-ink/5 hover:text-ink",
              )}
            >
              <span className="w-4 text-center">{item.glyph}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
