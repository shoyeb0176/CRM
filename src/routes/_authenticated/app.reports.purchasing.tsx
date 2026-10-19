import { Donut, TrendArea } from "@/components/charts/charts";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/lib/crm/use-org";
import { ReportsShell, DateRangeBar, KpiTile, ReportCard, DataTable, LoadingState, StatusBadge } from "@/components/reports/reports-shell";
import { fmtMoney, fmtNum, toCSV, useDateRange, useMonthBuckets, monthKey } from "@/lib/reports/use-reports";

export const Route = createFileRoute("/_authenticated/app/reports/purchasing")({
  head: () => ({ meta: [{ title: "Purchasing reports — Inuberry" }] }),
  component: PurchasingReportsPage,
});

function PurchasingReportsPage() {
  const orgId = useOrgId();
  const { from, to, setFrom, setTo } = useDateRange();
  const months = useMonthBuckets(from, to);

  const q = useQuery({
    queryKey: ["report-purchasing", orgId, from, to],
    enabled: !!orgId,
    queryFn: async () => {
      const [pos, bills, expenses] = await Promise.all([
        supabase.from("purchase_orders")
          .select("id, po_number, status, order_date, total, supplier:suppliers(name)")
          .eq("org_id", orgId!).gte("order_date", from).lte("order_date", to),
        supabase.from("vendor_bills")
          .select("id, bill_number, status, bill_date, due_date, total, balance_due, supplier:suppliers(name)")
          .eq("org_id", orgId!).gte("bill_date", from).lte("bill_date", to),
        supabase.from("expenses")
          .select("id, expense_number, expense_date, total, status, category:expense_categories(name), supplier:suppliers(name)")
          .eq("org_id", orgId!).gte("expense_date", from).lte("expense_date", to),
      ]);
      if (pos.error) throw pos.error;
      if (bills.error) throw bills.error;
      if (expenses.error) throw expenses.error;
      return { pos: pos.data ?? [], bills: bills.data ?? [], expenses: expenses.data ?? [] };
    },
  });

  const data = q.data;

  const posByStatus = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, number>();
    for (const p of data.pos) map.set(p.status, (map.get(p.status) ?? 0) + 1);
    return [...map.entries()].map(([label, value]) => ({ label, value }));
  }, [data]);

  const supplierSpend = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, number>();
    for (const b of data.bills) {
      const k = b.supplier?.name ?? "—";
      map.set(k, (map.get(k) ?? 0) + Number(b.total || 0));
    }
    for (const e of data.expenses) {
      const k = e.supplier?.name ?? "—";
      map.set(k, (map.get(k) ?? 0) + Number(e.total || 0));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, total]) => ({ name, total }));
  }, [data]);

  const expensesByMonth = useMemo(() => {
    if (!data) return [];
    const map = new Map(months.map((m) => [m, 0]));
    for (const e of data.expenses) {
      const k = monthKey(e.expense_date);
      if (map.has(k)) map.set(k, map.get(k)! + Number(e.total || 0));
    }
    return [...map.entries()].map(([label, value]) => ({ label, value }));
  }, [data, months]);

  const unpaidBills = (data?.bills ?? []).filter((b) => Number(b.balance_due ?? 0) > 0 && b.status !== "void");
  const totalSpend = (data?.expenses ?? []).reduce((s, e) => s + Number(e.total || 0), 0);
  const totalPOs = (data?.pos ?? []).reduce((s, p) => s + Number(p.total || 0), 0);
  const totalUnpaid = unpaidBills.reduce((s, b) => s + Number(b.balance_due || 0), 0);

  function onExport() {
    if (!data) return;
    toCSV(data.bills.map((b) => ({
      number: b.bill_number, supplier: b.supplier?.name, status: b.status,
      date: b.bill_date, due: b.due_date, total: b.total, balance: b.balance_due,
    })), `vendor-bills-${from}-${to}.csv`);
  }

  return (
    <ReportsShell title="Purchasing reports" breadcrumb="reports / purchasing">
      <DateRangeBar from={from} to={to} setFrom={setFrom} setTo={setTo} onExport={onExport} />
      {q.isLoading ? <LoadingState /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiTile label="PO value" value={fmtMoney(totalPOs)} hint={`${data?.pos.length ?? 0} POs`} />
            <KpiTile label="Expenses" value={fmtMoney(totalSpend)} hint={`${data?.expenses.length ?? 0} entries`} trend={expensesByMonth.map((m) => m.value)} />
            <KpiTile label="Unpaid bills" value={fmtMoney(totalUnpaid)} hint={`${unpaidBills.length} bills`} />
            <KpiTile label="Open POs" value={fmtNum((data?.pos ?? []).filter((p) => ["draft", "sent", "approved"].includes(p.status)).length)} />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <ReportCard title="Purchase orders by status">
              <Donut parts={posByStatus} format={(n) => fmtNum(n)} totalLabel="orders" />
            </ReportCard>
            <ReportCard title="Expenses by month">
              <TrendArea data={expensesByMonth} x="label" series={[{ key: "value", label: "Expenses", color: "var(--chart-1)" }]} />
            </ReportCard>
            <ReportCard title="Top supplier spend" subtitle="Bills + Expenses">
              <DataTable rows={supplierSpend}
                columns={[
                  { key: "name", label: "Supplier", render: (r) => r.name },
                  { key: "total", label: "Total", align: "right", render: (r) => fmtMoney(r.total) },
                ]} />
            </ReportCard>
            <ReportCard title="Unpaid vendor bills">
              <DataTable rows={unpaidBills}
                columns={[
                  { key: "num", label: "Number", render: (r) => r.bill_number },
                  { key: "supplier", label: "Supplier", render: (r) => r.supplier?.name ?? "—" },
                  { key: "due", label: "Due", render: (r) => r.due_date ?? "—" },
                  { key: "status", label: "Status", render: (r) => <StatusBadge tone={r.status === "overdue" ? "danger" : "warning"}>{r.status}</StatusBadge> },
                  { key: "balance", label: "Balance", align: "right", render: (r) => fmtMoney(r.balance_due) },
                ]} />
            </ReportCard>
          </div>
        </>
      )}
    </ReportsShell>
  );
}
