// How much the AI may do on its own, per kind of change. Applies to the assistant and connected AI
// apps. Shown in Settings › AI (#ai-rules); Inbox › Approvals links here.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useOrgId } from "@/lib/crm/use-org";
import {
  aiGetActionPolicies, aiSaveActionPolicy, ACTION_KEYS, ACTION_LABELS, APPROVAL_MODES, type ApprovalMode,
} from "@/lib/ai/entity-ai.functions";

import { SectionTitle } from "@/components/ui/section-title";
const MODE_LABELS: Record<ApprovalMode, string> = {
  read_only: "Never (read only)",
  draft: "Draft only",
  confirm: "Ask me first",
  autonomous: "Do it automatically",
};

export function AiRulesPanel({ canEdit }: { canEdit: boolean }) {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const getPolicies = useServerFn(aiGetActionPolicies);
  const savePolicy = useServerFn(aiSaveActionPolicy);
  const policies = useQuery({
    enabled: !!orgId,
    queryKey: ["ai-action-policies", orgId],
    queryFn: () => getPolicies({ data: { orgId: orgId! } }),
  });
  const save = useMutation({
    mutationFn: (v: { actionKey: (typeof ACTION_KEYS)[number]; mode: ApprovalMode }) => savePolicy({ data: { orgId: orgId!, ...v } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ai-action-policies", orgId] }); toast.success("Saved"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section id="ai-rules" className="scroll-mt-24 border border-border bg-background">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <ShieldCheck className="size-4 text-primary" />
        <SectionTitle>How much the AI may do on its own</SectionTitle>
      </header>
      <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
        {ACTION_KEYS.map((key) => (
          <label key={key} className="block">
            <span className="mb-1 block text-sm font-medium">{ACTION_LABELS[key]}</span>
            <select
              value={policies.data?.[key] ?? "confirm"}
              disabled={!canEdit || save.isPending}
              onChange={(e) => save.mutate({ actionKey: key, mode: e.target.value as ApprovalMode })}
              className="h-9 w-full border border-input bg-card shadow-xs px-2 text-sm disabled:opacity-60"
            >
              {APPROVAL_MODES.map((m) => <option key={m} value={m}>{MODE_LABELS[m]}</option>)}
            </select>
          </label>
        ))}
      </div>
      <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
        Applies to the assistant and connected AI apps. The AI never gets more access than the person using it, and
        every change it makes is listed in Inbox › Approvals. AI agents have their own approval setting on each agent.
      </p>
    </section>
  );
}
