import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { usePaged } from "@/lib/use-paged";
import { TablePager } from "@/components/ui/table-pager";
import { supabase } from "@/integrations/supabase/client";
import { CrmShell } from "@/components/crm/crm-shell";
import { DataTable } from "@/components/crm/data-table";
import { EmptyState } from "@/components/crm/empty-state";
import { PageToolbar } from "@/components/crm/page-toolbar";
import { StatusBadge, type BadgeTone } from "@/components/crm/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { useOrgId } from "@/lib/crm/use-org";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { AType, Activity, ActivityDrawer, TYPES } from "@/components/crm/activity-drawer";

const TYPE_TONE: Record<AType, BadgeTone> = {
  call: "info", email: "primary", meeting: "warning",
  task: "default", follow_up: "neutral", note: "neutral",
};

export const Route = createFileRoute("/_authenticated/app/crm/activities")({
  head: () => ({ meta: [{ title: "Activities — CRM" }] }),
  component: ActivitiesPage,
});

function ActivitiesPage() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const p = usePaged();
  const [typeFilter, setTypeRaw] = useState<string>("all");
  const [statusFilter, setStatusRaw] = useState<string>("all");
  const setTypeFilter = (v: string) => { setTypeRaw(v); p.reset(); };
  const setStatusFilter = (v: string) => { setStatusRaw(v); p.reset(); };
  const [drawer, setDrawer] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);

  const activities = useQuery({
    queryKey: ["activities", orgId, typeFilter, statusFilter, p.q, p.page, p.size],
    enabled: !!orgId,
    placeholderData: keepPreviousData,
    // Paged and searched in the database: 25 at a time.
    queryFn: async () => {
      let q = supabase.from("activities").select("*", { count: "exact" }).eq("org_id", orgId!).order("due_at", { ascending: true, nullsFirst: false });
      const term = p.q.replace(/[,()%*"\\]/g, " ").trim();
      if (term) q = q.ilike("title", `%${term}%`);
      if (typeFilter !== "all") q = q.eq("type", typeFilter as AType);
      if (statusFilter === "open") q = q.eq("completed", false);
      if (statusFilter === "done") q = q.eq("completed", true);
      const { data, count, error } = await q.range(p.from, p.to);
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });

  const filtered = activities.data?.rows;

  const toggle = useMutation({
    mutationFn: async (a: Activity) => {
      const completed = !a.completed;
      const { error } = await supabase.from("activities").update({
        completed, completed_at: completed ? new Date().toISOString() : null,
      }).eq("id", a.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["activities"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <CrmShell
      title="Activities"
      breadcrumb="crm / activities"
      actions={<Button size="sm" onClick={() => { setEditing(null); setDrawer(true); }}><Plus className="mr-1 size-4" /> New activity</Button>}
    >
      <PageToolbar
        search={p.search} onSearchChange={p.setSearch} placeholder="Search activities…"
        filters={
          <>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {TYPES.map((t) => <SelectItem key={t} value={t}>{t.replaceAll("_"," ")}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="done">Completed</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
      />
      <DataTable
        loading={activities.isLoading}
        data={filtered}
        columns={[
          { key: "done", header: "", className: "w-10", cell: (a) => (
            <Checkbox checked={a.completed} onCheckedChange={() => toggle.mutate(a)} onClick={(e)=>e.stopPropagation()} />
          )},
          { key: "type", header: "Type", cell: (a) => <StatusBadge tone={TYPE_TONE[a.type]}>{a.type.replaceAll("_"," ")}</StatusBadge> },
          { key: "title", header: "Title", cell: (a) => (
            <span className={a.completed ? "line-through text-muted-foreground" : "font-medium"}>{a.title}</span>
          )},
          { key: "due", header: "Due", cell: (a) => a.due_at
            ? <span className={`font-mono text-xs ${!a.completed && new Date(a.due_at) < new Date() ? "text-destructive" : "text-muted-foreground"}`}>{new Date(a.due_at).toLocaleString()}</span>
            : <span className="text-muted-foreground">—</span>
          },
        ]}
        onRowClick={(a) => { setEditing(a); setDrawer(true); }}
        empty={<EmptyState title="No activities yet" description="Log calls, emails, meetings, tasks and follow-ups." action={
          <Button onClick={() => { setEditing(null); setDrawer(true); }}><Plus className="mr-1 size-4" /> Create activity</Button>
        } />}
      />
      <TablePager page={p.page} size={p.size} total={activities.data?.total ?? 0} onPage={p.setPage} onSize={p.setSize} />
      <ActivityDrawer open={drawer} onOpenChange={(v) => { setDrawer(v); if (!v) setEditing(null); }} activity={editing} onSaved={() => qc.invalidateQueries({ queryKey: ["activities"] })} />
    </CrmShell>
  );
}
