// Personal developer keys (`inbp_…`): one user, one workspace, the user's current role.
// Checked with the service role, so the MCP tools filter by org and role themselves.
import type { McpAppContext } from "./context";
import { memberRole } from "./context";

export const PERSONAL_KEY_PREFIX = "inbp_";

export async function contextFromPersonalKey(token: string): Promise<McpAppContext | null> {
  if (!token.startsWith(PERSONAL_KEY_PREFIX)) return null;
  const { sha256Hex } = await import("@/lib/api/rest.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: key } = await supabaseAdmin.from("personal_api_keys")
    .select("id, user_id, org_id, expires_at, revoked_at")
    .eq("key_hash", await sha256Hex(token)).maybeSingle();
  if (!key || key.revoked_at || (key.expires_at && new Date(key.expires_at) <= new Date())) return null;
  // The key only works while its owner is still an active member; it uses their current role.
  const role = await memberRole(supabaseAdmin, key.user_id, key.org_id);
  if (!role) return null;
  void supabaseAdmin.from("personal_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id).then(() => {});
  return { db: supabaseAdmin, userId: key.user_id, orgId: key.org_id, role, via: "key" };
}

/** Why an OAuth app may no longer use /mcp (disconnected in Settings, or the user left the workspace),
 *  else null. Read from the bearer's unverified claims: it can only refuse a call, never allow one —
 *  the OAuth handler still verifies the token. mcp-js turns errors thrown while building the context
 *  into a 500, so this check runs first and answers 401 instead, which makes apps ask to reconnect. */
export async function oauthRefusal(bearer: string): Promise<string | null> {
  let claims: { sub?: string; client_id?: string };
  try {
    const p = bearer.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    claims = JSON.parse(atob(p));
  } catch {
    return null;
  }
  if (!claims.sub || !claims.client_id) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: conn } = await supabaseAdmin.from("mcp_connections")
    .select("org_id, revoked_at").eq("user_id", claims.sub).eq("client_id", claims.client_id).maybeSingle();
  if (!conn) return null;
  if (conn.revoked_at) return "This app was disconnected from Inuberry. Reconnect it to continue.";
  if (!(await memberRole(supabaseAdmin, claims.sub, conn.org_id))) return "You're no longer a member of the workspace this app was connected to. Reconnect it.";
  return null;
}
