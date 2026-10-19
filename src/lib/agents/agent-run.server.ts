// Creating and running agents, on the server. Shared by the wizard and the agent pages (through
// agent-actions.functions.ts), the assistant's approved "create this agent" card (tool-exec) and the
// scheduler that starts agents on their schedule or on an event (/api/public/agents/dispatch).
import { TOOL_REGISTRY } from "./tool-registry";
import { normalizeAgentSpec, type AgentSpec } from "./agent-spec";

/* eslint-disable @typescript-eslint/no-explicit-any */
type SB = { from: (t: string) => any; rpc: (n: string, a: Record<string, unknown>) => any };
const AGENT_HISTORY = 6;

export async function agentAudit(sb: SB, userId: string | null, e: {
  orgId: string; agentId?: string | null; runId?: string | null; actionId?: string | null;
  event: string; description?: string | null; metadata?: Record<string, unknown>;
}) {
  await sb.from("ai_agent_audit_logs").insert({
    org_id: e.orgId, agent_id: e.agentId ?? null, user_id: userId, run_id: e.runId ?? null, action_id: e.actionId ?? null,
    event_type: e.event, event_description: e.description ?? null, metadata_json: e.metadata ?? {},
  });
}
const audit = agentAudit;

/** Creates the agent and its data access, tools and triggers; removes it again if any part fails. */
export async function createAgentRecords(client: unknown, orgId: string, userId: string, input: AgentSpec) {
  const sb = client as SB;
  const spec = normalizeAgentSpec(input);
  // A schedule with no time zone (the assistant doesn't ask) runs on the workspace's time zone.
  if (spec.triggers.some((t) => t.type === "scheduled" && !t.config.tz)) {
    const { data: org } = await sb.from("organizations").select("timezone").eq("id", orgId).maybeSingle();
    for (const t of spec.triggers) if (t.type === "scheduled" && !t.config.tz) t.config.tz = org?.timezone || "UTC";
  }
  const { data: agent, error } = await sb.from("ai_agents").insert({
    org_id: orgId, name: spec.name, description: spec.description ?? null, agent_type: "custom",
    status: spec.activate ? "active" : "draft", system_prompt: spec.instructions,
    // Runs use the "AI agents" model from Settings › AI; these two are kept for the record.
    model_provider: "builtin", model_name: "settings",
    requires_approval: spec.requires_approval !== false, memory_enabled: false, owner_user_id: userId,
  }).select("id,name,status").single();
  if (error) throw new Error(error.message);
  try {
    if (spec.modules.length) {
      const { error: e } = await sb.from("ai_agent_permissions").insert(spec.modules.map((m) => ({
        org_id: orgId, agent_id: agent.id, module_key: m.module,
        can_read: !!m.read, can_create: !!m.create, can_update: !!m.update, can_delete: false, can_execute_action: !!m.execute,
      })));
      if (e) throw e;
    }
    if (spec.tools.length) {
      const { error: e } = await sb.from("ai_agent_tools").insert(spec.tools.map((tool_name) => {
        const def = TOOL_REGISTRY.find((t) => t.name === tool_name);
        return { org_id: orgId, agent_id: agent.id, tool_name, tool_type: def?.toolType ?? "custom_function", description: def?.description ?? null,
          config_json: {}, is_enabled: true, requires_approval: def?.requiresApproval ?? true };
      }));
      if (e) throw e;
    }
    const { error: e } = await sb.from("ai_agent_triggers").insert(spec.triggers.map((t) => ({
      org_id: orgId, agent_id: agent.id, trigger_name: t.name ?? t.type, trigger_type: t.type,
      // A new event trigger only reacts to events from now on.
      trigger_config_json: t.type === "manual" ? {} : { ...t.config, ...(t.type === "event_based" ? { since: new Date().toISOString() } : {}) },
      is_enabled: true,
    })));
    if (e) throw e;
  } catch (err) {
    await sb.from("ai_agents").delete().eq("id", agent.id);
    throw new Error(`The agent wasn't created: ${(err as { message?: string })?.message ?? "a part of it couldn't be saved"}`);
  }
  await audit(sb, userId, { orgId, agentId: agent.id, event: "agent_created", description: spec.name });
  if (spec.activate) await audit(sb, userId, { orgId, agentId: agent.id, event: "agent_activated" });
  return { id: agent.id as string, name: agent.name as string, status: agent.status as string };
}

/**
 * Runs an agent once on a prompt: the run, its messages, read-tool results and proposals (write
 * tools wait in Inbox › Approvals). `userId` is who it runs for: the person who clicked, or the
 * agent's owner for scheduled and event runs.
 */
