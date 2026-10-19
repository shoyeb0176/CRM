import { Link } from "@tanstack/react-router";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/app-shell";
import { DataTable } from "@/components/crm/data-table";
import { EmptyState } from "@/components/crm/empty-state";
import { PageToolbar } from "@/components/crm/page-toolbar";
import { StatusBadge, type BadgeTone } from "@/components/crm/status-badge";
import { useOrgId } from "@/lib/crm/use-org";
import { useOrgMembers, memberLabel } from "@/lib/projects/use-org-members";
import { useCurrentUser } from "@/lib/use-current-user";
import { Constants } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";

export const STATUS_TONE: Record<string, BadgeTone> = {
  open: "primary", pending: "warning", in_progress: "info", resolved: "success", closed: "neutral",
};
export const PRIORITY_TONE: Record<string, BadgeTone> = {
  low: "neutral", normal: "default", high: "warning", urgent: "danger",
};
export const STATUSES = Constants.public.Enums.support_ticket_status;
export const PRIORITIES = Constants.public.Enums.support_ticket_priority;
export const label = (s: string) => s.replaceAll("_", " ");

export const Route = createFileRoute("/_authenticated/app/support/")({
  head: () => ({ meta: [{ title: "Support — Inuberry" }] }),
  component: SupportInbox,
});

function SupportInbox() {
  const orgId = useOrgId();
  const me = useCurrentUser();
  const navigate = useNavigate();
  const members = useOrgMembers(orgId);
  const [search, setSearch] = useState("");
  // "active" = not resolved or closed, the default view of an inbox.
  const [status, setStatus] = useState("active");
  const [assignee, setAssignee] = useState("all");

  const tickets = useQuery({
    queryKey: ["support-tickets", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      // ponytail: latest 500, filtered in the browser; move filters into the query if inboxes grow past that.
      const { data, error } = await supabase.from("support_tickets")
        .select("id, ticket_number, subject, status, priority, assignee_id, created_at, updated_at, companies(name)")
        .eq("org_id", orgId!).order("updated_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const memberMap = useMemo(() => new Map((members.data ?? []).map((m) => [m.user_id, m])), [members.data]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return tickets.data?.filter((t) =>
      (status === "all" || (status === "active" ? !["resolved", "closed"].includes(t.status) : t.status === status)) &&
      (assignee === "all" || (assignee === "none" ? !t.assignee_id : t.assignee_id === (assignee === "me" ? me?.id : assignee))) &&
      (!s || [t.subject, t.ticket_number, t.companies?.name].some((v) => v?.toLowerCase().includes(s))));
  }, [tickets.data, search, status, assignee, me?.id]);

  const sel = "h-9 border border-input bg-card px-2 text-sm shadow-xs";

  return (
    <AppShell title="Support" breadcrumb="support">
      <PageToolbar search={search} onSearchChange={setSearch} placeholder="Search subject, ticket #, company…"
        filters={
          <>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={sel} aria-label="Status">
              <option value="active">Active</option>
              <option value="all">All statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
            </select>
            <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={sel} aria-label="Assignee">
              <option value="all">Anyone</option>
              <option value="me">Assigned to me</option>
              <option value="none">Unassigned</option>
              {(members.data ?? []).map((m) => <option key={m.user_id} value={m.user_id}>{memberLabel(m)}</option>)}
            </select>
          </>
        } />
      <DataTable
        loading={tickets.isLoading}
        data={filtered}
        onRowClick={(t) => navigate({ to: "/app/support/$ticketId", params: { ticketId: t.id } })}
        columns={[
          { key: "subject", header: "Ticket", cell: (t) => (
            <div className="min-w-0">
              <div className="truncate font-medium">{t.subject}</div>
              <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                {t.ticket_number ?? `#${t.id.slice(0, 8)}`} · {t.companies?.name ?? "No company"}
              </div>
            </div>
          )},
          { key: "status", header: "Status", cell: (t) => <StatusBadge tone={STATUS_TONE[t.status]}>{label(t.status)}</StatusBadge> },
          { key: "priority", header: "Priority", cell: (t) => <StatusBadge tone={PRIORITY_TONE[t.priority]}>{t.priority}</StatusBadge> },
          { key: "assignee", header: "Assignee", cell: (t) => t.assignee_id ? memberLabel(memberMap.get(t.assignee_id)) : <span className="text-muted-foreground">Unassigned</span> },
          { key: "updated", header: "Updated", cell: (t) => <span className="font-mono text-xs">{new Date(t.updated_at).toLocaleString()}</span> },
        ]}
        empty={<EmptyState title="No tickets" description="Tickets customers file in the customer portal show up here." action={<Button asChild variant="outline"><Link to="/app/settings/portal-users">Invite a customer to the portal</Link></Button>} />}
      />
    </AppShell>
  );
}
