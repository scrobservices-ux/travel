import { AgentRunner } from "@/components/app/AgentRunner";
import { getDict } from "@/i18n/server";

export default function AgentsPage() {
  const t = getDict().agentsPage;
  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">{t.title}</h1>
      <p className="mt-2 max-w-2xl text-ink-muted">{t.sub}</p>
      <div className="mt-8">
        <AgentRunner />
      </div>
    </div>
  );
}
