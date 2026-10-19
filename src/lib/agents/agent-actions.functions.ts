// Agent runs, approvals and their audit trail, on the server. The browser only asks; the server
// checks, writes and logs in one place, with the caller's own row-level access. An approved
// action runs right after the approval, so nothing is left "approved but not done" if a tab closes.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AgentSpec } from "./agent-spec";

/* eslint-disable @typescript-eslint/no-explicit-any */
type SB = { from: (t: string) => any; rpc: (n: string, a: Record<string, unknown>) => any };

export type AgentEvent =
  | "agent_created" | "agent_updated" | "agent_deleted" | "agent_activated" | "agent_paused"
  | "tool_added" | "tool_removed" | "permission_changed"
  | "run_started" | "run_completed" | "run_failed"
  | "action_proposed" | "action_approved" | "action_rejected" | "action_executed"
  | "credential_updated" | "webhook_received";

async function audit(sb: SB, userId: string, e: {
  orgId: string; agentId?: string | null; runId?: string | null; actionId?: string | null;
  event: AgentEvent; description?: string | null; metadata?: Record<string, unknown>;
}) {
  await sb.from("ai_agent_audit_logs").insert({
    org_id: e.orgId, agent_id: e.agentId ?? null, user_id: userId, run_id: e.runId ?? null, action_id: e.actionId ?? null,
    event_type: e.event, event_description: e.description ?? null, metadata_json: e.metadata ?? {},
  });
}

/** Write an audit entry for an agent (settings changes made on the agent pages). */
export const logAgentEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({
    agentId: z.string().uuid(), event: z.string().min(1).max(40), description: z.string().max(2000).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as SB;
    const { data: agent } = await sb.from("ai_agents").select("org_id").eq("id", data.agentId).maybeSingle();
    if (!agent) throw new Error("Agent not found");
    await audit(sb, context.userId, { orgId: agent.org_id, agentId: data.agentId, event: data.event as AgentEvent, description: data.description, metadata: data.metadata });
    return { ok: true };
  });

/** Create an agent from the wizard (the same checks the assistant's "create this agent" card uses). */
export const createAgentOnServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ orgId: z.string().uuid(), spec: z.record(z.string(), z.unknown()) }).parse(d))
  .handler(async ({ data, context }) => {
    const { createAgentRecords } = await import("./agent-run.server");
    return createAgentRecords(context.supabase, data.orgId, context.userId, data.spec as unknown as AgentSpec);
  });

/** Run an agent once on a prompt: the run, its messages, read-tool results and proposals. */
export const runAgentOnServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ agentId: z.string().uuid(), prompt: z.string().min(1).max(16000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { runAgentCore } = await import("./agent-run.server");
    return runAgentCore(context.supabase, context.userId, data.agentId, data.prompt);
  });

/**
 * Approve (and run) or reject an agent's proposed action. Only owners, admins and managers can
 * (row-level security on ai_agent_actions); the change runs with the approver's own access.
 */
export const decideAgentAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({
    actionId: z.string().uuid(), decision: z.enum(["approve", "reject"]), notes: z.string().max(2000).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as SB;
    const userId = context.userId;
    const now = new Date().toISOString();
    const { data: action, error } = await sb.from("ai_agent_actions").select("*").eq("id", data.actionId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!action) throw new Error("Action not found");
    if (action.status !== "pending_approval") throw new Error("This action was already decided");

    const approve = data.decision === "approve";
    const { data: updated, error: upErr } = await sb.from("ai_agent_actions")
      .update(approve ? { status: "approved", approved_by: userId, approved_at: now } : { status: "rejected" })
      .eq("id", action.id).eq("status", "pending_approval").select("id").maybeSingle();
    if (upErr) throw new Error(upErr.message);
    if (!updated) throw new Error("Only owners, admins and managers can decide on agent actions");
    await sb.from("ai_agent_approvals").update({
      approval_status: approve ? "approved" : "rejected", reviewed_by: userId, review_notes: data.notes ?? null, reviewed_at: now,
    }).eq("action_id", action.id);
    const base = { orgId: action.org_id, agentId: action.agent_id, runId: action.run_id, actionId: action.id };
    await audit(sb, userId, { ...base, event: approve ? "action_approved" : "action_rejected", description: data.notes });
    if (!approve) return { status: "rejected" as const };

    const args = Object.fromEntries(Object.entries((action.proposed_changes_json ?? {}) as Record<string, unknown>).filter(([k]) => k !== "_reason"));
    const { executeAgentTool } = await import("./tool-exec.server");
    const result = await executeAgentTool(context.supabase, action.org_id, action.action_type, args, userId) as { status?: string; error?: string };
    const ok = result?.status === "ok";
    await sb.from("ai_agent_actions").update({
      status: ok ? "executed" : "failed", executed_at: new Date().toISOString(), result_json: result,
      error_message: ok ? null : (result?.error ?? "The tool didn't run"),
    }).eq("id", action.id);
    await audit(sb, userId, { ...base, event: "action_executed", description: action.action_type, metadata: result as Record<string, unknown> });
    return ok ? { status: "executed" as const } : { status: "failed" as const, error: result?.error ?? "The tool didn't run" };
  });
