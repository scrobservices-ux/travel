import { z } from "zod";
import type { AgentTool } from "./types";

/**
 * The shared tool library. Agents are granted subsets of these. Every handler
 * is scoped to `ctx.orgId`, which is set by the runtime from an authorized
 * session — the model never chooses which tenant it operates on.
 */

export const listClients: AgentTool = {
  name: "list_clients",
  description: "List the organization's clients/contacts. Use to resolve a client by name or email.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Optional name/email substring to filter by." },
    },
  },
  run: async (input, ctx) => {
    let q = ctx.db.from("clients").select("id,name,email,company").eq("org_id", ctx.orgId).limit(25);
    if (input?.query) q = q.ilike("name", `%${input.query}%`);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data;
  },
};

export const listInvoices: AgentTool = {
  name: "list_invoices",
  description: "List invoices, optionally filtered by status (draft|sent|paid|overdue|void).",
  input_schema: {
    type: "object",
    properties: {
      status: { type: "string", description: "Filter by invoice status." },
    },
  },
  run: async (input, ctx) => {
    let q = ctx.db
      .from("invoices")
      .select("id,number,status,total_cents,currency,issue_date,due_date,client_id")
      .eq("org_id", ctx.orgId)
      .order("issue_date", { ascending: false })
      .limit(50);
    if (input?.status) q = q.eq("status", input.status);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data;
  },
};

const createInvoiceSchema = z.object({
  client_id: z.string().uuid().optional(),
  client_name: z.string().optional(),
  currency: z.string().default("USD"),
  due_date: z.string().optional(),
  line_items: z
    .array(
      z.object({
        description: z.string(),
        quantity: z.number().default(1),
        unit_cents: z.number().int(),
      }),
    )
    .min(1),
  tax_cents: z.number().int().default(0),
  notes: z.string().optional(),
});

export const createInvoice: AgentTool = {
  name: "create_invoice",
  description:
    "Create a draft invoice with line items. Amounts are in integer cents. " +
    "Provide either client_id or client_name. The invoice number is generated automatically.",
  input_schema: {
    type: "object",
    properties: {
      client_id: { type: "string" },
      client_name: { type: "string" },
      currency: { type: "string", default: "USD" },
      due_date: { type: "string", description: "ISO date, e.g. 2026-07-01" },
      tax_cents: { type: "integer", default: 0 },
      notes: { type: "string" },
      line_items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            quantity: { type: "number", default: 1 },
            unit_cents: { type: "integer" },
          },
          required: ["description", "unit_cents"],
        },
      },
    },
    required: ["line_items"],
  },
  run: async (rawInput, ctx) => {
    const input = createInvoiceSchema.parse(rawInput);

    let clientId = input.client_id ?? null;
    if (!clientId && input.client_name) {
      const { data: existing } = await ctx.db
        .from("clients")
        .select("id")
        .eq("org_id", ctx.orgId)
        .ilike("name", input.client_name)
        .maybeSingle();
      if (existing) clientId = existing.id;
      else {
        const { data: created, error } = await ctx.db
          .from("clients")
          .insert({ org_id: ctx.orgId, name: input.client_name })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        clientId = created.id;
      }
    }

    const subtotal = input.line_items.reduce(
      (sum, li) => sum + Math.round(li.quantity * li.unit_cents),
      0,
    );
    const total = subtotal + (input.tax_cents ?? 0);

    // Generate next invoice number for this org.
    const { count } = await ctx.db
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("org_id", ctx.orgId);
    const number = `INV-${String((count ?? 0) + 1).padStart(4, "0")}`;

    const { data: invoice, error } = await ctx.db
      .from("invoices")
      .insert({
        org_id: ctx.orgId,
        client_id: clientId,
        number,
        currency: input.currency,
        due_date: input.due_date ?? null,
        subtotal_cents: subtotal,
        tax_cents: input.tax_cents ?? 0,
        total_cents: total,
        notes: input.notes ?? null,
        status: "draft",
      })
      .select("id,number,total_cents,currency,status")
      .single();
    if (error) throw new Error(error.message);

    await ctx.db.from("invoice_line_items").insert(
      input.line_items.map((li) => ({
        org_id: ctx.orgId,
        invoice_id: invoice.id,
        description: li.description,
        quantity: li.quantity,
        unit_cents: li.unit_cents,
        amount_cents: Math.round(li.quantity * li.unit_cents),
      })),
    );

    return invoice;
  },
};

