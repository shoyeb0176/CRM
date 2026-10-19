// Inuberry AI Gateway — model-agnostic server-side entry point for every AI call.
//
// Application code asks for a logical capability (purpose) for an organization;
// the gateway resolves which provider/model that org has configured, decrypts
// the credential (service-role only), calls the provider, logs usage and cost,
// and returns a normalized result. No business code talks to a vendor SDK.

export type AiPurpose = "assistant" | "summaries" | "classification" | "agents" | "embeddings";

export type ProviderKind =
  | "lovable"
  | "openai"
  | "anthropic"
  | "google"
  | "azure_openai"
  | "openai_compatible";

import { toolSchema, type ToolCallRequest, type ToolSpec } from "@/lib/agents/tool-loop.server";
import { foldResponsesEvent, parseResponses, responsesBody, type RParsed } from "@/lib/ai/responses-api";
import { PROVIDER_DEFAULT_MODEL as OWN_DEFAULTS, ownProviderModel } from "@/lib/ai/models";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type AiResult = {
  text: string;
  /** Tools the model asked for through native tool calling (empty when it used none). */
  toolCalls?: ToolCallRequest[];
  provider: ProviderKind;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  costUsd: number | null;
  durationMs: number;
};

export const BUILTIN_MODELS = [
  "openai/gpt-6-astra",
  "openai/gpt-5.6-terra",
  "openai/gpt-5.6-luna",
  "google/gemini-3.8-flash",
  "google/gemini-3.1-flash-lite",
] as const;

export const DEFAULT_BUILTIN_MODEL = "google/gemini-3.8-flash";

export const PROVIDER_DEFAULT_MODEL: Record<ProviderKind, string> = { lovable: DEFAULT_BUILTIN_MODEL, ...OWN_DEFAULTS };

// Rough USD per 1M tokens, used for indicative cost reporting only.
// `cached` is the price of input tokens served from the provider's prompt cache, when it differs.
const PRICE_PER_MTOK: Record<string, { in: number; out: number; cached?: number }> = {
  "gpt-6-luna": { in: 0.1, cached: 0.01, out: 0.5 }, // developers.openai.com/api/docs/models/gpt-6-luna
  "openai/gpt-6-astra": { in: 2.5, out: 10 },
  "openai/gpt-5.6-terra": { in: 1, out: 4 },
  "openai/gpt-5.6-luna": { in: 0.2, out: 0.8 },
  "google/gemini-3.8-flash": { in: 0.15, out: 0.6 },
  "google/gemini-3.1-flash-lite": { in: 0.05, out: 0.2 },
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "gemini-3.8-flash": { in: 0.15, out: 0.6 },
};

function estimateCost(model: string, inTok: number | null, outTok: number | null, cachedTok: number | null = null): number | null {
  const p = PRICE_PER_MTOK[model];
  if (!p || inTok == null || outTok == null) return null;
  const cached = Math.min(cachedTok ?? 0, inTok);
  const inCost = ((inTok - cached) * p.in + cached * (p.cached ?? p.in)) / 1_000_000;
  return Number((inCost + (outTok / 1_000_000) * p.out).toFixed(6));
}

type ResolvedTarget = {
  /** org = the company's own provider; instance = this install's default (env); lovable = Lovable AI gateway. */
  source: "org" | "instance" | "lovable";
  provider: ProviderKind;
  model: string;
  baseUrl: string | null;
  apiKey: string | null;
  providerConfigId: string | null;
  maxOutputTokens: number | null;
  /** Built-in AI only: the providers to try next if this one fails. */
  fallbacks?: ResolvedTarget[];
  /** Set after the Responses API refused a request: use Chat Completions for this call. */
  chatOnly?: boolean;
};

export class AiGatewayError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/**
 * The install's built-in AI, in the order it is tried: OpenAI (OPENAI_API_KEY), then any
 * OpenAI-compatible endpoint (OPENROUTER_API_KEY, OpenRouter by default), then the Lovable AI
 * gateway. If one fails, runAiChat tries the next. Env is read per call: Workers bind env per request.
 */
