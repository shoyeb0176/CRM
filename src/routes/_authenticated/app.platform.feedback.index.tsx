import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PlatformShell } from "@/components/platform/platform-shell";
import { EmptyState } from "@/components/crm/empty-state";
import { StatusBadge } from "@/components/crm/status-badge";
import { TICKET_STATUS, kindLabel, useIsPlatformReviewer } from "@/lib/feedback/feedback";
import type { Ticket } from "@/components/feedback/ticket-view";

import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/_authenticated/app/platform/feedback/")({
  head: () => ({ meta: [{ title: "Feedback — Platform" }] }),
  component: FeedbackList,
});

const FILTERS = [
  { key: "open", label: "Open", statuses: ["new", "in_review", "in_progress"] },
  { key: "new", label: "New", statuses: ["new"] },
  { key: "done", label: "Done", statuses: ["fixed", "wont_fix", "closed"] },
  { key: "all", label: "All", statuses: [] as string[] },
] as const;

function FeedbackList() {
  const reviewer = useIsPlatformReviewer();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("open");
  const statuses = FILTERS.find((f) => f.key === filter)!.statuses;
  const list = useQuery({
    queryKey: ["platform-feedback", filter], enabled: !!reviewer.data,
    queryFn: async () => {
      let q = supabase.from("platform_tickets").select("*, org:organizations(name)").order("created_at", { ascending: false }).limit(200);
      if (statuses.length) q = q.in("status", [...statuses]);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as (Ticket & { org: { name: string } | null })[];
    },
  });

  return (
    <PlatformShell title="Feedback" breadcrumb="platform / feedback" allowReviewers>
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button variant="bare" size="bare" key={f.key} type="button" onClick={() => setFilter(f.key)}
            className={`border px-3 py-1.5 font-mono text-xs uppercase tracking-widest ${filter === f.key ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>
            {f.label}
          </Button>
        ))}
      </div>
      {reviewer.isPending || list.isPending ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : !list.data?.length ? (
        <EmptyState title="Nothing here" description="Reports that people send from the app (Report a problem) show up here." />
      ) : (
        <div className="overflow-x-auto border border-border bg-card shadow-sm">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="bg-muted text-left font-mono text-xs uppercase tracking-widest text-muted-foreground">
              <tr><th className="px-3 py-2">Report</th><th className="px-3 py-2">Kind</th><th className="px-3 py-2">Workspace</th><th className="px-3 py-2">Priority</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Sent</th></tr>
            </thead>
            <tbody>
              {list.data.map((t) => (
                <tr key={t.id} className="border-t border-border hover:bg-muted/50">
                  <td className="px-3 py-2">
                    <Link to="/app/platform/feedback/$ticketId" params={{ ticketId: t.id }} className="flex items-center gap-2 font-medium hover:underline">
                      <span className="font-mono text-xs text-muted-foreground">{t.ticket_number}</span>
                      <span className="truncate">{t.title}</span>
                      {t.screenshot_path && <ImageIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label="Has a screenshot" />}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{kindLabel(t.kind)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{t.org?.name ?? "—"}</td>
                  <td className="px-3 py-2 capitalize">{t.priority}</td>
                  <td className="px-3 py-2"><StatusBadge tone={TICKET_STATUS[t.status]?.tone}>{TICKET_STATUS[t.status]?.label ?? t.status}</StatusBadge></td>
                  <td className="px-3 py-2 text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PlatformShell>
  );
}
