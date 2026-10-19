import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ENTITY_TYPES } from "./context.server";

type SB = SupabaseClient<Database>;

export const APPROVAL_MODES = ["read_only", "draft", "confirm", "autonomous"] as const;
export type ApprovalMode = (typeof APPROVAL_MODES)[number];

export const ACTION_KEYS = [
  "create_lead",
  "create_company",
  "create_contact",
  "create_task",
  "log_activity",
  "update_deal_stage",
  "create_agent",
] as const;
export type ActionKey = (typeof ACTION_KEYS)[number];

export const ACTION_LABELS: Record<ActionKey, string> = {
  create_lead: "Create a lead",
  create_company: "Create a company",
  create_task: "Create a project task",
  log_activity: "Log an activity / note",
  update_deal_stage: "Move a deal to another stage",
  create_contact: "Create a contact",
  create_agent: "Create an AI agent",
};

async function assertMember(supabase: SB, orgId: string, userId: string) {
  const { data } = await supabase.from("memberships").select("id")
    .eq("org_id", orgId).eq("user_id", userId).eq("status", "active").maybeSingle();
  if (!data) throw new Error("Not a member of this organization");
}

/* ---------------------------------- Brief --------------------------------- */

export const aiEntityBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({
      orgId: z.string().uuid(),
      entityType: z.enum(ENTITY_TYPES),
      entityId: z.string().uuid(),
      question: z.string().max(2000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: SB; userId: string };
    await assertMember(supabase, data.orgId, userId);

    const { buildEntityContext, BRIEF_PROMPTS } = await import("./context.server");
    const { runAiChat } = await import("./gateway.server");

    const ctx = await buildEntityContext(supabase, data.orgId, data.entityType, data.entityId);
    const instruction = data.question?.trim() || BRIEF_PROMPTS[data.entityType];

    const { chargeAiAction } = await import("./usage.server");
    const charge = await chargeAiAction(supabase, data.orgId, "brief", "summaries");
    const result = await runAiChat({
      orgId: data.orgId,
      userId,
      purpose: "summaries",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "You are an in-app business analyst. Ground every statement in the CONTEXT below. " +
            "Never invent numbers, names or dates. If something is unknown, say so. " +
            "Answer in short markdown: a few bullets, then a bolded 'Next steps' list of at most 3 items.",
        },
        { role: "user", content: `CONTEXT:\n${ctx.text}\n\nTASK: ${instruction}` },
      ],
    }).catch(async (e) => { await charge.refund().catch(() => {}); throw e; });

    await supabase.from("ai_actions").insert({
      org_id: data.orgId, user_id: userId, module: "context", capability: `brief_${data.entityType}`,
      prompt: instruction, output: result.text,
      entity_type: data.entityType, entity_id: data.entityId,
      action_status: "completed", model: result.model,
    });

    return { text: result.text, model: result.model, label: ctx.label };
  });

/* --------------------------------- Policies -------------------------------- */

export const aiGetActionPolicies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: SB; userId: string };
    await assertMember(supabase, data.orgId, userId);
    const { data: rows } = await supabase.from("ai_action_policies")
      .select("action_key,mode").eq("org_id", data.orgId);
    const map: Record<string, ApprovalMode> = {};
    for (const key of ACTION_KEYS) map[key] = "confirm";
    for (const r of rows ?? []) map[r.action_key] = r.mode as ApprovalMode;
    return map;
  });

