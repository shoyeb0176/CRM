import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type SB = SupabaseClient<Database>;

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "workspace-default";

const CAPABILITIES = [
  "free_chat",
  "summarize_customer",
  "draft_followup_email",
  "explain_overdue_invoices",
  "summarize_project",
  "low_stock_review",
  "draft_quote_notes",
  "summarize_pipeline",
] as const;

type Capability = (typeof CAPABILITIES)[number];

export const AssistantInput = z.object({
  orgId: z.string().uuid(),
  conversationId: z.string().uuid().nullable().optional(),
  message: z.string().min(1).max(8000),
  capability: z.enum(CAPABILITIES).optional(),
  entityType: z.string().max(50).optional(),
  entityId: z.string().uuid().optional(),
  /** Where the user is and what just went wrong, so the assistant can guide them. */
  currentPath: z.string().max(300).optional(),
  recentErrors: z.array(z.string().max(300)).max(5).optional(),
});

type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

async function buildContext(
  supabase: SB,
  orgId: string,
  capability: Capability,
  entityId?: string,
  entityType?: string,
): Promise<string> {
  const lines: string[] = [];
  const today = new Date().toISOString().slice(0, 10);

  if (capability === "summarize_customer" && entityId) {
    const [co, inv, deals] = await Promise.all([
      supabase.from("companies").select("name,website,industry,size,country,status").eq("id", entityId).maybeSingle(),
      supabase.from("invoices").select("number,status,total,balance_due,issue_date,due_date,currency")
        .eq("org_id", orgId).eq("company_id", entityId).order("issue_date", { ascending: false }).limit(10),
      supabase.from("deals").select("name,amount,currency,probability,stage_id,close_date")
        .eq("org_id", orgId).eq("company_id", entityId).limit(10),
    ]);
    lines.push("CUSTOMER:", JSON.stringify(co.data ?? {}));
    lines.push("RECENT INVOICES:", JSON.stringify(inv.data ?? []));
    lines.push("OPEN DEALS:", JSON.stringify(deals.data ?? []));
  } else if (capability === "explain_overdue_invoices") {
    const { data } = await supabase.from("invoices")
      .select("number,company_id,total,balance_due,due_date,status,currency")
      .eq("org_id", orgId).lt("due_date", today).gt("balance_due", 0)
      .order("due_date").limit(25);
    lines.push("OVERDUE INVOICES:", JSON.stringify(data ?? []));
  } else if (capability === "summarize_project" && entityId) {
    const [p, tasks, ms] = await Promise.all([
      supabase.from("projects").select("name,status,start_date,due_date,budget,description").eq("id", entityId).maybeSingle(),
      supabase.from("project_tasks").select("title,status,due_date,priority").eq("project_id", entityId).limit(50),
      supabase.from("milestones").select("name,status,due_date").eq("project_id", entityId),
    ]);
    lines.push("PROJECT:", JSON.stringify(p.data ?? {}));
    lines.push("MILESTONES:", JSON.stringify(ms.data ?? []));
    lines.push("TASKS:", JSON.stringify(tasks.data ?? []));
  } else if (capability === "low_stock_review") {
    const { data } = await supabase.from("inventory_stock")
      .select("quantity,product_id,warehouse_id,products:product_id(name,sku,low_stock_threshold)")
      .eq("org_id", orgId).limit(200);
    const low = (data ?? []).filter((r) => {
      const t = (r.products as { low_stock_threshold?: number } | null)?.low_stock_threshold ?? 0;
      return t > 0 && Number(r.quantity) <= t;
    });
    lines.push("LOW STOCK ITEMS:", JSON.stringify(low.slice(0, 30)));
  } else if (capability === "summarize_pipeline") {
    const [stages, deals] = await Promise.all([
      supabase.from("deal_stages").select("id,name,probability,is_won,is_lost").eq("org_id", orgId),
      supabase.from("deals").select("title,amount,currency,stage_id,expected_close_date,probability,status")
        .eq("org_id", orgId).limit(200),
    ]);
    lines.push("STAGES:", JSON.stringify(stages.data ?? []));
    lines.push("DEALS:", JSON.stringify(deals.data ?? []));
  } else if (capability === "draft_quote_notes" && entityId) {
    const [q, items] = await Promise.all([
      supabase.from("quotes").select("number,total,currency,notes,terms").eq("id", entityId).maybeSingle(),
      supabase.from("quote_items").select("description,quantity,unit_price,line_total").eq("quote_id", entityId),
    ]);
    lines.push("QUOTE:", JSON.stringify(q.data ?? {}));
    lines.push("ITEMS:", JSON.stringify(items.data ?? []));
  } else if (capability === "draft_followup_email" && entityId) {
    const [c, deals] = await Promise.all([
      supabase.from("contacts").select("first_name,last_name,email,job_title").eq("id", entityId).maybeSingle(),
      supabase.from("deals").select("title,amount,currency,probability,expected_close_date").eq("contact_id", entityId).limit(5),
    ]);
    lines.push("CONTACT:", JSON.stringify(c.data ?? {}));
    lines.push("RELATED DEALS:", JSON.stringify(deals.data ?? []));
  }

  // Fallback: the user is looking at a record — ground the answer in it.
  if (!lines.length && entityId && entityType) {
    const { buildEntityContext, ENTITY_TYPES } = await import("./context.server");
    if ((ENTITY_TYPES as readonly string[]).includes(entityType)) {
      const ctx = await buildEntityContext(
        supabase, orgId, entityType as (typeof ENTITY_TYPES)[number], entityId,
      );
      lines.push(`THE USER IS CURRENTLY VIEWING: ${ctx.label}`, ctx.text);
    }
  }

  // Free chat: always give the model a compact snapshot of the workspace.
  if (capability === "free_chat") {
    const { buildOrgSnapshot } = await import("./context.server");
    lines.push(await buildOrgSnapshot(supabase, orgId));
  }
  return lines.join("\n");
}

