/**
 * Automation policy.
 *
 * The platform default is REVIEW everywhere: agents prepare actions (e.g. a
 * payment reminder) and a human approves them in the Approvals outbox before
 * anything is sent. A tenant can opt specific actions into AUTO to let agents
 * act without review. (Per the product decision: auto-send only if configured;
 * otherwise prepare for review.)
 */

export type PolicyMode = "review" | "auto";

/** Actions an agent can take that a tenant may want to automate. */
export const AUTOMATABLE_ACTIONS = [
  { key: "send_invoice", label: "Send invoices", hint: "Email a finished invoice to the client." },
  { key: "send_payment_reminder", label: "Send payment reminders", hint: "Chase overdue invoices automatically." },
  { key: "send_appointment_reminder", label: "Send appointment reminders", hint: "Remind clients of upcoming appointments." },
  { key: "categorize_transaction", label: "Auto-file bookkeeping", hint: "Record categorized transactions without review." },
] as const;

export type AutomationAction = (typeof AUTOMATABLE_ACTIONS)[number]["key"];

export type AutomationPolicy = Partial<Record<AutomationAction, PolicyMode>>;

/** Resolve the policy for an org, defaulting every action to "review". */
export function getPolicy(org: { automation?: AutomationPolicy | null }): Record<AutomationAction, PolicyMode> {
  const stored = org.automation ?? {};
  const resolved = {} as Record<AutomationAction, PolicyMode>;
  for (const a of AUTOMATABLE_ACTIONS) {
    resolved[a.key] = stored[a.key] === "auto" ? "auto" : "review";
  }
  return resolved;
}

/** True only when the tenant has explicitly enabled auto for this action. */
export function isAuto(org: { automation?: AutomationPolicy | null }, action: AutomationAction): boolean {
  return getPolicy(org)[action] === "auto";
}
