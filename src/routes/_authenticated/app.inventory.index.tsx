import { createFileRoute, Link } from "@tanstack/react-router";
import { ModuleCharts } from "@/components/charts/module-charts";
import { KpiTile } from "@/components/ui/kpi-tile";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { InventoryShell } from "@/components/inventory/inventory-shell";
import { DataTable } from "@/components/crm/data-table";
import { EmptyState } from "@/components/crm/empty-state";
import { PageToolbar } from "@/components/crm/page-toolbar";
import { StatusBadge, type BadgeTone } from "@/components/crm/status-badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOrgId } from "@/lib/crm/use-org";
import { useWarehouses, stockStatus, fmtMoney } from "@/lib/inventory/use-inv";
import { AdjustmentDialog } from "@/components/inventory/adjustment-dialog";

export const Route = createFileRoute("/_authenticated/app/inventory/")({
  head: () => ({ meta: [{ title: "Inventory — Inuberry" }] }),
  component: InventoryStockPage,
});

function InventoryStockPage() {
  const orgId = useOrgId();
  const warehouses = useWarehouses();
  const [search, setSearch] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState<string>("all");
  const [stockFilter, setStockFilter] = useState<string>("all");
  const [adjustOpen, setAdjustOpen] = useState(false);

  const stock = useQuery({
    queryKey: ["stock-overview", orgId, warehouseFilter],
    enabled: !!orgId,
    queryFn: async () => {
      let q = supabase.from("inventory_stock")
        .select("warehouse_id, quantity, products:product_id(id, name, sku, barcode, cost_price, sale_price, currency, low_stock_threshold, track_inventory, archived), warehouses:warehouse_id(id, name)")
        .eq("org_id", orgId!);
      if (warehouseFilter !== "all") q = q.eq("warehouse_id", warehouseFilter);
      const { data, error } = await q.limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });

  type Row = {
    id: string;
    product_id: string;
    name: string;
    sku: string | null;
    warehouse: string;
    qty: number;
    threshold: number | null;
    cost: number;
    value: number;
    currency: string;
  };

  const rows = useMemo<Row[]>(() => {
    if (!stock.data) return [];
    const filtered = stock.data.filter((r) => {
      const p = r.products as { archived?: boolean; track_inventory?: boolean } | null;
      return p && !p.archived && p.track_inventory;
    });
    return filtered.map((r) => {
      const p = r.products as { id: string; name: string; sku: string | null; cost_price: number; sale_price: number; currency: string; low_stock_threshold: number | null };
      const w = r.warehouses as { name: string };
      const qty = Number(r.quantity);
      return {
        id: `${p.id}-${r.warehouse_id}`,
        product_id: p.id,
        name: p.name,
        sku: p.sku,
        warehouse: w?.name ?? "—",
        qty,
        threshold: p.low_stock_threshold != null ? Number(p.low_stock_threshold) : null,
        cost: Number(p.cost_price),
        value: qty * Number(p.cost_price),
        currency: p.currency ?? "USD",
      };
    });
  }, [stock.data]);

  const filteredRows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (s && ![r.name, r.sku].filter(Boolean).some((v) => String(v).toLowerCase().includes(s))) return false;
      if (stockFilter !== "all") {
        const st = stockStatus(r.qty, r.threshold);
        if (st !== stockFilter) return false;
      }
      return true;
    });
  }, [rows, search, stockFilter]);

  const totals = useMemo(() => {
    const totalValue = filteredRows.reduce((s, r) => s + r.value, 0);
    const low = filteredRows.filter((r) => stockStatus(r.qty, r.threshold) === "low").length;
    const out = filteredRows.filter((r) => stockStatus(r.qty, r.threshold) === "out").length;
    return { totalValue, low, out };
  }, [filteredRows]);

  return (
    <InventoryShell title="Stock" breadcrumb="inventory / stock"
      actions={<Button size="sm" onClick={() => setAdjustOpen(true)}>Adjust stock</Button>}
    >
      <div className="mb-6"><ModuleCharts module="inventory" /></div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        <KpiTile label="Inventory value" value={fmtMoney(totals.totalValue)} hint={`${filteredRows.length} ${filteredRows.length === 1 ? "item" : "items"}`}
          bars={[filteredRows.length - totals.low - totals.out, totals.low, totals.out]} />
        <KpiTile label="Low stock items" value={String(totals.low)} tone={totals.low > 0 ? "warning" : undefined} />
        <KpiTile label="Out of stock" value={String(totals.out)} tone={totals.out > 0 ? "danger" : undefined} />
      </div>

      <PageToolbar
        search={search} onSearchChange={setSearch}
        placeholder="Search by product name or SKU…"
        filters={
          <>
            <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Warehouse" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All warehouses</SelectItem>
                {warehouses.data?.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={stockFilter} onValueChange={setStockFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="ok">In stock</SelectItem>
                <SelectItem value="low">Low stock</SelectItem>
                <SelectItem value="out">Out of stock</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
      />

      <DataTable
        loading={stock.isLoading}
        data={filteredRows}
        columns={[
          { key: "name", header: "Product", cell: (r) => (
            <Link to="/app/products/$productId" params={{ productId: r.product_id }} className="font-medium hover:text-primary">
              {r.name}
            </Link>
          )},
          { key: "sku", header: "SKU", cell: (r) => <span className="font-mono text-xs">{r.sku ?? "—"}</span> },
          { key: "warehouse", header: "Warehouse", cell: (r) => r.warehouse },
          { key: "qty", header: "On hand", cell: (r) => <span className="font-mono tabular-nums">{r.qty}</span> },
          { key: "status", header: "Status", cell: (r) => {
            const st = stockStatus(r.qty, r.threshold);
            const tone: BadgeTone = st === "ok" ? "success" : st === "low" ? "warning" : "danger";
            return <StatusBadge tone={tone}>{st === "ok" ? "In stock" : st === "low" ? "Low" : "Out"}</StatusBadge>;
          }},
          { key: "value", header: "Value", cell: (r) => <span className="font-mono">{fmtMoney(r.value, r.currency)}</span> },
        ]}
        empty={<EmptyState title="No stock yet" description="Add a product with tracking enabled, then receive or adjust stock to populate this view." />}
      />

      <AdjustmentDialog open={adjustOpen} onOpenChange={setAdjustOpen}
        onDone={() => stock.refetch()} />
    </InventoryShell>
  );
}

