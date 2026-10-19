import { Donut, SegmentBar } from "@/components/charts/charts";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/lib/crm/use-org";
import { ReportsShell, DateRangeBar, KpiTile, ReportCard, DataTable, LoadingState, StatusBadge } from "@/components/reports/reports-shell";
import { fmtMoney, fmtNum, toCSV, useDateRange } from "@/lib/reports/use-reports";
import { useOrgMembers } from "@/lib/projects/use-org-members";

export const Route = createFileRoute("/_authenticated/app/reports/crm")({
  head: () => ({ meta: [{ title: "CRM reports — Inuberry" }] }),
  component: CrmReportsPage,
});

function CrmReportsPage() {
  const orgId = useOrgId();
  const { from, to, setFrom, setTo } = useDateRange();
  const members = useOrgMembers(orgId);

  const q = useQuery({
    queryKey: ["report-crm", orgId, from, to],
    enabled: !!orgId,
    queryFn: async () => {
      const [leads, deals, stages, activities] = await Promise.all([
        supabase.from("leads").select("id, source, status, estimated_value, owner_id, created_at")
          .eq("org_id", orgId!).gte("created_at", from).lte("created_at", `${to}T23:59:59`),
        supabase.from("deals").select("id, title, amount, status, owner_id, stage_id, expected_close_date, created_at, stage:deal_stages(name, is_won, is_lost, position)")
          .eq("org_id", orgId!),
        supabase.from("deal_stages").select("id, name, position, is_won, is_lost").eq("org_id", orgId!).order("position"),
        supabase.from("activities").select("id, title, type, due_at, completed, owner_id")
          .eq("org_id", orgId!).eq("completed", false)
          .not("due_at", "is", null).order("due_at", { ascending: true }).limit(20),
      ]);
      if (leads.error) throw leads.error;
      if (deals.error) throw deals.error;
      if (stages.error) throw stages.error;
      if (activities.error) throw activities.error;
      return { leads: leads.data ?? [], deals: deals.data ?? [], stages: stages.data ?? [], activities: activities.data ?? [] };
    },
  });

  const data = q.data;

  const bySource = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, number>();
    for (const l of data.leads) {
      const k = (l.source as string) || "Unknown";
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
  }, [data]);

  const byStage = useMemo(() => {
    if (!data) return [];
    const totals = new Map<string, number>(), counts = new Map<string, number>();
    for (const d of data.deals) {
      const k = d.stage?.name ?? "—";
      totals.set(k, (totals.get(k) ?? 0) + Number(d.amount || 0));
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return data.stages.map((s) => ({ label: s.name, value: totals.get(s.name) ?? 0, count: counts.get(s.name) ?? 0 })).filter((s) => s.count > 0);
  }, [data]);

  const wonLost = useMemo(() => {
    if (!data) return { won: 0, lost: 0, wonValue: 0, lostValue: 0, openValue: 0 };
    let won = 0, lost = 0, wonValue = 0, lostValue = 0, openValue = 0;
    for (const d of data.deals) {
      if (d.stage?.is_won || d.status === "won") { won++; wonValue += Number(d.amount || 0); }
      else if (d.stage?.is_lost || d.status === "lost") { lost++; lostValue += Number(d.amount || 0); }
      else openValue += Number(d.amount || 0);
    }
    return { won, lost, wonValue, lostValue, openValue };
  }, [data]);

  const repPerf = useMemo(() => {
    if (!data || !members.data) return [];
    const map = new Map<string, { leads: number; openDeals: number; openValue: number; won: number; wonValue: number }>();
    const ensure = (id: string) => {
      const k = id || "unassigned";
      if (!map.has(k)) map.set(k, { leads: 0, openDeals: 0, openValue: 0, won: 0, wonValue: 0 });
      return map.get(k)!;
    };
    for (const l of data.leads) ensure(l.owner_id ?? "").leads++;
    for (const d of data.deals) {
      const row = ensure(d.owner_id ?? "");
      if (d.stage?.is_won || d.status === "won") { row.won++; row.wonValue += Number(d.amount || 0); }
      else if (!d.stage?.is_lost && d.status !== "lost") { row.openDeals++; row.openValue += Number(d.amount || 0); }
    }
    return [...map.entries()].map(([id, v]) => ({
      name: id === "unassigned" ? "Unassigned" : (members.data!.find((m) => m.user_id === id)?.full_name ?? "—"),
      ...v,
    })).sort((a, b) => b.wonValue - a.wonValue);
  }, [data, members.data]);

  function onExport() {
    if (!data) return;
    toCSV(data.deals.map((d) => ({
      title: d.title, amount: d.amount, status: d.status,
      stage: d.stage?.name, expected_close: d.expected_close_date,
    })), `crm-deals-${from}-${to}.csv`);
  }

  return (
    <ReportsShell title="CRM reports" breadcrumb="reports / crm">
      <DateRangeBar from={from} to={to} setFrom={setFrom} setTo={setTo} onExport={onExport} />
      {q.isLoading ? <LoadingState /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiTile label="New leads" value={fmtNum(data?.leads.length)} />
            <KpiTile label="Open pipeline" value={fmtMoney(wonLost.openValue)} />
            <KpiTile label="Won deals" value={fmtNum(wonLost.won)} hint={fmtMoney(wonLost.wonValue)} />
            <KpiTile label="Lost deals" value={fmtNum(wonLost.lost)} hint={fmtMoney(wonLost.lostValue)} />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <ReportCard title="Leads by source" subtitle={`${from} → ${to}`}>
              <Donut parts={bySource} format={(n) => fmtNum(n)} totalLabel="leads" />
            </ReportCard>
            <ReportCard title="Deals by stage" subtitle="All-time amount">
              <SegmentBar parts={byStage} format={(n) => fmtMoney(n)} unit={["deal", "deals"]} />
            </ReportCard>
            <ReportCard title="Sales rep performance">
              <DataTable rows={repPerf}
                columns={[
                  { key: "name", label: "Rep", render: (r) => r.name },
                  { key: "leads", label: "Leads", align: "right", render: (r) => fmtNum(r.leads) },
                  { key: "openDeals", label: "Open", align: "right", render: (r) => fmtNum(r.openDeals) },
                  { key: "openValue", label: "Open $", align: "right", render: (r) => fmtMoney(r.openValue) },
                  { key: "won", label: "Won", align: "right", render: (r) => fmtNum(r.won) },
                  { key: "wonValue", label: "Won $", align: "right", render: (r) => fmtMoney(r.wonValue) },
                ]} />
            </ReportCard>
            <ReportCard title="Upcoming activities" subtitle="Next 20">
              <DataTable rows={data?.activities ?? []}
                columns={[
                  { key: "title", label: "Title", render: (r) => r.title },
                  { key: "type", label: "Type", render: (r) => <StatusBadge tone="neutral">{r.type}</StatusBadge> },
                  { key: "due", label: "Due", render: (r) => r.due_at ? new Date(r.due_at).toLocaleString() : "—" },
                ]} />
            </ReportCard>
          </div>
        </>
      )}
    </ReportsShell>
  );
}
