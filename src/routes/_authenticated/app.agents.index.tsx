import { createFileRoute, Link } from "@tanstack/react-router";
import { AgentsShell } from "@/components/agents/agents-shell";
import { useAgentDashboard, AGENT_STATUS_TONE } from "@/lib/agents/use-agents";
import { StatusBadge } from "@/components/crm/status-badge";
import { Bot, Activity, AlertTriangle, CheckCircle2, Clock, Sparkles } from "lucide-react";

import { SectionTitle } from "@/components/ui/section-title";
export const Route = createFileRoute("/_authenticated/app/agents/")({
  head: () => ({ meta: [{ title: "AI Agents — Inuberry" }] }),
  component: AgentDashboardPage,
});

function AgentDashboardPage() {
  const { data, isLoading } = useAgentDashboard();
  const stats = [
    { label: "Total agents",      value: data?.totalAgents ?? 0,      icon: Bot,           tone: "default" as const },
    { label: "Active",            value: data?.activeAgents ?? 0,     icon: Activity,      tone: "success" as const },
    { label: "Runs (24h)",        value: data?.runsToday ?? 0,        icon: Sparkles,      tone: "info" as const },
    { label: "Failed (24h)",      value: data?.failedRuns ?? 0,       icon: AlertTriangle, tone: "danger" as const },
    { label: "Pending approvals", value: data?.pendingApprovals ?? 0, icon: Clock,         tone: "warning" as const },
  ];

  return (
    <AgentsShell title="AI Agent Control Center">
      <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="border border-border bg-card shadow-sm p-4">
            <div className="flex items-center justify-between">
              <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{s.label}</div>
              <s.icon className="size-4 text-muted-foreground" />
            </div>
            <div className="mt-3 font-display text-3xl">{isLoading ? "—" : s.value}</div>
          </div>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="border border-border bg-card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <SectionTitle>Recent runs</SectionTitle>
            <Link to="/app/agents/runs" className="font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground">All runs →</Link>
          </div>
          {(data?.recentRuns ?? []).length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No runs yet. Create an agent and trigger your first run from the chat console.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {(data?.recentRuns ?? []).map((r) => (
                <li key={r.id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{r.agent?.name ?? "—"}</div>
                    <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                      {r.trigger_type} · {new Date(r.created_at).toLocaleString()}
                    </div>
                  </div>
                  <StatusBadge tone={AGENT_STATUS_TONE[r.status] ?? "default"}>{r.status}</StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <SectionTitle>Quick actions</SectionTitle>
          </div>
          <div className="flex flex-col divide-y divide-border">
            <Link to="/app/agents/list" className="px-4 py-3 text-sm hover:bg-accent">Browse all agents →</Link>
            <Link to="/app/agents/templates" className="px-4 py-3 text-sm hover:bg-accent">Use a template →</Link>
            <Link to="/app/inbox" search={{ tab: "approvals" }} className="px-4 py-3 text-sm hover:bg-accent">Review pending approvals →</Link>
            <Link to="/app/agents/connections" className="px-4 py-3 text-sm hover:bg-accent">Configure external connections →</Link>
            <Link to="/app/agents/tools" className="px-4 py-3 text-sm hover:bg-accent">Browse the tool registry →</Link>
          </div>
        </div>
      </section>

      <section className="mt-8 border border-dashed border-border bg-card/40 p-4 text-sm text-muted-foreground">
        <div className="mb-1 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-foreground">
          <CheckCircle2 className="size-3 text-success" /> Safety model
        </div>
        Every agent runs against your organization only (RLS-scoped). Sensitive tools require human approval before execution.
        Audit logs are append-only and visible under each agent's detail page.
      </section>
    </AgentsShell>
  );
}
