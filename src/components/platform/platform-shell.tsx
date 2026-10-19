import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { AppShell } from "@/components/app/app-shell";
import { useMyMemberships } from "@/lib/use-memberships";
import type { ReactNode } from "react";
import {
  BarChart3, Beaker, Building2, CreditCard, Gift, Handshake, LayoutDashboard, type LucideIcon, MessageSquareWarning,
  Receipt, ScrollText, ShieldAlert, Tags, UserCheck, UserCog,
} from "lucide-react";
import { useIsPlatformReviewer } from "@/lib/feedback/feedback";

export type PlatformGroup = "Customers" | "Pricing" | "Insights and logs" | "Feedback";
export const PLATFORM_GROUPS: PlatformGroup[] = ["Customers", "Pricing", "Insights and logs", "Feedback"];

// One list for the Platform menu and the Overview tiles, grouped like Settings.
export const PLATFORM_SECTIONS: Array<{ to: string; label: string; desc: string; icon: LucideIcon; group: PlatformGroup; reviewers?: boolean }> = [
  { to: "/app/platform/organizations", label: "Organizations",    group: "Customers",         icon: Building2,   desc: "Every workspace: plan, members, suspend or delete." },
  { to: "/app/platform/subscriptions", label: "Subscriptions",    group: "Customers",         icon: CreditCard,  desc: "Who is on which plan, renewals and trials." },
  { to: "/app/platform/demo",          label: "Demo workspaces",  group: "Customers",         icon: Beaker,      desc: "Sample workspaces for sales demos." },
  { to: "/app/platform/impersonation", label: "Support access",   group: "Customers",         icon: UserCog,     desc: "Ask a workspace for time-boxed access to help them." },
  { to: "/app/platform/plans",         label: "Plans",            group: "Pricing",           icon: Tags,        desc: "Prices and limits of each plan." },
  { to: "/app/platform/offerings",     label: "Custom offerings", group: "Pricing",           icon: Gift,        desc: "Special deals for one workspace." },
  { to: "/app/platform/sponsors",      label: "Sponsors",         group: "Pricing",           icon: Handshake,   desc: "Partner offers shown on Startup dashboards." },
  { to: "/app/platform/insights",      label: "Insights",         group: "Insights and logs", icon: BarChart3,   desc: "People, workspaces, module use and how people found us." },
  { to: "/app/platform/audit",         label: "Audit log",        group: "Insights and logs", icon: ScrollText,  desc: "Everything done in Platform admin, and by whom." },
  { to: "/app/platform/events",        label: "Billing events",   group: "Insights and logs", icon: Receipt,     desc: "Payments and Stripe events as they arrived." },
  { to: "/app/platform/feedback",      label: "Reports",          group: "Feedback",          icon: MessageSquareWarning, desc: "Problems and ideas sent with Report a problem.", reviewers: true },
  { to: "/app/platform/reviewers",     label: "Reviewers",        group: "Feedback",          icon: UserCheck,   desc: "People who may read and answer reports." },
];

/** Platform admin pages. `allowReviewers` opens a page to platform reviewers as well as owners. */
export function PlatformShell({ children, title, breadcrumb, allowReviewers }: { children: ReactNode; title: string; breadcrumb?: string; allowReviewers?: boolean }) {
  const me = useMyMemberships();
  const reviewer = useIsPlatformReviewer();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const isPlatformOwner = me.data?.some((m) => m.role === "platform_owner");
  const allowed = isPlatformOwner || (allowReviewers && reviewer.data);
  const sections = isPlatformOwner ? PLATFORM_SECTIONS : PLATFORM_SECTIONS.filter((t) => t.reviewers);
  const isActive = (to: string) => pathname === to || pathname.startsWith(to + "/");

  if (me.isLoading || (allowReviewers && !isPlatformOwner && reviewer.isLoading)) {
    return <AppShell title="Platform" breadcrumb="platform"><div className="font-mono text-xs text-muted-foreground">Loading…</div></AppShell>;
  }
  if (!allowed) {
    return (
      <AppShell title="Platform" breadcrumb="platform">
        <div className="mx-auto max-w-lg border border-border bg-card shadow-sm p-8 text-center">
          <ShieldAlert className="mx-auto mb-3 size-6 text-muted-foreground" />
          <h2 className="font-display text-xl uppercase tracking-tight">Platform owner only</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This area is reserved for Inuberry platform operators.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={title} breadcrumb={breadcrumb ?? "platform"}>
      <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        <label className="lg:hidden">
          <span className="sr-only">Platform section</span>
          <select
            value={sections.find((s) => isActive(s.to))?.to ?? "/app/platform"}
            onChange={(e) => navigate({ to: e.target.value })}
            className="h-10 w-full border border-input bg-card shadow-xs px-3 text-sm"
          >
            {isPlatformOwner && <option value="/app/platform">Overview</option>}
            {PLATFORM_GROUPS.map((g) => {
              const items = sections.filter((s) => s.group === g);
              return items.length ? (
                <optgroup key={g} label={g}>
                  {items.map((s) => <option key={s.to} value={s.to}>{s.label}</option>)}
                </optgroup>
              ) : null;
            })}
          </select>
        </label>
        <nav aria-label="Platform admin" className="hidden lg:block">
          <div className="sticky top-20 space-y-4 text-sm">
            {isPlatformOwner && (
              <Link to="/app/platform" className={`flex items-center gap-2 border-l-2 px-3 py-1 ${pathname === "/app/platform" ? "border-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                <LayoutDashboard className="size-3.5 shrink-0" /> Overview
              </Link>
            )}
            {PLATFORM_GROUPS.map((g) => {
              const items = sections.filter((s) => s.group === g);
              if (!items.length) return null;
              return (
                <div key={g}>
                  <div className="mb-1 px-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">{g}</div>
                  <div className="ml-3">
                    {items.map(({ to, label, icon: Icon }) => (
                      <Link key={to} to={to}
                        className={`flex items-center gap-2 border-l-2 px-3 py-1.5 ${isActive(to) ? "border-primary bg-muted font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                        <Icon className="size-3.5 shrink-0" /> {label}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </AppShell>
  );
}
