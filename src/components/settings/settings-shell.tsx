import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { AppShell } from "@/components/app/app-shell";
import type { ReactNode } from "react";
import {
  AlarmClock, BellRing, Building2, Contact, CreditCard, Eye, Hash, KeyRound, type LucideIcon, Mail, Percent,
  ScrollText, ShieldCheck, Sparkles, Users,
} from "lucide-react";

export type SettingsGroup = "Workspace" | "People and access" | "Money" | "AI and integrations";
export const SETTINGS_GROUPS: SettingsGroup[] = ["Workspace", "People and access", "Money", "AI and integrations"];

// One list for the Settings menu and the Overview tiles.
export const SETTINGS_SECTIONS: Array<{ to: string; label: string; desc: string; icon: LucideIcon; group: SettingsGroup }> = [
  { to: "/app/settings/organization",  label: "Organization",   group: "Workspace",          desc: "Company profile, address, currency and fiscal year.", icon: Building2 },
  { to: "/app/settings/numbering",     label: "Numbering",      group: "Workspace",          desc: "Prefixes and sequences for quotes, orders and invoices.", icon: Hash },
  { to: "/app/settings/notifications", label: "Notifications",  group: "Workspace",          desc: "What reaches your bell and email, and what your sidebar shows.", icon: BellRing },
  { to: "/app/settings/email",         label: "Email",          group: "Workspace",          desc: "Send quotes and invoices from your own mailbox.", icon: Mail },
  { to: "/app/settings/members",       label: "Members",        group: "People and access",  desc: "Invite teammates and manage who has access.", icon: Users },
  { to: "/app/settings/roles",         label: "Roles",          group: "People and access",  desc: "What each role can see and change.", icon: ShieldCheck },
  { to: "/app/settings/portal-users",  label: "Portal users",   group: "People and access",  desc: "Customers who can sign in to your customer portal.", icon: Contact },
  { to: "/app/settings/access-log",    label: "Support access", group: "People and access",  desc: "Approve or end Inuberry support access to this workspace.", icon: Eye },
  { to: "/app/settings/audit",         label: "Audit log",      group: "People and access",  desc: "Who changed what, and when.", icon: ScrollText },
  { to: "/app/settings/billing",       label: "Billing",        group: "Money",              desc: "Your plan, what's included and payment history.", icon: CreditCard },
  { to: "/app/settings/taxes",         label: "Taxes",          group: "Money",              desc: "Tax rates for quotes, orders and invoices.", icon: Percent },
  { to: "/app/settings/ai",            label: "AI",             group: "AI and integrations", desc: "What the AI may do on its own, models, and your own AI key.", icon: Sparkles },
  { to: "/app/settings/automations",   label: "Alert rules",    group: "AI and integrations", desc: "Daily alerts for overdue invoices, low stock, stale deals and late tasks.", icon: AlarmClock },
  { to: "/app/settings/developer",     label: "Developer",      group: "AI and integrations", desc: "Connect AI apps, personal keys, API keys and webhooks.", icon: KeyRound },
];

/** Settings pages: a grouped menu on the left (a dropdown on phones) and the page on the right. */
export function SettingsShell({ children, title, breadcrumb }: { children: ReactNode; title: string; breadcrumb?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const isActive = (to: string) => pathname === to || pathname.startsWith(to + "/");
  return (
    <AppShell title={title} breadcrumb={breadcrumb ?? "settings"}>
      <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        <label className="lg:hidden">
          <span className="sr-only">Settings section</span>
          <select
            value={SETTINGS_SECTIONS.find((s) => isActive(s.to))?.to ?? "/app/settings"}
            onChange={(e) => navigate({ to: e.target.value })}
            className="h-10 w-full border border-input bg-card shadow-xs px-3 text-sm"
          >
            <option value="/app/settings">Overview</option>
            {SETTINGS_GROUPS.map((g) => (
              <optgroup key={g} label={g}>
                {SETTINGS_SECTIONS.filter((s) => s.group === g).map((s) => <option key={s.to} value={s.to}>{s.label}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <nav aria-label="Settings" className="hidden lg:block">
          <div className="sticky top-20 space-y-4 text-sm">
            <Link to="/app/settings" className={`block border-l-2 px-3 py-1 ${pathname === "/app/settings" ? "border-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              Overview
            </Link>
            {SETTINGS_GROUPS.map((g) => (
              <div key={g}>
                <div className="mb-1 px-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">{g}</div>
                {/* Indented under the group label so the grouping reads at a glance. */}
                <div className="ml-3">
                  {SETTINGS_SECTIONS.filter((s) => s.group === g).map(({ to, label, icon: Icon }) => (
                    <Link key={to} to={to}
                      className={`flex items-center gap-2 border-l-2 px-3 py-1.5 ${isActive(to) ? "border-primary bg-muted font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                      <Icon className="size-3.5 shrink-0" /> {label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </AppShell>
  );
}

export function SettingsField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function SettingsInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`border border-input bg-card px-3 py-2 text-sm shadow-xs transition-colors hover:border-foreground/30 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30 ${props.className ?? ""}`}
    />
  );
}

export function SettingsSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`border border-input bg-card px-3 py-2 text-sm shadow-xs transition-colors hover:border-foreground/30 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30 ${props.className ?? ""}`}
    />
  );
}
