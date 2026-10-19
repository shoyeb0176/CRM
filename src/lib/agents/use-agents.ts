import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/lib/crm/use-org";

// Typed from the generated Supabase types; row-level security keeps each workspace separate.
const sb = supabase;

export function useAgents() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["ai-agents", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("ai_agents")
        .select("*")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAgent(agentId: string | undefined) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["ai-agent", agentId],
    enabled: !!orgId && !!agentId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("ai_agents")
        .select("*")
        .eq("id", agentId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useAgentDashboard() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["ai-agent-dashboard", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [total, active, runsToday, failed, pending, recent] = await Promise.all([
        sb.from("ai_agents").select("*", { count: "exact", head: true }).eq("org_id", orgId!),
        sb.from("ai_agents").select("*", { count: "exact", head: true }).eq("org_id", orgId!).eq("status", "active"),
        sb.from("ai_agent_runs").select("*", { count: "exact", head: true }).eq("org_id", orgId!).gte("created_at", since),
        sb.from("ai_agent_runs").select("*", { count: "exact", head: true }).eq("org_id", orgId!).eq("status", "failed").gte("created_at", since),
        sb.from("ai_agent_approvals").select("*", { count: "exact", head: true }).eq("org_id", orgId!).eq("approval_status", "pending"),
        sb.from("ai_agent_runs").select("id, status, created_at, trigger_type, agent:ai_agents(id, name)").eq("org_id", orgId!).order("created_at", { ascending: false }).limit(10),
      ]);
      return {
        totalAgents: total.count ?? 0,
        activeAgents: active.count ?? 0,
        runsToday: runsToday.count ?? 0,
        failedRuns: failed.count ?? 0,
        pendingApprovals: pending.count ?? 0,
        recentRuns: recent.data ?? [],
      };
    },
  });
}

export function usePendingApprovals() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["ai-agent-approvals", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("ai_agent_approvals")
        .select("*, agent:ai_agents(id, name, agent_type), action:ai_agent_actions(id, action_type, target_module, target_entity_type, proposed_changes_json)")
        .eq("org_id", orgId!)
        .eq("approval_status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAgentRuns(agentId?: string) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["ai-agent-runs", orgId, agentId ?? "all"],
    enabled: !!orgId,
    queryFn: async () => {
      let q = sb
        .from("ai_agent_runs")
        .select("*, agent:ai_agents(id, name)")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (agentId) q = q.eq("agent_id", agentId!);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAgentMessages(runId: string | undefined) {
  return useQuery({
    queryKey: ["ai-agent-messages", runId],
    enabled: !!runId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("ai_agent_messages")
        .select("*")
        .eq("run_id", runId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAgentActions(agentId?: string) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["ai-agent-actions", orgId, agentId ?? "all"],
    enabled: !!orgId,
    queryFn: async () => {
      let q = sb
        .from("ai_agent_actions")
        .select("*, agent:ai_agents(id, name)")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (agentId) q = q.eq("agent_id", agentId!);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAgentTools(agentId: string | undefined) {
  return useQuery({
    queryKey: ["ai-agent-tools", agentId],
    enabled: !!agentId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("ai_agent_tools")
        .select("*")
        .eq("agent_id", agentId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAgentPermissions(agentId: string | undefined) {
  return useQuery({
    queryKey: ["ai-agent-permissions", agentId],
    enabled: !!agentId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("ai_agent_permissions")
        .select("*")
        .eq("agent_id", agentId!)
        .order("module_key", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAgentAuditLogs(agentId?: string) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["ai-agent-audit", orgId, agentId ?? "all"],
    enabled: !!orgId,
    queryFn: async () => {
      let q = sb
        .from("ai_agent_audit_logs")
        .select("*")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (agentId) q = q.eq("agent_id", agentId!);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useExternalConnections() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["ai-agent-connections", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("ai_agent_external_connections")
        .select("*")
        .eq("org_id", orgId!)
        .order("provider", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export const AGENT_STATUS_TONE: Record<string, "default" | "primary" | "success" | "warning" | "danger" | "info" | "neutral"> = {
  draft: "neutral",
  active: "success",
  paused: "warning",
  archived: "default",
  queued: "info",
  running: "info",
  waiting_for_approval: "warning",
  completed: "success",
  failed: "danger",
  cancelled: "default",
  pending: "warning",
  approved: "success",
  rejected: "danger",
  proposed: "info",
  executed: "success",
};
