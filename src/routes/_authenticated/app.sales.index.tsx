import { KpiCard } from "@/components/charts/kpi-card";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ModuleCharts, useOverviewKpis } from "@/components/charts/module-charts";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/lib/crm/use-org";
import { SalesShell, fmtMoney } from "@/components/sales/sales-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Receipt, ScrollText, Wallet, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/sales/")({
  head: () => ({ meta: [{ title: "Sales overview — Inuberry" }] }),
  component: SalesOverview,
});

function SalesOverview() {
  const orgId = useOrgId();
  // One overview call for the whole page (DB-26); these separate queries only run without it.
  const stats = useOverviewKpis("sales", "sales-overview", async () => {
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const [quotes, orders, invoices, payments] = await Promise.all([
      supabase.from("quotes").select("status, total").eq("org_id", orgId!),
      supabase.from("sales_orders").select("status, total").eq("org_id", orgId!),
      supabase.from("invoices").select("status, total, balance_due, issue_date").eq("org_id", orgId!),
      supabase.from("payments").select("amount, payment_date").eq("org_id", orgId!).gte("payment_date", monthStart.toISOString().slice(0, 10)),
    ]);
    const openQuotes = (quotes.data ?? []).filter((q) => q.status === "sent" || q.status === "draft").length;
    const openOrders = (orders.data ?? []).filter((o) => o.status === "confirmed" || o.status === "draft").length;
    const outstanding = (invoices.data ?? []).filter((i) => i.status !== "paid" && i.status !== "void" && i.status !== "draft").reduce((s, i) => s + Number(i.balance_due ?? 0), 0);
    const overdue = (invoices.data ?? []).filter((i) => i.status === "overdue").length;
    const revenue = (payments.data ?? []).reduce((s, p) => s + Number(p.amount ?? 0), 0);
    const invoicedMonth = (invoices.data ?? []).filter((i) => i.issue_date && new Date(i.issue_date) >= monthStart).reduce((s, i) => s + Number(i.total ?? 0), 0);
    return { openQuotes, openOrders, outstanding, overdue, revenue, invoicedMonth };
  });

  const tiles = [
    { label: "Revenue this month", value: stats.data ? fmtMoney(stats.data.revenue) : "—", icon: Wallet, href: "/app/sales/payments" },
    { label: "Invoiced this month", value: stats.data ? fmtMoney(stats.data.invoicedMonth) : "—", icon: Receipt, href: "/app/invoices" },
    { label: "Outstanding", value: stats.data ? fmtMoney(stats.data.outstanding) : "—", icon: Receipt, href: "/app/invoices" },
    { label: "Overdue invoices", value: stats.data?.overdue ?? "—", icon: Receipt, href: "/app/invoices" },
    { label: "Open quotes", value: stats.data?.openQuotes ?? "—", icon: FileText, href: "/app/sales/quotes" },
    { label: "Open orders", value: stats.data?.openOrders ?? "—", icon: ScrollText, href: "/app/sales/orders" },
  ];

  return (
    <SalesShell title="Sales" breadcrumb="sales / overview">
      <div className="mb-6"><ModuleCharts module="sales" /></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map((t) => (
          <KpiCard key={t.label} label={t.label} icon={t.icon} to={t.href} value={stats.isLoading ? null : String(t.value)} />
        ))}
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <QuickLink to="/app/sales/quotes" title="New quote" desc="Draft a quote for a contact or company." />
        <QuickLink to="/app/invoices" title="New invoice" desc="Bill a customer; track payment and balance." />
        <QuickLink to="/app/settings/taxes" title="Tax rates" desc="Set the tax rates used on quotes, orders and invoices (Settings › Taxes)." />
      </div>
    </SalesShell>
  );
}

function QuickLink({ to, title, desc }: { to: string; title: string; desc: string }) {
  return (
    <Link to={to} className="group block border border-border bg-card p-5 transition-colors hover:border-primary">
      <div className="flex items-center justify-between">
        <h3 className="font-heading text-lg uppercase">{title}</h3>
        <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
    </Link>
  );
}
