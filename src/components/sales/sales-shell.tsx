import { Link, useRouterState } from "@tanstack/react-router";
import { AppShell } from "@/components/app/app-shell";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useOrgId } from "@/lib/crm/use-org";
import { FIRST_PAGE } from "@/lib/list-query";
import { quotesList, salesOrdersList } from "@/lib/sales/queries";

const TABS = [
  { to: "/app/sales",           label: "Overview", exact: true },
  { to: "/app/sales/quotes",    label: "Quotes" },
  { to: "/app/sales/orders",    label: "Sales orders" },
  { to: "/app/invoices",        label: "Invoices" },
  { to: "/app/sales/payments",  label: "Payments" },
];

export function SalesShell({
  title, breadcrumb, actions, children,
}: { title: string; breadcrumb: string; actions?: ReactNode; children: ReactNode; }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const qc = useQueryClient();
  const orgId = useOrgId();
  // Pointing at a list's tab loads its first page, so the click finds it ready.
  const PREFETCH: Record<string, () => unknown> = {
    "/app/sales/quotes": () => qc.prefetchQuery(quotesList(orgId, FIRST_PAGE)),
    "/app/sales/orders": () => qc.prefetchQuery(salesOrdersList(orgId, FIRST_PAGE)),
  };
  return (
    <AppShell title={title} breadcrumb={breadcrumb}>
      <div className="-mt-2 mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-border">
        <nav className="flex flex-wrap">
          {TABS.map((t) => {
            const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
            return (
              <Link key={t.to} to={t.to}
                onPointerEnter={() => { if (orgId) void PREFETCH[t.to]?.(); }}
                onFocus={() => { if (orgId) void PREFETCH[t.to]?.(); }}
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
