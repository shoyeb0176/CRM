import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { focusSearch } from "@/lib/use-focus-row";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/use-current-user";
import { AppShell } from "@/components/app/app-shell";
import { useOrgId } from "@/lib/crm/use-org";
import { useOrgMembers, memberLabel } from "@/lib/projects/use-org-members";
import {
  PROJECT_STATUS_TONE, TASK_STATUS_TONE, TASK_STATUSES, TASK_PRIORITY_TONE, TASK_PRIORITIES,
  fmtDate, fmtMoney, type ProjectStatus, type TaskStatus, type TaskPriority,
} from "@/components/projects/projects-shell";
import { StatusBadge } from "@/components/crm/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, ArrowLeft, Trash2, Check, X, MessageSquare, Calendar, Flag, Users, ListChecks, KanbanSquare, Table as TableIcon, Pencil } from "lucide-react";
import { CommsTimeline } from "@/components/comms/comms-timeline";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { AiBlock } from "@/components/ai/ai-block";
import { useAiEntity } from "@/lib/ai/entity-context";
import { ProjectDrawer } from "@/components/projects/project-drawer";
import { AttachmentsPanel } from "@/components/attachments/attachments-panel";

type Project = Database["public"]["Tables"]["projects"]["Row"];
type Task = Database["public"]["Tables"]["project_tasks"]["Row"];
type Milestone = Database["public"]["Tables"]["milestones"]["Row"];
type Member = Database["public"]["Tables"]["project_members"]["Row"];

type Checklist = Database["public"]["Tables"]["task_checklists"]["Row"];
type MStatus = Database["public"]["Enums"]["milestone_status"];

export const Route = createFileRoute("/_authenticated/app/projects/$projectId")({
  head: () => ({ meta: [{ title: "Project — Inuberry" }] }),
  validateSearch: focusSearch("task"),
  component: ProjectDetailPage,
});

type TabKey = "overview" | "board" | "tasks" | "milestones" | "members";