export function instanceTargets(routeModel: string | null | undefined, maxOutputTokens: number | null): ResolvedTarget[] {
  const chain: ResolvedTarget[] = [];
  const openaiKey = process.env["OPENAI_API_KEY"];
  if (openaiKey) {
    chain.push({
      source: "instance", provider: "openai",
      model: process.env["OPENAI_MODEL"] || PROVIDER_DEFAULT_MODEL.openai,
      baseUrl: null, apiKey: openaiKey, providerConfigId: null, maxOutputTokens,
    });
  }
  const routerKey = process.env["OPENROUTER_API_KEY"];
  if (routerKey) {
    chain.push({
      source: "instance", provider: "openai_compatible",
      model: process.env["OPENROUTER_MODEL"] || routeModel || DEFAULT_BUILTIN_MODEL,
      baseUrl: process.env["OPENROUTER_BASE_URL"] || "https://openrouter.ai/api/v1",
      apiKey: routerKey, providerConfigId: null, maxOutputTokens,
    });
  }
  if (process.env["LOVABLE_API_KEY"] || !chain.length) chain.push(lovableTarget(routeModel, maxOutputTokens));
  return chain;
}

function builtinTarget(routeModel: string | null | undefined, maxOutputTokens: number | null): ResolvedTarget {
  const [first, ...fallbacks] = instanceTargets(routeModel, maxOutputTokens);
  return { ...first, fallbacks };
}

function lovableTarget(routeModel: string | null | undefined, maxOutputTokens: number | null): ResolvedTarget {
  const model = routeModel && (BUILTIN_MODELS as readonly string[]).includes(routeModel) ? routeModel : DEFAULT_BUILTIN_MODEL;
  return {
    source: "lovable",
    provider: "lovable",
    model,
    baseUrl: null,
    apiKey: process.env["LOVABLE_API_KEY"] ?? null,
    providerConfigId: null,
    maxOutputTokens,
  };
}

/** True when this purpose runs on the workspace's own provider and key (those calls don't use AI actions). */
export async function usesOwnKey(orgId: string, purpose: AiPurpose): Promise<boolean> {
  const db = await admin();
  const [{ data: route }, { data: policy }] = await Promise.all([
    db.from("ai_model_routes").select("provider_config_id").eq("org_id", orgId).eq("purpose", purpose).maybeSingle(),
    db.from("ai_org_policies").select("default_provider_config_id").eq("org_id", orgId).maybeSingle(),
  ]);
  const configId = route?.provider_config_id ?? policy?.default_provider_config_id ?? null;
  if (!configId) return false;
  const { data: cfg } = await db.from("ai_provider_configs").select("provider, is_enabled, org_id").eq("id", configId).maybeSingle();
  return !!cfg && cfg.org_id === orgId && cfg.is_enabled && cfg.provider !== "lovable";
}

