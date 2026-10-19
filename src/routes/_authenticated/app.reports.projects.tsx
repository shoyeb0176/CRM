import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/lib/crm/use-org";
import { ReportsShell, DateRangeBar, KpiTile, ReportCard, DataTable, LoadingState, StatusBadge } from "@/components/reports/reports-shell";
import { fmtMoney, fmtNum, toCSV, useDateRange } from "@/lib/reports/use-reports";
import { useOrgMembers } from "@/lib/projects/use-org-members";

export const Route = createFileRoute("/_authenticated/app/reports/projects")({
  head: () => ({ meta: [{ title: "Project reports — Inuberry" }] }),
  component: ProjectReportsPage,
});

function ProjectReportsPage() {
  const orgId = useOrgId();
  const { from, to, setFrom, setTo } = useDateRange();
  const members = useOrgMembers(orgId);

  const q = useQuery({
    queryKey: ["report-projects", orgId, from, to],
    enabled: !!orgId,
    queryFn: async () => {
      const [projects, tasks, timesheets] = await Promise.all([
        supabase.from("projects").select("id, name, status, due_date, budget").eq("org_id", orgId!).eq("archived", false),
        supabase.from("project_tasks").select("id, title, status, due_date, project:projects(name)")
          .eq("org_id", orgId!).neq("status", "done"),
        supabase.from("timesheets").select("id, hours, billable, hourly_rate, entry_date, user_id, project_id, project:projects(name)")
          .eq("org_id", orgId!).gte("entry_date", from).lte("entry_date", to),
      ]);
      if (projects.error) throw projects.error;
      if (tasks.error) throw tasks.error;
      if (timesheets.error) throw timesheets.error;
      return { projects: projects.data ?? [], tasks: tasks.data ?? [], timesheets: timesheets.data ?? [] };
    },
  });

  const data = q.data;
  const today = new Date().toISOString().slice(0, 10);

  const activeProjects = (data?.projects ?? []).filter((p) => p.status === "active");
  const overdueTasks = (data?.tasks ?? []).filter((t) => t.due_date && t.due_date < today);

  const totalHours = (data?.timesheets ?? []).reduce((s, t) => s + Number(t.hours || 0), 0);
  const billableHours = (data?.timesheets ?? []).filter((t) => t.billable).reduce((s, t) => s + Number(t.hours || 0), 0);
  const billableAmount = (data?.timesheets ?? []).filter((t) => t.billable).reduce((s, t) => s + Number(t.hours || 0) * Number(t.hourly_rate || 0), 0);

  const byProject = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { name: string; hours: number; billable: number }>();
    for (const t of data.timesheets) {
      const k = t.project?.name ?? "—";
      const cur = map.get(k) ?? { name: k, hours: 0, billable: 0 };
      cur.hours += Number(t.hours || 0);
      if (t.billable) cur.billable += Number(t.hours || 0);
      map.set(k, cur);
    }
    return [...map.values()].sort((a, b) => b.hours - a.hours);
  }, [data]);

  const byMember = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { name: string; hours: number; billable: number }>();
    for (const t of data.timesheets) {
      const name = members.data?.find((m) => m.user_id === t.user_id)?.full_name ?? t.user_id.slice(0, 8);
      const cur = map.get(t.user_id) ?? { name, hours: 0, billable: 0 };
      cur.hours += Number(t.hours || 0);
      if (t.billable) cur.billable += Number(t.hours || 0);
      map.set(t.user_id, cur);
    }
    return [...map.values()].sort((a, b) => b.hours - a.hours);
  }, [data, members.data]);

  function onExport() {
    toCSV(byProject.map((r) => ({ project: r.name, total_hours: r.hours, billable_hours: r.billable })), `time-by-project-${from}-${to}.csv`);
  }

  return (
    <ReportsShell title="Project reports" breadcrumb="reports / projects">
      <DateRangeBar from={from} to={to} setFrom={setFrom} setTo={setTo} onExport={onExport} />
      {q.isLoading ? <LoadingState /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiTile label="Active projects" value={fmtNum(activeProjects.length)} />
            <KpiTile label="Overdue tasks" value={fmtNum(overdueTasks.length)} />
            <KpiTile label="Hours logged" value={`${fmtNum(totalHours)}h`} hint={`${fmtNum(billableHours)}h billable`} />
            <KpiTile label="Billable amount" value={fmtMoney(billableAmount)} />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <ReportCard title="Time by project">
              <DataTable rows={byProject}
                columns={[
                  { key: "name", label: "Project", render: (r) => r.name },
                  { key: "hours", label: "Hours", align: "right", render: (r) => `${fmtNum(r.hours)}h` },
                  { key: "billable", label: "Billable", align: "right", render: (r) => `${fmtNum(r.billable)}h` },
                ]} />
            </ReportCard>
            <ReportCard title="Time by member">
              <DataTable rows={byMember}
                columns={[
                  { key: "name", label: "Member", render: (r) => r.name },
                  { key: "hours", label: "Hours", align: "right", render: (r) => `${fmtNum(r.hours)}h` },
                  { key: "billable", label: "Billable", align: "right", render: (r) => `${fmtNum(r.billable)}h` },
                ]} />
            </ReportCard>
            <ReportCard title="Active projects">
              <DataTable rows={activeProjects}
                columns={[
                  { key: "name", label: "Project", render: (r) => r.name },
                  { key: "due", label: "Due", render: (r) => r.due_date ?? "—" },
                  { key: "budget", label: "Budget", align: "right", render: (r) => r.budget ? fmtMoney(r.budget) : "—" },
                  { key: "status", label: "Status", render: (r) => <StatusBadge tone="success">{r.status}</StatusBadge> },
                ]} />
            </ReportCard>
            <ReportCard title="Overdue tasks">
              <DataTable rows={overdueTasks}
                columns={[
                  { key: "title", label: "Task", render: (r) => r.title },
                  { key: "project", label: "Project", render: (r) => r.project?.name ?? "—" },
                  { key: "due", label: "Due", render: (r) => r.due_date ?? "—" },
                  { key: "status", label: "Status", render: (r) => <StatusBadge tone="danger">{r.status}</StatusBadge> },
                ]} />
            </ReportCard>
          </div>
        </>
      )}
    </ReportsShell>
  );
}
