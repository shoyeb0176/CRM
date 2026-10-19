import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/use-current-user";
import { useMyMemberships, useCurrentOrgId, type Membership } from "@/lib/use-memberships";

/**
 * Single source of truth for "which workspace am I in".
 * Uses user_preferences.current_org_id when it still points at an active
 * membership, otherwise falls back to the first membership.
 */
export function useCurrentMembership(): {
  membership: Membership | undefined;
  memberships: Membership[];
  isLoading: boolean;
  error: unknown;
} {
  const me = useMyMemberships();
  const pref = useCurrentOrgId();
  const list = me.data ?? [];
  const chosen = pref.data ? list.find((m) => m.org_id === pref.data) : undefined;
  return {
    membership: chosen ?? list[0],
    memberships: list,
    isLoading: me.isLoading || pref.isLoading,
    error: me.error ?? pref.error,
  };
}

export function useSwitchWorkspace() {
  const qc = useQueryClient();
  return async function switchWorkspace(orgId: string) {
    const { data: u } = await getSessionUser();
    if (!u.user) return;
    await supabase
      .from("user_preferences")
      .upsert({ user_id: u.user.id, current_org_id: orgId }, { onConflict: "user_id" });
    await qc.cancelQueries();
    await qc.resetQueries();
  };
}
