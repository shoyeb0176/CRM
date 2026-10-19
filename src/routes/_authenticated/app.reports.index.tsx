import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/lib/crm/use-org";
import { ReportsShell, KpiTile, ReportCard, LoadingState } from "@/components/reports/reports-shell";
import { fmtMoney, fmtNum } from "@/lib/reports/use-reports";
import { TrendingUp, Receipt, Users, Boxes, Truck, Briefcase, BookOpenCheck, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/reports/")({
  head: () => ({ meta: [{ title: "Reports overview — Inuberry" }] }),
  component: ReportsOverview,
});

function ReportsOverview() {
  const orgId = useOrgId();
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + "-01";

  const q = useQuery({
    queryKey: ["reports-overview", orgId, monthStart, today],
    enabled: !!orgId,
    queryFn: async () => {
      await supabase.rpc("mark_overdue_invoices", { _org: orgId! });
      const [invRev, outstanding, activeProj, lowStock, openPO, leads] = await Promise.all([
        supabase.from("invoices").select("total")
          .eq("org_id", orgId!).gte("issue_date", monthStart).lte("issue_date", today)
          .in("status", ["sent", "partially_paid", "paid", "overdue"]),
        supabase.from("invoices").select("balance_due")
          .eq("org_id", orgId!).in("status", ["sent", "partially_paid", "overdue"]),
        supabase.from("projects").select("id", { count: "exact", head: true })
          .eq("org_id", orgId!).eq("status", "active"),
        supabase.from("products").select("id, low_stock_threshold").eq("org_id", orgId!).eq("track_inventory", true),
        supabase.from("purchase_orders").select("id", { count: "exact", head: true })
          .eq("org_id", orgId!).in("status", ["draft", "sent", "approved"]),
        supabase.from("leads").select("id", { count: "exact", head: true })
          .eq("org_id", orgId!).not("status", "in", "(converted,unqualified,lost)"),
      ]);
      const revenue = (invRev.data ?? []).reduce((s, r) => s + Number(r.total || 0), 0);
      const outstandingTotal = (outstanding.data ?? []).reduce((s, r) => s + Number(r.balance_due || 0), 0);
      return {
        revenue,
        outstanding: outstandingTotal,
        activeProjects: activeProj.count ?? 0,
        lowStockCount: lowStock.data?.length ?? 0,
        openPOs: openPO.count ?? 0,
        openLeads: leads.count ?? 0,
      };
    },
  });

  const d = q.data;

  return (
    <ReportsShell title="Reports" breadcrumb="reports">
      {q.isLoading ? <LoadingState /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <KpiTile label="Revenue this month" value={fmtMoney(d?.revenue)} />
            <KpiTile label="Outstanding invoices" value={fmtMoney(d?.outstanding)} />
            <KpiTile label="Active projects" value={fmtNum(d?.activeProjects)} />
            <KpiTile label="Open POs" value={fmtNum(d?.openPOs)} />
            <KpiTile label="Open leads" value={fmtNum(d?.openLeads)} />
            <KpiTile label="Low stock products" value={fmtNum(d?.lowStockCount)} />
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {SECTIONS.map((s) => (
              <Link key={s.to} to={s.to} className="group block">
                <ReportCard title={s.title} subtitle={s.subtitle}
                  action={<ArrowRight className="size-4 text-muted-foreground group-hover:text-foreground" />}>
                  <div className="flex items-start gap-3">
                    <s.icon className="mt-0.5 size-5 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">{s.blurb}</p>
                  </div>
                </ReportCard>
              </Link>
            ))}
          </div>
        </>
      )}
    </ReportsShell>
  );
}

const SECTIONS = [
  { to: "/app/reports/sales", title: "Sales reports", subtitle: "Revenue, AR, top customers", blurb: "Revenue by month, outstanding invoices, paid vs unpaid, top customers and products.", icon: TrendingUp },
  { to: "/app/reports/crm", title: "CRM reports", subtitle: "Leads, deals, pipeline", blurb: "Leads by source, deals by stage, win rate and upcoming activities.", icon: Users },
  { to: "/app/reports/inventory", title: "Inventory reports", subtitle: "Stock, valuation, movements", blurb: "Current stock levels, low stock alerts, inventory valuation and movement history.", icon: Boxes },
  { to: "/app/reports/purchasing", title: "Purchasing reports", subtitle: "POs, suppliers, expenses", blurb: "Purchase orders by status, supplier spend, monthly expenses and unpaid bills.", icon: Truck },
  { to: "/app/reports/projects", title: "Project reports", subtitle: "Tasks, hours, allocation", blurb: "Active projects, overdue tasks, billable hours and time by project or member.", icon: Briefcase },
  { to: "/app/reports/accounting", title: "Accounting reports", subtitle: "P&L, Trial balance, GL", blurb: "Profit and loss, trial balance, general ledger and balance sheet.", icon: BookOpenCheck },
  { to: "/app/invoices", title: "Invoices", subtitle: "Live ledger", blurb: "Open the full invoices module for detail-level reporting.", icon: Receipt },
];
