import { KpiCard } from "@/components/charts/kpi-card";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ModuleCharts, useOverviewKpis } from "@/components/charts/module-charts";
import { useOpenOnNew } from "@/lib/use-focus-row";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ProjectsShell, PROJECT_STATUSES, PROJECT_STATUS_TONE, fmtDate, fmtMoney, type ProjectStatus } from "@/components/projects/projects-shell";
import { DataTable } from "@/components/crm/data-table";
import { EmptyState } from "@/components/crm/empty-state";
import { PageToolbar } from "@/components/crm/page-toolbar";
import { StatusBadge } from "@/components/crm/status-badge";
import { ConfirmDelete } from "@/components/crm/confirm-delete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOrgId } from "@/lib/crm/use-org";
import { useOrgMembers, memberLabel } from "@/lib/projects/use-org-members";
import { useMemo, useState, useEffect } from "react";
import { toast } from "sonner";
import { Plus, Briefcase, ListChecks, Clock, AlertTriangle, ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { Project, ProjectDrawer } from "@/components/projects/project-drawer";

type Company = Database["public"]["Tables"]["companies"]["Row"];

export const Route = createFileRoute("/_authenticated/app/projects/")({
  head: () => ({ meta: [{ title: "Projects — Inuberry" }] }),
  component: ProjectsListPage,
});

function ProjectsListPage() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);

  const projects = useQuery({
    queryKey: ["projects", orgId, statusFilter, showArchived],
    enabled: !!orgId,
    queryFn: async () => {
      let q = supabase
        .from("projects")
        .select("*, companies:customer_company_id(id,name)")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });
      if (!showArchived) q = q.eq("archived", false);
      if (statusFilter !== "all") q = q.eq("status", statusFilter as ProjectStatus);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  // One overview call for the whole page (DB-26); these separate queries only run without it.
  const overview = useOverviewKpis("projects", "projects-overview", async () => {
    const now = new Date();
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay()); weekStart.setHours(0,0,0,0);
    const in7 = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0,10);
    const today = now.toISOString().slice(0,10);
    const [active, overdueTasks, hoursWeek, nearing] = await Promise.all([
      supabase.from("projects").select("id", { count: "exact", head: true }).eq("org_id", orgId!).eq("status","active").eq("archived", false),
      supabase.from("project_tasks").select("id", { count: "exact", head: true }).eq("org_id", orgId!).lt("due_date", today).not("status", "in", '("done","cancelled")'),
      supabase.from("timesheets").select("hours").eq("org_id", orgId!).gte("entry_date", weekStart.toISOString().slice(0,10)),
      supabase.from("projects").select("id, name, due_date, status").eq("org_id", orgId!).eq("archived", false).in("status", ["active","planned"]).not("due_date", "is", null).lte("due_date", in7).order("due_date"),
    ]);
    return {
      activeCount: active.count ?? 0,
      overdueTasks: overdueTasks.count ?? 0,
      hoursWeek: (hoursWeek.data ?? []).reduce((s, r) => s + Number(r.hours ?? 0), 0),
      nearing: nearing.data ?? [],
    };
  });

  const filtered = useMemo(() => {
    if (!projects.data) return undefined;
    const s = search.trim().toLowerCase();
    if (!s) return projects.data;
    return projects.data.filter((p) =>
      [p.name, p.code, p.description].filter(Boolean).some((v) => String(v).toLowerCase().includes(s)),
    );
  }, [projects.data, search]);

  const tiles = [
    { label: "Active projects",  value: overview.data?.activeCount ?? "—", icon: Briefcase, href: "/app/projects" },
    { label: "Overdue tasks",    value: overview.data?.overdueTasks ?? "—", icon: AlertTriangle, href: "/app/projects" },
    { label: "Hours this week",  value: overview.data ? overview.data.hoursWeek.toFixed(1) : "—", icon: Clock, href: "/app/projects/timesheets" },
    { label: "Due in 7 days",    value: overview.data?.nearing.length ?? "—", icon: ListChecks, href: "/app/projects" },
  ];

  useOpenOnNew(() => { setEditing(null); setDrawerOpen(true); });
  return (
    <ProjectsShell
      title="Projects"
      breadcrumb="projects"
      actions={
        <Button onClick={() => { setEditing(null); setDrawerOpen(true); }} size="sm">
          <Plus className="mr-1 size-4" /> New project
        </Button>
      }
    >
      <div className="mb-6"><ModuleCharts module="projects" /></div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((t) => (
          <KpiCard key={t.label} label={t.label} icon={t.icon} to={t.href} value={overview.isLoading ? null : String(t.value)} />
        ))}
      </div>

      {!!overview.data?.nearing.length && (
        <div className="mb-6 border border-warning/30 bg-warning/5 p-4">
          <div className="mb-2 font-mono text-xs uppercase tracking-widest text-warning">Nearing deadline</div>
          <ul className="divide-y divide-amber-500/20">
            {overview.data.nearing.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2">
                <Link to="/app/projects/$projectId" params={{ projectId: p.id }} className="text-sm hover:underline">{p.name}</Link>
                <span className="font-mono text-xs">{fmtDate(p.due_date)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <PageToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search projects…"
        filters={
          <>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {PROJECT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_"," ")}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant={showArchived ? "default" : "outline"} size="sm" onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? "Showing archived" : "Hide archived"}
            </Button>
          </>
        }
      />

      <DataTable
        loading={projects.isLoading}
        data={filtered}
        onRowClick={(r) => navigate({ to: "/app/projects/$projectId", params: { projectId: r.id } })}
        columns={[
          { key: "name", header: "Project", cell: (r) => (
            <div>
              <div className="font-medium">{r.name}</div>
              {r.code && <div className="font-mono text-xs text-muted-foreground">{r.code}</div>}
            </div>
          )},
          { key: "customer", header: "Customer", cell: (r) => {
            const c = (r as Project & { companies?: { name: string } | null }).companies;
            return c?.name ?? <span className="text-muted-foreground">—</span>;
          }},
          { key: "status", header: "Status", cell: (r) => (
            <StatusBadge tone={PROJECT_STATUS_TONE[r.status as ProjectStatus]}>{r.status.replace("_"," ")}</StatusBadge>
          )},
          { key: "dates", header: "Schedule", cell: (r) => (
            <span className="font-mono text-xs">
              {fmtDate(r.start_date)} → {fmtDate(r.due_date)}
            </span>
          )},
          { key: "budget", header: "Budget", className: "text-right", cell: (r) => (
            <span className="font-mono text-sm">{r.budget != null ? fmtMoney(r.budget, r.currency ?? "USD") : "—"}</span>
          )},
          { key: "archived", header: "", cell: (r) => r.archived ? <StatusBadge tone="neutral">Archived</StatusBadge> : null },
        ]}
        empty={
          <EmptyState
            title="No projects yet"
            description="Create a project to start tracking tasks, milestones and time."
            action={
              <Button onClick={() => { setEditing(null); setDrawerOpen(true); }}>
                <Plus className="mr-1 size-4" /> New project
              </Button>
            }
          />
        }
      />

      <ProjectDrawer
        open={drawerOpen}
        onOpenChange={(v) => { setDrawerOpen(v); if (!v) setEditing(null); }}
        project={editing}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["projects"] });
          qc.invalidateQueries({ queryKey: ["projects-overview"] });
        }}
      />
    </ProjectsShell>
  );
}
