import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { InventoryShell } from "@/components/inventory/inventory-shell";
import { DataTable } from "@/components/crm/data-table";
import { EmptyState } from "@/components/crm/empty-state";
import { Button } from "@/components/ui/button";
import { useOrgId } from "@/lib/crm/use-org";
import { AdjustmentDialog } from "@/components/inventory/adjustment-dialog";

export const Route = createFileRoute("/_authenticated/app/inventory/adjustments")({
  head: () => ({ meta: [{ title: "Stock adjustments — Inventory" }] }),
  component: AdjustmentsPage,
});

function AdjustmentsPage() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const adjustments = useQuery({
    queryKey: ["adjustments", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_adjustments")
        .select("*, products:product_id(id,name,sku), warehouses:warehouse_id(name)")
        .eq("org_id", orgId!).order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <InventoryShell title="Stock adjustments" breadcrumb="inventory / adjustments"
      actions={<Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1 size-4" /> New adjustment</Button>}
    >
      <DataTable
        loading={adjustments.isLoading}
        data={adjustments.data}
        columns={[
          { key: "when", header: "When", cell: (r) => <span className="font-mono text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span> },
          { key: "product", header: "Product", cell: (r) => {
            const p = r.products as { id?: string; name?: string } | null;
            return p?.id ? <Link to="/app/products/$productId" params={{ productId: p.id }} className="font-medium hover:text-primary">{p.name}</Link> : "—";
          }},
          { key: "warehouse", header: "Warehouse", cell: (r) => (r.warehouses as { name?: string } | null)?.name ?? "—" },
          { key: "reason", header: "Reason", cell: (r) => r.reason },
          { key: "delta", header: "Change", cell: (r) => {
            const q = Number(r.quantity_delta);
            return <span className={`font-mono tabular-nums ${q >= 0 ? "text-success" : "text-destructive"}`}>{q >= 0 ? "+" : ""}{q}</span>;
          }},
          { key: "notes", header: "Notes", cell: (r) => <span className="text-xs text-muted-foreground">{r.notes ?? "—"}</span> },
        ]}
        empty={<EmptyState title="No adjustments yet" description="Record manual stock counts, damage, returns or corrections."
          action={<Button onClick={() => setOpen(true)}><Plus className="mr-1 size-4" /> New adjustment</Button>} />}
      />
      <AdjustmentDialog open={open} onOpenChange={setOpen}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["adjustments"] });
          qc.invalidateQueries({ queryKey: ["stock-overview"] });
          qc.invalidateQueries({ queryKey: ["movements"] });
          qc.invalidateQueries({ queryKey: ["product-stock-totals"] });
        }} />
    </InventoryShell>
  );
}
