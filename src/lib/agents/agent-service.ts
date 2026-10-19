// What the pages call for AI agents. The work (runs, approvals, the audit trail) happens on the
// server in agent-actions.functions.ts; these are the browser-side entry points.
import { decideAgentAction as decideOnServer, logAgentEvent, runAgentOnServer, type AgentEvent } from "./agent-actions.functions";

export type { AgentEvent };

/** Run an agent once on a prompt. Write tools come back as actions waiting in Inbox › Approvals. */
export function runAgent(agentId: string, input: { prompt: string }) {
  return runAgentOnServer({ data: { agentId, prompt: input.prompt } });
}

/** Approve (the action then runs at once) or reject an agent's proposed action. */
export function decideAgentAction(actionId: string, decision: "approve" | "reject", notes?: string) {
  return decideOnServer({ data: { actionId, decision, notes } });
}

/** Record a change to an agent (created, activated, settings) in its audit log. */
export async function writeAgentAuditLog(input: { agentId?: string; event_type: AgentEvent; description?: string; metadata?: Record<string, unknown> }) {
  if (!input.agentId) return;
  await logAgentEvent({ data: { agentId: input.agentId, event: input.event_type, description: input.description, metadata: input.metadata } });
}