function systemPromptFor(capability: Capability, orgName: string): string {
  const base = `You are the Inuberry ERP assistant for the workspace "${orgName}". Be concise, accurate, and helpful. Use markdown. Never invent numbers — only summarize what's in the provided CONTEXT. If data is missing, say so.`;
  const extras: Record<Capability, string> = {
    free_chat: "Help the user navigate sales, invoicing, inventory, projects, HR, and accounting.",
    summarize_customer: "Produce a concise customer briefing: profile, billing health, deals, recommended next steps.",
    draft_followup_email: "Draft a polite, professional follow-up email. Output ONLY the email (Subject + body).",
    explain_overdue_invoices: "Explain overdue balances, group by customer, suggest collection actions.",
    summarize_project: "Summarize project status: progress, blockers, upcoming milestones, recommendations.",
    low_stock_review: "List low-stock items by urgency and suggest reorder priorities.",
    draft_quote_notes: "Write a short professional notes/terms block to attach to the quote.",
    summarize_pipeline: "Summarize pipeline health: stage distribution, weighted value, deals at risk.",
  };
  return `${base}\n\n${extras[capability]}`;
}

// Tools the assistant may use. Reads run at once; writes become approval cards in the chat
// (ai_proposed_actions, respecting each action's policy in AI actions).
const ASSISTANT_READS = ["crm_search_contacts", "crm_list_leads", "crm_list_deals", "invoice_search", "quote_search", "payment_list", "project_list", "inventory_check_stock"] as const;
const ASSISTANT_WRITES: Record<string, { tool?: string; args?: Record<string, string> }> = {
  create_lead: { tool: "crm_create_lead" },
  create_company: { tool: "crm_create_company" },
  create_contact: { tool: "crm_create_contact" },
  create_task: { tool: "task_create" },
  log_activity: { args: { title: "string", description: "string?", type: "call|email|meeting|task|follow_up|note?", entity_type: "contact|company|deal|lead?", entity_id: "uuid?" } },
  create_agent: { args: {
    name: "string", description: "string?", instructions: "string (what it does on every run, its rules and tone)",
    modules: "[{module: crm|sales|invoices|payments|inventory|purchasing|accounting|projects|hr|reports, read, create?, update?}]",
    tools: `string[] from: ${["crm_search_contacts", "crm_list_leads", "crm_list_deals", "crm_add_note", "crm_update_deal", "crm_create_lead", "invoice_search", "quote_search", "payment_list", "project_list", "project_summarize_status", "task_create", "inventory_check_stock", "report_generate_sales_summary", "report_generate_cashflow_summary", "notification_create", "send_email", "team_chat_post"].join(", ")}`,
    triggers: "[{type: manual} | {type: scheduled, config: {every: hour|day|weekday|week, at: HH:MM, day?: 0-6 (0 Sunday), tz?: IANA zone, prompt}} | {type: event_based, config: {event: alert.invoice_overdue|alert.deal_stale|alert.low_stock|alert.task_overdue|crm.lead|forms.form|support.support_ticket|sales.quote_response|invoices.paid|hr.leave_request, prompt}}]",
    activate: "boolean? (true to start it straight away)",
  } },
};
const MAX_TOOL_ROUNDS = 3;
// The newest messages go to the model word for word; older ones are folded into a running summary.
const RECENT_MESSAGES = 10;
const SUMMARY_BATCH = 10;
// The workspace snapshot (about a dozen queries) is reused for this long within a conversation.
const SNAPSHOT_MS = 5 * 60_000;

