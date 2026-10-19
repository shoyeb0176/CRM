import { createFileRoute, Link } from "@tanstack/react-router";
import { BadgeCheck, Bell, LifeBuoy } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { ApprovalsPanel } from "@/components/inbox/approvals-panel";
import { NotificationsPanel } from "@/components/inbox/notifications-panel";
import { SupportPanel } from "@/components/inbox/support-panel";
import { useAttentionCounts } from "@/lib/notifications/use-attention";
import { useOrgId } from "@/lib/crm/use-org";
import { UUID } from "@/lib/use-focus-row";

const TABS = [
  { key: "approvals", label: "Approvals", icon: BadgeCheck },
  { key: "support", label: "Support", icon: LifeBuoy },
  { key: "notifications", label: "Notifications", icon: Bell },
] as const;
type Tab = (typeof TABS)[number]["key"];

export const Route = createFileRoute("/_authenticated/app/inbox")({
  head: () => ({ meta: [{ title: "Inbox — Inuberry" }] }),
  validateSearch: (s: Record<string, unknown>): { tab?: Tab; action?: string } => ({
    ...(TABS.some((t) => t.key === s.tab) ? { tab: s.tab as Tab } : {}),
    ...(typeof s.action === "string" && UUID.test(s.action) ? { action: s.action } : {}),
  }),
  component: InboxPage,
});

/** Everything waiting on you: AI approvals, open support tickets and notifications. */
function InboxPage() {
  const { tab = "approvals", action } = Route.useSearch();
  const counts = useAttentionCounts(useOrgId()).data;
  return (
    <AppShell title="Inbox" breadcrumb="inbox">
      <div className="mb-4 flex gap-px overflow-x-auto border-b border-border" role="tablist" aria-label="Inbox">
        {TABS.map((t) => {
          const n = t.key === "approvals" ? counts?.approvals : t.key === "support" ? counts?.support : undefined;
          const active = tab === t.key;
          return (
            <Link key={t.key} to="/app/inbox" search={{ tab: t.key }} role="tab" aria-selected={active}
              className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm ${active ? "border-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              <t.icon className="size-4" /> {t.label}
              {!!n && <span className="bg-primary px-1.5 font-mono text-xs leading-5 text-primary-foreground">{n > 99 ? "99+" : n}</span>}
            </Link>
          );
        })}
      </div>
      {tab === "approvals" && <ApprovalsPanel focusId={action} />}
      {tab === "support" && <SupportPanel />}
      {tab === "notifications" && <NotificationsPanel />}
    </AppShell>
  );
}
