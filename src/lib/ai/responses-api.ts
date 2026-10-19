// OpenAI's Responses API, used for OpenAI reasoning models (gpt-5 / gpt-6 family, o-series). On Chat
// Completions, GPT-6 Luna and Sol only take tools with reasoning turned off; through Responses they
// can reason while they use tools (developers.openai.com/api/docs/guides/latest-model). Pure
// helpers: the gateway does the HTTP call and falls back to Chat Completions if this is refused.

export type RMessage = { role: "system" | "user" | "assistant"; content: string };
export type RTool = { name: string; description: string; parameters: Record<string, unknown> };
export type RCall = { name: string; args: Record<string, unknown> };
export type RParsed = { text: string; calls: RCall[]; inputTokens: number | null; outputTokens: number | null; cachedTokens: number | null };

export function responsesBody(opts: {
  model: string; messages: RMessage[]; tools?: RTool[]; effort?: string | null;
  maxOutputTokens?: number | null; cacheKey?: string; stream?: boolean;
}): Record<string, unknown> {
  // The parts that don't change between turns lead the prompt, so the provider can cache them.
  const instructions = opts.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const body: Record<string, unknown> = {
    model: opts.model,
    input: opts.messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content })),
    store: false,
  };
  if (instructions) body.instructions = instructions;
  if (opts.tools?.length) body.tools = opts.tools.map((t) => ({ type: "function", name: t.name, description: t.description, parameters: t.parameters }));
  if (opts.effort) body.reasoning = { effort: opts.effort };
  if (opts.maxOutputTokens) body.max_output_tokens = opts.maxOutputTokens;
  if (opts.cacheKey) body.prompt_cache_key = opts.cacheKey;
  if (opts.stream) body.stream = true;
  return body;
}

type OutItem = { type?: string; name?: string; arguments?: string; content?: Array<{ type?: string; text?: string }> };
type Usage = { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } };

function args(raw: string | undefined): Record<string, unknown> {
  try { return JSON.parse(raw || "{}"); } catch { return {}; } // malformed arguments: call with none
}

/** A finished response: its text, the functions it wants called, and the token counts. */
export function parseResponses(json: { output?: OutItem[]; usage?: Usage }): RParsed {
  const out = json.output ?? [];
  const text = out.filter((o) => o.type === "message")
    .flatMap((o) => o.content ?? []).filter((c) => c.type === "output_text").map((c) => c.text ?? "").join("").trim();
  const calls = out.filter((o) => o.type === "function_call" && o.name).map((o) => ({ name: o.name!, args: args(o.arguments) }));
  return {
    text, calls,
    inputTokens: json.usage?.input_tokens ?? null,
    outputTokens: json.usage?.output_tokens ?? null,
    cachedTokens: json.usage?.input_tokens_details?.cached_tokens ?? null,
  };
}

/** Folds one streamed event into the running result; text pieces go to onDelta as they arrive. */
export function foldResponsesEvent(acc: RParsed, ev: { type?: string; delta?: string; item?: OutItem; response?: { usage?: Usage } }, onDelta: (t: string) => void) {
  if (ev.type === "response.output_text.delta" && ev.delta) {
    acc.text += ev.delta;
    onDelta(ev.delta);
  } else if (ev.type === "response.output_item.done" && ev.item?.type === "function_call" && ev.item.name) {
    acc.calls.push({ name: ev.item.name, args: args(ev.item.arguments) });
  } else if (ev.type === "response.completed" && ev.response?.usage) {
    const u = ev.response.usage;
    acc.inputTokens = u.input_tokens ?? null;
    acc.outputTokens = u.output_tokens ?? null;
    acc.cachedTokens = u.input_tokens_details?.cached_tokens ?? null;
  } else if (ev.type === "response.failed" || ev.type === "error") {
    throw new Error("The AI provider stopped the answer.");
  }
  return acc;
}
