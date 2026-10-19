// Secret-bearing AI configuration operations. Keys are written through the
// service role and are never returned to the browser.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PURPOSES = ["assistant", "summaries", "classification", "agents", "embeddings"] as const;

async function assertOrgAdmin(supabase: unknown, orgId: string) {
  const sb = supabase as { rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown }> };
  const { data } = await sb.rpc("has_org_role", { _org: orgId, _roles: ["org_owner", "org_admin"] });
  if (!data) throw new Error("Only workspace owners and admins can change AI settings.");
}

const SaveKeyInput = z.object({
  orgId: z.string().uuid(),
  providerConfigId: z.string().uuid(),
  apiKey: z.string().min(8).max(8000),
});

export const saveAiProviderKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => SaveKeyInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOrgAdmin(supabase, data.orgId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cfg } = await supabaseAdmin
      .from("ai_provider_configs").select("id, org_id").eq("id", data.providerConfigId).maybeSingle();
    if (!cfg || cfg.org_id !== data.orgId) throw new Error("Provider not found in this workspace.");

    const key = data.apiKey.trim();
    const { encryptSecret } = await import("@/lib/crypto.server");
    const { error } = await supabaseAdmin.from("ai_provider_secrets").upsert({
      provider_config_id: data.providerConfigId,
      org_id: data.orgId,
      api_key: await encryptSecret(key),
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);

    const { error: e2 } = await supabaseAdmin.from("ai_provider_configs")
      .update({ has_key: true, key_last4: key.slice(-4) })
      .eq("id", data.providerConfigId);
    if (e2) throw new Error(e2.message);

    await supabaseAdmin.from("audit_logs").insert({
      org_id: data.orgId, user_id: userId, action: "ai.provider_key_saved",
      entity_type: "ai_provider_configs", entity_id: data.providerConfigId,
    });

    return { ok: true as const };
  });

const RemoveKeyInput = z.object({ orgId: z.string().uuid(), providerConfigId: z.string().uuid() });

export const removeAiProviderKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => RemoveKeyInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertOrgAdmin(context.supabase, data.orgId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("ai_provider_secrets").delete()
      .eq("provider_config_id", data.providerConfigId).eq("org_id", data.orgId);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("ai_provider_configs")
      .update({ has_key: false, key_last4: null })
      .eq("id", data.providerConfigId).eq("org_id", data.orgId);
    await supabaseAdmin.from("audit_logs").insert({
      org_id: data.orgId, user_id: context.userId, action: "ai.provider_key_removed",
      entity_type: "ai_provider_configs", entity_id: data.providerConfigId,
    });
    return { ok: true as const };
  });

const TestInput = z.object({
  orgId: z.string().uuid(),
  purpose: z.enum(PURPOSES).default("assistant"),
});

export const testAiConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => TestInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertOrgAdmin(context.supabase, data.orgId);
    const { pingTarget } = await import("./gateway.server");
    try {
      const r = await pingTarget(data.orgId, data.purpose);
      return { ok: true as const, ...r };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  });