type ConvMemory = { summary: string | null; summarized_upto: string | null; snapshot: string | null; snapshot_at: string | null };

/**
 * Fold older messages into the conversation's summary once enough have built up. One cheap call
 * every SUMMARY_BATCH messages; nothing happens on most turns. Never blocks the answer on failure.
 */
async function refreshSummary(supabase: SB, orgId: string, userId: string, convId: string, mem: ConvMemory | null): Promise<string | null> {
  if (!mem) return null;
  try {
    const { data: older } = await supabase.from("ai_messages").select("role,content,created_at")
      .eq("conversation_id", convId).order("created_at", { ascending: false }).range(RECENT_MESSAGES, RECENT_MESSAGES + 39);
    const pending = (older ?? [])
      .filter((m) => (m.role === "user" || m.role === "assistant") && (!mem.summarized_upto || m.created_at > mem.summarized_upto))
      .reverse();
    if (pending.length < SUMMARY_BATCH) return mem.summary;
    const { runAiChat } = await import("./gateway.server");
    const transcript = pending.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 2000)}`).join("\n\n");
    const res = await runAiChat({
      orgId, userId, purpose: "summaries", temperature: 0.2,
      messages: [
        { role: "system", content: "You keep a short running summary of a chat between a user and their business assistant. Keep facts, names, numbers, decisions, open questions and what the user prefers. Drop greetings and filler. At most 200 words, plain sentences." },
        { role: "user", content: `${mem.summary ? `SUMMARY SO FAR:\n${mem.summary}\n\n` : ""}NEWER MESSAGES:\n${transcript}\n\nWrite the updated summary.` },
      ],
    });
    const summary = res.text.trim().slice(0, 4000);
    await supabase.from("ai_conversations").update({ summary, summarized_upto: pending[pending.length - 1].created_at }).eq("id", convId);
    return summary;
  } catch {
    return mem.summary;
  }
}

const GUIDE_RULES = `HELPING PEOPLE USE THE APP
- If the user asks how to do something, or seems stuck, confused or frustrated (repeated failures, "it doesn't work", complaints), stay calm and practical: say what is probably happening, then give short numbered steps with the exact menu path, and a markdown link to the page, e.g. [Settings › Email](/app/settings/email).
- If you can do it for them with a write tool, offer to (they approve it first).
- Use the RECENT ERRORS and CURRENT PAGE below to explain what just went wrong. Never blame the user.
- Only describe features listed in the APP GUIDE; if something isn't there, say it isn't available yet.

