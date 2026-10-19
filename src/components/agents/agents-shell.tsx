import { Link, useRouterState } from "@tanstack/react-router";
import { AppShell } from "@/components/app/app-shell";
import type { ReactNode } from "react";

const TABS = [
  { to: "/app/agents",              label: "Overview",    exact: true },
  { to: "/app/agents/list",         label: "Agents" },
  { to: "/app/inbox",    label: "Approvals" },
  { to: "/app/agents/runs",         label: "Runs" },
  { to: "/app/agents/connections",  label: "Connections" },
  { to: "/app/agents/tools",        label: "Tool registry" },
  { to: "/app/agents/templates",    label: "Templates" },
];

export function AgentsShell({ children, title, breadcrumb }: { children: ReactNode; title: string; breadcrumb?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <AppShell title={title} breadcrumb={breadcrumb ?? "AI Agents"}>
      <div className="-mt-2 mb-6 flex flex-wrap items-center gap-2 border-b border-border pb-3">
        {TABS.map((t) => {
          const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
          return (
            <Link
              key={t.to}
              to={t.to}
              className={`border px-3 py-1.5 font-mono text-xs uppercase tracking-widest transition-colors ${
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      {children}
    </AppShell>
  );
}
