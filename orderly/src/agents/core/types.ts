import type Anthropic from "@anthropic-ai/sdk";

/** A tool an agent can call. Pure server-side; runs against tenant-scoped data. */
export interface AgentTool {
  name: string;
  description: string;
  input_schema: Anthropic.Tool.InputSchema;
  /**
   * Execute the tool. `ctx.orgId` is authoritative — every DB query MUST be
   * scoped to it so one tenant can never touch another's data.
   */
  run: (input: any, ctx: ToolContext) => Promise<unknown>;
}

export interface ToolContext {
  orgId: string;
  /** Service-role Supabase client. Always filter by ctx.orgId. */
  db: ReturnType<typeof import("@/lib/supabase/server").createAdminSupabase>;
  /** Which agent is running — recorded on anything the tools create. */
  agentKey?: string;
}

/** Definition of one of Orderly's specialist agents. */
export interface AgentDefinition {
  key: string; // invoicing | bookkeeping | documents | scheduling
  label: string;
  description: string;
  systemPrompt: string;
  tools: AgentTool[];
}

/** A single step in an agent run, persisted for the audit trail. */
export interface RunStep {
  type: "thinking" | "tool_call" | "tool_result" | "message";
  tool?: string;
  input?: unknown;
  output?: unknown;
  text?: string;
  at: string;
}
