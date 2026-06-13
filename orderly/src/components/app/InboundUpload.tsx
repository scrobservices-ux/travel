"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDict } from "@/i18n/client";

/** Import a supplier e-invoice (Factur-X PDF or CII/UBL XML); Orderly parses it. */
export function InboundUpload() {
  const router = useRouter();
  const t = useDict().received;
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [recordExpense, setRecordExpense] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  function toBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const data = await toBase64(file);
      const media_type = file.type || (file.name.endsWith(".xml") ? "application/xml" : "application/pdf");
      const res = await fetch("/api/einvoicing/inbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, media_type, data, record_expense: recordExpense }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Import failed");
      setMsg(`✓ ${json.parsed?.supplier_name ?? file.name} · ${json.parsed?.number ?? ""}`);
      router.refresh();
    } catch (err: any) {
      setMsg(err.message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-ink-muted">
          <input type="checkbox" checked={recordExpense} onChange={(e) => setRecordExpense(e.target.checked)} />
          {t.recordExpense}
        </label>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,application/xml,text/xml,.xml"
          onChange={onPick}
          className="hidden"
          id="einvoice-upload"
        />
        <label
          htmlFor="einvoice-upload"
          className={`cursor-pointer rounded-full bg-ink px-5 py-2 text-sm text-ivory hover:bg-ink-soft ${busy ? "opacity-50" : ""}`}
        >
          {busy ? t.uploading : t.upload}
        </label>
      </div>
      <span className="text-xs text-ink-muted">{msg ?? t.uploadHint}</span>
    </div>
  );
}