/** Resolve which provider + model an org uses for a purpose. */
export async function resolveTarget(orgId: string, purpose: AiPurpose): Promise<ResolvedTarget> {
  const db = await admin();

  const [{ data: route }, { data: policy }] = await Promise.all([
    db.from("ai_model_routes").select("model, provider_config_id, max_output_tokens")
      .eq("org_id", orgId).eq("purpose", purpose).maybeSingle(),
    db.from("ai_org_policies").select("allow_builtin, default_provider_config_id, own_provider_only_modules")
      .eq("org_id", orgId).maybeSingle(),
  ]);

  const configId = route?.provider_config_id ?? policy?.default_provider_config_id ?? null;

  if (!configId) {
    if (policy && policy.allow_builtin === false) {
      throw new AiGatewayError(
        "This workspace requires its own AI provider, but none is configured. Add one in Settings → AI.",
        400,
      );
    }
    return builtinTarget(route?.model, route?.max_output_tokens ?? null);
  }

  const { data: cfg } = await db.from("ai_provider_configs")
    .select("id, org_id, provider, base_url, is_enabled").eq("id", configId).maybeSingle();

  if (!cfg || cfg.org_id !== orgId || !cfg.is_enabled) {
    throw new AiGatewayError("The configured AI provider is unavailable. Check Settings → AI.", 400);
  }

  const provider = cfg.provider as ProviderKind;
  if (provider === "lovable") {
    // "Built-in AI" chosen explicitly: same as having no provider, so the same policy applies.
    if (policy && policy.allow_builtin === false) {
      throw new AiGatewayError("This workspace requires its own AI provider. Choose one in Settings → AI.", 400);
    }
    return builtinTarget(route?.model, route?.max_output_tokens ?? null);
  }

  const { data: secret } = await db.from("ai_provider_secrets")
    .select("api_key").eq("provider_config_id", cfg.id).maybeSingle();
  let apiKey: string | null = null;
  if (secret?.api_key) {
    const { decryptSecret } = await import("@/lib/crypto.server");
    try {
      apiKey = await decryptSecret(secret.api_key);
    } catch (e) {
      throw new AiGatewayError(e instanceof Error ? e.message : "Could not read the saved AI key.", 500);
    }
  }
  // OpenAI-compatible endpoints (e.g. a local model server) may not need a key.
  if (!apiKey && provider !== "openai_compatible") {
    throw new AiGatewayError("No API key saved for the selected AI provider.", 400);
  }

  const ownModel = ownProviderModel(provider, route?.model);
  if (!ownModel) {
    throw new AiGatewayError(provider === "azure_openai"
      ? "Enter your Azure OpenAI deployment name as the model in Settings → AI."
      : "Enter a model name for this provider in Settings → AI.", 400);
  }
  return {
    source: "org",
    provider,
    model: ownModel,
    baseUrl: cfg.base_url,
    apiKey,
    providerConfigId: cfg.id,
    maxOutputTokens: route?.max_output_tokens ?? null,
  };
}

type Endpoint = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

/**
 * Optional request extras for cheaper repeated prompts: OpenAI's prompt_cache_key (groups a workspace's
 * calls so the shared start of the prompt is reused), Anthropic cache markers, and streamed usage.
 * A provider that rejects one of them gets the call again without extras.
 */
type Extras = { cacheKey?: string; lean?: boolean; streaming?: boolean; effort?: string };

/**
 * How hard a reasoning model (OpenAI gpt-5 / gpt-6 family, o-series) thinks, per job. Cheap and quick
 * for summaries and labels, a little more for agents that chain tools. Override in the server's
 * secrets with OPENAI_REASONING_EFFORT (every job) or OPENAI_REASONING_EFFORT_AGENTS etc.
 */
const DEFAULT_EFFORT: Record<AiPurpose, string | null> = {
  assistant: "low", summaries: "low", classification: "low", agents: "medium", embeddings: null,
};
export function effortFor(purpose: AiPurpose): string | null {
  return process.env[`OPENAI_REASONING_EFFORT_${purpose.toUpperCase()}`]
    || process.env["OPENAI_REASONING_EFFORT"] || DEFAULT_EFFORT[purpose];
}
const isReasoningModel = (model: string) => /gpt-(5|6)|^o\d/i.test(model);
/**
 * The effort a request is sent with. OpenAI's GPT-6 Luna and Sol accept tools on Chat Completions
 * only with reasoning_effort "none" (developers.openai.com/api/docs/guides/latest-model), so calls
 * that carry tools use "none"; the rest use the job's effort.
 */
export function requestEffort(model: string, hasTools: boolean, effort: string | undefined): string | undefined {
  if (!isReasoningModel(model)) return undefined;
  if (hasTools && /gpt-6(\.\d+)?-(luna|sol)/i.test(model)) return "none";
  return effort;
}

