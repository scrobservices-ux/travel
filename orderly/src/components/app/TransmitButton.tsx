"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDict, useLocale } from "@/i18n/client";
import { STATUS_LABEL_FR, STATUS_LABEL_EN, type EInvoiceStatus } from "@/lib/einvoicing/types";

const BADGE: Record<string, string> = {
  draft: "bg-ink/10 text-ink-muted",
  submitted: "bg-brass/15 text-brass-dark",
  received: "bg-brass/15 text-brass-dark",
  approved: "bg-sage/15 text-sage",
  payment_received: "bg-sage/15 text-sage",
  refused: "bg-red-100 text-red-700",
  rejected: "bg-red-100 text-red-700",
  not_required: "bg-ink/5 text-ink-muted",
};

export function TransmitButton({ invoiceId, status }: { invoiceId: string; status: EInvoiceStatus }) {
  const router = useRouter();
  const t = useDict().invoices;
  const locale = useLocale();
  const labels = locale === "fr" ? STATUS_LABEL_FR : STATUS_LABEL_EN;
  const [busy, setBusy] = useState(false);
  const [cur, setCur] = useState<EInvoiceStatus>(status);

  async function transmit() {
    setBusy(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/transmit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok) {
        setCur(data.status as EInvoiceStatus);
        router.refresh();
      } else {
        setCur(status);
        alert(data.error ?? "Transmission failed");
      }
    } finally {
      setBusy(false);
    }
  }

  // Once transmitted (or out of scope) just show the status badge.
  if (cur !== "draft") {
    return (
      <span className={`rounded-full px-2.5 py-1 text-xs ${BADGE[cur] ?? "bg-ink/10 text-ink-muted"}`}>
        {labels[cur]}
      </span>
    );
  }

  return (
    <button
      onClick={transmit}
      disabled={busy}
      className="rounded-full border border-ink/15 px-3 py-1 text-xs text-ink hover:border-brass disabled:opacity-50"
    >
      {busy ? t.transmitting : t.transmit}
    </button>
  );
}
