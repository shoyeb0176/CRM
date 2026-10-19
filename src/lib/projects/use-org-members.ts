import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type OrgMember = {
  user_id: string;
  role: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

/** Memberships + profiles fetched separately — there is no FK between them for PostgREST to embed. */
export async function fetchOrgMembers(orgId: string, opts?: { activeOnly?: boolean }) {
  let q = supabase.from("memberships").select("user_id, role, status").eq("org_id", orgId);
  if (opts?.activeOnly !== false) q = q.eq("status", "active");
  const { data: rows, error } = await q;
  if (error) throw error;
  const ids = (rows ?? []).map((r) => r.user_id);
  const profiles = ids.length
    ? (await supabase.from("profiles").select("id, full_name, avatar_url, email").in("id", ids)).data ?? []
    : [];
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return (rows ?? []).map((r) => {
    const p = byId.get(r.user_id);
    return {
      user_id: r.user_id,
      role: r.role as string,
      full_name: p?.full_name ?? null,
      email: p?.email ?? null,
      avatar_url: p?.avatar_url ?? null,
    } as OrgMember;
  });
}

export function useOrgMembers(orgId: string | undefined) {
  return useQuery({
    queryKey: ["org-members", orgId],
    enabled: !!orgId,
    queryFn: () => fetchOrgMembers(orgId!),
  });
}

export function memberLabel(m: OrgMember | undefined | null) {
  if (!m) return "Unassigned";
  return m.full_name ?? m.email ?? m.user_id.slice(0, 8);
}
