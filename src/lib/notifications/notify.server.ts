// Notifications for events only the server sees (Stripe webhook, agent runs, updates).
// Goes through public.notify (migration 0037), so preferences, deep links and email apply.
type Severity = "info" | "success" | "warning" | "error";

export type ServerNotice = {
  kind: string;
  title: string;
  body?: string | null;
  severity?: Severity;
  module?: string;
  link?: string | null;
  action?: string | null;
  entityType?: string | null;
  entityId?: string | null;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Notify these users (active members of the workspace). Never throws: a notice must not break the caller. */
export async function notifyUsers(orgId: string, userIds: (string | null | undefined)[], n: ServerNotice) {
  try {
    const db = await admin();
    const { error } = await db.rpc("notify" as never, {
      _org: orgId, _users: userIds.filter(Boolean), _title: n.title, _body: n.body ?? null,
      _severity: n.severity ?? "info", _module: n.module ?? n.kind.split(".")[0], _link: n.link ?? null,
      _entity_type: n.entityType ?? null, _entity_id: n.entityId ?? null, _rule: null,
      _kind: n.kind, _include_actor: true, _action: n.action ?? null,
    } as never);
    if (error) console.error("[notify]", error.message);
  } catch (e) {
    console.error("[notify]", e);
  }
}

/** Owners and admins of a workspace (plus the extra roles given). */
export async function workspaceLeads(orgId: string, roles: string[] = []) {
  const db = await admin();
  const { data } = await db.rpc("notify_recipients" as never, { _org: orgId, _roles: roles } as never);
  return (data as unknown as string[] | null) ?? [];
}
