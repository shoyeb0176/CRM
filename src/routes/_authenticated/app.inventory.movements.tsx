import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { InventoryShell } from "@/components/inventory/inventory-shell";
import { DataTable } from "@/components/crm/data-table";
import { EmptyState } from "@/components/crm/empty-state";
import { PageToolbar } from "@/components/crm/page-toolbar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOrgId } from "@/lib/crm/use-org";
import { useWarehouses } from "@/lib/inventory/use-inv";
import { Button } from "@/components/ui/button";

const TYPES = ["receipt","sale","transfer_in","transfer_out","adjustment","return","consumption"];

export const Route = createFileRoute("/_authenticated/app/inventory/movements")({
  head: () => ({ meta: [{ title: "Stock movements — Inventory" }] }),
  component: MovementsPage,
});

function MovementsPage() {
  const orgId = useOrgId();
  const warehouses = useWarehouses();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [warehouseFilter, setWarehouseFilter] = useState<string>("all");

  const movements = useQuery({
    queryKey: ["movements", orgId, typeFilter, warehouseFilter],
    enabled: !!orgId,
    queryFn: async () => {
      let q = supabase.from("inventory_movements")
        .select("id, created_at, quantity, movement_type, notes, products:product_id(id,name,sku), warehouses:warehouse_id(name)")
        .eq("org_id", orgId!).order("created_at", { ascending: false }).limit(500);
      if (typeFilter !== "all") q = q.eq("movement_type", typeFilter as never);
      if (warehouseFilter !== "all") q = q.eq("warehouse_id", warehouseFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    if (!movements.data) return undefined;
    const s = search.trim().toLowerCase();
    if (!s) return movements.data;
    return movements.data.filter((m) => {
      const p = m.products as { name?: string; sku?: string } | null;
      return [p?.name, p?.sku, m.notes].filter(Boolean).some((v) => String(v).toLowerCase().includes(s));
    });
  }, [movements.data, search]);

  return (
    <InventoryShell title="Stock movements" breadcrumb="inventory / movements">
      <PageToolbar
        search={search} onSearchChange={setSearch} placeholder="Search by product, SKU, notes…"
        filters={
          <>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace("_"," ")}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Warehouse" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All warehouses</SelectItem>
                {warehouses.data?.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </>
        }
      />
      <DataTable
        loading={movements.isLoading}
        data={filtered}
        columns={[
          { key: "when", header: "When", cell: (r) => (
            <span className="font-mono text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
          )},
          { key: "type", header: "Type", cell: (r) => (
            <div className="flex items-center gap-2">
              {Number(r.quantity) >= 0 ? <TrendingUp className="size-3.5 text-success" /> : <TrendingDown className="size-3.5 text-destructive" />}
              <span className="font-mono uppercase text-xs tracking-widest text-muted-foreground">{r.movement_type}</span>
            </div>
          )},
          { key: "product", header: "Product", cell: (r) => {
            const p = r.products as { id?: string; name?: string; sku?: string } | null;
            if (!p?.id) return <span className="text-muted-foreground">—</span>;
            return <Link to="/app/products/$productId" params={{ productId: p.id }} className="font-medium hover:text-primary">{p.name}</Link>;
          }},
          { key: "warehouse", header: "Warehouse", cell: (r) => (r.warehouses as { name?: string } | null)?.name ?? "—" },
          { key: "qty", header: "Qty", cell: (r) => {
            const q = Number(r.quantity);
            return <span className={`font-mono tabular-nums ${q >= 0 ? "text-success" : "text-destructive"}`}>{q >= 0 ? "+" : ""}{q}</span>;
          }},
          { key: "notes", header: "Notes", cell: (r) => <span className="text-xs text-muted-foreground">{r.notes ?? "—"}</span> },
        ]}
        empty={<EmptyState title="No movements yet" description="Stock receipts, sales, transfers and adjustments will show up here." action={<Button asChild variant="outline"><Link to="/app/inventory/adjustments">Adjust stock</Link></Button>} />}
      />
    </InventoryShell>
  );
}
