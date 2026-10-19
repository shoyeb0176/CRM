import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { AppShell } from "@/components/app/app-shell";
import { useCanAccessAccounting, useEnsureCOA } from "@/lib/accounting/use-accounting";
import { Lock } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
const TABS = [
  { to: "/app/accounting",          label: "Overview", exact: true },
  { to: "/app/accounting/coa",      label: "Chart of accounts" },
  { to: "/app/accounting/journal",  label: "Journal entries" },
  { to: "/app/accounting/pnl",      label: "P&L" },
  { to: "/app/accounting/balance",  label: "Balance sheet" },
  { to: "/app/accounting/trial",    label: "Trial balance" },
  { to: "/app/accounting/ledger",   label: "General ledger" },
  { to: "/app/accounting/settings", label: "Settings" },
];

export function AccountingShell({
  title, breadcrumb, actions, children,
}: { title: string; breadcrumb: string; actions?: ReactNode; children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const canAccess = useCanAccessAccounting();
  const navigate = useNavigate();
  useEnsureCOA();

  useEffect(() => {
    if (!canAccess) return;
  }, [canAccess]);

  if (!canAccess) {
    return (
      <AppShell title="Accounting" breadcrumb="accounting">
        <div className="mx-auto max-w-md py-20 text-center">
          <Lock className="mx-auto mb-4 size-10 text-muted-foreground" />
          <h2 className="font-display text-xl">Access restricted</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Accounting is available to Organization Owners, Admins, and Accountants.
          </p>
          <Button variant="bare" size="bare" onClick={() => navigate({ to: "/app" })} className="mt-6 font-mono text-xs uppercase tracking-widest text-primary hover:underline">
            Back to dashboard
          </Button>
        </div>
      </AppShell>
    );
  }

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