function buildRequest(t: ResolvedTarget, messages: ChatMessage[], temperature: number, tools?: ToolSpec[], extras: Extras = {}): Endpoint {
  const maxTokens = t.maxOutputTokens ?? undefined;

  if (t.provider === "anthropic") {
    const systems = messages.filter((m) => m.role === "system").map((m) => m.content);
    const rest = messages.filter((m) => m.role !== "system");
    // The first system message is the part that doesn't change between turns: mark it for caching.
    const system = extras.lean ? systems.join("\n\n") || undefined
      : systems.map((text, i) => (i === 0 ? { type: "text", text, cache_control: { type: "ephemeral" } } : { type: "text", text }));
    return {
      url: `${(t.baseUrl || "https://api.anthropic.com").replace(/\/$/, "")}/v1/messages`,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": t.apiKey ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: {
        model: t.model,
        system: Array.isArray(system) && !system.length ? undefined : system,
        max_tokens: maxTokens ?? 2048,
        temperature,
        messages: rest.map((m) => ({ role: m.role, content: m.content })),
        ...(tools?.length ? { tools: tools.map((x) => ({ name: x.name, description: x.description, input_schema: toolSchema(x) })) } : {}),
      },
    };
  }

  const isGpt5Plus = /gpt-(5|6)/.test(t.model);
  // Some OpenAI-style endpoints accept only one system message. Joined in order, the unchanging part
  // still leads the prompt, which is all their prefix caching needs.
  const systemText = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const body: Record<string, unknown> = {
    model: t.model,
    messages: [...(systemText ? [{ role: "system", content: systemText }] : []), ...messages.filter((m) => m.role !== "system")],
  };
  if (!isGpt5Plus) body["temperature"] = temperature;
  if (maxTokens) body[isGpt5Plus ? "max_completion_tokens" : "max_tokens"] = maxTokens;
  if (tools?.length) {
    body.tools = tools.map((x) => ({ type: "function", function: { name: x.name, description: x.description, parameters: toolSchema(x) } }));
  }
  if (!extras.lean) {
    const effort = (t.provider === "openai" || t.provider === "azure_openai")
      ? requestEffort(t.model, !!tools?.length, extras.effort) : undefined;
    if (effort) body.reasoning_effort = effort;
    if (extras.streaming && t.provider !== "google") body.stream_options = { include_usage: true };
    if (extras.cacheKey && t.provider === "openai" && !t.baseUrl) body.prompt_cache_key = extras.cacheKey;
  }

  switch (t.provider) {
    case "lovable":
      return {
        url: "https://ai.gateway.lovable.dev/v1/chat/completions",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": t.apiKey ?? "",
          "X-Lovable-AIG-SDK": "fetch",
        },
        body,
      };
    case "openai":
      return {
        url: `${(t.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "")}/chat/completions`,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t.apiKey}` },
        body,
      };
    case "google":
      return {
        url: `${(t.baseUrl || "https://generativelanguage.googleapis.com/v1beta/openai").replace(/\/$/, "")}/chat/completions`,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t.apiKey}` },
        body,
      };
    case "azure_openai": {
      const base = (t.baseUrl || "").replace(/\/$/, "");
      if (!base) throw new AiGatewayError("Azure OpenAI needs an endpoint URL.", 400);
      const url = base.includes("?") ? base : `${base}/chat/completions?api-version=2024-08-01-preview`;
      return { url, headers: { "Content-Type": "application/json", "api-key": t.apiKey ?? "" }, body };
    }
    case "openai_compatible": {
      const base = (t.baseUrl || "").replace(/\/$/, "");
      if (!base) throw new AiGatewayError("This provider needs a base URL.", 400);
      return {
        url: `${base}/chat/completions`,
        headers: {
          "Content-Type": "application/json",
          ...(t.apiKey ? { Authorization: `Bearer ${t.apiKey}` } : {}),
        },
        body,
      };
    }
    default:
      throw new AiGatewayError("Unsupported AI provider.", 400);
  }
}

/**
 * Read an OpenAI-style server-sent-events answer: text pieces go to onDelta as they come; tool calls
 * arrive in fragments (name first, then the arguments a few characters at a time) and are joined.
 */
