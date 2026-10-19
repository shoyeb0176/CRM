import { createFileRoute, Link } from "@tanstack/react-router";
import { ModuleCharts, useOverviewKpis } from "@/components/charts/module-charts";
import { supabase } from "@/integrations/supabase/client";
import { HrShell } from "@/components/hr/hr-shell";
import { useOrgId, fmtDate, fullName } from "@/lib/hr/use-hr";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/crm/status-badge";
import { Users, CalendarCheck, Cake, Clock, ArrowRight } from "lucide-react";

import { SectionTitle } from "@/components/ui/section-title";
export const Route = createFileRoute("/_authenticated/app/hr/")({
  component: HrOverview,
});

function HrOverview() {
  const orgId = useOrgId();
  // One overview call for the whole page (DB-26); these separate queries only run without it.
  const stats = useOverviewKpis("hr", "hr-overview", async () => {
    const today = new Date(); const m = today.getMonth(); const d = today.getDate();
    const [active, allEmp, pendingLeave, recentLeave, recentAtt] = await Promise.all([
      supabase.from("employees").select("id", { count: "exact", head: true }).eq("org_id", orgId!).eq("status", "active"),
      supabase.from("employees").select("id, first_name, last_name, preferred_name, start_date").eq("org_id", orgId!).not("start_date", "is", null),
      supabase.from("leave_requests").select("id, leave_type, start_date, end_date, employee_id, employees:employee_id(first_name, last_name, preferred_name)").eq("org_id", orgId!).eq("status", "pending").order("created_at", { ascending: false }).limit(10),
      supabase.from("leave_requests").select("id, status, leave_type, start_date, end_date, created_at, employees:employee_id(first_name, last_name, preferred_name)").eq("org_id", orgId!).order("created_at", { ascending: false }).limit(5),
      supabase.from("attendance_records").select("id, work_date, hours_worked, employees:employee_id(first_name, last_name, preferred_name)").eq("org_id", orgId!).order("work_date", { ascending: false }).limit(5),
    ]);
    const anniversaries = (allEmp.data ?? []).filter((e) => {
      if (!e.start_date) return false;
      const sd = new Date(e.start_date);
      const diff = (sd.getMonth() - m) * 31 + (sd.getDate() - d);
      return diff >= 0 && diff <= 30 && sd.getFullYear() < today.getFullYear();
    }).slice(0, 5);
    return {
      active: active.count ?? 0,
      pendingLeave: pendingLeave.data ?? [],
      anniversaries,
      recentLeave: recentLeave.data ?? [],
      recentAtt: recentAtt.data ?? [],
    };
  });

  const tiles = [
    { label: "Active employees", value: stats.data?.active ?? "—", icon: Users, href: "/app/hr/employees" },
    { label: "Pending leave",    value: stats.data?.pendingLeave.length ?? "—", icon: CalendarCheck, href: "/app/hr/leave" },
    { label: "Upcoming anniversaries", value: stats.data?.anniversaries.length ?? "—", icon: Cake, href: "/app/hr/employees" },
    { label: "Recent attendance",value: stats.data?.recentAtt.length ?? "—", icon: Clock, href: "/app/hr/attendance" },
  ];

  return (
    <HrShell title="HR" breadcrumb="hr">
      <div className="mb-6"><ModuleCharts module="hr" /></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.label} to={t.href} className="group border border-border bg-card p-5 hover:border-primary/60 transition-colors">
            <div className="flex items-center justify-between">
              <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{t.label}</div>
              <t.icon className="size-4 text-muted-foreground group-hover:text-primary" />
            </div>
            <div className="mt-3 font-display text-3xl">
              {stats.isLoading ? <Skeleton className="h-7 w-12" /> : t.value}
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <SectionTitle>Pending leave</SectionTitle>
            <Link to="/app/hr/leave" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">View all <ArrowRight className="size-3" /></Link>
          </div>
          {stats.isLoading ? (
            <div className="p-4 space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
          ) : stats.data?.pendingLeave.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">No pending requests</div>
          ) : (
            <ul className="divide-y divide-border">
              {stats.data?.pendingLeave.map((r) => (
                <li key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <div>
                    <div className="font-medium">{fullName(r.employees ?? {})}</div>
                    <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                      {r.leave_type} · {fmtDate(r.start_date)} → {fmtDate(r.end_date)}
                    </div>
                  </div>
                  <StatusBadge tone="warning">pending</StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <SectionTitle>Upcoming anniversaries</SectionTitle>
            <Link to="/app/hr/employees" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">All employees <ArrowRight className="size-3" /></Link>
          </div>
          {stats.isLoading ? (
            <div className="p-4 space-y-2"><Skeleton className="h-10 w-full" /></div>
          ) : stats.data?.anniversaries.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">No anniversaries in the next 30 days</div>
          ) : (
            <ul className="divide-y divide-border">
              {stats.data?.anniversaries.map((e) => {
                const years = new Date().getFullYear() - new Date(e.start_date!).getFullYear();
                return (
                  <li key={e.id} className="flex items-center justify-between px-4 py-3 text-sm">
                    <div className="font-medium">{fullName(e)}</div>
                    <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{years} yr · {fmtDate(e.start_date)}</div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </HrShell>
  );
}
