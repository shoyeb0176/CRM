import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
export { KpiTile as StatTile } from "@/components/ui/kpi-tile";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { LayoutDashboard, Receipt, FileText, Briefcase, LifeBuoy, Building2, LogOut } from "lucide-react";
import { usePortalIdentity } from "@/lib/portal/use-portal";
import { Button } from "@/components/ui/button";

const NAV: Array<{ code: string; label: string; to: string; icon: typeof Receipt; exact?: boolean }> = [
  { code: "00", label: "Overview", to: "/portal", icon: LayoutDashboard, exact: true },
  { code: "01", label: "Invoices", to: "/portal/invoices", icon: Receipt },
  { code: "02", label: "Quotes", to: "/portal/quotes", icon: FileText },
  { code: "03", label: "Projects", to: "/portal/projects", icon: Briefcase },
  { code: "04", label: "Support", to: "/portal/support", icon: LifeBuoy },
  { code: "05", label: "Company", to: "/portal/profile", icon: Building2 },
];

export function PortalShell({ children, title, breadcrumb }: { children: ReactNode; title: string; breadcrumb?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const identity = usePortalIdentity();

  async function handleSignOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/portal/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen bg-background font-sans text-foreground">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex h-16 items-center border-b border-sidebar-border px-5">
          <Link to="/portal" className="font-display text-xl uppercase tracking-tight">
            Inuberry
          </Link>
        </div>
        <div className="border-b border-sidebar-border px-5 py-3">
          <div className="font-mono text-xs uppercase tracking-widest opacity-50">Customer Portal</div>
          <div className="truncate text-sm font-semibold">{identity.data?.org_name ?? "—"}</div>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 border-l-2 px-5 py-2 text-sm transition-colors ${
                  active
                    ? "border-primary bg-sidebar-accent text-sidebar-foreground"
                    : "border-transparent text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                }`}
              >
                <span className="font-mono text-xs opacity-50">{item.code}</span>
                <Icon className="size-4" />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-4">
          <div className="mb-2 truncate text-xs text-sidebar-foreground/70">{identity.data?.email}</div>
          <Button variant="kit" size="kit"
            onClick={handleSignOut}
            className="flex w-full justify-start border-sidebar-border px-3 py-2 hover:bg-sidebar-accent tracking-wider"
          >
            <LogOut className="size-3" /> Sign out
          </Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-x-hidden">
        {/* Phones: the sidebar is hidden, so the same tabs scroll across the top. */}
        <nav aria-label="Portal" className="flex overflow-x-auto border-b border-sidebar-border bg-sidebar text-sidebar-foreground md:hidden">
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            return (
              <Link key={item.to} to={item.to} className={`shrink-0 border-b-2 px-4 py-3 text-sm ${active ? "border-primary" : "border-transparent text-sidebar-foreground/70"}`}>
                {item.label}
              </Link>
            );
          })}
          <Button variant="bare" size="bare" onClick={handleSignOut} className="ml-auto shrink-0 px-4 py-3 text-sm text-sidebar-foreground/70">Sign out</Button>
        </nav>
        <header className="flex h-16 items-center justify-between border-b border-border bg-background px-6">
          <div>
            {breadcrumb && (
              <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{breadcrumb}</div>
            )}
            <h1 className="font-display text-xl uppercase tracking-tight">{title}</h1>
          </div>
        </header>
        <div className="p-6">
          {identity.isSuccess && !identity.data?.company_id && (
            <div role="status" className="mb-6 border border-border bg-card shadow-sm p-4 text-sm">
              Your account isn't linked to a customer company yet. Ask your supplier to add <b>{identity.data?.email ?? "your email"}</b> under
              Settings › Portal users, then sign in again with that email.
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}

// One empty state across the app; portal pages use its compact size.
export { EmptyState } from "@/components/crm/empty-state";


export function PortalCard({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{title}</div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}
