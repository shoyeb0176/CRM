// Shared context for the Inuberry MCP server. Every call runs for one user in one workspace:
// - OAuth (an AI app signed in as the user): db is the user's own Supabase client, so RLS applies too;
//   the workspace is the one picked on the consent page (mcp_connections), else the user's current one.
// - Personal developer key: db is the service role, so every tool MUST filter by orgId and check the
//   role with requireAccess() — exactly like the REST API.
import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { moduleAccess, type ModuleKey } from "@/lib/settings/role-matrix";

export type Db = SupabaseClient<Database>;
export interface McpAppContext {
  readonly db: Db;
  readonly userId: string;
  readonly orgId: string;
  readonly role: string;
  readonly via: "oauth" | "key";
}

export const defineDbTool = defineTool.withAppContext<McpAppContext>();

/** Refuses the call unless the caller's role may read (or change) this module. */
export function requireAccess(ctx: McpAppContext, module: ModuleKey, write = false) {
  const a = moduleAccess(ctx.role, module);
  if (a === "none" || (write && a === "read")) {
    throw new ToolError(`Your role (${ctx.role.replace("_", " ")}) can't ${write ? "change" : "see"} ${module} in this workspace.`);
  }
}

/** The caller's role in a workspace, or null when they're not an active member. */
export async function memberRole(db: Db, userId: string, orgId: string): Promise<string | null> {
  const { data } = await db.from("memberships").select("role")
    .eq("org_id", orgId).eq("user_id", userId).eq("status", "active").maybeSingle();
  return data?.role ?? null;
}

/** The caller's current organization: their preference if they're still a member, else their oldest active membership. */
export async function resolveOrgId(db: Db, userId: string): Promise<string> {
  const { data: pref, error: prefErr } = await db
    .from("user_preferences")
    .select("current_org_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (prefErr) throw new Error(prefErr.message);
  // Filter by user explicitly: RLS also lets a platform owner read other people's memberships.
  const { data: m, error } = await db
    .from("memberships")
    .select("org_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  if (!m?.length) throw new Error("No active organization for this caller");
  return m.find((r) => r.org_id === pref?.current_org_id)?.org_id ?? m[0].org_id;
}

/** Context for an OAuth caller (an AI app the user signed in to). */
export async function oauthContext(db: Db, userId: string, clientId: string | undefined): Promise<McpAppContext> {
  let orgId: string | null = null;
  if (clientId) {
    const { data: conn } = await db.from("mcp_connections")
      .select("id, org_id, revoked_at").eq("user_id", userId).eq("client_id", clientId).maybeSingle();
    if (conn?.revoked_at) throw new ToolError("This app's access to Inuberry was revoked. Reconnect it to continue.");
    if (conn) {
      orgId = conn.org_id;
      void db.from("mcp_connections").update({ last_used_at: new Date().toISOString() }).eq("id", conn.id).then(() => {});
    }
  }
  orgId ??= await resolveOrgId(db, userId);
  const role = await memberRole(db, userId, orgId);
  if (!role) throw new ToolError("You're no longer a member of the workspace this app was connected to. Reconnect it.");
  return { db, userId, orgId, role, via: "oauth" };
}

/** Tool result as pretty JSON. */
export function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

/** Keyword safe to put inside a PostgREST `or=` / ilike filter. */
export function term(q: string | undefined) {
  return (q ?? "").replace(/[,()%*\\"]/g, " ").replace(/\s+/g, " ").trim();
}