async function readStream(res: Response, onDelta: (t: string) => void, alive: () => void) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "", text = "", inTok: number | null = null, outTok: number | null = null, cached: number | null = null;
  const calls: Array<{ name: string; args: string }> = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    alive();
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      let j: {
        choices?: Array<{ delta?: { content?: string | null; tool_calls?: Array<{ index?: number; function?: { name?: string; arguments?: string } }> } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
      };
      try { j = JSON.parse(data); } catch { continue; }
      const d = j.choices?.[0]?.delta;
      if (d?.content) { text += d.content; onDelta(d.content); }
      for (const tc of d?.tool_calls ?? []) {
        const c = (calls[tc.index ?? 0] ??= { name: "", args: "" });
        if (tc.function?.name) c.name += tc.function.name;
        if (tc.function?.arguments) c.args += tc.function.arguments;
      }
      if (j.usage) {
        inTok = j.usage.prompt_tokens ?? null; outTok = j.usage.completion_tokens ?? null;
        cached = j.usage.prompt_tokens_details?.cached_tokens ?? null;
      }
    }
  }
  const toolCalls = calls.filter((c) => c?.name).map((c) => {
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(c.args || "{}"); } catch { /* malformed arguments: call with none */ }
    return toCall(c.name, args);
  });
  return { text: text.trim(), toolCalls, inputTokens: inTok, outputTokens: outTok, cachedTokens: cached };
}

/** A Responses API stream: server-sent events, each a JSON object with a `type`. */
async function readResponsesStream(res: Response, onDelta: (t: string) => void, alive: () => void): Promise<RParsed> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const acc: RParsed = { text: "", calls: [], inputTokens: null, outputTokens: null, cachedTokens: null };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    alive();
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      let ev: Parameters<typeof foldResponsesEvent>[1];
      try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
      foldResponsesEvent(acc, ev, onDelta);
    }
  }
  acc.text = acc.text.trim();
  return acc;
}

function toParsed(r: RParsed) {
  return { text: r.text, toolCalls: r.calls.map((c) => toCall(c.name, c.args)), inputTokens: r.inputTokens, outputTokens: r.outputTokens, cachedTokens: r.cachedTokens };
}

/** A native tool call in the shape the tool loop uses ("reason" travels inside the arguments). */
function toCall(tool: string, input: Record<string, unknown>): ToolCallRequest {
  const { reason, ...args } = input;
  return { tool, args, reason: typeof reason === "string" ? reason : "" };
}

function parseResponse(provider: ProviderKind, json: unknown) {
  if (provider === "anthropic") {
    const j = json as {
      content?: Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown> }>;
      usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number };
    };
    const text = (j.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim();
    const toolCalls = (j.content ?? []).filter((c) => c.type === "tool_use" && c.name)
      .map((c) => toCall(c.name!, c.input ?? {}));
    return {
      text, toolCalls,
      inputTokens: j.usage?.input_tokens ?? null,
      outputTokens: j.usage?.output_tokens ?? null,
      cachedTokens: j.usage?.cache_read_input_tokens ?? null,
    };
  }
  const j = json as {
    choices?: Array<{ message?: { content?: string | null; tool_calls?: Array<{ function?: { name?: string; arguments?: string } }> } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
  };
  const toolCalls = (j.choices?.[0]?.message?.tool_calls ?? []).filter((c) => c.function?.name).map((c) => {
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(c.function?.arguments || "{}"); } catch { /* malformed arguments: call with none */ }
    return toCall(c.function!.name!, args);
  });
  return {
    text: j.choices?.[0]?.message?.content?.trim() ?? "", toolCalls,
    inputTokens: j.usage?.prompt_tokens ?? null,
    outputTokens: j.usage?.completion_tokens ?? null,
    cachedTokens: j.usage?.prompt_tokens_details?.cached_tokens ?? null,
  };
}

function friendlyError(status: number, provider: ProviderKind, raw: string): AiGatewayError {
  if (status === 401 || status === 403)
    return new AiGatewayError(`The ${provider} credential was rejected. Update it in Settings → AI.`, status);
  // OpenAI answers 429 both for rate limits and for an account without credit (insufficient_quota).
  if (status === 402 || (status === 429 && raw.includes("insufficient_quota")))
    return new AiGatewayError("AI credits are exhausted. Add credits or switch provider in Settings → AI.", 402);
  if (status === 429)
    return new AiGatewayError("The AI provider is rate limiting requests. Try again shortly.", 429);
  return new AiGatewayError(`AI provider error (${status}): ${raw.slice(0, 300)}`, status);
}

async function logCall(row: Record<string, unknown>) {
  try {
    const db = await admin();
    await db.from("ai_call_logs").insert(row as never);
  } catch {
    // logging must never break a user request
  }
}