export const markInvoiceStatus: AgentTool = {
  name: "mark_invoice_status",
  description: "Update an invoice's status (e.g. mark as sent, paid, overdue, or void).",
  input_schema: {
    type: "object",
    properties: {
      invoice_id: { type: "string" },
      status: { type: "string", enum: ["draft", "sent", "paid", "overdue", "void"] },
    },
    required: ["invoice_id", "status"],
  },
  run: async (input, ctx) => {
    const { data, error } = await ctx.db
      .from("invoices")
      .update({ status: input.status })
      .eq("org_id", ctx.orgId)
      .eq("id", input.invoice_id)
      .select("id,number,status")
      .single();
    if (error) throw new Error(error.message);
    return data;
  },
};

export const recordTransaction: AgentTool = {
  name: "record_transaction",
  description:
    "Record a bookkeeping transaction (income or expense) with an assigned category " +
    "and a confidence score (0-1) reflecting how certain the categorization is.",
  input_schema: {
    type: "object",
    properties: {
      direction: { type: "string", enum: ["income", "expense"] },
      description: { type: "string" },
      amount_cents: { type: "integer" },
      category: { type: "string" },
      category_confidence: { type: "number" },
      occurred_on: { type: "string", description: "ISO date" },
    },
    required: ["direction", "description", "amount_cents", "category"],
  },
  run: async (input, ctx) => {
    const { data, error } = await ctx.db
      .from("transactions")
      .insert({
        org_id: ctx.orgId,
        direction: input.direction,
        description: input.description,
        amount_cents: input.amount_cents,
        category: input.category,
        category_confidence: input.category_confidence ?? null,
        occurred_on: input.occurred_on ?? new Date().toISOString().slice(0, 10),
        source: "manual",
      })
      .select("id,category,amount_cents,direction")
      .single();
    if (error) throw new Error(error.message);
    return data;
  },
};

export const summarizeDocument: AgentTool = {
  name: "save_document_analysis",
  description:
    "Persist the classification, summary and extracted fields for a document the agent analyzed.",
  input_schema: {
    type: "object",
    properties: {
      document_id: { type: "string" },
      kind: { type: "string", description: "invoice | receipt | contract | email | other" },
      summary: { type: "string" },
      extracted: { type: "object", description: "Structured fields pulled from the document." },
    },
    required: ["document_id", "kind", "summary"],
  },
  run: async (input, ctx) => {
    const { data, error } = await ctx.db
      .from("documents")
      .update({
        kind: input.kind,
        summary: input.summary,
        extracted: input.extracted ?? {},
        status: "processed",
      })
      .eq("org_id", ctx.orgId)
      .eq("id", input.document_id)
      .select("id,kind,status")
      .single();
    if (error) throw new Error(error.message);
    return data;
  },
};

export const listUpcomingAppointments: AgentTool = {
  name: "list_upcoming_appointments",
  description: "List upcoming appointments so reminders/follow-ups can be planned.",
  input_schema: { type: "object", properties: {} },
  run: async (_input, ctx) => {
    const { data, error } = await ctx.db
      .from("appointments")
      .select("id,title,starts_at,client_id,reminder_sent")
      .eq("org_id", ctx.orgId)
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(50);
    if (error) throw new Error(error.message);
    return data;
  },
};

export const draftMessage: AgentTool = {
  name: "draft_message",
  description:
    "Compose a client-facing message (email/SMS body) and return it for human review. " +
    "Does NOT send — Orderly keeps a human in the loop for outbound comms by default.",
  input_schema: {
    type: "object",
    properties: {
      channel: { type: "string", enum: ["email", "sms"] },
      to: { type: "string" },
      subject: { type: "string" },
      body: { type: "string" },
    },
    required: ["channel", "body"],
  },
  // Pure: returns the draft to the run result. Sending is a separate, gated action.
  run: async (input) => ({ drafted: true, ...input }),
};

export const ALL_TOOLS: Record<string, AgentTool> = Object.fromEntries(
  [
    listClients,
    listInvoices,
    createInvoice,
    markInvoiceStatus,
    recordTransaction,
    summarizeDocument,
    listUpcomingAppointments,
    draftMessage,
  ].map((t) => [t.name, t]),
);
