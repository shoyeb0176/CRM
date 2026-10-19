import { Link, useRouterState } from "@tanstack/react-router";
import { AppShell } from "@/components/app/app-shell";
import type { ReactNode } from "react";

const TABS = [
  { to: "/app/hr",             label: "Overview",   exact: true },
  { to: "/app/hr/employees",   label: "Employees" },
  { to: "/app/hr/departments", label: "Departments" },
  { to: "/app/hr/titles",      label: "Job Titles" },
  { to: "/app/hr/leave",       label: "Leave" },
  { to: "/app/hr/attendance",  label: "Attendance" },
  { to: "/app/hr/payroll",     label: "Payroll" },
];

export function HrShell({
  title, breadcrumb, actions, children,
}: {
  title: string;
  breadcrumb: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <AppShell title={title} breadcrumb={breadcrumb}>
      <div className="-mt-2 mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-border">
        <nav className="flex flex-wrap">
          {TABS.map((t) => {
            const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
            return (
              <Link
                key={t.to}
                to={t.to}
                className={`-mb-px border-b-2 px-4 py-3 font-mono text-xs uppercase tracking-widest transition-colors ${
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
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
