import { Link, useRouterState } from "@tanstack/react-router";
import { AppShell } from "@/components/app/app-shell";
import type { ReactNode } from "react";

const TABS = [
  { to: "/app/products",                label: "Products",   exact: true },
  { to: "/app/products/categories",     label: "Categories" },
  { to: "/app/inventory",               label: "Stock",      exact: true },
  { to: "/app/inventory/warehouses",    label: "Warehouses" },
  { to: "/app/inventory/movements",     label: "Movements" },
  { to: "/app/inventory/adjustments",   label: "Adjustments" },
  { to: "/app/suppliers",               label: "Suppliers" },
];

export function InventoryShell({
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
              <Link
                key={t.to}
                to={t.to}
                className={`-mb-px border-b-2 px-4 py-3 font-mono text-xs uppercase tracking-widest transition-colors ${
                  active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
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
