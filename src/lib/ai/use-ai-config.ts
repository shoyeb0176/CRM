import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const AI_PURPOSES = [
  { key: "assistant", label: "Assistant chat" },
  { key: "summaries", label: "Summaries & reports" },
  { key: "classification", label: "Classification & scoring" },
  { key: "agents", label: "AI agents" },
  { key: "embeddings", label: "Search embeddings" },
] as const;

export type AiPurposeKey = (typeof AI_PURPOSES)[number]["key"];

export const PROVIDERS = [
  { key: "lovable", label: "Built-in AI (managed)", needsKey: false, needsUrl: false },
  { key: "openai", label: "OpenAI", needsKey: true, needsUrl: false },
  { key: "anthropic", label: "Anthropic", needsKey: true, needsUrl: false },
  { key: "google", label: "Google AI", needsKey: true, needsUrl: false },
  { key: "azure_openai", label: "Azure OpenAI", needsKey: true, needsUrl: true },
  { key: "openai_compatible", label: "OpenAI-compatible / local", needsKey: false, needsUrl: true },
] as const;

export type ProviderKey = (typeof PROVIDERS)[number]["key"];

/** Shortcuts in "Add provider" that save as an existing provider type with the URL filled in. */
export const PROVIDER_PRESETS = [
  { key: "openrouter", label: "OpenRouter", provider: "openai_compatible", baseUrl: "https://openrouter.ai/api/v1" },
] as const satisfies ReadonlyArray<{ key: string; label: string; provider: ProviderKey; baseUrl: string }>;

export const BUILTIN_MODEL_CHOICES = [
  "google/gemini-3.8-flash",
  "google/gemini-3.1-flash-lite",
  "openai/gpt-5.6-terra",
  "openai/gpt-5.6-luna",
  "openai/gpt-6-astra",
];

export function useAiProviders(orgId: string | null) {
  return useQuery({
    queryKey: ["ai-providers", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_provider_configs")
        .select("*")
        .eq("org_id", orgId!)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

export function useAiRoutes(orgId: string | null) {
  return useQuery({
    queryKey: ["ai-routes", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("ai_model_routes").select("*").eq("org_id", orgId!);
      if (error) throw error;
      return data;
    },
  });
}

export function useAiPolicy(orgId: string | null) {
  return useQuery({
    queryKey: ["ai-policy", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_org_policies").select("*").eq("org_id", orgId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useAiUsage(orgId: string | null) {
  return useQuery({
    queryKey: ["ai-usage", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      const { data, error } = await supabase
        .from("ai_call_logs")
        .select("purpose, provider, model, total_tokens, cost_usd, status, error, created_at")
        .eq("org_id", orgId!)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const rows = data ?? [];
      return {
        rows: rows.slice(0, 50),
        calls: rows.length,
        failed: rows.filter((r) => r.status !== "completed").length,
        tokens: rows.reduce((s, r) => s + (r.total_tokens ?? 0), 0),
        cost: rows.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0),
      };
    },
  });
}
