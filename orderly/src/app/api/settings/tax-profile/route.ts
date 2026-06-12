import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/tenant";
import { isValidVatFormat, normalizeVat } from "@/lib/tax/eu";

export const runtime = "nodejs";

const schema = z.object({
  country: z.string().length(2).optional(),
  currency: z.string().optional(),
  legal_name: z.string().optional(),
  legal_form: z.string().optional(),
  siren: z.string().optional(),
  siret: z.string().optional(),
  vat_number: z.string().optional(),
  address: z.string().optional(),
  vat_registered: z.boolean().optional(),
  default_vat_rate_bps: z.number().int().optional(),
});

/**
 * POST /api/settings/tax-profile — save the org's seller identity used on
 * compliant invoices (SIREN/SIRET, TVA number, default rate, etc.).
 */
export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await getActiveOrg();
  if (!org) return NextResponse.json({ error: "No active organization" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { country, currency, ...profileFields } = parsed.data;

  if (profileFields.vat_number) {
    profileFields.vat_number = normalizeVat(profileFields.vat_number);
    if (!isValidVatFormat(profileFields.vat_number)) {
      return NextResponse.json({ error: "VAT number format looks invalid." }, { status: 400 });
    }
  }

  const nextProfile = { ...(org.tax_profile ?? {}), ...profileFields };
  const update: Record<string, unknown> = { tax_profile: nextProfile };
  if (country) update.country = country.toUpperCase();
  if (currency) update.currency = currency.toUpperCase();

  const { error } = await supabase.from("organizations").update(update).eq("id", org.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ tax_profile: nextProfile, country, currency });
}
