import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/use-current-user";
import { ProjectsShell } from "@/components/projects/projects-shell";
import { useOrgId } from "@/lib/crm/use-org";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/crm/empty-state";
import { StatusBadge } from "@/components/crm/status-badge";
import { Plus, Trash2, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Timesheet = Database["public"]["Tables"]["timesheets"]["Row"];
type Status = Database["public"]["Enums"]["timesheet_status"];

export const Route = createFileRoute("/_authenticated/app/projects/timesheets")({
  head: () => ({ meta: [{ title: "Timesheets — Projects" }] }),
  component: TimesheetsPage,
});

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}
function ymd(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

const STATUS_TONE: Record<Status, "neutral" | "info" | "success" | "danger"> = {
  draft: "neutral", submitted: "info", approved: "success", rejected: "danger",
};

function TimesheetsPage() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const [me, setMe] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Timesheet | null>(null);

  useEffect(() => {
    getSessionUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

  const entries = useQuery({
    queryKey: ["timesheets", orgId, me, ymd(weekStart)],
    enabled: !!orgId && !!me,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("timesheets")
        .select("*, projects:project_id(name), project_tasks:task_id(title)")
        .eq("org_id", orgId!)
        .eq("user_id", me!)
        .gte("entry_date", ymd(weekStart))
        .lte("entry_date", ymd(weekEnd))
        .order("entry_date");
      if (error) throw error;
      return data ?? [];
    },
  });

  const byDay = useMemo(() => {
    const m = new Map<string, typeof entries.data extends infer T ? (T extends Array<infer U> ? U[] : never) : never>();
    for (const d of days) m.set(ymd(d), []);
    for (const e of entries.data ?? []) {
      const k = e.entry_date;
      const arr = m.get(k); if (arr) arr.push(e);
    }
    return m;
  }, [entries.data, days]);

  const totalHours = (entries.data ?? []).reduce((s, e) => s + Number(e.hours ?? 0), 0);
  const billableHours = (entries.data ?? []).filter((e) => e.billable).reduce((s, e) => s + Number(e.hours ?? 0), 0);

  async function submitWeek() {
    const ids = (entries.data ?? []).filter((e) => e.status === "draft").map((e) => e.id);
    if (!ids.length) return toast.message("Nothing to submit");
    const { error } = await supabase.from("timesheets").update({ status: "submitted" as Status }).in("id", ids);
    if (error) return toast.error(error.message);
    toast.success("Week submitted for approval");
    qc.invalidateQueries({ queryKey: ["timesheets"] });
  }

  async function removeEntry(id: string) {
    const { error } = await supabase.from("timesheets").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Entry removed");
    qc.invalidateQueries({ queryKey: ["timesheets"] });
  }

  return (
    <ProjectsShell
      title="Timesheets"
      breadcrumb="projects / timesheets"
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={submitWeek}>Submit week</Button>
          <Button size="sm" onClick={() => { setEditing(null); setDrawerOpen(true); }}>
            <Plus className="mr-1 size-4" /> Log time
          </Button>
        </div>
      }
    >
      <div className="mb-4 flex items-center justify-between border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          <Button aria-label="Previous week" variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft className="size-4" /></Button>
          <div className="font-mono text-xs uppercase tracking-widest">
            {weekStart.toLocaleDateString()} – {weekEnd.toLocaleDateString()}
          </div>
          <Button aria-label="Next week" variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight className="size-4" /></Button>
          <Button variant="ghost" size="sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>This week</Button>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs">
          <div><span className="text-muted-foreground">Total</span> <span className="ml-1 text-base">{totalHours.toFixed(1)}h</span></div>
          <div><span className="text-muted-foreground">Billable</span> <span className="ml-1 text-base">{billableHours.toFixed(1)}h</span></div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
        {days.map((d) => {
          const list = (byDay.get(ymd(d)) ?? []) as Timesheet[];
          const isToday = ymd(d) === ymd(new Date());
          const dayHours = list.reduce((s, e) => s + Number(e.hours ?? 0), 0);
          return (
            <div key={ymd(d)} className={`border ${isToday ? "border-primary" : "border-border"} bg-card`}>
              <div className="border-b border-border px-3 py-2">
                <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  {d.toLocaleDateString(undefined, { weekday: "short" })}
                </div>
                <div className="flex items-baseline justify-between">
                  <div className="text-sm">{d.getDate()}/{d.getMonth() + 1}</div>
                  <div className="font-mono text-xs">{dayHours.toFixed(1)}h</div>
                </div>
              </div>
              <div className="divide-y divide-border">
                {list.length === 0 && (
                  <Button variant="bare" size="bare"
                    onClick={() => { setEditing({ entry_date: ymd(d) } as Timesheet); setDrawerOpen(true); }}
                    className="block w-full px-3 py-4 text-left font-mono text-xs uppercase tracking-widest text-muted-foreground hover:bg-muted/30"
                  >+ add</Button>
                )}
                {list.map((e) => {
                  const ext = e as Timesheet & { projects?: { name: string } | null; project_tasks?: { title: string } | null };
                  return (
                    <div key={e.id} className="group px-3 py-2 hover:bg-muted/30">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm">{Number(e.hours).toFixed(1)}h</span>
                        <div className="flex items-center gap-1">
                          <StatusBadge tone={STATUS_TONE[e.status as Status]}>{e.status}</StatusBadge>
                          {e.status === "draft" && (
                            <Button variant="bare" size="bare" aria-label="Delete time entry" onClick={() => removeEntry(e.id)} className="invisible text-muted-foreground hover:text-destructive group-hover:visible">
                              <Trash2 className="size-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <Button variant="bare" size="bare"
                        onClick={() => { setEditing(e); setDrawerOpen(true); }}
                        className="mt-1 block w-full text-left"
                      >
                        <div className="truncate text-xs">{ext.projects?.name ?? "—"}</div>
                        {ext.project_tasks?.title && <div className="truncate text-xs text-muted-foreground">{ext.project_tasks.title}</div>}
                        {e.billable && <div className="font-mono text-xs text-success">billable</div>}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {(entries.data?.length ?? 0) === 0 && !entries.isLoading && (
        <div className="mt-6">
          <EmptyState
            title="No time logged this week"
            description="Log hours against a project or task. You can submit them for approval at any time."
            action={<Button onClick={() => { setEditing(null); setDrawerOpen(true); }}><Plus className="mr-1 size-4" /> Log time</Button>}
          />
        </div>
      )}

      <TimesheetDrawer
        open={drawerOpen}
        onOpenChange={(v) => { setDrawerOpen(v); if (!v) setEditing(null); }}
        entry={editing}
        onSaved={() => qc.invalidateQueries({ queryKey: ["timesheets"] })}
      />
    </ProjectsShell>
  );
}

import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";

function TimesheetDrawer({
  open, onOpenChange, entry, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entry: Timesheet | null;
  onSaved: () => void;
}) {
  const orgId = useOrgId();
  const [form, setForm] = useState(() => initialEntry(entry));
  useEffect(() => { setForm(initialEntry(entry)); }, [entry, open]);

  const projects = useQuery({
    queryKey: ["projects-min", orgId], enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id, name").eq("org_id", orgId!).eq("archived", false).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const tasks = useQuery({
    queryKey: ["project-tasks-min", orgId, form.project_id], enabled: !!orgId && !!form.project_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("project_tasks").select("id, title").eq("org_id", orgId!).eq("project_id", form.project_id!).order("title");
      if (error) throw error;
      return data ?? [];
    },
  });

  const m = useMutation({
    mutationFn: async () => {
      if (!form.project_id) throw new Error("Project required");
      if (!form.hours || Number(form.hours) <= 0) throw new Error("Hours must be > 0");
      const { data: { user } } = await getSessionUser();
      const payload = {
        org_id: orgId!,
        project_id: form.project_id,
        task_id: form.task_id || null,
        user_id: user!.id,
        entry_date: form.entry_date,
        hours: Number(form.hours),
        billable: form.billable,
        hourly_rate: form.hourly_rate ? Number(form.hourly_rate) : null,
        notes: form.notes || null,
      };
      if (entry?.id) {
        const { error } = await supabase.from("timesheets").update(payload).eq("id", entry.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("timesheets").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(entry?.id ? "Updated" : "Time logged"); onSaved(); onOpenChange(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{entry?.id ? "Edit entry" : "Log time"}</SheetTitle>
          <SheetDescription>Track time against a project or specific task.</SheetDescription>
        </SheetHeader>
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Project</Label>
            <Select value={form.project_id ?? ""} onValueChange={(v) => setForm({ ...form, project_id: v, task_id: null })}>
              <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
              <SelectContent>
                {projects.data?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Task</Label>
            <Select value={form.task_id ?? "none"} onValueChange={(v) => setForm({ ...form, task_id: v === "none" ? null : v })} disabled={!form.project_id}>
              <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {tasks.data?.map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Date</Label>
              <Input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Hours</Label>
              <Input type="number" step="0.25" min="0.25" max="24" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox checked={form.billable} onCheckedChange={(v) => setForm({ ...form, billable: !!v })} id="bill" />
            <Label htmlFor="bill" className="text-sm">Billable</Label>
          </div>
          {form.billable && (
            <div className="space-y-1.5">
              <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Hourly rate</Label>
              <Input type="number" min="0" step="0.01" value={form.hourly_rate} onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Notes</Label>
            <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={2000} />
          </div>
          <SheetFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={m.isPending}>Cancel</Button>
            <Button type="submit" disabled={m.isPending}>
              <Check className="mr-1 size-4" /> {m.isPending ? "Saving…" : "Save"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function initialEntry(e: Timesheet | null) {
  return {
    project_id: e?.project_id ?? null as string | null,
    task_id: e?.task_id ?? null as string | null,
    entry_date: e?.entry_date ?? ymd(new Date()),
    hours: e?.hours != null ? String(e.hours) : "1",
    billable: e?.billable ?? true,
    hourly_rate: e?.hourly_rate != null ? String(e.hourly_rate) : "",
    notes: e?.notes ?? "",
  };
}
