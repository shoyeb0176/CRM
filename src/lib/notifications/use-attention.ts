// Small counts that remind people of things waiting for them (sidebar badges).
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Attention } from "@/components/app/nav";

export function useAttentionCounts(orgId: string | null | undefined) {
  return useQuery({
    enabled: !!orgId,
    queryKey: ["attention", orgId],
    refetchInterval: 60_000,
    queryFn: async (): Promise<Record<Attention, number>> => {
      // One call (DB-27); the three separate counts below only run without it.
      const one = (await supabase.rpc("attention_counts", { _org: orgId! })) as { data: unknown; error: unknown };
      if (!one.error && one.data) {
        const d = one.data as unknown as { approvals: number; support: number };
        return { approvals: d.approvals, support: d.support, inbox: d.approvals + d.support };
      }
      const count = (r: { count: number | null }) => r.count ?? 0;
      const [ai, agent, tickets] = await Promise.all([
        supabase.from("ai_proposed_actions").select("id", { count: "exact", head: true }).eq("org_id", orgId!).eq("status", "pending"),
        supabase.from("ai_agent_actions").select("id", { count: "exact", head: true }).eq("org_id", orgId!).eq("status", "pending_approval"),
        supabase.from("support_tickets").select("id", { count: "exact", head: true }).eq("org_id", orgId!).eq("status", "open").is("assignee_id", null),
      ]);
      const approvals = count(ai) + count(agent), support = count(tickets);
      return { approvals, support, inbox: approvals + support };
    },
  });
}