type ChatParams = {
  orgId: string;
  userId?: string | null;
  purpose: AiPurpose;
  messages: ChatMessage[];
  temperature?: number;
  /** Offer these tools through the provider's native tool calling. */
  tools?: ToolSpec[];
  /** Stream the answer: called with each piece of text as it arrives (OpenAI-style providers). */
  onDelta?: (text: string) => void;
};

/** One provider call. Failures are logged and thrown as AiGatewayError. */
async function callTarget(target: ResolvedTarget, params: ChatParams, lean = false): Promise<AiResult> {
  const started = Date.now();
  const logBase = {
    org_id: params.orgId, user_id: params.userId ?? null, purpose: params.purpose,
    provider: target.provider, provider_config_id: target.providerConfigId, model: target.model,
    source: target.source,
  };
  if (!target.apiKey && target.provider !== "openai_compatible") {
    throw new AiGatewayError("AI is not configured for this workspace yet.", 400);
  }

  const streaming = !!params.onDelta && target.provider !== "anthropic";
  // OpenAI reasoning models go through the Responses API, where they can reason while using tools.
  // Turn it off with OPENAI_RESPONSES_API=off; a refused request retries on Chat Completions.
  const viaResponses = !target.chatOnly && !lean && target.provider === "openai" && isReasoningModel(target.model)
    && process.env["OPENAI_RESPONSES_API"] !== "off";
  const req: Endpoint = viaResponses
    ? {
        url: `${(target.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "")}/responses`,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${target.apiKey}` },
        body: responsesBody({
          model: target.model, messages: params.messages, effort: effortFor(params.purpose),
          tools: params.tools?.map((x) => ({ name: x.name, description: x.description, parameters: toolSchema(x) })),
          maxOutputTokens: target.maxOutputTokens, cacheKey: params.orgId, stream: streaming,
        }),
      }
    : buildRequest(target, params.messages, params.temperature ?? 0.4, params.tools, { cacheKey: params.orgId, lean, streaming, effort: effortFor(params.purpose) ?? undefined });
  if (streaming && !viaResponses) req.body.stream = true;

  // The time limit counts from the last sign of life: the request, then each streamed piece.
  const ctrl = new AbortController();
  let timer = setTimeout(() => ctrl.abort(), PROVIDER_TIMEOUT_MS);
  const alive = () => { clearTimeout(timer); timer = setTimeout(() => ctrl.abort(), PROVIDER_TIMEOUT_MS); };

  let res: Response;
  try {
    res = await fetch(req.url, { method: "POST", headers: req.headers, body: JSON.stringify(req.body), signal: ctrl.signal });
  } catch (e) {
    clearTimeout(timer);
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    const err = new AiGatewayError(
      timedOut
        ? `The AI provider didn't answer within ${PROVIDER_TIMEOUT_MS / 1000} seconds.`
        : `Could not reach the AI provider: ${e instanceof Error ? e.message : String(e)}`,
      timedOut ? 504 : 502,
    );
    await logCall({ ...logBase, status: "failed", error: err.message, duration_ms: Date.now() - started });
    throw err;
  }

  if (!res.ok) {
    clearTimeout(timer);
    const raw = await res.text().catch(() => "");
    // The Responses API refused this request (an older model, an endpoint without it): use Chat Completions.
    if (viaResponses && (res.status === 400 || res.status === 404)) {
      await logCall({ ...logBase, status: "failed", error: `Responses API refused (${res.status}), retried on Chat Completions: ${raw.slice(0, 200)}`, duration_ms: Date.now() - started });
      return callTarget({ ...target, chatOnly: true }, params, lean);
    }
    // A model or endpoint without tool support: ask again without tools (the prompt still explains
    // the fenced-block fallback).
    if (res.status === 400 && params.tools?.length && /tool|function/i.test(raw)) {
      return callTarget(target, { ...params, tools: undefined }, lean);
    }
    // An endpoint that doesn't know the caching or usage extras: ask again without them.
    if (res.status === 400 && !lean && /stream_options|prompt_cache_key|cache_control|reasoning_effort|unrecognized|unknown (parameter|field)/i.test(raw)) {
      return callTarget(target, params, true);
    }
    const err = friendlyError(res.status, target.provider, raw);
    await logCall({ ...logBase, status: "failed", error: err.message, duration_ms: Date.now() - started });
    throw err;
  }

  let parsed: ReturnType<typeof parseResponse>;
  try {
    parsed = viaResponses
      ? toParsed(streaming ? await readResponsesStream(res, params.onDelta!, alive) : parseResponses(await res.json()))
      : streaming ? await readStream(res, params.onDelta!, alive) : parseResponse(target.provider, await res.json());
    if (!streaming && params.onDelta && parsed.text) params.onDelta(parsed.text);
  } catch (e) {
    const err = new AiGatewayError(ctrl.signal.aborted
      ? `The AI provider stopped answering for ${PROVIDER_TIMEOUT_MS / 1000} seconds.`
      : `The AI provider's answer broke off: ${e instanceof Error ? e.message : String(e)}`, 504);
    await logCall({ ...logBase, status: "failed", error: err.message, duration_ms: Date.now() - started });
    throw err;
  } finally {
    clearTimeout(timer);
  }
  const durationMs = Date.now() - started;
  const total =
    parsed.inputTokens != null && parsed.outputTokens != null
      ? parsed.inputTokens + parsed.outputTokens
      : null;
  const costUsd = estimateCost(target.model, parsed.inputTokens, parsed.outputTokens, parsed.cachedTokens ?? null);

  await logCall({
    ...logBase,
    input_tokens: parsed.inputTokens, output_tokens: parsed.outputTokens, total_tokens: total,
    cached_tokens: parsed.cachedTokens ?? null,
    cost_usd: costUsd, duration_ms: durationMs, status: "completed",
  });

  return {
    text: parsed.text || (parsed.toolCalls?.length ? "" : "_(no response)_"),
    toolCalls: parsed.toolCalls,
    provider: target.provider,
    model: target.model,
    inputTokens: parsed.inputTokens,
    outputTokens: parsed.outputTokens,
    totalTokens: total,
    costUsd,
    durationMs,
  };
}

