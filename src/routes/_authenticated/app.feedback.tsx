import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bug } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/crm/empty-state";
import { StatusBadge } from "@/components/crm/status-badge";
import { TicketView, type Ticket } from "@/components/feedback/ticket-view";
import { TICKET_STATUS, openReportDialog } from "@/lib/feedback/feedback";
import { useOpenOnNew } from "@/lib/use-focus-row";

export const Route = createFileRoute("/_authenticated/app/feedback")({
  head: () => ({ meta: [{ title: "My reports — Inuberry" }] }),
  validateSearch: (s: Record<string, unknown>): { ticket?: string } => (typeof s.ticket === "string" ? { ticket: s.ticket } : {}),
  component: MyReports,
});

function MyReports() {
  const { ticket: selected } = Route.useSearch();
  const navigate = useNavigate();
  useOpenOnNew(() => openReportDialog());
  const list = useQuery({
    queryKey: ["my-feedback"],
    queryFn: async () => {
      const { data: s } = await supabase.auth.getSession();
      const { data, error } = await supabase.from("platform_tickets").select("*")
        .eq("created_by", s.session?.user.id ?? "").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as Ticket[];
    },
  });
  // A link to an older report (past the newest 100) loads that one report instead of opening the wrong one.
  const inList = list.data?.find((t) => t.id === selected);
  const one = useQuery({
    queryKey: ["my-feedback-item", selected], enabled: !!selected && !!list.data && !inList,
    queryFn: async () => {
      const { data, error } = await supabase.from("platform_tickets").select("*").eq("id", selected!).maybeSingle();
      if (error) throw error;
      return data as Ticket | null;
    },
  });
  const current = inList ?? one.data ?? (selected && one.isFetching ? undefined : list.data?.[0]);

  return (
    <AppShell title="My reports" breadcrumb="feedback">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">Problems and ideas you've sent to the Inuberry team, and their answers.</p>
        <Button size="sm" onClick={() => openReportDialog()}><Bug className="mr-1 size-3.5" /> Report a problem</Button>
      </div>
      {list.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : !list.data?.length ? (
        <EmptyState title="Nothing sent yet" description="If something breaks or is hard to use, tell us. A screenshot of the area helps us fix it faster."
          action={<Button size="sm" onClick={() => openReportDialog()}><Bug className="mr-1 size-3.5" /> Report a problem</Button>} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_1fr]">
          <ul className="grid content-start gap-px border border-border bg-border">
            {list.data.map((t) => (
              <li key={t.id}>
                <Button variant="bare" size="bare" type="button" onClick={() => navigate({ to: "/app/feedback", search: { ticket: t.id }, replace: true })}
                  className={`grid w-full gap-1 bg-background p-3 text-left hover:bg-muted ${current?.id === t.id ? "border-l-2 border-primary" : ""}`}>
                  <span className="truncate text-sm font-medium">{t.title}</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono">{t.ticket_number}</span>
                    <StatusBadge tone={TICKET_STATUS[t.status]?.tone}>{TICKET_STATUS[t.status]?.label ?? t.status}</StatusBadge>
                  </span>
                </Button>
              </li>
            ))}
          </ul>
          <div className="min-w-0 border border-border bg-card shadow-sm p-4 md:p-6">
            {current && <TicketView key={current.id} ticket={current} />}
          </div>
        </div>
      )}
    </AppShell>
  );
}
