import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/lib/crm/use-org";
import { ReportsShell, KpiTile, ReportCard, DataTable, LoadingState, StatusBadge } from "@/components/reports/reports-shell";
import { fmtMoney, fmtNum, toCSV, fmtDate } from "@/lib/reports/use-reports";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/app/reports/inventory")({
  head: () => ({ meta: [{ title: "Inventory reports — Inuberry" }] }),
  component: InventoryReportsPage,
});

function InventoryReportsPage() {
  const orgId = useOrgId();

  const q = useQuery({
    queryKey: ["report-inventory", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const [stock, products, movements] = await Promise.all([
        supabase.from("inventory_stock").select("product_id, warehouse_id, quantity, reserved").eq("org_id", orgId!),
        supabase.from("products").select("id, name, sku, cost_price, sale_price, low_stock_threshold, track_inventory, is_active, archived").eq("org_id", orgId!),
        supabase.from("inventory_movements")
          .select("id, movement_type, quantity, created_at, product:products(name, sku), warehouse:warehouses(name)")
          .eq("org_id", orgId!).order("created_at", { ascending: false }).limit(50),
      ]);
      if (stock.error) throw stock.error;
      if (products.error) throw products.error;
      if (movements.error) throw movements.error;
      return { stock: stock.data ?? [], products: products.data ?? [], movements: movements.data ?? [] };
    },
  });

  const data = q.data;

  const stockByProduct = useMemo(() => {
    if (!data) return [];
    const totals = new Map<string, number>();
    for (const s of data.stock) totals.set(s.product_id, (totals.get(s.product_id) ?? 0) + Number(s.quantity || 0));
    return data.products
      .filter((p) => p.track_inventory && !p.archived)
      .map((p) => {
        const qty = totals.get(p.id) ?? 0;
        const threshold = Number(p.low_stock_threshold ?? 0);
        const status = qty <= 0 ? "out" : threshold > 0 && qty <= threshold ? "low" : "ok";
        return {
          id: p.id, name: p.name, sku: p.sku, qty,
          cost: Number(p.cost_price ?? 0), sale: Number(p.sale_price ?? 0),
          value: qty * Number(p.cost_price ?? 0),
          threshold, status,
        };
      });
  }, [data]);

  const lowStock = stockByProduct.filter((r) => r.status !== "ok").sort((a, b) => a.qty - b.qty);
  const totalValue = stockByProduct.reduce((s, r) => s + r.value, 0);
  const totalSKUs = stockByProduct.length;
  const outCount = stockByProduct.filter((r) => r.status === "out").length;

  function onExport() {
    toCSV(stockByProduct.map((r) => ({
      sku: r.sku, name: r.name, qty: r.qty, threshold: r.threshold,
      cost: r.cost, value: r.value, status: r.status,
    })), `inventory-stock.csv`);
  }

  return (
    <ReportsShell title="Inventory reports" breadcrumb="reports / inventory">
      <div className="mb-6 flex justify-end">
        <Button variant="kit" size="kit" onClick={onExport} className="bg-card px-3 py-2 text-muted-foreground hover:text-foreground">
          Export CSV
        </Button>
      </div>
      {q.isLoading ? <LoadingState /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiTile label="Tracked SKUs" value={fmtNum(totalSKUs)} />
            <KpiTile label="Inventory value" value={fmtMoney(totalValue)} hint="At cost" />
            <KpiTile label="Low stock" value={fmtNum(lowStock.length - outCount)} />
            <KpiTile label="Out of stock" value={fmtNum(outCount)} />
          </div>

          <div className="mt-6 grid gap-4">
            <ReportCard title="Low / out of stock">
              <DataTable rows={lowStock}
                empty="All products are sufficiently stocked."
                columns={[
                  { key: "sku", label: "SKU", render: (r) => r.sku ?? "—" },
                  { key: "name", label: "Product", render: (r) => r.name },
                  { key: "qty", label: "On hand", align: "right", render: (r) => fmtNum(r.qty) },
                  { key: "threshold", label: "Threshold", align: "right", render: (r) => r.threshold || "—" },
                  { key: "status", label: "Status", render: (r) => <StatusBadge tone={r.status === "out" ? "danger" : "warning"}>{r.status}</StatusBadge> },
                ]} />
            </ReportCard>

            <ReportCard title="Current stock" subtitle={`${stockByProduct.length} tracked SKUs`}>
              <DataTable rows={stockByProduct}
                columns={[
                  { key: "sku", label: "SKU", render: (r) => r.sku ?? "—" },
                  { key: "name", label: "Product", render: (r) => r.name },
                  { key: "qty", label: "On hand", align: "right", render: (r) => fmtNum(r.qty) },
                  { key: "cost", label: "Unit cost", align: "right", render: (r) => fmtMoney(r.cost) },
                  { key: "value", label: "Value", align: "right", render: (r) => fmtMoney(r.value) },
                ]} />
            </ReportCard>

            <ReportCard title="Stock movement history" subtitle="Latest 50">
              <DataTable rows={data?.movements ?? []}
                columns={[
                  { key: "when", label: "When", render: (r) => fmtDate(r.created_at) },
                  { key: "type", label: "Type", render: (r) => <StatusBadge tone="neutral">{r.movement_type}</StatusBadge> },
                  { key: "product", label: "Product", render: (r) => r.product?.name ?? "—" },
                  { key: "wh", label: "Warehouse", render: (r) => r.warehouse?.name ?? "—" },
                  { key: "qty", label: "Qty", align: "right", render: (r) => fmtNum(Number(r.quantity)) },
                ]} />
            </ReportCard>
          </div>
        </>
      )}
    </ReportsShell>
  );
}