/**
 * Run a chat completion for an organization using its configured provider.
 * On the install's built-in AI, a failure moves on to the next provider in the chain
 * (OpenAI → OpenRouter → Lovable). A company's own provider never falls back:
 * they see their provider's error so they can fix their key.
 */
export async function runAiChat(params: ChatParams): Promise<AiResult> {
  const target = await resolveTarget(params.orgId, params.purpose);
  const chain = [target, ...(target.fallbacks ?? [])];
  // Skip built-in providers that failed in the last few minutes, so one broken provider doesn't
  // slow every message down. If they're all cooling down, try them anyway.
  const ready = chain.length > 1 ? chain.filter((t) => (coolingDown.get(chainKey(t)) ?? 0) < Date.now()) : chain;
  let lastError: unknown;
  for (const t of ready.length ? ready : chain) {
    try {
      const result = await callTarget(t, params);
      coolingDown.delete(chainKey(t));
      return result;
    } catch (e) {
      lastError = e; // already logged by callTarget; try the next provider
      // A 400 is about this request (too long, bad input), not the provider being down.
      if (chain.length > 1 && !(e instanceof AiGatewayError && e.status === 400)) {
        coolingDown.set(chainKey(t), Date.now() + COOLDOWN_MS);
      }
    }
  }
  throw lastError;
}

// Long enough for a long answer, short enough that a hung provider doesn't block the chain.
const PROVIDER_TIMEOUT_MS = 30_000;
const COOLDOWN_MS = 5 * 60_000;
// ponytail: per server instance; each instance learns about a broken provider on its own.
const coolingDown = new Map<string, number>();
const chainKey = (t: ResolvedTarget) => `${t.provider}:${t.model}:${t.providerConfigId ?? ""}`;

/** Send a single trivial prompt to verify a saved credential works. */
export async function pingTarget(orgId: string, purpose: AiPurpose) {
  const result = await runAiChat({
    orgId,
    purpose,
    messages: [{ role: "user", content: "Reply with the single word: ready" }],
    temperature: 0,
  });
  return { provider: result.provider, model: result.model, reply: result.text.slice(0, 80) };
}