function ProjectDetailPage() {
  const { projectId } = Route.useParams();
  const orgId = useOrgId();
  useAiEntity({ type: "project", id: projectId, label: projectId });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>("overview");
  const [taskOpen, setTaskOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const project = useQuery({
    queryKey: ["project", projectId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*, companies:customer_company_id(id,name), contacts:customer_contact_id(id,first_name,last_name)")
        .eq("id", projectId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const tasks = useQuery({
    queryKey: ["tasks", projectId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_tasks").select("*")
        .eq("project_id", projectId).order("position").order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });  // A notification about a task opens it here (?task=<id>).
  const { task: focusTask } = Route.useSearch();
  const openedTask = useRef<string | null>(null);
  useEffect(() => {
    const t = focusTask && tasks.data?.find((x) => x.id === focusTask);
    if (t && openedTask.current !== focusTask) { openedTask.current = focusTask!; setEditingTask(t as Task); setTaskOpen(true); }
  }, [focusTask, tasks.data]);


  const milestones = useQuery({
    queryKey: ["milestones", projectId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("milestones").select("*").eq("project_id", projectId).order("position").order("due_date");
      if (error) throw error;
      return data ?? [];
    },
  });

  const projectMembers = useQuery({
    queryKey: ["project-members", projectId], enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_members").select("*").eq("project_id", projectId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const orgMembers = useOrgMembers(orgId);
  const memberMap = useMemo(() => new Map((orgMembers.data ?? []).map((m) => [m.user_id, m])), [orgMembers.data]);

  const totalTasks = tasks.data?.length ?? 0;
  const doneTasks = (tasks.data ?? []).filter((t) => t.status === "done").length;
  const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const hours = useQuery({
    queryKey: ["project-hours", projectId], enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("timesheets").select("hours, billable").eq("project_id", projectId);
      if (error) throw error;
      const total = (data ?? []).reduce((s, r) => s + Number(r.hours ?? 0), 0);
      const billable = (data ?? []).filter((r) => r.billable).reduce((s, r) => s + Number(r.hours ?? 0), 0);
      return { total, billable };
    },
  });

  if (project.isLoading) {
    return <AppShell title="Project" breadcrumb="projects"><Skeleton className="h-12 w-64" /></AppShell>;
  }
  if (!project.data) {
    return (
      <AppShell title="Project" breadcrumb="projects">
        <div className="border border-border p-12 text-center bg-card shadow-sm">
          <p>Project not found.</p>
          <Button className="mt-4" onClick={() => navigate({ to: "/app/projects" })}>Back to projects</Button>
        </div>
      </AppShell>
    );
  }

  const p = project.data;
  const overdueTasks = (tasks.data ?? []).filter((t) => t.due_date && t.due_date < new Date().toISOString().slice(0,10) && t.status !== "done" && t.status !== "cancelled").length;

  return (
    <AppShell title={p.name} breadcrumb="projects">
      <div className="mb-4"><AiBlock entityType="project" entityId={projectId} /></div>
      <div className="mb-6"><CommsTimeline orgId={orgId} entityType="project" entityId={projectId} /></div>
      <AttachmentsPanel orgId={orgId} entityType="project" entityId={projectId} className="mb-6 border border-border bg-background" />
      <Link to="/app/projects" className="mb-4 inline-flex items-center gap-1 font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3" /> All projects
      </Link>

      <div className="mb-6 border border-border bg-card">
        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="font-display text-2xl uppercase">{p.name}</h1>
              <StatusBadge tone={PROJECT_STATUS_TONE[p.status as ProjectStatus]}>{p.status.replace("_"," ")}</StatusBadge>
              {p.code && <span className="font-mono text-xs text-muted-foreground">{p.code}</span>}
            </div>
            {p.description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{p.description}</p>}
          </div>
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}><Pencil className="mr-1 size-3.5" /> Edit</Button>
        </div>
        <div className="grid grid-cols-2 gap-px border-t border-border bg-border md:grid-cols-6">
          <Meta label="Customer" value={(p as Project & { companies?: { name: string } | null }).companies?.name ?? "—"} />
          <Meta label="Manager" value={memberLabel(memberMap.get(p.manager_id ?? "") ?? null)} />
          <Meta label="Start" value={fmtDate(p.start_date)} />
          <Meta label="Due" value={fmtDate(p.due_date)} />
          <Meta label="Budget" value={p.budget != null ? fmtMoney(p.budget, p.currency ?? "USD") : "—"} />
          <Meta label="Progress" value={`${progress}%`} />
        </div>
        <div className="grid grid-cols-2 gap-px border-t border-border bg-border md:grid-cols-4">
          <Meta label="Total tasks" value={String(totalTasks)} />
          <Meta label="Done" value={String(doneTasks)} />
          <Meta label="Overdue" value={String(overdueTasks)} />
          <Meta label="Hours logged" value={hours.data ? `${hours.data.total.toFixed(1)}h` : "—"} />
        </div>
        <div className="h-1 w-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <nav className="mb-6 flex flex-wrap border-b border-border">
        {([
          ["overview", "Overview", null],
          ["board", "Board", KanbanSquare],
          ["tasks", "Tasks", TableIcon],
          ["milestones", "Milestones", Flag],
          ["members", "Members", Users],
        ] as Array<[TabKey, string, typeof KanbanSquare | null]>).map(([key, label, Icon]) => {
          const active = tab === key;
          return (
            <Button variant="bare" size="bare" key={key} onClick={() => setTab(key)}
              className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-4 py-3 font-mono text-xs uppercase tracking-widest transition-colors ${
                active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}>
              {Icon && <Icon className="size-3.5" />} {label}
            </Button>
          );
        })}
        <div className="ml-auto self-center pb-2">
          <Button size="sm" onClick={() => { setEditingTask(null); setTaskOpen(true); }}>
            <Plus className="mr-1 size-4" /> New task
          </Button>
        </div>
      </nav>

      {tab === "overview" && (
        <OverviewTab project={p} tasks={tasks.data ?? []} milestones={milestones.data ?? []} memberMap={memberMap} hours={hours.data} />
      )}
      {tab === "board" && (
        <BoardTab
          tasks={tasks.data ?? []}
          loading={tasks.isLoading}
          memberMap={memberMap}
          onMove={async (id, status) => {
            const { error } = await supabase.from("project_tasks").update({ status, completed_at: status === "done" ? new Date().toISOString() : null }).eq("id", id);
            if (error) return toast.error(error.message);
            qc.invalidateQueries({ queryKey: ["tasks", projectId] });
          }}
          onOpen={(t) => { setEditingTask(t); setTaskOpen(true); }}
        />
      )}
      {tab === "tasks" && (
        <TasksTableTab
          tasks={tasks.data ?? []}
          loading={tasks.isLoading}
          memberMap={memberMap}
          onOpen={(t) => { setEditingTask(t); setTaskOpen(true); }}
        />
      )}
      {tab === "milestones" && (
        <MilestonesTab projectId={projectId} orgId={orgId} milestones={milestones.data ?? []} loading={milestones.isLoading} />
      )}
      {tab === "members" && (
        <MembersTab projectId={projectId} orgId={orgId} members={(projectMembers.data ?? []) as Member[]} orgMembers={orgMembers.data ?? []} />
      )}

      <TaskDrawer
        open={taskOpen}
        onOpenChange={(v) => { setTaskOpen(v); if (!v) setEditingTask(null); }}
        task={editingTask}
        projectId={projectId}
        orgId={orgId}
        milestones={milestones.data ?? []}
      />
      <ProjectDrawer key={p.id + String(editOpen)} open={editOpen} onOpenChange={setEditOpen} project={p}
        onSaved={() => { qc.invalidateQueries({ queryKey: ["project", projectId] }); qc.invalidateQueries({ queryKey: ["projects"] }); qc.invalidateQueries({ queryKey: ["projects-overview"] }); }} />
    </AppShell>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-background p-3">
      <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm">{value}</div>
    </div>
  );
}

function OverviewTab({
  project, tasks, milestones, memberMap, hours,
}: {
  project: Project;
  tasks: Task[];
  milestones: Milestone[];
  memberMap: Map<string, ReturnType<typeof Object>>;
  hours: { total: number; billable: number } | undefined;
}) {
  const upcoming = tasks.filter((t) => t.status !== "done" && t.status !== "cancelled" && t.due_date).sort((a,b) => (a.due_date ?? "").localeCompare(b.due_date ?? "")).slice(0,5);
  const recent = [...tasks].sort((a,b) => b.created_at.localeCompare(a.created_at)).slice(0,5);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section>
        <h3 className="mb-3 border-b border-border pb-2 font-heading text-base uppercase">Upcoming tasks</h3>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming tasks.</p>
        ) : (
          <ul className="divide-y divide-border border border-border bg-card">
            {upcoming.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm">{t.title}</div>
                  <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                    due {fmtDate(t.due_date)}
                  </div>
                </div>
                <StatusBadge tone={TASK_STATUS_TONE[t.status as TaskStatus]}>{t.status.replace("_"," ")}</StatusBadge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-3 border-b border-border pb-2 font-heading text-base uppercase">Milestones</h3>
        {milestones.length === 0 ? (
          <p className="text-sm text-muted-foreground">No milestones yet.</p>
        ) : (
          <ul className="divide-y divide-border border border-border bg-card">
            {milestones.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm">{m.name}</div>
                  <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">due {fmtDate(m.due_date)}</div>
                </div>
                <StatusBadge tone={m.status === "completed" ? "success" : m.status === "missed" ? "danger" : m.status === "in_progress" ? "info" : "neutral"}>{m.status.replace("_"," ")}</StatusBadge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="md:col-span-2">
        <h3 className="mb-3 border-b border-border pb-2 font-heading text-base uppercase">Recent activity</h3>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tasks created yet.</p>
        ) : (
          <ul className="divide-y divide-border border border-border bg-card">
            {recent.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm">{t.title}</div>
                  <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">created {new Date(t.created_at).toLocaleDateString()}</div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge tone={TASK_PRIORITY_TONE[t.priority as TaskPriority]}>{t.priority}</StatusBadge>
                  <StatusBadge tone={TASK_STATUS_TONE[t.status as TaskStatus]}>{t.status.replace("_"," ")}</StatusBadge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function BoardTab({
  tasks, loading, memberMap, onMove, onOpen,
}: {
  tasks: Task[];
  loading: boolean;
  memberMap: Map<string, any>;
  onMove: (id: string, status: TaskStatus) => void;
  onOpen: (t: Task) => void;
}) {
  const grouped = useMemo(() => {
    const m = new Map<TaskStatus, Task[]>();
    TASK_STATUSES.forEach((s) => m.set(s, []));
    for (const t of tasks) m.get(t.status as TaskStatus)?.push(t);
    return m;
  }, [tasks]);

  if (loading) return <div className="grid grid-cols-6 gap-2">{Array.from({length:6}).map((_,i) => <Skeleton key={i} className="h-64 w-full" />)}</div>;

  return (
    <div className="grid gap-3 overflow-x-auto md:grid-cols-3 lg:grid-cols-6">
      {TASK_STATUSES.map((s) => (
        <div key={s}
          className="flex min-w-[220px] flex-col border border-border bg-card"
          onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("ring-1","ring-primary"); }}
          onDragLeave={(e) => e.currentTarget.classList.remove("ring-1","ring-primary")}
          onDrop={(e) => {
            e.currentTarget.classList.remove("ring-1","ring-primary");
            const id = e.dataTransfer.getData("text/plain");
            if (id) onMove(id, s);
          }}
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{s.replace("_"," ")}</span>
            <span className="font-mono text-xs">{grouped.get(s)?.length ?? 0}</span>
          </div>
          <div className="flex-1 space-y-2 p-2">
            {(grouped.get(s) ?? []).map((t) => {
              const a = memberMap.get(t.assignee_id ?? "");
              const overdue = t.due_date && t.due_date < new Date().toISOString().slice(0,10) && t.status !== "done" && t.status !== "cancelled";
              return (
                <Button variant="bare" size="bare"
                  key={t.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}
                  onClick={() => onOpen(t)}
                  className="block w-full cursor-grab border border-border bg-background p-3 text-left transition-colors hover:border-primary active:cursor-grabbing"
                >
                  <div className="mb-1.5 line-clamp-2 text-sm">{t.title}</div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge tone={TASK_PRIORITY_TONE[t.priority as TaskPriority]}>{t.priority}</StatusBadge>
                    {t.due_date && (
                      <span className={`font-mono text-xs ${overdue ? "text-destructive" : "text-muted-foreground"}`}>
                        <Calendar className="-mt-0.5 mr-0.5 inline size-3" />{fmtDate(t.due_date)}
                      </span>
                    )}
                  </div>
                  {a && <div className="mt-2 font-mono text-xs text-muted-foreground">{memberLabel(a)}</div>}
                </Button>
              );
            })}
            {(grouped.get(s) ?? []).length === 0 && (
              <div className="border border-dashed border-border p-3 text-center font-mono text-xs uppercase tracking-widest text-muted-foreground">empty</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function TasksTableTab({
  tasks, loading, memberMap, onOpen,
}: { tasks: Task[]; loading: boolean; memberMap: Map<string, any>; onOpen: (t: Task) => void }) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [tasks, statusFilter, priorityFilter, search]);

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Input placeholder="Search tasks…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {TASK_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_"," ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            {TASK_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {filtered.length === 0 ? (
        <div className="border border-dashed border-border p-12 text-center text-sm text-muted-foreground">No tasks match your filters.</div>
      ) : (
        <div className="overflow-x-auto border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30">
              <tr>
                {["Task","Status","Priority","Assignee","Due","Hours"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-mono text-xs uppercase tracking-widest text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((t) => {
                const a = memberMap.get(t.assignee_id ?? "");
                const overdue = t.due_date && t.due_date < new Date().toISOString().slice(0,10) && t.status !== "done" && t.status !== "cancelled";
                return (
                  <tr key={t.id} className="cursor-pointer hover:bg-muted/30" onClick={() => onOpen(t)}>
                    <td className="px-4 py-3 font-medium">{t.title}</td>
                    <td className="px-4 py-3"><StatusBadge tone={TASK_STATUS_TONE[t.status as TaskStatus]}>{t.status.replace("_"," ")}</StatusBadge></td>
                    <td className="px-4 py-3"><StatusBadge tone={TASK_PRIORITY_TONE[t.priority as TaskPriority]}>{t.priority}</StatusBadge></td>
                    <td className="px-4 py-3">{a ? memberLabel(a) : <span className="text-muted-foreground">—</span>}</td>
                    <td className={`px-4 py-3 font-mono text-xs ${overdue ? "text-destructive" : ""}`}>{fmtDate(t.due_date)}</td>
                    <td className="px-4 py-3 font-mono text-xs">{t.estimated_hours != null ? `${t.estimated_hours}h` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MilestonesTab({ projectId, orgId, milestones, loading }: { projectId: string; orgId: string | undefined; milestones: Milestone[]; loading: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Milestone | null>(null);

  async function setStatus(id: string, status: MStatus) {
    const { error } = await supabase.from("milestones").update({ status, completed_at: status === "completed" ? new Date().toISOString() : null }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["milestones", projectId] });
  }

  async function remove(id: string) {
    if (!confirm("Delete milestone?")) return;
    const { error } = await supabase.from("milestones").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["milestones", projectId] });
  }

  if (loading) return <Skeleton className="h-40 w-full" />;

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}><Plus className="mr-1 size-4" />New milestone</Button>
      </div>
      {milestones.length === 0 ? (
        <div className="border border-dashed border-border p-12 text-center text-sm text-muted-foreground">No milestones yet.</div>
      ) : (
        <ul className="divide-y divide-border border border-border bg-card">
          {milestones.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Flag className="size-4 text-muted-foreground" />
                  <span className="font-medium">{m.name}</span>
                </div>
                {m.description && <p className="ml-6 text-xs text-muted-foreground">{m.description}</p>}
                <div className="ml-6 font-mono text-xs uppercase tracking-widest text-muted-foreground">due {fmtDate(m.due_date)}</div>
              </div>
              <div className="flex items-center gap-2">
                <Select value={m.status} onValueChange={(v) => setStatus(m.id, v as MStatus)}>
                  <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["pending","in_progress","completed","missed"] as MStatus[]).map((s) => <SelectItem key={s} value={s}>{s.replace("_"," ")}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button aria-label="Edit milestone" variant="ghost" size="sm" onClick={() => { setEditing(m); setOpen(true); }}><Pencil className="size-4" /></Button>
                <Button aria-label="Delete milestone" variant="ghost" size="sm" onClick={() => remove(m.id)}><Trash2 className="size-4" /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <MilestoneDrawer
        open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}
        milestone={editing} projectId={projectId} orgId={orgId}
        onSaved={() => qc.invalidateQueries({ queryKey: ["milestones", projectId] })}
      />
    </div>
  );
}

function MilestoneDrawer({
  open, onOpenChange, milestone, projectId, orgId, onSaved,
}: { open: boolean; onOpenChange: (v: boolean) => void; milestone: Milestone | null; projectId: string; orgId: string | undefined; onSaved: () => void }) {
  const [form, setForm] = useState({ name: "", description: "", due_date: "", status: "pending" as MStatus });
  useEffect(() => {
    if (milestone) setForm({ name: milestone.name, description: milestone.description ?? "", due_date: milestone.due_date ?? "", status: milestone.status as MStatus });
    else setForm({ name: "", description: "", due_date: "", status: "pending" });
  }, [milestone, open]);

  async function save() {
    if (!form.name.trim()) return toast.error("Name required");
    const payload = {
      org_id: orgId!, project_id: projectId,
      name: form.name.trim(),
      description: form.description || null,
      due_date: form.due_date || null,
      status: form.status,
    };
    if (milestone) {
      const { error } = await supabase.from("milestones").update(payload).eq("id", milestone.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("milestones").insert(payload);
      if (error) return toast.error(error.message);
    }
    toast.success("Saved");
    onSaved(); onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{milestone ? "Edit milestone" : "New milestone"}</SheetTitle>
          <SheetDescription>Major delivery checkpoint for the project.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Description</Label>
            <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={2000} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Due date</Label>
              <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as MStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["pending","in_progress","completed","missed"] as MStatus[]).map((s) => <SelectItem key={s} value={s}>{s.replace("_"," ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function MembersTab({ projectId, orgId, members, orgMembers }: { projectId: string; orgId: string | undefined; members: Member[]; orgMembers: ReturnType<typeof useOrgMembers>["data"] }) {
  const qc = useQueryClient();
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [role, setRole] = useState("member");

  const present = new Set(members.map((m) => m.user_id));
  const available = (orgMembers ?? []).filter((m) => !present.has(m.user_id));

  async function add() {
    if (!selectedUser) return;
    const { error } = await supabase.from("project_members").insert({ org_id: orgId!, project_id: projectId, user_id: selectedUser, role });
    if (error) return toast.error(error.message);
    setSelectedUser("");
    toast.success("Member added");
    qc.invalidateQueries({ queryKey: ["project-members", projectId] });
  }
  async function remove(id: string) {
    if (!confirm("Remove member from project?")) return;
    const { error } = await supabase.from("project_members").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["project-members", projectId] });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-2 border border-border bg-card shadow-sm p-4">
        <div className="space-y-1.5">
          <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Add member</Label>
          <Select value={selectedUser} onValueChange={setSelectedUser}>
            <SelectTrigger className="w-[260px]"><SelectValue placeholder="Choose user" /></SelectTrigger>
            <SelectContent>
              {available.length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground">All workspace users already added</div>}
              {available.map((m) => <SelectItem key={m.user_id} value={m.user_id}>{memberLabel(m)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Role</Label>
          <Input value={role} onChange={(e) => setRole(e.target.value)} className="w-[160px]" />
        </div>
        <Button onClick={add} disabled={!selectedUser}><Plus className="mr-1 size-4" />Add</Button>
      </div>
      {members.length === 0 ? (
        <div className="border border-dashed border-border p-12 text-center text-sm text-muted-foreground">No members yet.</div>
      ) : (
        <ul className="divide-y divide-border border border-border bg-card">
          {members.map((m) => {
            const om = (orgMembers ?? []).find((u) => u.user_id === m.user_id);
            return (
              <li key={m.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="text-sm">{memberLabel(om ?? null)}</div>
                  <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{m.role}</div>
                </div>
                <Button aria-label="Remove member" variant="ghost" size="sm" onClick={() => remove(m.id)}><Trash2 className="size-4" /></Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TaskDrawer({
  open, onOpenChange, task, projectId, orgId, milestones,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  task: Task | null;
  projectId: string;
  orgId: string | undefined;
  milestones: Milestone[];
}) {
  const qc = useQueryClient();
  const orgMembers = useOrgMembers(orgId);
  const [form, setForm] = useState(() => initialTask(task));
  const [me, setMe] = useState<string | null>(null);
  useEffect(() => { setForm(initialTask(task)); }, [task, open]);
  useEffect(() => { getSessionUser().then(({ data }) => setMe(data.user?.id ?? null)); }, []);

  const comments = useQuery({
    queryKey: ["task-comments", task?.id], enabled: !!task?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("task_comments").select("*").eq("task_id", task!.id).order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const checklist = useQuery({
    queryKey: ["task-checklist", task?.id], enabled: !!task?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("task_checklists").select("*").eq("task_id", task!.id).order("position").order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("Title required");
      const payload = {
        org_id: orgId!, project_id: projectId,
        title: form.title.trim(),
        description: form.description || null,
        status: form.status,
        priority: form.priority,
        assignee_id: form.assignee_id || null,
        milestone_id: form.milestone_id || null,
        due_date: form.due_date || null,
        start_date: form.start_date || null,
        estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : null,
        completed_at: form.status === "done" ? new Date().toISOString() : null,
      };
      if (task) {
        const { error } = await supabase.from("project_tasks").update(payload).eq("id", task.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("project_tasks").insert({ ...payload, reporter_id: me });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(task ? "Task updated" : "Task created"); qc.invalidateQueries({ queryKey: ["tasks", projectId] }); onOpenChange(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  async function remove() {
    if (!task) return;
    if (!confirm("Delete this task?")) return;
    const { error } = await supabase.from("project_tasks").delete().eq("id", task.id);
    if (error) return toast.error(error.message);
    toast.success("Task deleted");
    qc.invalidateQueries({ queryKey: ["tasks", projectId] });
    onOpenChange(false);
  }

  const [commentBody, setCommentBody] = useState("");
  async function addComment() {
    if (!task || !commentBody.trim()) return;
    const { error } = await supabase.from("task_comments").insert({ org_id: orgId!, task_id: task.id, author_id: me, body: commentBody.trim() });
    if (error) return toast.error(error.message);
    setCommentBody("");
    qc.invalidateQueries({ queryKey: ["task-comments", task.id] });
  }

  const [clTitle, setClTitle] = useState("");
  async function addChecklist() {
    if (!task || !clTitle.trim()) return;
    const { error } = await supabase.from("task_checklists").insert({ org_id: orgId!, task_id: task.id, title: clTitle.trim() });
    if (error) return toast.error(error.message);
    setClTitle("");
    qc.invalidateQueries({ queryKey: ["task-checklist", task.id] });
  }
  async function toggleChecklist(item: Checklist) {
    const done = !item.is_done;
    const { error } = await supabase.from("task_checklists").update({ is_done: done, completed_at: done ? new Date().toISOString() : null, completed_by: done ? me : null }).eq("id", item.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["task-checklist", item.task_id] });
  }
  async function removeChecklist(id: string, taskId: string) {
    const { error } = await supabase.from("task_checklists").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["task-checklist", taskId] });
  }

  const done = (checklist.data ?? []).filter((c) => c.is_done).length;
  const total = (checklist.data ?? []).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{task ? "Task" : "New task"}</SheetTitle>
          <SheetDescription>{task ? "Update details, manage checklist and discuss." : "Create a new task for this project."}</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Title</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={500} />
          </div>
          <div className="space-y-1.5">
            <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Description</Label>
            <Textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={20000} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as TaskStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_"," ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as TaskPriority })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Assignee</Label>
              <Select value={form.assignee_id ?? "none"} onValueChange={(v) => setForm({ ...form, assignee_id: v === "none" ? null : v })}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Unassigned —</SelectItem>
                  {orgMembers.data?.map((m) => <SelectItem key={m.user_id} value={m.user_id}>{memberLabel(m)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Milestone</Label>
              <Select value={form.milestone_id ?? "none"} onValueChange={(v) => setForm({ ...form, milestone_id: v === "none" ? null : v })}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {milestones.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Start</Label>
              <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Due</Label>
              <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Est. hours</Label>
              <Input type="number" min="0" step="0.25" value={form.estimated_hours} onChange={(e) => setForm({ ...form, estimated_hours: e.target.value })} />
            </div>
          </div>

          {task && (
            <>
              <div className="border-t border-border pt-4">
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="flex items-center gap-1.5 font-heading text-sm uppercase"><ListChecks className="size-4" /> Checklist {total > 0 && <span className="font-mono text-xs text-muted-foreground">{done}/{total}</span>}</h4>
                </div>
                <ul className="space-y-1">
                  {(checklist.data ?? []).map((c) => (
                    <li key={c.id} className="flex items-center gap-2 group">
                      <Checkbox checked={c.is_done} onCheckedChange={() => toggleChecklist(c)} />
                      <span className={`flex-1 text-sm ${c.is_done ? "line-through text-muted-foreground" : ""}`}>{c.title}</span>
                      <Button variant="bare" size="bare" aria-label="Remove checklist item" onClick={() => removeChecklist(c.id, c.task_id)} className="invisible text-muted-foreground hover:text-destructive group-hover:visible"><X className="size-3.5" /></Button>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex gap-2">
                  <Input placeholder="Add checklist item" value={clTitle} onChange={(e) => setClTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addChecklist(); } }} />
                  <Button aria-label="Add checklist item" size="sm" onClick={addChecklist} disabled={!clTitle.trim()}><Plus className="size-4" /></Button>
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <h4 className="mb-2 flex items-center gap-1.5 font-heading text-sm uppercase"><MessageSquare className="size-4" /> Comments</h4>
                <ul className="space-y-3">
                  {(comments.data ?? []).map((c) => {
                    const author = orgMembers.data?.find((m) => m.user_id === c.author_id);
                    return (
                      <li key={c.id} className="border border-border bg-muted/30 px-3 py-2">
                        <div className="mb-1 flex items-center justify-between font-mono text-xs uppercase tracking-widest text-muted-foreground">
                          <span>{memberLabel(author ?? null)}</span>
                          <span>{new Date(c.created_at).toLocaleString()}</span>
                        </div>
                        <p className="whitespace-pre-wrap text-sm">{c.body}</p>
                      </li>
                    );
                  })}
                  {(comments.data ?? []).length === 0 && <p className="text-xs text-muted-foreground">No comments yet.</p>}
                </ul>
                <div className="mt-3 flex gap-2">
                  <Textarea rows={2} placeholder="Add a comment…" value={commentBody} onChange={(e) => setCommentBody(e.target.value)} />
                  <Button onClick={addComment} disabled={!commentBody.trim()}>Post</Button>
                </div>
              </div>

              <AttachmentsPanel orgId={orgId} entityType="task" entityId={task.id} className="border-t border-border pt-2" />
            </>
          )}
        </div>
        <SheetFooter className="mt-6 flex justify-between gap-2">
          {task && <Button variant="ghost" size="sm" onClick={remove} className="text-destructive"><Trash2 className="mr-1 size-4" />Delete</Button>}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}><Check className="mr-1 size-4" />{save.isPending ? "Saving…" : "Save"}</Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function initialTask(t: Task | null) {
  return {
    title: t?.title ?? "",
    description: t?.description ?? "",
    status: (t?.status ?? "todo") as TaskStatus,
    priority: (t?.priority ?? "medium") as TaskPriority,
    assignee_id: t?.assignee_id ?? null as string | null,
    milestone_id: t?.milestone_id ?? null as string | null,
    start_date: t?.start_date ?? "",
    due_date: t?.due_date ?? "",
    estimated_hours: t?.estimated_hours != null ? String(t.estimated_hours) : "",
  };
}
