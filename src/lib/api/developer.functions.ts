// Developer platform: API keys and webhook endpoints.
// All writes run as the signed-in user, so RLS restricts them to org admins.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const CreateKey = z.object({
  orgId: z.string().uuid(),
  name: z.string().min(1).max(80),
  scopes: z.array(z.enum(["read", "write"])).min(1),
});

function randomToken(bytes = 24) {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CreateKey.parse(d))
  .handler(async ({ data, context }) => {
    const { sha256Hex } = await import("./rest.server");
    const secret = randomToken(24);
    const prefix = `inb_${randomToken(3)}`;
    const token = `${prefix}_${secret}`;
    const { data: row, error } = await context.supabase
      .from("api_keys")
      .insert({
        org_id: data.orgId,
        name: data.name,
        prefix,
        key_hash: await sha256Hex(token),
        scopes: data.scopes,
        created_by: context.userId,
      })
      .select("id,name,prefix,scopes,created_at")
      .single();
    if (error) throw new Error(error.message);
    // The full token is returned exactly once — only its hash is stored.
    return { key: row, token };
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const CreateHook = z.object({
  orgId: z.string().uuid(),
  name: z.string().min(1).max(80),
  url: z.string().url(),
  events: z.array(z.string()).default([]),
});

export const createWebhookEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CreateHook.parse(d))
  .handler(async ({ data, context }) => {
    const { randomSecret } = await import("./webhooks.server");
    const { data: row, error } = await context.supabase
      .from("webhook_endpoints")
      .insert({
        org_id: data.orgId,
        name: data.name,
        url: data.url,
        events: data.events,
        secret: randomSecret(),
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateWebhookEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1).max(80).optional(),
        url: z.string().url().optional(),
        events: z.array(z.string()).optional(),
        is_active: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("webhook_endpoints").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteWebhookEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("webhook_endpoints").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendTestWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: endpoint, error } = await context.supabase
      .from("webhook_endpoints")
      .select("id,org_id,url,secret")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!endpoint) throw new Error("Endpoint not found");
    const { deliverToEndpoint } = await import("./webhooks.server");
    return deliverToEndpoint(endpoint, "test.ping", { message: "Hello from Inuberry" });
  });

/* ---------------- Personal developer keys (MCP for scripts / CI) ---------------- */

const CreatePersonalKey = z.object({
  orgId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  days: z.union([z.literal(30), z.literal(90), z.literal(365)]),
});

/** A key for one user in one workspace, used as `Authorization: Bearer inbp_…` on /mcp. */
export const createPersonalKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CreatePersonalKey.parse(d))
  .handler(async ({ data, context }) => {
    const { data: m } = await context.supabase.from("memberships").select("id")
      .eq("org_id", data.orgId).eq("user_id", context.userId).eq("status", "active").maybeSingle();
    if (!m) throw new Error("You're not a member of this workspace.");
    const { sha256Hex } = await import("./rest.server");
    const { PERSONAL_KEY_PREFIX } = await import("@/lib/mcp/personal-key.server");
    const token = `${PERSONAL_KEY_PREFIX}${randomToken(24)}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.from("personal_api_keys").insert({
      user_id: context.userId,
      org_id: data.orgId,
      name: data.name,
      prefix: token.slice(0, 11),
      key_hash: await sha256Hex(token),
      expires_at: new Date(Date.now() + data.days * 86_400_000).toISOString(),
    }).select("id,name,prefix,expires_at,created_at").single();
    if (error) throw new Error(error.message);
    // Shown once; only the hash is stored.
    return { key: row, token };
  });
