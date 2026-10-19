import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/use-current-user";
import type { Database } from "@/integrations/supabase/types";
import { getStripeEnvironment } from "@/lib/stripe";

// Accept pending invitations once per signed-in user and page load, so an invited user lands in
// the workspace instead of onboarding. Keyed by user: a sign-in without a reload (invite link,
// account switch) must check again. Returns how many were accepted.
let invitesCheckedFor: string | null = null;
async function acceptInvitesOnce(): Promise<number> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid || invitesCheckedFor === uid) return 0;
  invitesCheckedFor = uid;
  try {
    // Loaded on use: these server functions (and zod in their validators) stay out of the first download.
    const [{ acceptPendingInvites }, { syncSubscriptionSeats }] = await Promise.all([
      import("@/lib/settings/members.functions"), import("@/lib/billing/billing.functions"),
    ]);
    const { accepted } = await acceptPendingInvites();
    for (const orgId of accepted) {
      // Best-effort: keep the Stripe seat count in step with the new member.
      await syncSubscriptionSeats({ data: { orgId, environment: getStripeEnvironment() } }).catch(() => {});
    }
    return accepted.length;
  } catch {
    invitesCheckedFor = null; // transient error: try again on the next fetch
    return 0;
  }
}

async function readMemberships(uid: string) {
  // Filter by user explicitly: RLS also lets a platform owner read other people's memberships.
  const { data, error } = await supabase
    .from("memberships")
    .select("*, organizations(*)")
    .eq("user_id", uid)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Membership[];
}

export type Membership = Database["public"]["Tables"]["memberships"]["Row"] & {
  organizations: Database["public"]["Tables"]["organizations"]["Row"];
};

export function useMyMemberships() {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["my-memberships"],
    staleTime: 5 * 60_000, // changes through actions that refresh it; no need to re-ask on every page
    queryFn: async () => {
      const { data: s } = await supabase.auth.getSession();
      const uid = s.session?.user.id;
      if (!uid) return [];
      // The invite check (a server call, about 0.6 s) runs beside the read instead of before it.
      // Someone with no workspace yet waits for it, so an invited user doesn't land in onboarding;
      // anyone else sees their workspaces at once, and the list refreshes if an invite was accepted.
      const invites = acceptInvitesOnce();
      const rows = await readMemberships(uid);
      if (rows.length === 0) return (await invites) ? readMemberships(uid) : rows;
      void invites.then((n) => { if (n) qc.invalidateQueries({ queryKey: ["my-memberships"] }); });
      return rows;
    },
  });
}

export function useCurrentOrgId() {
  return useQuery({
    queryKey: ["current-org-id"],
    staleTime: 5 * 60_000, // changes through actions that refresh it; no need to re-ask on every page
    queryFn: async () => {
      const { data: u } = await getSessionUser();
      if (!u.user) return null;
      const { data, error } = await supabase
        .from("user_preferences")
        .select("current_org_id")
        .eq("user_id", u.user.id)
        .maybeSingle();
      if (error) throw error;
      return data?.current_org_id ?? null;
    },
  });
}
