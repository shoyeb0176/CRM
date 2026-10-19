import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AgentsShell } from "@/components/agents/agents-shell";
import { useAgents, AGENT_STATUS_TONE } from "@/lib/agents/use-agents";
import { EmptyState } from "@/components/crm/empty-state";
import { StatusBadge } from "@/components/crm/status-badge";
import { Bot, Plus, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/agents/list")({
  head: () => ({ meta: [{ title: "Agents — Inuberry" }] }),
  component: AgentListPage,
});

function AgentListPage() {
  const agents = useAgents();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filtered = (agents.data ?? []).filter((a) => {
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (q && !`${a.name} ${a.description ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <AgentsShell title="Agents">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-border bg-card shadow-sm p-3">
        <div className="flex flex-1 items-center gap-2">
          <Search className="size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search agents…"
            className="w-full bg-transparent text-sm focus:outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-input bg-card shadow-xs px-2 py-1.5 font-mono text-xs uppercase tracking-widest"
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="archived">Archived</option>
        </select>
        <Link
          to="/app/agents/new"
          className="inline-flex items-center gap-2 bg-foreground px-3 py-1.5 font-mono text-xs uppercase tracking-widest text-background hover:bg-primary"
        >
          <Plus className="size-3" /> New agent
        </Link>
      </div>

      {agents.isLoading ? (
        <div className="border border-border bg-card shadow-sm p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={agents.data?.length === 0 ? "No agents yet" : "No matches"}
          description={
            agents.data?.length === 0
              ? "Create your first AI agent from scratch or start from a template."
              : "Adjust filters or clear your search to see other agents."
          }
          action={
            agents.data?.length === 0 ? (
              <div className="flex gap-2">
                <Link to="/app/agents/new" className="border border-foreground bg-foreground px-3 py-1.5 font-mono text-xs uppercase tracking-widest text-background">New agent</Link>
                <Link to="/app/agents/templates" className="border border-border px-3 py-1.5 font-mono text-xs uppercase tracking-widest">Browse templates</Link>
              </div>
            ) : undefined
          }
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((a) => (
            <li key={a.id} className="group border border-border bg-card transition-colors hover:border-foreground">
              <Link to="/app/agents/$agentId" params={{ agentId: a.id }} className="block p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="grid size-8 place-items-center border border-border bg-background"><Bot className="size-4" /></div>
                    <div>
                      <div className="font-heading text-base">{a.name}</div>
                      <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{a.agent_type}</div>
                    </div>
                  </div>
                  <StatusBadge tone={AGENT_STATUS_TONE[a.status] ?? "default"}>{a.status}</StatusBadge>
                </div>
                <p className="line-clamp-2 text-sm text-muted-foreground">{a.description || "—"}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {a.requires_approval && <StatusBadge tone="warning">Requires approval</StatusBadge>}
                  {a.memory_enabled && <StatusBadge tone="info">Memory</StatusBadge>}
                  <StatusBadge tone="neutral">{a.model_provider}</StatusBadge>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AgentsShell>
  );
}
