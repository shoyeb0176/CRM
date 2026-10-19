import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Archive, Package, TrendingDown, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, type BadgeTone } from "@/components/crm/status-badge";
import { ConfirmDelete } from "@/components/crm/confirm-delete";
import { useOrgId } from "@/lib/crm/use-org";
import { fmtMoney, stockStatus, useWarehouses } from "@/lib/inventory/use-inv";
import { AdjustmentDialog } from "@/components/inventory/adjustment-dialog";
import { ProductDrawer } from "@/components/inventory/product-drawer";

import { SectionTitle } from "@/components/ui/section-title";
export const Route = createFileRoute("/_authenticated/app/products/$productId")({
  head: () => ({ meta: [{ title: "Product — Inuberry" }] }),
  component: ProductDetail,
});

function ProductDetail() {
  const { productId } = useParams({ from: "/_authenticated/app/products/$productId" });
  const orgId = useOrgId();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const warehouses = useWarehouses();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const product = useQuery({
    queryKey: ["product", productId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, product_categories:category_id(id,name), suppliers:supplier_id(id,name)")
        .eq("id", productId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const stock = useQuery({
    queryKey: ["product-stock", productId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_stock")
        .select("warehouse_id, quantity, warehouses:warehouse_id(name)")
        .eq("product_id", productId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const movements = useQuery({
    queryKey: ["product-movements", productId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("*, warehouses:warehouse_id(name)")
        .eq("product_id", productId)
        .order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const archive = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("products").update({ archived: true, is_active: false }).eq("id", productId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Product archived");
      qc.invalidateQueries({ queryKey: ["products"] });
      navigate({ to: "/app/products" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (product.isLoading) {
    return <AppShell title="Product"><Skeleton className="h-64 w-full" /></AppShell>;
  }
  if (!product.data) {
    return (
      <AppShell title="Not found">
        <div className="border border-dashed border-border p-12 text-center">
          <p className="text-muted-foreground">Product not found.</p>
          <Button asChild variant="link"><Link to="/app/products">Back to products</Link></Button>
        </div>
      </AppShell>
    );
  }

  const p = product.data;
  const totalQty = (stock.data ?? []).reduce((s, r) => s + Number(r.quantity), 0);
  const st = stockStatus(totalQty, p.low_stock_threshold);
  const stTone: BadgeTone = st === "ok" ? "success" : st === "low" ? "warning" : "danger";
  const category = (p as typeof p & { product_categories?: { id: string; name: string } | null }).product_categories;
  const supplier = (p as typeof p & { suppliers?: { id: string; name: string } | null }).suppliers;

  return (
    <AppShell title={p.name} breadcrumb={`products / ${p.name}`}>
      <div className="mb-6 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/app/products" })}>
          <ArrowLeft className="mr-1 size-4" /> All products
        </Button>
        <div className="flex gap-2">
          {p.track_inventory && (
            <Button size="sm" variant="outline" onClick={() => setAdjustOpen(true)}>Adjust stock</Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>Edit</Button>
          <Button size="sm" variant="outline" onClick={() => setConfirmOpen(true)}>
            <Archive className="mr-1 size-4" /> Archive
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="border border-border bg-card shadow-sm p-6">
            <div className="flex items-start gap-4">
              <span className="grid size-12 place-items-center border border-border bg-muted/30">
                <Package className="size-5 text-muted-foreground" />
              </span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h1 className="font-display text-2xl uppercase">{p.name}</h1>
                  <StatusBadge tone={p.is_active ? "success" : "neutral"}>{p.is_active ? "Active" : "Inactive"}</StatusBadge>
                </div>
                <div className="mt-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  {p.sku || "no-sku"} {p.barcode && ` · ${p.barcode}`} · {p.product_type}
                </div>
                {p.description && <p className="mt-3 text-sm text-muted-foreground whitespace-pre-wrap">{p.description}</p>}
              </div>
            </div>
            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 text-sm">
              <Stat label="Sale price" value={fmtMoney(Number(p.sale_price), p.currency)} />
              <Stat label="Cost price" value={fmtMoney(Number(p.cost_price), p.currency)} />
              <Stat label="Tax" value={p.taxable ? `${p.tax_rate}%` : "Non-taxable"} />
              <Stat label="Unit" value={p.unit_of_measure} />
              <Stat label="Category" value={category?.name ?? "—"} />
              <Stat label="Supplier" value={supplier?.name ?? "—"} />
              <Stat label="Low stock at" value={p.low_stock_threshold != null ? String(p.low_stock_threshold) : "—"} />
              <Stat label="Tracked" value={p.track_inventory ? "Yes" : "No"} />
            </dl>
          </div>

          {p.track_inventory && (
            <section>
              <SectionTitle className="mb-3 border-b border-border pb-2">Stock by warehouse</SectionTitle>
              {stock.isLoading ? <Skeleton className="h-24" /> : (
                <div className="border border-border bg-card divide-y divide-border">
                  {(warehouses.data ?? []).map((w) => {
                    const rec = (stock.data ?? []).find((s) => s.warehouse_id === w.id);
                    const qty = Number(rec?.quantity ?? 0);
                    return (
                      <div key={w.id} className="flex items-center justify-between px-4 py-3">
                        <div>
                          <div className="font-medium">{w.name}</div>
                          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{w.code ?? "—"}</div>
                        </div>
                        <div className="font-mono tabular-nums text-lg">{qty}</div>
                      </div>
                    );
                  })}
                  {(!warehouses.data || warehouses.data.length === 0) && (
                    <div className="p-4 text-sm text-muted-foreground">No warehouses configured.</div>
                  )}
                </div>
              )}
            </section>
          )}

          <section>
            <SectionTitle className="mb-3 border-b border-border pb-2">Movement history</SectionTitle>
            {movements.isLoading ? <Skeleton className="h-32" /> : (movements.data ?? []).length === 0 ? (
              <div className="border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No movements yet.</div>
            ) : (
              <ul className="divide-y divide-border border border-border bg-card">
                {movements.data!.map((m) => {
                  const qty = Number(m.quantity);
                  const isIn = qty >= 0;
                  return (
                    <li key={m.id} className="flex items-center gap-4 px-4 py-3">
                      {isIn ? <TrendingUp className="size-4 text-success" /> : <TrendingDown className="size-4 text-destructive" />}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm">
                          <span className="font-mono uppercase text-xs tracking-widest text-muted-foreground">{m.movement_type}</span>
                          {m.notes && <span className="text-muted-foreground"> · {m.notes}</span>}
                        </div>
                        <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                          {(m as typeof m & { warehouses?: { name: string } | null }).warehouses?.name ?? "—"} · {new Date(m.created_at).toLocaleString()}
                        </div>
                      </div>
                      <span className={`font-mono tabular-nums ${isIn ? "text-success" : "text-destructive"}`}>{isIn ? "+" : ""}{qty}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <div className="border border-border bg-card shadow-sm p-5">
            <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">On hand</div>
            <div className="mt-1 flex items-center gap-2">
              <div className="font-display text-3xl">{totalQty}</div>
              {p.track_inventory && <StatusBadge tone={stTone}>{st === "ok" ? "In stock" : st === "low" ? "Low" : "Out"}</StatusBadge>}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">across {warehouses.data?.length ?? 0} warehouses</div>
          </div>
          <div className="border border-border bg-card shadow-sm p-5">
            <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Inventory value</div>
            <div className="mt-1 font-display text-2xl">{fmtMoney(totalQty * Number(p.cost_price), p.currency)}</div>
            <div className="mt-1 text-xs text-muted-foreground">at cost price</div>
          </div>
        </aside>
      </div>

      <ConfirmDelete
        open={confirmOpen} onOpenChange={setConfirmOpen}
        title="Archive product?" description="It will be hidden from lists and reports but kept for history." confirmLabel="Archive"
onConfirm={() => archive.mutate()}
      />

      <AdjustmentDialog
        open={adjustOpen} onOpenChange={setAdjustOpen}
        productId={productId}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["product-stock", productId] });
          qc.invalidateQueries({ queryKey: ["product-movements", productId] });
          qc.invalidateQueries({ queryKey: ["product-stock-totals"] });
        }}
      />
      {product.data && (
        <ProductDrawer open={editOpen} onOpenChange={setEditOpen} product={product.data}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["product", productId] }); qc.invalidateQueries({ queryKey: ["products"] }); }} />
      )}
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}
