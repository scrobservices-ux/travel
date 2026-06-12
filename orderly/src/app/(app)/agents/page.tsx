import { AgentRunner } from "@/components/app/AgentRunner";

export default function AgentsPage() {
  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Agents</h1>
      <p className="mt-2 max-w-2xl text-ink-muted">
        Put a specialist to work in plain language. Each agent acts only within your
        business and records every step, so you always know exactly what was done.
      </p>
      <div className="mt-8">
        <AgentRunner />
      </div>
    </div>
  );
}
