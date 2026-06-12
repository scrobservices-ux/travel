"use client";

import { useState } from "react";

interface TaxProfile {
  legal_name?: string;
  legal_form?: string;
  siren?: string;
  siret?: string;
  vat_number?: string;
  address?: string;
  vat_registered?: boolean;
  default_vat_rate_bps?: number;
}

const RATE_OPTIONS = [
  { bps: 2000, label: "20 % (standard)" },
  { bps: 1000, label: "10 % (réduit)" },
  { bps: 550, label: "5,5 % (réduit)" },
  { bps: 210, label: "2,1 % (particulier)" },
  { bps: 0, label: "0 % / non assujetti" },
];

export function TaxProfilePanel({
  country,
  currency,
  profile,
}: {
  country: string;
  currency: string;
  profile: TaxProfile;
}) {
  const [form, setForm] = useState<TaxProfile & { country: string; currency: string }>({
    country,
    currency,
    legal_name: profile.legal_name ?? "",
    legal_form: profile.legal_form ?? "",
    siren: profile.siren ?? "",
    siret: profile.siret ?? "",
    vat_number: profile.vat_number ?? "",
    address: profile.address ?? "",
    vat_registered: profile.vat_registered ?? true,
    default_vat_rate_bps: profile.default_vat_rate_bps ?? 2000,
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/settings/tax-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    setMsg(res.ok ? "Saved." : data.error ?? "Could not save");
  }

  const field = "w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-brass";

  return (
    <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm">
        <span className="text-ink-muted">Legal name</span>
        <input className={field} value={form.legal_name} onChange={(e) => set("legal_name", e.target.value)} placeholder="Acme Studio SARL" />
      </label>
      <label className="text-sm">
        <span className="text-ink-muted">Legal form</span>
        <input className={field} value={form.legal_form} onChange={(e) => set("legal_form", e.target.value)} placeholder="SARL, SAS, EI, micro-entreprise…" />
      </label>
      <label className="text-sm">
        <span className="text-ink-muted">SIREN</span>
        <input className={field} value={form.siren} onChange={(e) => set("siren", e.target.value)} placeholder="123 456 789" />
      </label>
      <label className="text-sm">
        <span className="text-ink-muted">SIRET</span>
        <input className={field} value={form.siret} onChange={(e) => set("siret", e.target.value)} placeholder="123 456 789 00012" />
      </label>
      <label className="text-sm">
        <span className="text-ink-muted">VAT number (TVA intracom.)</span>
        <input className={field} value={form.vat_number} onChange={(e) => set("vat_number", e.target.value)} placeholder="FR12345678901" />
      </label>
      <label className="text-sm">
        <span className="text-ink-muted">Default VAT rate</span>
        <select
          className={field}
          value={form.default_vat_rate_bps}
          onChange={(e) => set("default_vat_rate_bps", Number(e.target.value))}
        >
          {RATE_OPTIONS.map((r) => (
            <option key={r.bps} value={r.bps}>{r.label}</option>
          ))}
        </select>
      </label>
      <label className="text-sm sm:col-span-2">
        <span className="text-ink-muted">Registered address</span>
        <input className={field} value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="12 rue de la Paix, 75002 Paris, France" />
      </label>
      <div className="flex items-center gap-4 sm:col-span-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.vat_registered} onChange={(e) => set("vat_registered", e.target.checked)} />
          VAT-registered (uncheck for franchise en base — art. 293 B)
        </label>
        <label className="text-sm">
          <span className="text-ink-muted">Country</span>{" "}
          <input className="w-16 rounded-lg border border-ink/15 bg-white px-2 py-1 text-sm uppercase" maxLength={2} value={form.country} onChange={(e) => set("country", e.target.value.toUpperCase())} />
        </label>
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button disabled={saving} className="rounded-full bg-ink px-5 py-2 text-sm text-ivory hover:bg-ink-soft disabled:opacity-50">
          {saving ? "Saving…" : "Save tax profile"}
        </button>
        {msg && <span className="text-sm text-ink-muted">{msg}</span>}
      </div>
    </form>
  );
}
