// Shared by the agent runtime and the assistant. Tools go to the model through the provider's own
// tool calling (OpenAI-style `tools`, Anthropic `tools`); for models without it, the model can still
// ask for a tool with a fenced block:
//   ```action
//   { "tool": "<name>", "args": { ... }, "reason": "..." }
//   ```
// Read tools run at once and their result is fed back; write tools become proposals a person approves.

export type ToolCallRequest = { tool: string; args: Record<string, unknown>; reason: string };
export type ToolSpec = { name: string; description: string; write: boolean; args?: Record<string, string> };

export function parseActions(text: string): ToolCallRequest[] {
  const out: ToolCallRequest[] = [];
  const re = /```action\s*([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    try {
      const j = JSON.parse(m[1].trim());
      if (j && typeof j.tool === "string") {
        out.push({ tool: j.tool, args: (j.args && typeof j.args === "object") ? j.args : {}, reason: String(j.reason ?? "") });
      }
    } catch { /* ignore a malformed block */ }
  }
  return out;
}

export function stripActions(text: string) {
  return text.replace(/```action\s*[\s\S]*?```/g, "").trim();
}

/** The model's tool requests: native tool calls when it made any, else fenced blocks in its text. */
export function actionsFrom(result: { text: string; toolCalls?: ToolCallRequest[] }) {
  return result.toolCalls?.length ? result.toolCalls : parseActions(result.text);
}

/** What to put back in the history for the model's turn, so it remembers which tools it called. */
export function assistantTurn(result: { text: string; toolCalls?: ToolCallRequest[] }) {
  if (!result.toolCalls?.length) return result.text;
  const calls = result.toolCalls.map((c) => `- ${c.tool} ${JSON.stringify(c.args)}`).join("\n");
  return `${result.text ? result.text + "\n\n" : ""}[I called these tools]\n${calls}`;
}

/**
 * JSON Schema for a tool's arguments from the registry's short hints:
 * "string", "uuid?", "number", "YYYY-MM-DD?", "low|medium|high?" (a trailing ? = optional).
 */
export function toolSchema(spec: ToolSpec) {
  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];
  for (const [key, hint] of Object.entries(spec.args ?? {})) {
    const optional = /\?/.test(hint);
    const h = hint.replace(/\?.*$/, "").trim();
    if (/^number/.test(h)) properties[key] = { type: "number" };
    else if (/^[a-z_]+(\|[a-z_]+)+$/.test(h)) properties[key] = { type: "string", enum: h.split("|") };
    else properties[key] = { type: "string", ...(h === "uuid" ? { format: "uuid" } : {}), ...(/YYYY/.test(h) ? { description: h } : {}) };
    if (/\(.+\)/.test(hint)) properties[key].description = hint.replace(/^[^(]*\(|\)$/g, "");
    if (!optional) required.push(key);
  }
  properties.reason = { type: "string", description: "One line on why you're calling this" };
  return { type: "object", properties, required };
}

/** The tool section of a system prompt. */
export function toolPrompt(tools: ToolSpec[]): string {
  if (!tools.length) return "";
  const lines = tools.map((t) => {
    const kind = t.write ? "write — the user approves it before it runs" : "read — runs immediately, you get the result";
    return `- ${t.name} (${kind}): ${t.description}${t.args ? ` args: ${JSON.stringify(t.args)}` : ""}`;
  });
  return `\n\nAVAILABLE TOOLS:\n${lines.join("\n")}\n\nCall tools with your tool-calling feature. Only if you can't call tools, include one block per call instead:\n\`\`\`action\n{ "tool": "<name>", "args": { ... }, "reason": "..." }\n\`\`\`\n- Read tools: you then receive the TOOL RESULT and can answer or call another tool. Always look data up with a read tool instead of guessing.\n- Write tools: propose every write the request needs in the same reply, one call each, in the order they should run (e.g. a company before its contact). The user approves each one before it runs.\n- Answer the rest of the user's message as normal text in the same reply.\n- Ask for any required field you don't have (e.g. which project a task belongs to) instead of inventing it.`;
}
