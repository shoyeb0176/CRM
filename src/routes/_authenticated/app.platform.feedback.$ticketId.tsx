import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PlatformShell } from "@/components/platform/platform-shell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TicketView, type Ticket } from "@/components/feedback/ticket-view";
import { TICKET_PRIORITIES, TICKET_STATUS, useIsPlatformReviewer } from "@/lib/feedback/feedback";

export const Route = createFileRoute("/_authenticated/app/platform/feedback/$ticketId")({
  head: () => ({ meta: [{ title: "Report — Platform" }] }),
  component: FeedbackDetail,
});

function FeedbackDetail() {
  const { ticketId } = Route.useParams();
  const reviewer = useIsPlatformReviewer();
  const qc = useQueryClient();
  const ticket = useQuery({
    queryKey: ["platform-feedback-item", ticketId], enabled: !!reviewer.data,
    queryFn: async () => {
      const { data, error } = await supabase.from("platform_tickets").select("*, org:organizations(name)").eq("id", ticketId).maybeSingle();
      if (error) throw error;
      return data as (Ticket & { org: { name: string } | null }) | null;
    },
  });
  // People who can be assigned: platform owners and reviewers.
  const team = useQuery({
    queryKey: ["platform-team"], enabled: !!reviewer.data,
    queryFn: async () => {
      // DB-29's list_platform_assignees covers owners and reviewers for every reviewer; before it, owners only.
      const all = await supabase.rpc("list_platform_assignees" as never);
      const data = (all.error ? (await supabase.rpc("list_platform_reviewers")).data : all.data) as { user_id: string; full_name: string | null; email: string }[] | null;
      const { data: s } = await supabase.auth.getSession();
      const me = s.session?.user;
      const list = (data ?? []).map((r) => ({ id: r.user_id, name: r.full_name || r.email }));
      if (me && !list.some((x) => x.id === me.id)) list.unshift({ id: me.id, name: "Me" });
      return list;
    },
  });
  const update = useMutation({
    mutationFn: async (patch: Partial<Pick<Ticket, "status" | "priority" | "assignee_id">>) => {
      const { error } = await supabase.from("platform_tickets").update(patch).eq("id", ticketId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["platform-feedback-item", ticketId] });
      qc.invalidateQueries({ queryKey: ["platform-feedback"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const t = ticket.data;
  return (
    <PlatformShell title={t ? `${t.ticket_number} · ${t.title}` : "Report"} breadcrumb="platform / feedback" allowReviewers>
      <Button size="sm" variant="outline" asChild className="mb-4"><Link to="/app/platform/feedback"><ArrowLeft className="mr-1 size-3.5" /> All reports</Link></Button>
      {reviewer.isPending || ticket.isPending ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : !t ? (
        <div className="text-sm text-muted-foreground">Report not found.</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
          <div className="min-w-0 border border-border bg-card shadow-sm p-4 md:p-6"><TicketView ticket={t} reviewer /></div>
          <aside className="grid content-start gap-4 border border-border bg-card shadow-sm p-4">
            <div className="text-sm"><span className="text-muted-foreground">Workspace:</span> {t.org?.name ?? "—"}</div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={t.status} onValueChange={(v) => update.mutate({ status: v })}>
                <SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(TICKET_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">The reporter is notified when this changes.</p>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Priority</Label>
              <Select value={t.priority} onValueChange={(v) => update.mutate({ priority: v })}>
                <SelectTrigger aria-label="Priority"><SelectValue /></SelectTrigger>
                <SelectContent>{TICKET_PRIORITIES.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Assigned to</Label>
              <Select value={t.assignee_id ?? "none"} onValueChange={(v) => update.mutate({ assignee_id: v === "none" ? null : v })}>
                <SelectTrigger aria-label="Assigned to"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nobody</SelectItem>
                  {team.data?.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </aside>
        </div>
      )}
    </PlatformShell>
  );
}
