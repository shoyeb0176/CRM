// AI Agent runtime — calls the org's configured AI provider (via the gateway)
// with the agent's system prompt + conversation.
//
// Tool calling: the model answers with an ```action {"tool","args","reason"}```
// block. Read-only tools (readOnly && !requiresApproval) run immediately and
// the result is fed back to the model (max 3 rounds). Any other tool is
// returned as a proposal; the client records it as a pending approval so a
// human decides before anything is written.

import { z } from "zod";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { TOOL_REGISTRY, isWriteTool, toolDescription } from "./tool-registry";
import { actionsFrom, assistantTurn, stripActions, toolPrompt, type ToolSpec } from "./tool-loop.server";

const Input = z.object({
  orgId: z.string().uuid(),
  agentId: z.string().uuid(),
  runId: z.string().uuid(),
  systemPrompt: z.string().default(""),
  prompt: z.string().min(1).max(16000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).default([]),
  availableTools: z.array(z.string()).default([]),
});

export type AgentToolCall = { tool: string; args: Record<string, any>; result: any };
export type AgentProposal = { tool: string; args: Record<string, any>; reason: string };

type Result =
  | { ok: true; reply: string; tokens: number | null; model: string; toolCalls: AgentToolCall[]; proposals: AgentProposal[] }
  | { ok: false; error: string };

const MAX_TOOL_ROUNDS = 3;

/** One agent turn: the model, read tools run at once, write tools returned as proposals. */
export async function agentTurn(supabase: unknown, userId: string, data: z.infer<typeof Input>): Promise<Result> {
    // Membership of the person it runs for (the signed-in user, or the owner for scheduled runs).
    const sb = supabase as unknown as { from: (t: string) => any };
    const { data: member } = await sb.from("memberships").select("id")
      .eq("org_id", data.orgId).eq("user_id", userId).eq("status", "active").maybeSingle();
    if (!member) return { ok: false, error: "Not a member of this organization" };

    const tools = TOOL_REGISTRY.filter((t) => data.availableTools.includes(t.name));
    const specs: ToolSpec[] = tools.map((t) => ({
      name: t.name, description: toolDescription(t), write: isWriteTool(t), args: t.inputSchema,
    }));
    const toolBlurb = toolPrompt(specs);

    const system = `${data.systemPrompt || "You are an AI assistant operating inside Inuberry ERP."}${toolBlurb}\n\nBe concise, accurate, and actionable. Use markdown. Never invent data.`;

    const { runAiChat } = await import("@/lib/ai/gateway.server");
    const { executeAgentTool } = await import("./tool-exec.server");

    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: system },
      ...data.history,
      { role: "user", content: data.prompt },
    ];
    const toolCalls: AgentToolCall[] = [];
    const proposals: AgentProposal[] = [];
    let tokens = 0;
    let model = "";

    try {
      for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        const result = await runAiChat({ orgId: data.orgId, userId, purpose: "agents", messages, tools: specs });
        tokens += result.totalTokens ?? 0;
        model = result.model;
        const actions = actionsFrom(result);
        if (!actions.length || round === MAX_TOOL_ROUNDS) {
          return { ok: true, reply: stripActions(result.text) || result.text, tokens: tokens || null, model, toolCalls, proposals };
        }

        const reads: string[] = [];
        for (const act of actions) {
          const def = tools.find((t) => t.name === act.tool);
          if (!def) {
            reads.push(`TOOL RESULT for ${act.tool}: error — tool not available to this agent.`);
          } else if (!isWriteTool(def)) {
            const res = await executeAgentTool(supabase, data.orgId, def.name, act.args);
            toolCalls.push({ tool: def.name, args: act.args, result: res });
            reads.push(`TOOL RESULT for ${def.name}:\n${JSON.stringify(res).slice(0, 12000)}`);
          } else {
            proposals.push({ tool: def.name, args: act.args, reason: act.reason });
          }
        }

        if (!reads.length) {
          const list = proposals.map((p) => `- **${p.tool}**${p.reason ? ` — ${p.reason}` : ""}`).join("\n");
          let intro = stripActions(result.text);
          if (!intro && round > 0) {
            // It looked something up, then only queued a change with no text: ask once more, without
            // tools, for the answer it skipped.
            messages.push({ role: "assistant", content: assistantTurn(result) });
            messages.push({ role: "user", content: `(Queued for human approval: ${proposals.map((p) => p.tool).join(", ")}.) Now answer the rest of the original question in plain text. Don't call tools.` });
            const answer = await runAiChat({ orgId: data.orgId, userId, purpose: "agents", messages });
            tokens += answer.totalTokens ?? 0;
            intro = stripActions(answer.text);
          }
          return {
            ok: true,
            reply: `${intro ? intro + "\n\n" : ""}I've proposed the following action${proposals.length > 1 ? "s" : ""}. ${proposals.length > 1 ? "They are" : "It is"} waiting for approval in Inbox › Approvals:\n${list}`,
            tokens: tokens || null, model, toolCalls, proposals,
          };
        }

        messages.push({ role: "assistant", content: assistantTurn(result) });
        messages.push({
          role: "user",
          content: `${reads.join("\n\n")}${proposals.length ? `\n\n(Write actions queued for human approval: ${proposals.map((p) => p.tool).join(", ")})` : ""}\n\nNow answer the original question using these results, or call another tool if needed.`,
        });
      }
      return { ok: false, error: "Agent stopped without an answer" };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "AI provider error" };
    }
}
