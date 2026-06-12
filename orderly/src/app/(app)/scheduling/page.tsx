import { createServerSupabase } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/tenant";
import { formatDate } from "@/lib/utils";

export default async function SchedulingPage() {
  const supabase = createServerSupabase();
  const org = await getActiveOrg();
  const { data: appts } = await supabase
    .from("appointments")
    .select("id,title,starts_at,location,reminder_sent,clients(name)")
    .eq("org_id", org!.id)
    .order("starts_at", { ascending: true });

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Scheduling</h1>
      <p className="mt-2 text-ink-muted">Upcoming appointments and the reminders the agent is handling.</p>

      <div className="mt-8 divide-y divide-ink/10 rounded-2xl border border-ink/10 bg-white/60">
        {(appts ?? []).length === 0 && (
          <div className="p-10 text-center text-ink-muted">
            No appointments yet — connect your calendar and the scheduling agent takes it from here.
          </div>
        )}
        {(appts ?? []).map((a: any) => (
          <div key={a.id} className="flex items-center justify-between p-5">
            <div>
              <h3 className="font-medium">{a.title}</h3>
              <p className="text-sm text-ink-muted">
                {a.clients?.name ? `${a.clients.name} · ` : ""}
                {formatDate(a.starts_at)}
                {a.location ? ` · ${a.location}` : ""}
              </p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs ${a.reminder_sent ? "bg-sage/15 text-sage" : "bg-brass/15 text-brass-dark"}`}>
              {a.reminder_sent ? "Reminded" : "Reminder pending"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
