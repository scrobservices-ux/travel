import { createServerSupabase } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/tenant";
import { ApprovalsList } from "@/components/app/ApprovalsList";
import { getDict } from "@/i18n/server";

export default async function ApprovalsPage() {
  const supabase = createServerSupabase();
  const t = getDict().approvals;
  const org = await getActiveOrg();
  const { data: items } = await supabase
    .from("outbox")
    .select("id,channel,to_address,subject,body,status,agent,related_type,created_at")
    .eq("org_id", org!.id)
    .in("status", ["draft", "approved"])
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">{t.title}</h1>
      <p className="mt-2 max-w-2xl text-ink-muted">{t.sub}</p>
      <div className="mt-8">
        <ApprovalsList initial={items ?? []} />
      </div>
    </div>
  );
}
