// Two charts at the top of each module's overview, from module_summary() (migration 0038), which
// adds up in the database and only counts rows the person can see.
import { useQuery } from "@tanstack/react-query";
import { moduleSummaryQuery, type SummaryModule } from "@/lib/module-summary";
export type { SummaryModule };
import { useCurrentMembership } from "@/lib/use-current-org";
import { useOrgId } from "@/lib/crm/use-org";
import { ChartEmpty, ChartSkeleton, Panel, dayLabel, money as fmtMoney, monthLabel } from "./chart-kit";
import { Columns, DivergingBars, Donut, RankList, SegmentBar, StackedColumns, TrendArea } from "./charts";

type Row = Record<string, number | string>;

export function useModuleSummary(module: SummaryModule, enabled = true) {
  const orgId = useOrgId();
  return useQuery({ ...moduleSummaryQuery(orgId ?? "", module), enabled: !!orgId && enabled });
}

/**
 * A module overview's card numbers: from the one overview call when the database has it (DB-26),
 * otherwise from `fallback`, the page's older separate queries, which then run.
 */
export function useOverviewKpis<T>(module: SummaryModule, key: string, fallback: () => Promise<T>, pick: (s: Record<string, unknown>) => unknown = (s) => s.kpis) {
  const orgId = useOrgId();
  const summary = useModuleSummary(module);
  // Same shape as the fallback returns (the SQL builds the same keys).
  const fromSummary = (summary.data ? pick(summary.data as Record<string, unknown>) : undefined) as T | undefined;
  const old = useQuery({ queryKey: [key, orgId], enabled: !!orgId && summary.isFetched && fromSummary === undefined, queryFn: fallback });
  return { data: fromSummary ?? old.data, isLoading: fromSummary === undefined && (summary.isLoading || old.isLoading) };
}

const C1 = "var(--chart-2)", C2 = "var(--chart-1)";
const byMonth = (r: Row[]): Row[] => r.map((m) => ({ ...m, _x: monthLabel(String(m.month)) }));
const byWeek = (r: Row[]): Row[] => r.map((m) => ({ ...m, _x: dayLabel(String(m.week)) }));
const parts = (r: Row[], key = "value") => r.map((x) => ({ label: String(x.label), value: Number(x[key]) || 0, count: x.count != null ? Number(x.count) : undefined }));
const ranked = (r: Row[]) => r.map((x) => ({ label: String(x.label), value: Number(x.value) || 0 }));

type ChartDef = { title: string; hint: string; to: string; key: string; empty: [string, string, string];
  render: (rows: Row[], money: (n: number) => string) => React.ReactNode; isEmpty?: (rows: Row[]) => boolean };
const noValues = (keys: string[]) => (rows: Row[]) => rows.every((r) => keys.every((k) => !Number(r[k])));

