// Model names per provider, shared by the AI gateway (server) and Settings › AI (browser).
// Checked against the providers' model lists on 16 Oct 2026: OpenAI GPT-6, Anthropic Claude 5.5,
// Google Gemini (ai.google.dev/gemini-api/docs/models).

export type ProviderKind = "lovable" | "openai" | "anthropic" | "google" | "azure_openai" | "openai_compatible";

/** Used when a workspace's own provider has no model chosen. */
export const PROVIDER_DEFAULT_MODEL: Record<Exclude<ProviderKind, "lovable">, string> = {
  openai: "gpt-6-luna",
  anthropic: "claude-haiku-5-5",
  google: "gemini-3.8-flash",
  azure_openai: "", // the deployment name, which only the customer knows
  openai_compatible: "",
};

/** Offered in the model box for each provider (any other name can still be typed). */
export const MODEL_SUGGESTIONS: Record<Exclude<ProviderKind, "lovable">, string[]> = {
  openai: ["gpt-6-luna", "gpt-6.1-sol", "gpt-6-astra"],
  anthropic: ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"],
  google: ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.1-pro-preview"],
  azure_openai: [],
  openai_compatible: ["openai/gpt-6-luna", "anthropic/claude-haiku-5-5", "google/gemini-3.8-flash"],
};

/**
 * The model to send to a workspace's own provider. A name from the built-in list ("google/…",
 * "openai/…") left over from before the provider was chosen means nothing to OpenAI, Anthropic or
 * Google directly, so their default is used instead.
 */
export function ownProviderModel(provider: Exclude<ProviderKind, "lovable">, routeModel: string | null | undefined): string {
  const m = (routeModel ?? "").trim();
  if (!m) return PROVIDER_DEFAULT_MODEL[provider];
  if (m.includes("/") && provider !== "openai_compatible") return PROVIDER_DEFAULT_MODEL[provider] || m;
  return m;
}
