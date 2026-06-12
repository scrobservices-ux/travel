"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDict } from "@/i18n/client";

/** Upload a PDF/image; it's OCR'd via Claude and filed by the Documents agent. */
export function DocumentUpload() {
  const router = useRouter();
  const t = useDict().documents;
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const data = await fileToBase64(file);
      const res = await fetch("/api/documents/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: file.name, media_type: file.type, data }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      setMsg(`✓ ${file.name}`);
      router.refresh();
    } catch (err: any) {
      setMsg(err.message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"
        onChange={onPick}
        className="hidden"
        id="doc-upload"
      />
      <label
        htmlFor="doc-upload"
        className={`cursor-pointer rounded-full bg-ink px-5 py-2 text-sm text-ivory hover:bg-ink-soft ${busy ? "opacity-50" : ""}`}
      >
        {busy ? t.uploading : t.upload}
      </label>
      <span className="text-xs text-ink-muted">{msg ?? t.uploadHint}</span>
    </div>
  );
}
