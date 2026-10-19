// Open support tickets, unassigned first. Shown in Inbox › Support; the full list is at /app/support.
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState } from "@/components/crm/empty-state";
import { StatusBadge } from "@/components/crm/status-badge";
import { useOrgId } from "@/lib/crm/use-org";
import { timeAgo } from "@/lib/notifications/kinds";
import { Button } from "@/components/ui/button";

export function SupportPanel() {
  const orgId = useOrgId();
  const tickets = useQuery({
    enabled: !!orgId,
    queryKey: ["support-tickets", "inbox", orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from("support_tickets")
        .select("id, ticket_number, subject, status, priority, assignee_id, updated_at, companies(name)")
        .eq("org_id", orgId!).in("status", ["open", "pending", "in_progress"])
        .order("updated_at", { ascending: false }).limit(50);
      if (error) throw error;
      // Nobody has picked these up yet, so they go first.
      return (data ?? []).sort((a, b) => Number(!!a.assignee_id) - Number(!!b.assignee_id));
    },
  });

  if (tickets.isLoading) return <div className="border border-border bg-card shadow-sm p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!tickets.data?.length) {
    return <EmptyState title="No open tickets" description="Tickets your customers open in the customer portal show up here." action={<Button asChild variant="outline"><Link to="/app/settings/portal-users">Invite a customer to the portal</Link></Button>} />;
  }
  return (
    <div className="space-y-2">
      <ul className="border border-border bg-card">
        {tickets.data.map((t) => (
          <li key={t.id} className="border-b border-border last:border-b-0">
            <Link to="/app/support/$ticketId" params={{ ticketId: t.id }} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-accent">
              <div className="min-w-0">
                <div className="truncate font-medium">{t.subject}</div>
                <div className="text-xs text-muted-foreground">
                  {t.ticket_number ?? `#${t.id.slice(0, 8)}`} · {t.companies?.name ?? "No company"} · {timeAgo(t.updated_at)}
                </div>
              </div>
              <div className="flex gap-1.5">
                {!t.assignee_id && <StatusBadge tone="warning">Unassigned</StatusBadge>}
                <StatusBadge tone={t.priority === "urgent" ? "danger" : t.priority === "high" ? "warning" : "neutral"}>{t.priority}</StatusBadge>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <Link to="/app/support" className="text-xs text-primary hover:underline">All tickets, with search and filters</Link>
    </div>
  );
}
