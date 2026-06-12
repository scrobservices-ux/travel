import { createServerSupabase } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/tenant";
import { formatDate } from "@/lib/utils";
import { getDict } from "@/i18n/server";
import { DocumentUpload } from "@/components/app/DocumentUpload";

export default async function DocumentsPage() {
  const supabase = createServerSupabase();
  const t = getDict().documents;
  const org = await getActiveOrg();
  const { data: docs } = await supabase
    .from("documents")
    .select("id,title,kind,summary,status,created_at")
    .eq("org_id", org!.id)
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">{t.title}</h1>
          <p className="mt-2 text-ink-muted">{t.sub}</p>
        </div>
        <DocumentUpload />
      </div>

      <div className="mt-8 grid gap-4">
        {(docs ?? []).length === 0 && (
          <div className="rounded-2xl border border-dashed border-ink/20 bg-white/40 p-10 text-center text-ink-muted">
            {t.empty}
          </div>
        )}
        {(docs ?? []).map((d) => (
          <div key={d.id} className="rounded-2xl border border-ink/10 bg-white/60 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-medium">{d.title}</h3>
                {d.kind && (
                  <span className="mt-1 inline-block rounded-full bg-brass/15 px-2.5 py-0.5 text-xs capitalize text-brass-dark">
                    {d.kind}
                  </span>
                )}
              </div>
              <span className="text-xs text-ink-muted">{formatDate(d.created_at)}</span>
            </div>
            {d.summary && <p className="mt-3 text-sm leading-relaxed text-ink-muted">{d.summary}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
