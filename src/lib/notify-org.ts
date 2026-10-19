// Company-wide notification: one copy per member, via public.notify_org (migration 0030).
export type OrgNotice = {
  title: string;
  body?: string | null;
  severity?: "info" | "success" | "warning" | "error";
  module?: string | null;
  link?: string | null;
  entityType?: string | null;
  entityId?: string | null;
};

type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }> };

export async function notifyOrg(sb: unknown, orgId: string, n: OrgNotice) {
  const { error } = await (sb as RpcClient).rpc("notify_org", {
    _org: orgId, _title: n.title, _body: n.body ?? null, _severity: n.severity ?? "info",
    _module: n.module ?? null, _link: n.link ?? null, _entity_type: n.entityType ?? null, _entity_id: n.entityId ?? null,
  });
  return { error };
}