export async function runAgentCore(client: unknown, userId: string, agentId: string, prompt: string,
  trigger: { type: "manual" | "scheduled" | "event_based"; label?: string } = { type: "manual" }) {
  const sb = client as SB;
  const { data: agent, error: agentErr } = await sb.from("ai_agents").select("*").eq("id", agentId).maybeSingle();
  if (agentErr) throw new Error(agentErr.message);
  if (!agent) throw new Error("Agent not found");
  if (agent.status === "archived") throw new Error("This agent is archived");
  if (agent.status === "paused") throw new Error("This agent is paused");
  const orgId = agent.org_id as string;
  // One AI action per run (refused when the month's allowance is used up).
  const { chargeAiAction } = await import("@/lib/ai/usage.server");
  const charge = await chargeAiAction(client, orgId, "agent", "agents");

  const { data: run, error: runErr } = await sb.from("ai_agent_runs").insert({
    org_id: orgId, agent_id: agent.id, triggered_by_user_id: userId, trigger_type: trigger.type, status: "running",
    input_payload: { prompt: prompt }, started_at: new Date().toISOString(),
  }).select().single();
  if (runErr) throw new Error(runErr.message);
  await audit(sb, userId, { orgId, agentId: agent.id, runId: run.id, event: "run_started", description: trigger.type === "manual" ? "Manual run started" : `Started: ${trigger.label ?? trigger.type}` });
  // The last few messages of this person's earlier runs, so a follow-up ("and the next one?") makes sense.
  const { data: recent } = await sb.from("ai_agent_messages")
    .select("role,content,ai_agent_runs!inner(triggered_by_user_id)")
    .eq("agent_id", agent.id).eq("ai_agent_runs.triggered_by_user_id", userId).in("role", ["user", "assistant"])
    .order("created_at", { ascending: false }).limit(AGENT_HISTORY);
  const history = ((recent ?? []) as Array<{ role: "user" | "assistant"; content: string }>)
    .reverse().map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  await sb.from("ai_agent_messages").insert([
    { org_id: orgId, agent_id: agent.id, run_id: run.id, role: "system", content: agent.system_prompt ?? "" },
    { org_id: orgId, agent_id: agent.id, run_id: run.id, role: "user", content: prompt },
  ]);

  try {
    const { data: granted } = await sb.from("ai_agent_tools").select("tool_name").eq("agent_id", agent.id);
    const names = ((granted ?? []) as Array<{ tool_name: string }>).map((t) => t.tool_name);
    const { agentTurn } = await import("./agent-runtime.functions");
    const turn = await agentTurn(client, userId, {
      orgId, agentId: agent.id, runId: run.id, systemPrompt: agent.system_prompt ?? "", prompt: prompt, history,
      availableTools: names.length ? names : TOOL_REGISTRY.map((t) => t.name),
    });
    if (!turn.ok) throw new Error(turn.error);

    if (turn.toolCalls.length) {
      await sb.from("ai_agent_messages").insert(turn.toolCalls.map((c) => ({
        org_id: orgId, agent_id: agent.id, run_id: run.id, role: "tool",
        content: `Ran ${c.tool} ${JSON.stringify(c.args)}`, metadata_json: { tool: c.tool, args: c.args, ok: (c.result as { status?: string } | null)?.status !== "error" },
      })));
      for (const c of turn.toolCalls) {
        await audit(sb, userId, { orgId, agentId: agent.id, runId: run.id, event: "action_executed", description: `${c.tool} (read-only)`, metadata: { args: c.args } });
      }
    }

    // Write tools wait for a person (Inbox › Approvals).
    for (const p of turn.proposals) {
      const def = TOOL_REGISTRY.find((t) => t.name === p.tool);
      const changes = { ...p.args, ...(p.reason ? { _reason: p.reason } : {}) };
      const { data: action, error } = await sb.from("ai_agent_actions").insert({
        org_id: orgId, agent_id: agent.id, run_id: run.id, action_type: p.tool,
        target_module: def?.requiredPermissions[0]?.module ?? null, proposed_changes_json: changes,
        requires_approval: true, status: "pending_approval",
      }).select("id").single();
      if (error) throw new Error(error.message);
      await sb.from("ai_agent_approvals").insert({
        org_id: orgId, agent_id: agent.id, run_id: run.id, action_id: action.id, requested_by_agent: true, approval_status: "pending",
      });
      await audit(sb, userId, { orgId, agentId: agent.id, runId: run.id, actionId: action.id, event: "action_proposed", description: p.tool, metadata: changes });
    }

    await sb.from("ai_agent_messages").insert({ org_id: orgId, agent_id: agent.id, run_id: run.id, role: "assistant", content: turn.reply });
    await sb.from("ai_agent_runs").update({
      status: turn.proposals.length ? "waiting_for_approval" : "completed", completed_at: new Date().toISOString(),
      output_summary: turn.reply.slice(0, 500), tokens_used: turn.tokens, model_used: turn.model,
    }).eq("id", run.id);
    await sb.from("ai_agents").update({ last_run_at: new Date().toISOString() }).eq("id", agent.id);
    await audit(sb, userId, { orgId, agentId: agent.id, runId: run.id, event: "run_completed" });
    return { runId: run.id as string, reply: turn.reply as string | null, error: null as string | null, proposals: turn.proposals.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Run failed";
    await charge.refund().catch(() => {});
    await sb.from("ai_agent_messages").insert({ org_id: orgId, agent_id: agent.id, run_id: run.id, role: "error", content: message });
    await sb.from("ai_agent_runs").update({ status: "failed", completed_at: new Date().toISOString(), error_message: message }).eq("id", run.id);
    await audit(sb, userId, { orgId, agentId: agent.id, runId: run.id, event: "run_failed", description: message });
    return { runId: run.id as string, reply: null as string | null, error: message, proposals: 0 };
  }
}
