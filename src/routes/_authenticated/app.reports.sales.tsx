import { Donut, TrendArea } from "@/components/charts/charts";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/lib/crm/use-org";
import { ReportsShell, DateRangeBar, KpiTile, ReportCard, DataTable, LoadingState, StatusBadge } from "@/components/reports/reports-shell";
import { fmtMoney, fmtNum, toCSV, useDateRange, useMonthBuckets, monthKey } from "@/lib/reports/use-reports";

export const Route = createFileRoute("/_authenticated/app/reports/sales")({
  head: () => ({ meta: [{ title: "Sales reports — Inuberry" }] }),
  component: SalesReportsPage,
});

function SalesReportsPage() {
  const orgId = useOrgId();
  const { from, to, setFrom, setTo } = useDateRange();
  const months = useMonthBuckets(from, to);

  const q = useQuery({
    queryKey: ["report-sales", orgId, from, to],
    enabled: !!orgId,
    queryFn: async () => {
      await supabase.rpc("mark_overdue_invoices", { _org: orgId! });
      const [invoices, items, deals] = await Promise.all([
        supabase.from("invoices")
          .select("id, number, status, issue_date, total, amount_paid, balance_due, company:companies(name), contact:contacts(first_name, last_name)")
          .eq("org_id", orgId!).gte("issue_date", from).lte("issue_date", to)
          .in("status", ["sent", "partially_paid", "paid", "overdue"]).order("issue_date", { ascending: false }),
        supabase.from("invoice_items")
          .select("quantity, line_total, product:products(name), invoice:invoices!inner(org_id, issue_date, status)")
          .eq("org_id", orgId!)
          .gte("invoice.issue_date", from).lte("invoice.issue_date", to)
          .in("invoice.status", ["sent", "partially_paid", "paid", "overdue"]),
        supabase.from("deals").select("amount, status, probability, stage:deal_stages(name, is_won, is_lost)")
          .eq("org_id", orgId!),
      ]);
      if (invoices.error) throw invoices.error;
      if (items.error) throw items.error;
      if (deals.error) throw deals.error;
      return {
        invoices: invoices.data ?? [],
        items: items.data ?? [],
        deals: deals.data ?? [],
      };
    },
  });

  const data = q.data;

  const stats = useMemo(() => {
    if (!data) return null;
    const revenue = data.invoices.reduce((s, i) => s + Number(i.total || 0), 0);
    const paid = data.invoices.filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.total || 0), 0);
    const outstanding = data.invoices.reduce((s, i) => s + Number(i.balance_due || 0), 0);
    const overdue = data.invoices.filter((i) => i.status === "overdue").reduce((s, i) => s + Number(i.balance_due || 0), 0);
    return { revenue, paid, outstanding, overdue, count: data.invoices.length };
  }, [data]);

  const revenueByMonth = useMemo(() => {
    if (!data) return [];
    const map = new Map(months.map((m) => [m, 0]));
    for (const inv of data.invoices) {
      const k = monthKey(inv.issue_date);
      if (map.has(k)) map.set(k, map.get(k)! + Number(inv.total || 0));
    }
    return [...map.entries()].map(([label, value]) => ({ label, value }));
  }, [data, months]);

  const paidVsUnpaid = useMemo(() => {
    if (!data) return [];
    const buckets: Record<string, number> = { paid: 0, partially_paid: 0, sent: 0, overdue: 0, draft: 0 };
    for (const i of data.invoices) buckets[i.status] = (buckets[i.status] ?? 0) + Number(i.total || 0);
    return Object.entries(buckets).filter(([, v]) => v > 0).map(([k, v]) => ({ label: k, value: v }));
  }, [data]);

  const topCustomers = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, number>();
    for (const i of data.invoices) {
      const name = i.company?.name ?? (i.contact ? `${i.contact.first_name ?? ""} ${i.contact.last_name ?? ""}`.trim() : "—");
      map.set(name || "—", (map.get(name || "—") ?? 0) + Number(i.total || 0));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, total]) => ({ name, total }));
  }, [data]);

  const topProducts = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { qty: number; total: number }>();
    for (const it of data.items as Array<{ quantity: number; line_total: number; product: { name: string } | null }>) {
      const name = it.product?.name ?? "—";
      const cur = map.get(name) ?? { qty: 0, total: 0 };
      cur.qty += Number(it.quantity || 0);
      cur.total += Number(it.line_total || 0);
      map.set(name, cur);
    }
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 10)
      .map(([name, v]) => ({ name, qty: v.qty, total: v.total }));
  }, [data]);

  const pipeline = useMemo(() => {
    if (!data) return { weighted: 0, gross: 0 };
    let weighted = 0, gross = 0;
    for (const d of data.deals as Array<{ amount: number; status: string; probability: number; stage: { is_won: boolean; is_lost: boolean } | null }>) {
      if (d.status === "open" || (!d.stage?.is_won && !d.stage?.is_lost)) {
        gross += Number(d.amount || 0);
        weighted += Number(d.amount || 0) * (Number(d.probability || 0) / 100);
      }
    }
    return { weighted, gross };
  }, [data]);

  function onExport() {
    if (!data) return;
    toCSV(data.invoices.map((i) => ({
      number: i.number, status: i.status, issue_date: i.issue_date,
      customer: i.company?.name ?? `${i.contact?.first_name ?? ""} ${i.contact?.last_name ?? ""}`.trim(),
      total: i.total, paid: i.amount_paid, balance: i.balance_due,
    })), `sales-invoices-${from}-${to}.csv`);
  }

  return (
    <ReportsShell title="Sales reports" breadcrumb="reports / sales">
      <DateRangeBar from={from} to={to} setFrom={setFrom} setTo={setTo} onExport={onExport} />
      {q.isLoading ? <LoadingState /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiTile label="Revenue" value={fmtMoney(stats?.revenue)} hint={`${stats?.count ?? 0} invoices`} trend={revenueByMonth.map((m) => m.value)} />
            <KpiTile label="Paid" value={fmtMoney(stats?.paid)} />
            <KpiTile label="Outstanding" value={fmtMoney(stats?.outstanding)} />
            <KpiTile label="Overdue" value={fmtMoney(stats?.overdue)} />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <ReportCard title="Revenue by month" subtitle={`${from} → ${to}`}>
              <TrendArea data={revenueByMonth} x="label" series={[{ key: "value", label: "Invoiced", color: "var(--chart-2)" }]} />
            </ReportCard>
            <ReportCard title="Invoices by status" subtitle="Totals">
              <Donut parts={paidVsUnpaid} format={(n) => fmtMoney(n)} totalLabel="invoiced" />
            </ReportCard>
            <ReportCard title="Top customers" subtitle="By invoiced amount">
              <DataTable rows={topCustomers}
                columns={[
                  { key: "name", label: "Customer", render: (r) => r.name },
                  { key: "total", label: "Total", align: "right", render: (r) => fmtMoney(r.total) },
                ]} />
            </ReportCard>
            <ReportCard title="Top products / services" subtitle="By line revenue">
              <DataTable rows={topProducts}
                columns={[
                  { key: "name", label: "Product", render: (r) => r.name },
                  { key: "qty", label: "Qty", align: "right", render: (r) => fmtNum(r.qty) },
                  { key: "total", label: "Revenue", align: "right", render: (r) => fmtMoney(r.total) },
                ]} />
            </ReportCard>
            <ReportCard title="Sales pipeline" subtitle="Open deals">
              <div className="grid grid-cols-2 gap-4">
                <KpiTile label="Gross pipeline" value={fmtMoney(pipeline.gross)} />
                <KpiTile label="Weighted pipeline" value={fmtMoney(pipeline.weighted)} hint="By probability" />
              </div>
            </ReportCard>
            <ReportCard title="Recent invoices" subtitle={`${from} → ${to}`}>
              <DataTable rows={(data?.invoices ?? []).slice(0, 10)}
                columns={[
                  { key: "number", label: "Number", render: (r) => r.number },
                  { key: "status", label: "Status", render: (r) => <StatusBadge tone={r.status === "paid" ? "success" : r.status === "overdue" ? "danger" : "neutral"}>{r.status}</StatusBadge> },
                  { key: "date", label: "Date", render: (r) => r.issue_date },
                  { key: "total", label: "Total", align: "right", render: (r) => fmtMoney(r.total) },
                ]} />
            </ReportCard>
          </div>
        </>
      )}
    </ReportsShell>
  );
}
