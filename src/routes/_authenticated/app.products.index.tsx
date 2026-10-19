import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useOpenOnNew } from "@/lib/use-focus-row";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";
import { downloadCsv } from "@/lib/import/csv";
import { Plus, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { InventoryShell } from "@/components/inventory/inventory-shell";
import { DataTable } from "@/components/crm/data-table";
import { EmptyState } from "@/components/crm/empty-state";
import { PageToolbar } from "@/components/crm/page-toolbar";
import { StatusBadge, type BadgeTone } from "@/components/crm/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useOrgId } from "@/lib/crm/use-org";
import { ilikeAny, usePaged } from "@/lib/use-paged";
import { TablePager } from "@/components/ui/table-pager";
import { useProductCategories, useSuppliersMin, fmtMoney, stockStatus } from "@/lib/inventory/use-inv";
import type { Database } from "@/integrations/supabase/types";
import { Product, ProductDrawer, ProductType, TYPES } from "@/components/inventory/product-drawer";

type ProductRow = Product & { on_hand?: number | null; stock_status?: string | null; product_categories?: { id: string; name: string } | null };

const TYPE_TONE: Record<ProductType, BadgeTone> = {
  physical: "info", service: "primary", digital: "warning", bundle: "neutral",
};

export const Route = createFileRoute("/_authenticated/app/products/")({
  head: () => ({ meta: [{ title: "Products — Inuberry" }] }),
  component: ProductsPage,
});

function ProductsPage() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const p = usePaged();
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [stockFilter, setStockFilter] = useState<string>("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [exporting, setExporting] = useState(false);

  const categories = useProductCategories();

  // One page at a time, filtered in the database. products_with_stock (database update 0044) adds
  // each product's on-hand quantity and stock status; before that update the list still works,
  // without stock numbers or the stock filter.
  function query(withStock: boolean) {
    let q = supabase.from((withStock ? "products_with_stock" : "products") as "products_with_stock")
      .select("*, product_categories:category_id(id,name)", { count: "exact" })
      .eq("org_id", orgId!).eq("archived", false)
      .order("created_at", { ascending: false });
    if (typeFilter !== "all") q = q.eq("product_type", typeFilter as ProductType);
    if (categoryFilter !== "all") q = q.eq("category_id", categoryFilter);
    if (withStock && stockFilter !== "all") q = q.eq("stock_status", stockFilter);
    const or = ilikeAny(["name", "sku", "barcode"], p.q);
    if (or) q = q.or(or);
    return q;
  }
  const products = useQuery({
    queryKey: ["products", orgId, typeFilter, categoryFilter, stockFilter, p.q, p.page, p.size],
    enabled: !!orgId,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let res = await query(true).range(p.from, p.to);
      if (res.error && /products_with_stock/.test(res.error.message)) res = await query(false).range(p.from, p.to);
      if (res.error) throw res.error;
      return { rows: (res.data ?? []) as ProductRow[], total: res.count ?? 0 };
    },
  });

  // Every matching product (not just this page), 1,000 at a time.
  async function exportAll() {
    setExporting(true);
    try {
      const rows: ProductRow[] = [];
      for (let from = 0; ; from += 1000) {
        let res = await query(true).range(from, from + 999);
        if (res.error && /products_with_stock/.test(res.error.message)) res = await query(false).range(from, from + 999);
        if (res.error) throw res.error;
        rows.push(...((res.data ?? []) as ProductRow[]));
        if ((res.data ?? []).length < 1000) break;
      }
      downloadCsv(
        `products-${new Date().toISOString().slice(0, 10)}.csv`,
        ["name", "sku", "barcode", "product_type", "unit_of_measure", "category", "cost_price", "sale_price", "tax_rate", "track_inventory", "is_active", "on_hand", "description"],
        rows.map((r) => [r.name, r.sku, r.barcode, r.product_type, r.unit_of_measure, r.product_categories?.name, r.cost_price, r.sale_price, r.tax_rate, r.track_inventory, r.is_active, r.track_inventory ? (r.on_hand ?? "") : "", r.description]),
      );
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setExporting(false);
    }
  }

  useOpenOnNew(() => { setEditing(null); setDrawerOpen(true); });
  return (
    <InventoryShell
      title="Products"
      breadcrumb="products"
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild><Link to="/app/import" search={{ target: "products" }}>Import</Link></Button>
          <Button variant="outline" size="sm" disabled={!products.data?.total || exporting} onClick={exportAll}>
            {exporting ? "Exporting…" : "Export"}
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setDrawerOpen(true); }}>
            <Plus className="mr-1 size-4" /> New product
          </Button>
        </div>
      }
    >
      <PageToolbar
        search={p.search}
        onSearchChange={p.setSearch}
        placeholder="Search by name, SKU, barcode…"
        filters={
          <>
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); p.reset(); }}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); p.reset(); }}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={stockFilter} onValueChange={(v) => { setStockFilter(v); p.reset(); }}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Stock" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stock</SelectItem>
                <SelectItem value="ok">In stock</SelectItem>
                <SelectItem value="low">Low stock</SelectItem>
                <SelectItem value="out">Out of stock</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
      />

      <DataTable
        loading={products.isLoading}
        data={products.data?.rows}
        onRowClick={(row) => navigate({ to: "/app/products/$productId", params: { productId: row.id } })}
        columns={[
          { key: "name", header: "Name", cell: (r) => (
            <div className="flex items-center gap-3">
              <span className="grid size-8 place-items-center border border-border bg-muted/30 font-mono text-xs text-muted-foreground">
                <Package className="size-3.5" />
              </span>
              <div className="min-w-0">
                <div className="font-medium truncate">{r.name}</div>
                <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{r.sku || "no-sku"}</div>
              </div>
            </div>
          )},
          { key: "type", header: "Type", cell: (r) => <StatusBadge tone={TYPE_TONE[r.product_type]}>{r.product_type}</StatusBadge> },
          { key: "category", header: "Category", cell: (r) => r.product_categories?.name ?? <span className="text-muted-foreground">—</span> },
          { key: "price", header: "Price", cell: (r) => <span className="font-mono">{fmtMoney(Number(r.sale_price), r.currency)}</span> },
          { key: "stock", header: "Stock", cell: (r) => {
            if (!r.track_inventory) return <span className="text-muted-foreground text-xs">n/a</span>;
            if (r.on_hand == null) return <span className="text-muted-foreground">—</span>;
            const qty = Number(r.on_hand);
            const st = stockStatus(qty, r.low_stock_threshold);
            const tone: BadgeTone = st === "ok" ? "success" : st === "low" ? "warning" : "danger";
            return (
              <div className="flex items-center gap-2">
                <span className="font-mono tabular-nums">{qty}</span>
                {st !== "ok" && <StatusBadge tone={tone}>{st === "out" ? "out" : "low"}</StatusBadge>}
              </div>
            );
          }},
          { key: "status", header: "Status", cell: (r) => (
            <StatusBadge tone={r.is_active ? "success" : "neutral"}>{r.is_active ? "Active" : "Inactive"}</StatusBadge>
          )},
        ]}
        empty={
          <EmptyState
            title="No products yet"
            description="Add your first product or service to start tracking pricing, tax, and stock levels."
            action={<Button onClick={() => { setEditing(null); setDrawerOpen(true); }}><Plus className="mr-1 size-4" /> New product</Button>}
          />
        }
      />

      <TablePager page={p.page} size={p.size} total={products.data?.total ?? 0} onPage={p.setPage} onSize={p.setSize} />

      <ProductDrawer
        open={drawerOpen}
        onOpenChange={(v) => { setDrawerOpen(v); if (!v) setEditing(null); }}
        product={editing}
        onSaved={() => qc.invalidateQueries({ queryKey: ["products"] })}
      />

      <p className="mt-6 text-xs text-muted-foreground">
        <Link to="/app/products/categories" className="text-primary hover:underline">Manage categories →</Link>
      </p>
    </InventoryShell>
  );
}
