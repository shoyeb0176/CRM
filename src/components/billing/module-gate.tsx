import { Link } from "@tanstack/react-router";
import { Lock, ArrowUpRight } from "lucide-react";
import { useModuleAccess, type ModuleKey } from "@/lib/billing/use-subscription";
import { AppShell } from "@/components/app/app-shell";
import { StartTrialButton } from "@/components/billing/start-trial-button";
import type { ReactNode } from "react";

export function ModuleGate({ module, children }: { module: ModuleKey; children: ReactNode }) {
  const { isLoading, allowed, planName } = useModuleAccess(module);
  if (isLoading)
    return (
      <AppShell title={MODULE_LABEL[module]}>
        <div className="font-mono text-xs text-muted-foreground">Loading…</div>
      </AppShell>
    );
  if (allowed) return <>{children}</>;
  return (
    <AppShell title={MODULE_LABEL[module]} breadcrumb="locked">
      <LockedModuleScreen module={module} planName={planName} />
    </AppShell>
  );
}

const MODULE_LABEL: Record<ModuleKey, string> = {
  crm: "CRM",
  sales: "Sales",
  invoices: "Invoices",
  inventory: "Inventory",
  purchasing: "Purchasing",
  accounting: "Accounting",
  projects: "Projects",
  hr: "HR & Employees",
  reports: "Reports",
  settings: "Settings",
};

export function LockedModuleScreen({ module, planName }: { module: ModuleKey; planName: string }) {
  const label = MODULE_LABEL[module];
  return (
    <div className="mx-auto max-w-2xl border border-border bg-card shadow-sm p-10 text-center">
      <div className="mx-auto mb-6 flex size-14 items-center justify-center border border-border bg-muted">
        <Lock className="size-6 text-muted-foreground" />
      </div>
      <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
        Not included · {planName}
      </div>
      <h2 className="mt-2 font-display text-2xl uppercase tracking-tight">{label} is locked</h2>
      <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
        Your current plan does not include the {label} module. Upgrade your subscription to unlock it for your team.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/app/settings/billing"
          className="inline-flex items-center gap-2 bg-primary px-5 py-2.5 font-mono text-xs uppercase tracking-widest text-primary-foreground hover:opacity-90"
        >
          View billing & plans <ArrowUpRight className="size-3.5" />
        </Link>
        <StartTrialButton />
      </div>
    </div>
  );
}