// Which chart for which data: see the key at the top of ./charts.tsx.
const CHARTS: Record<SummaryModule, ChartDef[]> = {
  crm: [
    { title: "Open deals by stage", hint: "Value and number of deals in each stage", to: "/app/crm/deals", key: "stages", empty: ["No open deals yet.", "/app/crm/deals?new=1", "Add a deal"],
      render: (r, money) => <SegmentBar parts={parts(r)} format={money} unit={["deal", "deals"]} /> },
    { title: "Deals won and lost", hint: "Last 6 months", to: "/app/crm/deals", key: "wonLost", empty: ["No deals closed yet.", "/app/crm/deals", "Open the board"],
      isEmpty: noValues(["won", "lost"]),
      render: (r) => <StackedColumns data={byMonth(r)} x="_x" series={[{ key: "won", label: "Won", color: "var(--success)" }, { key: "lost", label: "Lost", color: "var(--destructive)" }]} /> },
  ],
  sales: [
    { title: "Invoiced and paid", hint: "Last 6 months; the gap is what's still owed", to: "/app/invoices", key: "revenue", empty: ["Nothing invoiced yet.", "/app/invoices?new=1", "Create an invoice"],
      isEmpty: noValues(["invoiced", "paid"]),
      render: (r) => <TrendArea data={byMonth(r)} x="_x" series={[{ key: "invoiced", label: "Invoiced", color: C1, dashed: true }, { key: "paid", label: "Paid", color: "var(--success)" }]} /> },
    { title: "Quotes by status", hint: "How many in each status", to: "/app/sales/quotes", key: "quotes", empty: ["No quotes yet.", "/app/sales/quotes?new=1", "Create a quote"],
      render: (r) => <Donut parts={parts(r, "count")} totalLabel="quotes" /> },
  ],
  inventory: [
    { title: "Stock value by warehouse", hint: "Quantity × cost price", to: "/app/inventory/warehouses", key: "byWarehouse", empty: ["No stock yet.", "/app/inventory/adjustments", "Add opening stock"],
      render: (r, money) => <RankList data={ranked(r)} format={money} /> },
    { title: "Stock in and out", hint: "Units moved per week, last 8 weeks", to: "/app/inventory/movements", key: "movements", empty: ["No movements yet.", "/app/inventory/movements", "See movements"],
      isEmpty: noValues(["in", "out"]),
      render: (r) => <DivergingBars data={byWeek(r)} x="_x" up={{ key: "in", label: "In", color: "var(--success)" }} down={{ key: "out", label: "Out", color: "var(--destructive)" }} /> },
  ],
  purchasing: [
    { title: "Spending", hint: "Purchase orders and expenses, last 6 months", to: "/app/purchasing/orders", key: "spend", empty: ["Nothing bought yet.", "/app/purchasing/orders?new=1", "Create a purchase order"],
      isEmpty: noValues(["orders", "expenses"]),
      render: (r) => <TrendArea data={byMonth(r)} x="_x" series={[{ key: "orders", label: "Purchase orders", color: C1 }, { key: "expenses", label: "Expenses", color: C2, dashed: true }]} /> },
    { title: "Top suppliers", hint: "Purchase order value, all time", to: "/app/suppliers", key: "topSuppliers", empty: ["No purchase orders yet.", "/app/suppliers", "Add a supplier"],
      render: (r, money) => <RankList data={ranked(r)} format={money} /> },
  ],
  projects: [
    { title: "Tasks by status", hint: "Across all projects", to: "/app/projects", key: "tasks", empty: ["No tasks yet.", "/app/projects?new=1", "Create a project"],
      render: (r) => <Donut parts={parts(r)} totalLabel="tasks" /> },
    { title: "Hours logged", hint: "All hours, with the billable ones as a line; last 6 months", to: "/app/projects/timesheets", key: "hours", empty: ["No time logged yet.", "/app/projects/timesheets", "Log time"],
      isEmpty: noValues(["hours"]),
      render: (r) => <Columns data={byMonth(r)} x="_x" bar={{ key: "hours", label: "Hours", color: C1 }} line={{ key: "billable", label: "Billable", color: C2 }} /> },
  ],
  accounting: [
    { title: "Income and costs", hint: "Posted entries, last 6 months", to: "/app/accounting/pnl", key: "pnl", empty: ["Nothing posted yet.", "/app/accounting/settings", "Set up accounting"],
      isEmpty: noValues(["income", "costs"]),
      render: (r) => <TrendArea data={byMonth(r)} x="_x" series={[{ key: "income", label: "Income", color: "var(--success)" }, { key: "costs", label: "Costs", color: C2, dashed: true }]} /> },
    { title: "Profit by month", hint: "Income minus costs; red is a loss", to: "/app/accounting/pnl", key: "pnl", empty: ["Nothing posted yet.", "/app/accounting/settings", "Set up accounting"],
      isEmpty: noValues(["income", "costs"]),
      render: (r) => <DivergingBars data={byMonth(r).map((m) => ({ ...m, profit: Number(m.income) - Number(m.costs) }))} x="_x" up={{ key: "profit", label: "Profit", color: "var(--success)" }} /> },
  ],
  hr: [
    { title: "People by department", hint: "Active employees", to: "/app/hr/employees", key: "byDepartment", empty: ["No employees yet.", "/app/hr/employees?new=1", "Add an employee"],
      render: (r) => (r.length <= 5 ? <Donut parts={parts(r)} totalLabel="people" /> : <RankList data={ranked(r)} />) },
    { title: "Leave taken", hint: "Approved days, last 6 months", to: "/app/hr/leave", key: "leave", empty: ["No leave approved yet.", "/app/hr/leave", "See leave"],
      isEmpty: noValues(["days"]),
      render: (r) => <Columns data={byMonth(r)} x="_x" bar={{ key: "days", label: "Days", color: C1 }} /> },
  ],
};

/** The charts row for one module's overview page. */
export function ModuleCharts({ module }: { module: SummaryModule }) {
  const q = useModuleSummary(module);
  const ccy = useCurrentMembership().membership?.organizations?.default_currency ?? "USD";
  const money = (n: number) => fmtMoney(n, ccy);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {CHARTS[module].map((c) => {
        const rows = q.data?.[c.key] ?? [];
        const empty = !rows.length || (c.isEmpty?.(rows) ?? false);
        return (
          <Panel key={c.title} title={c.title} hint={c.hint} to={c.to}>
            {q.isLoading ? <ChartSkeleton /> : q.error ? <p className="text-sm text-muted-foreground">Couldn't load this chart.</p>
              : empty ? <ChartEmpty text={c.empty[0]} to={c.empty[1]} cta={c.empty[2]} /> : c.render(rows, money)}
          </Panel>
        );
      })}
    </div>
  );
}
