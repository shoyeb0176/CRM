import { createFileRoute, Link } from "@tanstack/react-router";
import { ModuleCharts, useOverviewKpis } from "@/components/charts/module-charts";
import { KpiTile as Kpi } from "@/components/ui/kpi-tile";
import { supabase } from "@/integrations/supabase/client";
import { PurchasingShell, fmtMoney } from "@/components/purchasing/purchasing-shell";
import { useOrgId } from "@/lib/crm/use-org";
import { ShoppingCart, FileText, Receipt, Wallet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/purchasing/")({
  head: () => ({ meta: [{ title: "Purchasing overview — Inuberry" }] }),
  component: PurchasingOverview,
});

function PurchasingOverview() {
  const orgId = useOrgId();

  // One overview call for the whole page (DB-26); these separate queries only run without it.
  const stats = useOverviewKpis("purchasing", "purchasing-overview", async () => {
    const [po, billsOpen, billsOverdue, expenses] = await Promise.all([
      supabase.from("purchase_orders").select("id, total, status").eq("org_id", orgId!).in("status", ["draft","sent","approved","partially_received"]),
      supabase.from("vendor_bills").select("id, balance_due").eq("org_id", orgId!).in("status", ["approved","partially_paid","overdue","draft"]),
      supabase.from("vendor_bills").select("id, balance_due").eq("org_id", orgId!).eq("status", "overdue"),
      supabase.from("expenses").select("total, expense_date").eq("org_id", orgId!).gte("expense_date", firstOfMonth()),
    ]);
    const openPO = po.data ?? [];
    const billsO = billsOpen.data ?? [];
    const overdue = billsOverdue.data ?? [];
    const exps = expenses.data ?? [];
    return {
      openPOCount: openPO.length,
      openPOValue: openPO.reduce((s, p) => s + Number(p.total || 0), 0),
      billsOpenCount: billsO.length,
      billsOpenValue: billsO.reduce((s, b) => s + Number(b.balance_due || 0), 0),
      overdueCount: overdue.length,
      monthlyExpenses: exps.reduce((s, e) => s + Number(e.total || 0), 0),
    };
  });

  // One overview call for the whole page (DB-26); these separate queries only run without it.
  const recent = useOverviewKpis("purchasing", "purchasing-recent", async () => {
    const [pos, bills] = await Promise.all([
      supabase.from("purchase_orders").select("id, po_number, total, status, created_at, suppliers:supplier_id(name)").eq("org_id", orgId!).order("created_at", { ascending: false }).limit(5),
      supabase.from("vendor_bills").select("id, bill_number, total, status, created_at, suppliers:supplier_id(name)").eq("org_id", orgId!).order("created_at", { ascending: false }).limit(5),
    ]);
    return { pos: pos.data ?? [], bills: bills.data ?? [] };
  }, (s) => s.recent);

  return (
    <PurchasingShell title="Purchasing" breadcrumb="purchasing">
      <div className="mb-6"><ModuleCharts module="purchasing" /></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={<ShoppingCart className="size-4" />} label="Open POs" value={String(stats.data?.openPOCount ?? "—")} hint={fmtMoney(stats.data?.openPOValue ?? 0)} />
        <Kpi icon={<Receipt className="size-4" />} label="Unpaid bills" value={String(stats.data?.billsOpenCount ?? "—")} hint={fmtMoney(stats.data?.billsOpenValue ?? 0)} />
        <Kpi icon={<FileText className="size-4" />} label="Overdue bills" value={String(stats.data?.overdueCount ?? "—")} hint="action needed" tone={stats.data?.overdueCount ? "danger" : undefined} />
        <Kpi icon={<Wallet className="size-4" />} label="Expenses this month" value={fmtMoney(stats.data?.monthlyExpenses ?? 0)} hint={new Date().toLocaleDateString(undefined,{month:"long",year:"numeric"})} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel title="Recent purchase orders" linkTo="/app/purchasing/orders" linkLabel="View all">
          {(recent.data?.pos.length ?? 0) === 0 ? <Empty msg="No purchase orders yet." /> : (
            <ul className="divide-y divide-border">
              {recent.data!.pos.map((p) => (
                <li key={p.id}>
                  <Link to="/app/purchasing/orders/$poId" params={{ poId: p.id }} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30">
                    <div className="min-w-0">
                      <div className="font-mono text-xs">{p.po_number}</div>
                      <div className="truncate text-xs text-muted-foreground">{p.suppliers?.name ?? "—"} · {p.status}</div>
                    </div>
                    <div className="font-mono text-sm">{fmtMoney(p.total)}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Recent vendor bills" linkTo="/app/purchasing/bills" linkLabel="View all">
          {(recent.data?.bills.length ?? 0) === 0 ? <Empty msg="No vendor bills yet." /> : (
            <ul className="divide-y divide-border">
              {recent.data!.bills.map((b) => (
                <li key={b.id}>
                  <Link to="/app/purchasing/bills/$billId" params={{ billId: b.id }} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30">
                    <div className="min-w-0">
                      <div className="font-mono text-xs">{b.bill_number}</div>
                      <div className="truncate text-xs text-muted-foreground">{b.suppliers?.name ?? "—"} · {b.status}</div>
                    </div>
                    <div className="font-mono text-sm">{fmtMoney(b.total)}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </PurchasingShell>
  );
}

function firstOfMonth() {
  const d = new Date(); d.setDate(1);
  return d.toISOString().slice(0, 10);
}


function Panel({ title, linkTo, linkLabel, children }: { title: string; linkTo: string; linkLabel: string; children: React.ReactNode }) {
  return (
    <div className="border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{title}</h3>
        <Link to={linkTo} className="font-mono text-xs uppercase tracking-widest text-primary hover:underline">{linkLabel}</Link>
      </div>
      {children}
    </div>
  );
}
function Empty({ msg }: { msg: string }) {
  return <div className="p-8 text-center text-sm text-muted-foreground">{msg}</div>;
}
