import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useOpenOnNew } from "@/lib/use-focus-row";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";
import { downloadCsv } from "@/lib/import/csv";
import { Plus, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/use-current-user";
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
import { useProductCategories, useSuppliersMin, fmtMoney, stockStatus } from "@/lib/inventory/use-inv";
import type { Database } from "@/integrations/supabase/types";

export type Product = Database["public"]["Tables"]["products"]["Row"];
export type ProductType = Database["public"]["Enums"]["product_type"];

export const TYPES: ProductType[] = ["physical", "service", "digital", "bundle"];
const schema = z.object({
  name: z.string().trim().min(1, "Required").max(200),
  sku: z.string().trim().max(80).optional().or(z.literal("")),
  barcode: z.string().trim().max(80).optional().or(z.literal("")),
  product_type: z.enum(["physical","service","digital","bundle"]),
  category_id: z.string().uuid().optional().nullable(),
  supplier_id: z.string().uuid().optional().nullable(),
  unit_of_measure: z.string().trim().max(40).default("unit"),
  cost_price: z.number().min(0),
  sale_price: z.number().min(0),
  tax_rate: z.number().min(0).max(100),
  taxable: z.boolean(),
  is_active: z.boolean(),
  track_inventory: z.boolean(),
  low_stock_threshold: z.number().min(0).nullable().optional(),
  description: z.string().trim().max(5000).optional().or(z.literal("")),
});

function initial(p: Product | null) {
  return {
    name: p?.name ?? "",
    sku: p?.sku ?? "",
    barcode: p?.barcode ?? "",
    product_type: (p?.product_type ?? "physical") as ProductType,
    category_id: p?.category_id ?? null,
    supplier_id: p?.supplier_id ?? null,
    unit_of_measure: p?.unit_of_measure ?? "unit",
    cost_price: Number(p?.cost_price ?? 0),
    sale_price: Number(p?.sale_price ?? 0),
    tax_rate: Number(p?.tax_rate ?? 0),
    taxable: p?.taxable ?? true,
    is_active: p?.is_active ?? true,
    track_inventory: p?.track_inventory ?? true,
    low_stock_threshold: p?.low_stock_threshold != null ? Number(p.low_stock_threshold) : null,
    description: p?.description ?? "",
  };
}

export function ProductDrawer({
  open, onOpenChange, product, onSaved,
}: { open: boolean; onOpenChange: (v: boolean) => void; product: Product | null; onSaved: () => void }) {
  const orgId = useOrgId();
  const categories = useProductCategories();
  const suppliers = useSuppliersMin();
  const [form, setForm] = useState(() => initial(product));
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => { setForm(initial(product)); setErrors({}); }, [product, open]);

  const mutation = useMutation({
    mutationFn: async () => {
      const parsed = schema.safeParse(form);
      if (!parsed.success) {
        const errs: Record<string, string> = {};
        parsed.error.issues.forEach((i) => { errs[i.path[0] as string] = i.message; });
        setErrors(errs);
        throw new Error("Validation failed");
      }
      setErrors({});
      const { data: { user } } = await getSessionUser();
      const payload = {
        org_id: orgId!,
        name: form.name,
        sku: form.sku || null,
        barcode: form.barcode || null,
        product_type: form.product_type,
        category_id: form.category_id || null,
        supplier_id: form.supplier_id || null,
        unit_of_measure: form.unit_of_measure || "unit",
        cost_price: form.cost_price,
        sale_price: form.sale_price,
        tax_rate: form.tax_rate,
        taxable: form.taxable,
        is_active: form.is_active,
        track_inventory: form.track_inventory,
        low_stock_threshold: form.low_stock_threshold,
        description: form.description || null,
      };
      if (product) {
        const { error } = await supabase.from("products").update(payload).eq("id", product.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert({ ...payload, created_by: user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(product ? "Product updated" : "Product created");
      onSaved();
      onOpenChange(false);
    },
    onError: (e: Error) => { if (e.message !== "Validation failed") toast.error(friendlyError(e)); },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{product ? "Edit product" : "New product"}</SheetTitle>
          <SheetDescription>SKU, pricing, tax and inventory tracking.</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label>Name *</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>SKU</Label>
              <Input value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} />
            </div>
            <div>
              <Label>Barcode</Label>
              <Input value={form.barcode} onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={form.product_type} onValueChange={(v) => setForm((f) => ({ ...f, product_type: v as ProductType, track_inventory: v === "physical" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Unit</Label>
              <Input value={form.unit_of_measure} onChange={(e) => setForm((f) => ({ ...f, unit_of_measure: e.target.value }))} placeholder="unit, kg, hr…" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <Select value={form.category_id ?? "none"} onValueChange={(v) => setForm((f) => ({ ...f, category_id: v === "none" ? null : v }))}>
                <SelectTrigger><SelectValue placeholder="Uncategorized" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {categories.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Supplier</Label>
              <Select value={form.supplier_id ?? "none"} onValueChange={(v) => setForm((f) => ({ ...f, supplier_id: v === "none" ? null : v }))}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {suppliers.data?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Cost price</Label>
              <Input type="number" step="0.01" value={form.cost_price} onChange={(e) => setForm((f) => ({ ...f, cost_price: Number(e.target.value) }))} />
            </div>
            <div>
              <Label>Sale price</Label>
              <Input type="number" step="0.01" value={form.sale_price} onChange={(e) => setForm((f) => ({ ...f, sale_price: Number(e.target.value) }))} />
            </div>
            <div>
              <Label>Tax rate %</Label>
              <Input type="number" step="0.01" value={form.tax_rate} onChange={(e) => setForm((f) => ({ ...f, tax_rate: Number(e.target.value) }))} />
            </div>
          </div>
          <div className="flex items-center justify-between border border-border bg-muted/20 px-3 py-2">
            <Label className="m-0">Taxable</Label>
            <Switch checked={form.taxable} onCheckedChange={(v) => setForm((f) => ({ ...f, taxable: v }))} />
          </div>
          <div className="flex items-center justify-between border border-border bg-muted/20 px-3 py-2">
            <Label className="m-0">Track inventory</Label>
            <Switch checked={form.track_inventory} onCheckedChange={(v) => setForm((f) => ({ ...f, track_inventory: v }))} />
          </div>
          <div className="flex items-center justify-between border border-border bg-muted/20 px-3 py-2">
            <Label className="m-0">Active</Label>
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
          </div>
          {form.track_inventory && (
            <div>
              <Label>Low stock threshold</Label>
              <Input
                type="number" step="0.01"
                value={form.low_stock_threshold ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, low_stock_threshold: e.target.value === "" ? null : Number(e.target.value) }))}
                placeholder="e.g. 5"
              />
            </div>
          )}
          <div>
            <Label>Description</Label>
            <Textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : product ? "Save changes" : "Create product"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
