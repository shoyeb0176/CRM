import { createFileRoute, Link } from "@tanstack/react-router";
import { AgentsShell } from "@/components/agents/agents-shell";
import { useAgentRuns, AGENT_STATUS_TONE } from "@/lib/agents/use-agents";
import { EmptyState } from "@/components/crm/empty-state";
import { StatusBadge } from "@/components/crm/status-badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/app/agents/runs")({
  head: () => ({ meta: [{ title: "Agent runs — Inuberry" }] }),
  component: RunsPage,
});

function RunsPage() {
  const runs = useAgentRuns();
  return (
    <AgentsShell title="Agent runs">
      {runs.isLoading ? (
        <div className="border border-border bg-card shadow-sm p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : !runs.data?.length ? (
        <EmptyState title="No runs" description="Agent runs you trigger or schedule will appear here." action={<Button asChild variant="outline"><Link to="/app/agents/list">Open your agents</Link></Button>} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border border-border bg-card text-sm">
            <thead className="border-b border-border font-mono text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Agent</th>
                <th className="px-3 py-2 text-left">Trigger</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Output</th>
                <th className="px-3 py-2 text-left">When</th>
              </tr>
            </thead>
            <tbody>
              {runs.data.map((r) => (
                <tr key={r.id} className="border-b border-border">
                  <td className="px-3 py-2">
                    {r.agent?.id ? <Link to="/app/agents/$agentId" params={{ agentId: r.agent.id }} className="hover:underline">{r.agent.name}</Link> : "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs uppercase">{r.trigger_type}</td>
                  <td className="px-3 py-2"><StatusBadge tone={AGENT_STATUS_TONE[r.status] ?? "default"}>{r.status}</StatusBadge></td>
                  <td className="px-3 py-2 max-w-md truncate">{r.output_summary || r.error_message || "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AgentsShell>
  );
}
