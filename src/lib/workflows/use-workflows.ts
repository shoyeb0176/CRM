import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/lib/crm/use-org";
import type { WorkflowRow } from "./workflow-model";

export function useWorkflows() {
  const orgId = useOrgId();
  return useQuery({
    enabled: !!orgId,
    queryKey: ["workflows", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workflows")
        .select("*")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as WorkflowRow[];
    },
  });
}

export function useWorkflow(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: ["workflow", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("workflows").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data as unknown as WorkflowRow | null;
    },
  });
}

export function useWorkflowRuns(workflowId: string | undefined) {
  return useQuery({
    enabled: !!workflowId,
    queryKey: ["workflow-runs", workflowId],
    queryFn: async () => {
      const { data } = await supabase
        .from("workflow_runs")
        .select("id,status,matched,actions_run,log,started_at")
        .eq("workflow_id", workflowId!)
        .order("started_at", { ascending: false })
        .limit(15);
      return data ?? [];
    },
  });
}

export function useWorkflowMutations() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["workflows"] });
    void qc.invalidateQueries({ queryKey: ["workflow"] });
  };

  const create = useMutation({
    mutationFn: async (input: Partial<WorkflowRow> & { name: string }) => {
      const { data, error } = await supabase
        .from("workflows")
        .insert({
          org_id: orgId!,
          name: input.name,
          description: input.description ?? null,
          entity: input.entity ?? "invoice",
          conditions: (input.conditions ?? []),
          actions: (input.actions ?? []),
        })
        .select("id")
        .maybeSingle();
      if (error) throw error;
      return data!.id as string;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from("workflows").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("workflows").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { create, update, remove };
}