BUILDING AN AI AGENT WITH THE USER
- When someone wants something done again and again (chase overdue invoices, follow up quiet deals, a Monday summary, reorder stock), offer to set up an agent.
- Ask what you need, one short question at a time, at most four, skipping anything they already said: 1) what it should do and for whom, 2) which data it may read or change, 3) when it runs (on a schedule, when something happens, or only when they run it), 4) anything that must wait for their OK (sending email always does). Don't ask for a time zone or the exact minute: leave tz out (the workspace's time zone is used) and pick a sensible time (09:00) unless they gave one.
- Then call create_agent with a clear name, step-by-step instructions, only the modules and tools it needs, and the triggers. They approve the card before anything is created. Say they can also open it in the wizard to adjust: link /app/agents/new.
- Agents use the "AI agents" model from Settings › AI, one AI action per run; what they want to change waits in Inbox › Approvals.`;

function fieldSummary(args: Record<string, unknown>) {
  return Object.entries(args)
    .filter(([k, v]) => v != null && v !== "" && k !== "reason")
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ")
    .slice(0, 1500);
}

/** The approval card for a new agent: what it does, what it can touch, and when it runs. */
async function agentCardSummary(a: Record<string, unknown>) {
  const { normalizeAgentSpec, describeTrigger, USABLE_TOOLS } = await import("@/lib/agents/agent-spec");
  const { MODULE_LABELS } = await import("@/lib/agents/tool-registry");
  try {
    const s = normalizeAgentSpec(a as never);
    const access = (m: { module: string; create?: boolean; update?: boolean }) => `${MODULE_LABELS[m.module] ?? m.module} (${m.create || m.update ? "read and change" : "read"})`;
    return [
      s.instructions.slice(0, 600),
      `Data: ${s.modules.map(access).join(", ") || "none"}`,
      `Tools: ${s.tools.map((n) => USABLE_TOOLS.find((t) => t.name === n)?.label ?? n).join(", ") || "none"}`,
      `Runs: ${s.triggers.map(describeTrigger).join("; ")}`,
      s.activate ? "Starts active." : "Saved as a draft; activate it on its page.",
    ].join("\n").slice(0, 1900);
  } catch (e) {
    return e instanceof Error ? e.message : fieldSummary(a);
  }
}

/** What the streaming endpoint sends while the assistant works (see /api/ai/assistant). */
export type AssistantEvent =
  | { type: "status"; text: string }
  | { type: "delta"; text: string }
  | { type: "round" }
  | { type: "done"; result: AssistantResult };
export type AssistantResult = Awaited<ReturnType<typeof runAssistant>>;

export const aiAssistantSend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => AssistantInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: SB; userId: string };
    return runAssistant(supabase, userId, data);
  });

/** A "/command" turn: run its lookup, format the result, save both messages like a normal turn. */
async function runCommandTurn(
  supabase: SB, userId: string, data: z.infer<typeof AssistantInput>,
  command: NonNullable<ReturnType<typeof import("./commands").parseCommand>>,
  emit: (e: AssistantEvent) => void,
) {
  const { data: member } = await supabase.from("memberships").select("id")
    .eq("org_id", data.orgId).eq("user_id", userId).eq("status", "active").maybeSingle();
  if (!member) throw new Error("Not a member of this organization");
  let convId = data.conversationId ?? null;
  if (!convId) {
    const { data: c, error } = await supabase.from("ai_conversations").insert({
      org_id: data.orgId, user_id: userId, title: data.message.slice(0, 80),
      capability: data.capability ?? "free_chat", module: "assistant", context: {},
    }).select("id").single();
    if (error) throw error;
    convId = c.id;
  }
  await supabase.from("ai_messages").insert({ org_id: data.orgId, conversation_id: convId, role: "user", content: data.message });
  emit({ type: "status", text: "Looking that up…" });
  const { runCommand } = await import("./commands");
  const { executeAgentTool } = await import("@/lib/agents/tool-exec.server");
  let reply: string;
  let status: "completed" | "failed" = "completed";
  try {
    reply = await runCommand(command, (tool, args) => executeAgentTool(supabase, data.orgId, tool, args, userId));
  } catch (e) {
    status = "failed";
    reply = `_That lookup failed: ${e instanceof Error ? e.message : String(e)}_`;
  }
  emit({ type: "delta", text: reply });
  await supabase.from("ai_messages").insert({
    org_id: data.orgId, conversation_id: convId, role: "assistant", content: reply,
    model: "command", metadata: { command: command.name },
  });
  await supabase.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);
  return { conversationId: convId, reply, status, proposals: [] as { id: string; title: string; status: string }[] };
}

/** One assistant turn: prompt, tool rounds, saved messages. `emit` streams progress and text. */
export async function runAssistant(
  supabase: SB, userId: string, data: z.infer<typeof AssistantInput>,
  emit: (e: AssistantEvent) => void = () => {},
) {
    const capability: Capability = data.capability ?? "free_chat";

    // "/sales", "/low-stock"…: a fixed lookup, no model and no AI action (see commands.ts).
    const { parseCommand } = await import("./commands");
    const command = parseCommand(data.message);
    // "/new-agent …" is a normal assistant turn with a fuller message; the rest are lookups.
    if (command?.command?.rewrite) data = { ...data, message: command.command.rewrite(command.rest) };
    else if (command) return runCommandTurn(supabase, userId, data, command, emit);

    // Everything the prompt needs that doesn't depend on the conversation, fetched at once.
    const reuseSnapshot = capability === "free_chat" && !data.entityId && !!data.conversationId;
    const loadContext = () => buildContext(supabase, data.orgId, capability, data.entityId, data.entityType)
      .catch((e) => `Could not load context: ${e instanceof Error ? e.message : String(e)}`);
    // Without a snapshot to reuse, build the context alongside the rest of the setup.
    const earlyContext = reuseSnapshot ? null : loadContext();
    const [{ data: member }, { data: org }, { data: agents }, { data: memRow }, { APP_GUIDE }, { TOOL_REGISTRY, toolDescription }, toolLoop] = await Promise.all([
      supabase.from("memberships").select("id")
        .eq("org_id", data.orgId).eq("user_id", userId).eq("status", "active").maybeSingle(),
      supabase.from("organizations").select("name").eq("id", data.orgId).maybeSingle(),
      supabase.from("ai_agents").select("name,description,status")
        .eq("org_id", data.orgId).not("status", "in", "(archived,paused)").limit(15),
      // (Before database update 0043 these columns don't exist: the query fails and memory is skipped.)
      data.conversationId
        ? supabase.from("ai_conversations").select("summary,summarized_upto,snapshot,snapshot_at").eq("id", data.conversationId).maybeSingle()
        : Promise.resolve({ data: null }),
      import("./app-guide"),
      import("@/lib/agents/tool-registry"),
      import("@/lib/agents/tool-loop.server"),
    ]);
    if (!member) throw new Error("Not a member of this organization");
    // One AI action per message (refused when the month's allowance is used up).
    const { chargeAiAction } = await import("./usage.server");
    const charge = await chargeAiAction(supabase, data.orgId, "assistant", "assistant");
    const { actionsFrom, assistantTurn, stripActions, toolPrompt } = toolLoop;
    const mem = (memRow ?? null) as ConvMemory | null;
    const freshSnapshot = reuseSnapshot && mem?.snapshot && mem.snapshot_at && Date.now() - new Date(mem.snapshot_at).getTime() < SNAPSHOT_MS;
    const contextText = freshSnapshot ? mem!.snapshot! : await (earlyContext ?? loadContext());
    const orgName = (org as { name?: string } | null)?.name ?? "your workspace";
    const agentList = (agents ?? []).map((a) => `- ${a.name}${a.description ? `: ${a.description}` : ""}`).join("\n");

    // Conversation
    let convId = data.conversationId ?? null;
    if (!convId) {
      const { data: c, error } = await supabase.from("ai_conversations").insert({
        org_id: data.orgId, user_id: userId,
        title: data.message.slice(0, 80),
        capability, module: "assistant",
        context: data.entityId ? { entity_type: data.entityType, entity_id: data.entityId } : {},
      }).select("id").single();
      if (error) throw error;
      convId = c.id;
    }

    // History (a new conversation has none)
    const [{ data: rawHistory }, { data: pastProposals }] = data.conversationId
      ? await Promise.all([
        supabase.from("ai_messages")
          .select("role,content,metadata").eq("conversation_id", convId).order("created_at", { ascending: false }).limit(RECENT_MESSAGES)
          .then((r) => ({ ...r, data: (r.data ?? []).reverse() })),
        supabase.from("ai_proposed_actions").select("id,title,status").eq("conversation_id", convId),
        supabase.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId),
      ])
      : [{ data: [] as { role: string; content: string; metadata: unknown }[] }, { data: [] as { id: string; title: string; status: string }[] }];
    // Tell the model what happened to the actions it proposed, so it doesn't propose them again.
    const proposalById = new Map((pastProposals ?? []).map((p) => [p.id, p]));
    const history = (rawHistory ?? []).map((m) => {
      const ids = (m.metadata as { proposal_ids?: string[] } | null)?.proposal_ids ?? [];
      const lines = ids.map((id) => proposalById.get(id)).filter(Boolean)
        .map((p) => `- ${p!.title}: ${p!.status === "executed" ? "approved and done" : p!.status}`);
      return lines.length ? { ...m, content: `${m.content}\n\n[Action status]\n${lines.join("\n")}` } : m;
    });

    const reads = TOOL_REGISTRY.filter((t) => (ASSISTANT_READS as readonly string[]).includes(t.name));
    const tools = [
      ...reads.map((t) => ({ name: t.name, description: toolDescription(t), write: false, args: t.inputSchema })),
      ...Object.entries(ASSISTANT_WRITES).map(([key, w]) => {
        const def = w.tool ? TOOL_REGISTRY.find((t) => t.name === w.tool) : undefined;
        return { name: key, description: def?.description ?? "Log a call, email, meeting or note, optionally on a record.", write: true, args: w.args ?? def?.inputSchema };
      }),
    ];

    const situation = [
      data.currentPath ? `CURRENT PAGE: ${data.currentPath}` : "",
      data.recentErrors?.length ? `RECENT ERRORS SHOWN TO THE USER (newest last):\n${data.recentErrors.map((e) => `- ${e}`).join("\n")}` : "",
      agentList ? `THE USER'S AI AGENTS (they can pick one at the top of this panel to talk to it directly):\n${agentList}` : "",
    ].filter(Boolean).join("\n\n");

    const summary = data.conversationId ? await refreshSummary(supabase, data.orgId, userId, convId!, mem) : null;
    if (reuseSnapshot && mem && !freshSnapshot && contextText && !contextText.startsWith("Could not load")) {
      await supabase.from("ai_conversations").update({ snapshot: contextText, snapshot_at: new Date().toISOString() }).eq("id", convId);
    }

    // Two system messages: what stays the same every turn first (so providers can cache it), then
    // what changes (page, summary, current data).
    const staticPrompt = systemPromptFor(capability, orgName) +
      (capability === "free_chat" ? `\n\n${GUIDE_RULES}\n\nAPP GUIDE:\n${APP_GUIDE}` : "") +
      toolPrompt(tools);
    const dynamicPrompt = [
      situation,
      summary ? `EARLIER IN THIS CONVERSATION (summary; the latest messages follow word for word):\n${summary}` : "",
      contextText ? `CONTEXT (current data, do not invent beyond this):\n${contextText}` : "",
    ].filter(Boolean).join("\n\n");

    const messages: ChatMsg[] = [
      { role: "system", content: staticPrompt },
      ...(dynamicPrompt ? [{ role: "system" as const, content: dynamicPrompt }] : []),
      ...(history ?? []).filter(m => m.role === "user" || m.role === "assistant")
        .map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user", content: data.message },
    ];

    // Persist user message
    await supabase.from("ai_messages").insert({
      org_id: data.orgId, conversation_id: convId, role: "user", content: data.message,
    });

    let reply = "";
    let status: "completed" | "failed" = "completed";
    let errorMsg: string | null = null;
    let usedModel = DEFAULT_MODEL;
    const proposals: { id: string; title: string; status: string }[] = [];
    // Each tool call and whether it worked, saved with the reply for /ai-stats.
    const toolLog: { tool: string; ok: boolean }[] = [];

    try {
      const { runAiChat } = await import("./gateway.server");
      const { executeAgentTool } = await import("@/lib/agents/tool-exec.server");
      const { proposeAction, ACTION_LABELS } = await import("./entity-ai.functions");

      for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        if (round > 0) emit({ type: "round" });
        const result = await runAiChat({
          orgId: data.orgId, userId, purpose: "assistant", messages, temperature: 0.4, tools,
          onDelta: (text) => emit({ type: "delta", text }),
        });
        usedModel = result.model;
        const actions = actionsFrom(result);
        if (!actions.length || round === MAX_TOOL_ROUNDS) {
          reply = stripActions(result.text) || result.text;
          break;
        }

        const results: string[] = [];
        const proposedNow: string[] = [];
        emit({ type: "status", text: actions.some((x) => (ASSISTANT_READS as readonly string[]).includes(x.tool)) ? "Looking that up…" : "Preparing the changes for you to approve…" });
        for (const act of actions) {
          if ((ASSISTANT_READS as readonly string[]).includes(act.tool)) {
            const res = await executeAgentTool(supabase, data.orgId, act.tool, act.args, userId);
            toolLog.push({ tool: act.tool, ok: res?.status !== "error" });
            results.push(`TOOL RESULT for ${act.tool}:\n${JSON.stringify(res).slice(0, 12000)}`);
          } else if (act.tool in ASSISTANT_WRITES) {
            const key = act.tool as keyof typeof ACTION_LABELS;
            const a = act.args as Record<string, unknown>;
            const what = String(a.name ?? a.title ?? [a.first_name, a.last_name].filter(Boolean).join(" ")).trim();
            const title = `${ACTION_LABELS[key]}${what ? `: ${what}` : ""}`.slice(0, 200);
            try {
              const summary = key === "create_agent" ? await agentCardSummary(a) : fieldSummary(a);
              const p = await proposeAction(supabase, userId, {
                orgId: data.orgId, actionKey: key, title, summary, payload: a,
                conversationId: convId ?? undefined,
                ...(data.entityId ? { entityType: data.entityType, entityId: data.entityId } : {}),
              });
              proposals.push({ id: p.id, title, status: p.status });
              toolLog.push({ tool: act.tool, ok: true });
              proposedNow.push(p.status === "executed" ? `- ${title} (done)` : `- ${title}`);
            } catch (e) {
              toolLog.push({ tool: act.tool, ok: false });
              results.push(`TOOL RESULT for ${act.tool}: refused — ${e instanceof Error ? e.message : String(e)}`);
            }
          } else {
            toolLog.push({ tool: act.tool, ok: false });
            results.push(`TOOL RESULT for ${act.tool}: error — no such tool.`);
          }
        }

        if (!results.length) {
          let intro = stripActions(result.text);
          if (!intro && round > 0) {
            // It looked something up, then only proposed a change with no text: ask once more, without
            // tools, for the answer it skipped.
            messages.push({ role: "assistant", content: assistantTurn(result) });
            messages.push({ role: "user", content: `(Proposed for the user to approve: ${proposals.map((p) => p.title).join(", ")}.) Now answer the rest of the user's message in plain text. Don't call tools.` });
            emit({ type: "round" });
            const answer = await runAiChat({
              orgId: data.orgId, userId, purpose: "assistant", messages, temperature: 0.4,
              onDelta: (text) => emit({ type: "delta", text }),
            });
            intro = stripActions(answer.text);
          }
          const pending = proposals.some((p) => p.status === "pending");
          reply = `${intro ? intro + "\n\n" : ""}${pending ? "Here's what I'll do once you approve it below:" : "Done:"}\n${proposedNow.join("\n")}`;
          break;
        }
        messages.push({ role: "assistant", content: assistantTurn(result) });
        messages.push({ role: "user", content: `${results.join("\n\n")}\n\nNow answer the user, or call another tool if needed.` });
      }
    } catch (e) {
      status = "failed";
      errorMsg = e instanceof Error ? e.message : String(e);
      if (!reply) await charge.refund().catch(() => {});
      reply = `_Assistant error: ${errorMsg}_`;
    }

    // Persist assistant message
    await supabase.from("ai_messages").insert({
      org_id: data.orgId, conversation_id: convId, role: "assistant", content: reply,
      model: usedModel, metadata: { capability, proposal_ids: proposals.map((p) => p.id), tool_calls: toolLog },
    });

    // Log action
    await supabase.from("ai_actions").insert({
      org_id: data.orgId, user_id: userId, conversation_id: convId,
      module: "assistant", capability,
      prompt: data.message, output: reply,
      entity_type: data.entityType ?? null, entity_id: data.entityId ?? null,
      action_status: status, model: usedModel, error: errorMsg,
    });

    return { conversationId: convId, reply, status, proposals };
}
