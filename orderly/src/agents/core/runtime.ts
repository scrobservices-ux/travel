import Anthropic from "@anthropic-ai/sdk";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getAgent } from "./registry";
import type { RunStep, ToolContext } from "./types";

const MODEL = process.env.ORDERLY_AGENT_MODEL ?? "claude-opus-4-8";
const MAX_TURNS = 8;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface RunAgentArgs {
  agentKey: string;
  orgId: string;
  /** The task in plain language, e.g. "Invoice Acme for 10h design at $120/hr". */
  task: string;
  trigger?: "manual" | "scheduled" | "webhook";
}

export interface RunAgentResult {
  runId: string;
  status: "succeeded" | "failed";
  summary: string;
  steps: RunStep[];
}

/**
 * Execute one specialist agent against a tenant's data.
 *
 * This is a standard tool-use loop: we hand Claude the agent's system prompt
 * and its granted tools, then run each tool the model calls (scoped to orgId)
 * and feed the results back until it stops calling tools. Every step is
 * recorded to `agent_runs.steps` so the business has a full audit trail.
 */
export async function runAgent(args: RunAgentArgs): Promise<RunAgentResult> {
  const { agentKey, orgId, task, trigger = "manual" } = args;
  const agent = getAgent(agentKey);
  const db = createAdminSupabase();
  const ctx: ToolContext = { orgId, db, agentKey };

  // Open a run row up front so an in-progress run is observable.
  const { data: runRow, error: runErr } = await db
    .from("agent_runs")
    .insert({ org_id: orgId, agent: agentKey, trigger, status: "running", input: { task } })
    .select("id")
    .single();
  if (runErr) throw new Error(`Could not start run: ${runErr.message}`);
  const runId = runRow.id as string;

  const steps: RunStep[] = [];
  const now = () => new Date().toISOString();
  const toolDefs = agent.tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: task }];
  let tokensIn = 0;
  let tokensOut = 0;
  let summary = "";
  let status: "succeeded" | "failed" = "succeeded";

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1500,
        system: agent.systemPrompt,
        tools: toolDefs,
        messages,
      });
      tokensIn += response.usage.input_tokens;
      tokensOut += response.usage.output_tokens;

      const toolUses = response.content.filter(
        (c): c is Anthropic.ToolUseBlock => c.type === "tool_use",
      );
      const text = response.content
        .filter((c): c is Anthropic.TextBlock => c.type === "text")
        .map((c) => c.text)
        .join("\n")
        .trim();
      if (text) steps.push({ type: "message", text, at: now() });

      messages.push({ role: "assistant", content: response.content });

      // No tool calls -> the agent is done; its text is the summary.
      if (toolUses.length === 0) {
        summary = text || "Done.";
        break;
      }

      // Execute each requested tool, scoped to this tenant.
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const use of toolUses) {
        const tool = agent.tools.find((t) => t.name === use.name);
        steps.push({ type: "tool_call", tool: use.name, input: use.input, at: now() });
        try {
          if (!tool) throw new Error(`Tool ${use.name} not available to this agent`);
          const output = await tool.run(use.input, ctx);
          steps.push({ type: "tool_result", tool: use.name, output, at: now() });
          toolResults.push({
            type: "tool_result",
            tool_use_id: use.id,
            content: JSON.stringify(output ?? null),
          });
        } catch (err: any) {
          const message = err?.message ?? String(err);
          steps.push({ type: "tool_result", tool: use.name, output: { error: message }, at: now() });
          toolResults.push({
            type: "tool_result",
            tool_use_id: use.id,
            content: JSON.stringify({ error: message }),
            is_error: true,
          });
        }
      }

      messages.push({ role: "user", content: toolResults });

      // Persist progress so the UI can stream the trace.
      await db.from("agent_runs").update({ steps, tokens_in: tokensIn, tokens_out: tokensOut }).eq("id", runId);
    }
  } catch (err: any) {
    status = "failed";
    summary = err?.message ?? "Agent run failed.";
    await db
      .from("agent_runs")
      .update({ status, error: summary, steps, finished_at: now(), tokens_in: tokensIn, tokens_out: tokensOut })
      .eq("id", runId);
    return { runId, status, summary, steps };
  }

  await db
    .from("agent_runs")
    .update({
      status,
      result: { summary },
      steps,
      finished_at: now(),
      tokens_in: tokensIn,
      tokens_out: tokensOut,
    })
    .eq("id", runId);

  return { runId, status, summary, steps };
}
