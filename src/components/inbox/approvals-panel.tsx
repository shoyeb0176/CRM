// Everything an AI is waiting on you for, in one list: the assistant, connected AI apps (both use
// ai_proposed_actions) and AI agents (ai_agent_actions). Shown in Inbox › Approvals.
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Check, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { JsonBlock } from "@/components/ui/code-block";
import { EmptyState } from "@/components/crm/empty-state";
import { useOrgId } from "@/lib/crm/use-org";
import { FOCUS_CLASS, focusDomId, useScrollToFocus } from "@/lib/use-focus-row";
import { timeAgo } from "@/lib/notifications/kinds";
import { usePendingApprovals } from "@/lib/agents/use-agents";
import { TOOL_REGISTRY } from "@/lib/agents/tool-registry";
import { decideAgentAction } from "@/lib/agents/agent-service";
import { aiListProposedActions, aiDecideAction, ACTION_LABELS } from "@/lib/ai/entity-ai.functions";
import { Button } from "@/components/ui/button";

type Filter = "pending" | "done" | "all";
type Item = {
  id: string; source: "assistant" | "agent"; title: string; what: string; status: string;
  createdAt: string; payload: unknown; summary?: string | null; error?: string | null;
};

const STATUS_TEXT: Record<string, string> = {
  pending: "Waiting", pending_approval: "Waiting", executed: "Done", approved: "Done",
  rejected: "Rejected", failed: "Failed",
};
const STATUS_CLASS: Record<string, string> = {
  Waiting: "text-primary", Done: "text-foreground", Rejected: "text-muted-foreground", Failed: "text-destructive",
};

export function ApprovalsPanel({ focusId }: { focusId?: string }) {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>(focusId ? "all" : "pending");
  const list = useServerFn(aiListProposedActions);
  const decide = useServerFn(aiDecideAction);

  const assistant = useQuery({
    enabled: !!orgId,
    queryKey: ["ai-proposed-actions", orgId, filter],
    queryFn: () => list({ data: { orgId: orgId!, status: filter === "pending" ? "pending" : "all" } }),
  });
  const agents = usePendingApprovals();

  const items: Item[] = [
    ...(assistant.data ?? [])
      .filter((a) => filter !== "done" || a.status !== "pending")
      .map((a): Item => ({
        id: a.id, source: "assistant", title: a.title,
        what: ACTION_LABELS[a.action_key as keyof typeof ACTION_LABELS] ?? a.action_key,
        status: a.status, createdAt: a.created_at, payload: a.payload, summary: a.summary, error: a.error,
      })),
    // Agent requests are listed while they wait; their history is on each agent's page.
    ...(filter === "done" ? [] : (agents.data ?? []) as Array<{ action_id: string; created_at: string; agent?: { name?: string }; action?: { action_type?: string; target_module?: string; proposed_changes_json?: unknown } }>)
      .map((ap): Item => {
        const type = ap.action?.action_type ?? "action";
        const args = (ap.action?.proposed_changes_json ?? {}) as Record<string, unknown>;
        const subject = String(args.name ?? args.title ?? "").trim();
        return {
          id: ap.action_id, source: "agent",
          title: `${TOOL_REGISTRY.find((t) => t.name === type)?.label ?? type.replaceAll("_", " ")}${subject ? `: ${subject}` : ""}`,
          what: ap.agent?.name ?? "An agent", status: "pending_approval",
          createdAt: ap.created_at, payload: args,
        };
      }),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const loading = assistant.isLoading || agents.isLoading;
  useScrollToFocus(focusId, !loading);

  const act = useMutation({
    mutationFn: async ({ item, decision }: { item: Item; decision: "approve" | "reject" }) => {
      if (item.source === "assistant") return decide({ data: { orgId: orgId!, id: item.id, decision } });
      const res = await decideAgentAction(item.id, decision);
      if (res.status === "failed") throw new Error(res.error ?? "The agent's action didn't run");
    },
    onSuccess: (_r, v) => toast.success(v.decision === "approve" ? "Approved and done" : "Rejected"),
    onSettled: () => {
      for (const k of ["ai-proposed-actions", "ai-agent-approvals", "ai-agent-actions", "notifications", "attention"]) {
        qc.invalidateQueries({ queryKey: [k] });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5" role="tablist" aria-label="Filter approvals">
          {(["pending", "done", "all"] as const).map((f) => (
            <Button variant="bare" size="bare" key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
              className={`border px-2.5 py-1 text-xs ${filter === f ? "border-foreground bg-foreground text-background" : "border-border hover:bg-accent"}`}>
              {f === "pending" ? "Waiting" : f === "done" ? "Decided" : "All"}
            </Button>
          ))}
        </div>
        <Link to="/app/settings/ai" hash="ai-rules" className="text-xs text-primary hover:underline">How much may the AI do on its own?</Link>
      </div>

      {loading ? <div className="border border-border bg-card shadow-sm p-6 text-sm text-muted-foreground">Loading…</div>
        : !items.length ? (
          <EmptyState
            title={filter === "pending" ? "Nothing waiting" : "Nothing here"}
            description="When the assistant, an AI agent or a connected AI app wants to change something, it waits here until you approve it."
          />
        ) : (
          <ul className="space-y-3">
            {items.map((it) => {
              const status = STATUS_TEXT[it.status] ?? it.status;
              const waiting = status === "Waiting";
              const busy = act.isPending && act.variables?.item.id === it.id;
              const Icon = it.source === "agent" ? Bot : Sparkles;
              return (
                <li key={it.id} id={focusDomId(it.id)} className={`border border-border bg-card p-4 ${it.id === focusId ? FOCUS_CLASS : ""}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center border border-border bg-background"><Icon className="size-4" /></span>
                      <div className="min-w-0">
                        <p className="font-medium">{it.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {it.source === "agent" ? "AI agent" : "Assistant or AI app"} · {it.what} ·{" "}
                          <span className={STATUS_CLASS[status] ?? ""}>{status}</span> · {timeAgo(it.createdAt)}
                        </p>
                        {it.summary && <p className="mt-1 text-sm text-muted-foreground">{it.summary}</p>}
                        {it.error && <p className="mt-1 text-sm text-destructive">{it.error}</p>}
                      </div>
                    </div>
                    {waiting && (
                      <div className="flex gap-2">
                        <Button variant="kitSolid" size="kit" onClick={() => act.mutate({ item: it, decision: "approve" })} disabled={act.isPending}
                          className="flex gap-1 px-3 py-1.5 font-medium">
                          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Approve
                        </Button>
                        <Button variant="bare" size="bare" onClick={() => act.mutate({ item: it, decision: "reject" })} disabled={act.isPending}
                          className="flex items-center gap-1 border border-border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50">
                          <X className="size-3.5" /> Reject
                        </Button>
                      </div>
                    )}
                  </div>
                  <details className="mt-3" open={waiting}>
                    <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Details</summary>
                    <JsonBlock value={it.payload} label="What it will save" className="mt-2" />
                  </details>
                </li>
              );
            })}
          </ul>
        )}
    </div>
  );
}
