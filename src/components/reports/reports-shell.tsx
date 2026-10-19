import { Link, useRouterState } from "@tanstack/react-router";
export { KpiTile } from "@/components/ui/kpi-tile";
import { AppShell } from "@/components/app/app-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

const TABS = [
  { to: "/app/reports", label: "Overview", exact: true },
  { to: "/app/reports/sales", label: "Sales" },
  { to: "/app/reports/crm", label: "CRM" },
  { to: "/app/reports/inventory", label: "Inventory" },
  { to: "/app/reports/purchasing", label: "Purchasing" },
  { to: "/app/reports/projects", label: "Projects" },
  { to: "/app/reports/accounting", label: "Accounting" },
];

export function ReportsShell({
  title, breadcrumb, actions, children,
}: { title: string; breadcrumb: string; actions?: ReactNode; children: ReactNode }) {
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

export function DateRangeBar({
  from, to, setFrom, setTo, onExport,
}: { from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void; onExport?: () => void }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" />
        </div>
        <div>
          <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" />
        </div>
      </div>
      {onExport && (
        <Button variant="kit" size="kit" onClick={onExport}
          className="bg-card px-3 py-2 text-muted-foreground hover:text-foreground">
          <Download className="size-3" /> Export CSV
        </Button>
      )}
    </div>
  );
}


export function ReportCard({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div>
          <div className="font-heading text-sm uppercase tracking-wide">{title}</div>
          {subtitle && <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{subtitle}</div>}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function NoData({ label = "No data in this range." }: { label?: string }) {
  return <div className="py-10 text-center text-sm text-muted-foreground">{label}</div>;
}

export function LoadingState() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-8 animate-pulse bg-muted/40" />
      ))}
    </div>
  );
}

export function DataTable<T>({
  rows, columns, empty,
}: {
  rows: T[];
  columns: Array<{ key: string; label: string; align?: "left" | "right"; render: (row: T) => ReactNode }>;
  empty?: string;
}) {
  if (!rows.length) return <NoData label={empty} />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            {columns.map((c) => (
              <th key={c.key} className={`px-3 py-2 font-mono text-xs uppercase tracking-widest text-muted-foreground ${c.align === "right" ? "text-right" : "text-left"}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/60 hover:bg-muted/20">
              {columns.map((c) => (
                <td key={c.key} className={`px-3 py-2 ${c.align === "right" ? "text-right font-mono" : ""}`}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { StatusBadge } from "@/components/crm/status-badge";