export const aiSaveActionPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({
      orgId: z.string().uuid(),
      actionKey: z.enum(ACTION_KEYS),
      mode: z.enum(APPROVAL_MODES),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: SB; userId: string };
    await assertMember(supabase, data.orgId, userId);
    const { error } = await supabase.from("ai_action_policies").upsert(
      { org_id: data.orgId, action_key: data.actionKey, mode: data.mode, updated_at: new Date().toISOString() },
      { onConflict: "org_id,action_key" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ----------------------------- Proposed actions ---------------------------- */

const ProposeInput = z.object({
  orgId: z.string().uuid(),
  actionKey: z.enum(ACTION_KEYS),
  title: z.string().min(1).max(200),
  summary: z.string().max(2000).optional(),
  payload: z.record(z.string(), z.unknown()),
  entityType: z.string().max(50).optional(),
  entityId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
});

// Creates go through the same executors the AI agents use, so both paths write records the same way.
const AGENT_TOOL_FOR: Partial<Record<ActionKey, string>> = {
  create_lead: "crm_create_lead",
  create_company: "crm_create_company",
  create_contact: "crm_create_contact",
  create_task: "task_create",
  create_agent: "agent_create",
};

export async function executeAction(
  supabase: SB,
  orgId: string,
  userId: string,
  actionKey: ActionKey,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const s = (k: string) => (typeof payload[k] === "string" ? (payload[k] as string) : undefined);

  const tool = AGENT_TOOL_FOR[actionKey];
  if (tool) {
    const { executeAgentTool } = await import("@/lib/agents/tool-exec.server");
    const res = await executeAgentTool(supabase, orgId, tool, payload, userId);
    if (res?.status !== "ok") throw new Error(res?.error ?? `Could not ${ACTION_LABELS[actionKey].toLowerCase()}`);
    return res;
  }

  if (actionKey === "log_activity") {
    const title = s("title");
    if (!title) throw new Error("An activity title is required");
    const { data, error } = await supabase.from("activities").insert({
      org_id: orgId, title,
      description: s("description") ?? null,
      type: (s("type") ?? "note") as Database["public"]["Tables"]["activities"]["Insert"]["type"],
      entity_type: (s("entity_type") ?? "company") as Database["public"]["Tables"]["activities"]["Insert"]["entity_type"],
      entity_id: s("entity_id") ?? null,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { activity_id: data.id };
  }

  if (actionKey === "update_deal_stage") {
    const dealId = s("deal_id");
    const stageId = s("stage_id");
    if (!dealId || !stageId) throw new Error("A deal and a target stage are required");
    const { error } = await supabase.from("deals").update({ stage_id: stageId }).eq("id", dealId).eq("org_id", orgId);
    if (error) throw new Error(error.message);
    return { deal_id: dealId, stage_id: stageId, link: `/app/crm/deals` };
  }

  throw new Error(`Unknown action ${actionKey}`);
}

type ProposeArgs = z.infer<typeof ProposeInput>;

/** Records an AI-proposed write and, depending on the org's policy, executes it
 *  immediately (autonomous) or leaves it pending a human decision. */
export async function proposeAction(supabase: SB, userId: string, data: ProposeArgs) {
  const { data: policy } = await supabase.from("ai_action_policies")
    .select("mode").eq("org_id", data.orgId).eq("action_key", data.actionKey).maybeSingle();
  // A new agent always waits for a person, whatever the policy says.
  const raw = (policy?.mode ?? "confirm") as ApprovalMode;
  const mode: ApprovalMode = data.actionKey === "create_agent" && raw === "autonomous" ? "confirm" : raw;

  if (mode === "read_only") {
    throw new Error(`AI is not allowed to ${ACTION_LABELS[data.actionKey].toLowerCase()} in this workspace`);
  }

  const { data: row, error } = await supabase.from("ai_proposed_actions").insert({
    org_id: data.orgId, user_id: userId,
    conversation_id: data.conversationId ?? null,
    action_key: data.actionKey, title: data.title,
    summary: data.summary ?? null,
    payload: data.payload as Database["public"]["Tables"]["ai_proposed_actions"]["Insert"]["payload"],
    entity_type: data.entityType ?? null, entity_id: data.entityId ?? null,
    status: "pending",
  }).select("id").single();
  if (error) throw new Error(error.message);

  if (mode === "autonomous") {
    try {
      const result = await executeAction(supabase, data.orgId, userId, data.actionKey, data.payload as Record<string, unknown>);
      await supabase.from("ai_proposed_actions").update({
        status: "executed", result: result as never, decided_by: userId, decided_at: new Date().toISOString(),
      }).eq("id", row.id);
      return { id: row.id, mode, status: "executed" as const };
    } catch (e) {
      await supabase.from("ai_proposed_actions").update({
        status: "failed", error: e instanceof Error ? e.message : String(e),
      }).eq("id", row.id);
      return { id: row.id, mode, status: "failed" as const };
    }
  }

  return { id: row.id, mode, status: "pending" as const };
}

export const aiProposeAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => ProposeInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: SB; userId: string };
    await assertMember(supabase, data.orgId, userId);
    return proposeAction(supabase, userId, data);
  });

export const aiListProposedActions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ orgId: z.string().uuid(), status: z.string().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: SB; userId: string };
    await assertMember(supabase, data.orgId, userId);
    let q = supabase.from("ai_proposed_actions")
      .select("id,action_key,title,summary,payload,entity_type,entity_id,status,result,error,created_at,decided_at")
      .eq("org_id", data.orgId).order("created_at", { ascending: false }).limit(100);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const aiDecideAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({
      orgId: z.string().uuid(),
      id: z.string().uuid(),
      decision: z.enum(["approve", "reject"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: SB; userId: string };
    await assertMember(supabase, data.orgId, userId);

    const { data: row, error } = await supabase.from("ai_proposed_actions")
      .select("id,action_key,payload,status").eq("id", data.id).eq("org_id", data.orgId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Action not found");
    if (row.status !== "pending") throw new Error("This action was already decided");

    const now = new Date().toISOString();

    if (data.decision === "reject") {
      await supabase.from("ai_proposed_actions").update({
        status: "rejected", decided_by: userId, decided_at: now,
      }).eq("id", row.id);
      return { status: "rejected" as const };
    }

    try {
      const result = await executeAction(
        supabase, data.orgId, userId,
        row.action_key as ActionKey,
        (row.payload ?? {}) as Record<string, unknown>,
      );
      await supabase.from("ai_proposed_actions").update({
        status: "executed", result: result as never, decided_by: userId, decided_at: now,
      }).eq("id", row.id);
      return { status: "executed" as const, link: typeof result.link === "string" ? result.link : null };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await supabase.from("ai_proposed_actions").update({
        status: "failed", error: message, decided_by: userId, decided_at: now,
      }).eq("id", row.id);
      throw new Error(message);
    }
  });
