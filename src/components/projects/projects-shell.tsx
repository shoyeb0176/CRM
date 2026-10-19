import { Link, useRouterState } from "@tanstack/react-router";
import { AppShell } from "@/components/app/app-shell";
import type { ReactNode } from "react";

const TABS = [
  { to: "/app/projects", label: "Projects", exact: true },
  { to: "/app/projects/timesheets", label: "Timesheets" },
];

export function ProjectsShell({
  title, breadcrumb, actions, children,
}: { title: string; breadcrumb: string; actions?: ReactNode; children: ReactNode; }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <AppShell title={title} breadcrumb={breadcrumb}>
      <div className="-mt-2 mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-border">
        <nav className="flex flex-wrap">
          {TABS.map((t) => {
            const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
            return (
              <Link key={t.to} to={t.to}
                className={`-mb-px border-b-2 px-4 py-3 font-mono text-xs uppercase tracking-widest transition-colors ${
                  active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}>
                {t.label}
              </Link>
            );
          })}
        </nav>
        {actions && <div className="pb-2">{actions}</div>}
      </div>
      {children}
    </AppShell>
  );
}

export function fmtMoney(n: number | string | null | undefined, ccy = "USD") {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  return new Intl.NumberFormat(undefined, { style: "currency", currency: ccy }).format(v || 0);
}

export function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

export const PROJECT_STATUSES = ["planned", "active", "on_hold", "completed", "cancelled"] as const;
export type ProjectStatus = typeof PROJECT_STATUSES[number];

export const TASK_STATUSES = ["todo", "in_progress", "review", "done", "blocked", "cancelled"] as const;
export type TaskStatus = typeof TASK_STATUSES[number];

export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type TaskPriority = typeof TASK_PRIORITIES[number];

export const PROJECT_STATUS_TONE: Record<ProjectStatus, "neutral" | "info" | "warning" | "success" | "danger"> = {
  planned: "neutral", active: "info", on_hold: "warning", completed: "success", cancelled: "danger",
};

export const TASK_STATUS_TONE: Record<TaskStatus, "neutral" | "info" | "primary" | "success" | "warning" | "danger"> = {
  todo: "neutral", in_progress: "info", review: "primary", done: "success", blocked: "warning", cancelled: "danger",
};

export const TASK_PRIORITY_TONE: Record<TaskPriority, "neutral" | "info" | "warning" | "danger"> = {
  low: "neutral", medium: "info", high: "warning", urgent: "danger",
};
