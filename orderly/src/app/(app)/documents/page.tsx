import { createServerSupabase } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/tenant";
import { formatDate } from "@/lib/utils";

export default async function DocumentsPage() {
  const supabase = createServerSupabase();
  const org = await getActiveOrg();
  const { data: docs } = await supabase
    .from("documents")
    .select("id,title,kind,summary,status,created_at")
    .eq("org_id", org!.id)
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Documents</h1>
      <p className="mt-2 text-ink-muted">Everything read, classified and filed by the documents agent.</p>

      <div className="mt-8 grid gap-4">
        {(docs ?? []).length === 0 && (
          <div className="rounded-2xl border border-dashed border-ink/20 bg-white/40 p-10 text-center text-ink-muted">
            No documents yet. Upload files or connect your inbox, then let the documents agent process them.
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
