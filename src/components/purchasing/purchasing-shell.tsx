import { Link, useRouterState } from "@tanstack/react-router";
import { AppShell } from "@/components/app/app-shell";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useOrgId } from "@/lib/crm/use-org";
import { FIRST_PAGE } from "@/lib/list-query";
import { ALL_SUPPLIERS, purchaseOrdersList, suppliersMin, vendorBillsList } from "@/lib/purchasing/queries";

const TABS = [
  { to: "/app/purchasing",            label: "Overview",         exact: true },
  { to: "/app/purchasing/orders",     label: "Purchase orders" },
  { to: "/app/purchasing/bills",      label: "Vendor bills" },
  { to: "/app/purchasing/expenses",   label: "Expenses" },
  { to: "/app/purchasing/categories", label: "Categories" },
];

export function PurchasingShell({
  title, breadcrumb, actions, children,
}: { title: string; breadcrumb: string; actions?: ReactNode; children: ReactNode; }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const qc = useQueryClient();
  const orgId = useOrgId();
  // Pointing at a list's tab loads its first page, so the click finds it ready.
  const PREFETCH: Record<string, () => unknown> = {
    "/app/purchasing/orders": () => Promise.all([qc.prefetchQuery(purchaseOrdersList(orgId, ALL_SUPPLIERS, FIRST_PAGE)), qc.prefetchQuery(suppliersMin(orgId))]),
    "/app/purchasing/bills": () => Promise.all([qc.prefetchQuery(vendorBillsList(orgId, ALL_SUPPLIERS, FIRST_PAGE)), qc.prefetchQuery(suppliersMin(orgId))]),
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
