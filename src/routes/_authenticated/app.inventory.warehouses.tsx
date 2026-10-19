import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/use-current-user";
import { InventoryShell } from "@/components/inventory/inventory-shell";
import { DataTable } from "@/components/crm/data-table";
import { EmptyState } from "@/components/crm/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/crm/status-badge";
import { useOrgId } from "@/lib/crm/use-org";
import type { Database } from "@/integrations/supabase/types";

type Warehouse = Database["public"]["Tables"]["warehouses"]["Row"];

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().max(20).optional().or(z.literal("")),
  address_line1: z.string().trim().max(200).optional().or(z.literal("")),
  city: z.string().trim().max(120).optional().or(z.literal("")),
  region: z.string().trim().max(120).optional().or(z.literal("")),
  postal_code: z.string().trim().max(20).optional().or(z.literal("")),
  country: z.string().trim().max(80).optional().or(z.literal("")),
  is_default: z.boolean(),
  is_active: z.boolean(),
});

export const Route = createFileRoute("/_authenticated/app/inventory/warehouses")({
  head: () => ({ meta: [{ title: "Warehouses — Inventory" }] }),
  component: WarehousesPage,
});

function WarehousesPage() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Warehouse | null>(null);

  const list = useQuery({
    queryKey: ["warehouses-all", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouses").select("*").eq("org_id", orgId!).order("is_default", { ascending: false }).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <InventoryShell title="Warehouses" breadcrumb="inventory / warehouses"
      actions={<Button size="sm" onClick={() => { setEditing(null); setDrawerOpen(true); }}><Plus className="mr-1 size-4" /> New warehouse</Button>}
    >
      <DataTable
        loading={list.isLoading}
        data={list.data}
        onRowClick={(r) => { setEditing(r); setDrawerOpen(true); }}
        columns={[
          { key: "name", header: "Name", cell: (r) => (
            <div>
              <div className="font-medium">{r.name}</div>
              <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{r.code ?? "—"}</div>
            </div>
          )},
          { key: "loc", header: "Location", cell: (r) => [r.city, r.region, r.country].filter(Boolean).join(", ") || <span className="text-muted-foreground">—</span> },
          { key: "default", header: "", cell: (r) => r.is_default ? <StatusBadge tone="primary">Default</StatusBadge> : null },
          { key: "active", header: "Status", cell: (r) => <StatusBadge tone={r.is_active ? "success" : "neutral"}>{r.is_active ? "Active" : "Inactive"}</StatusBadge> },
        ]}
        empty={<EmptyState title="No warehouses yet" description="Add a warehouse to start tracking stock locations."
          action={<Button onClick={() => { setEditing(null); setDrawerOpen(true); }}><Plus className="mr-1 size-4" /> New warehouse</Button>} />}
      />

      <WarehouseDrawer open={drawerOpen} onOpenChange={(v) => { setDrawerOpen(v); if (!v) setEditing(null); }}
        warehouse={editing} onSaved={() => { qc.invalidateQueries({ queryKey: ["warehouses"] }); qc.invalidateQueries({ queryKey: ["warehouses-all"] }); }} />
    </InventoryShell>
  );
}

function init(w: Warehouse | null) {
  return {
    name: w?.name ?? "",
    code: w?.code ?? "",
    address_line1: w?.address_line1 ?? "",
    city: w?.city ?? "",
    region: w?.region ?? "",
    postal_code: w?.postal_code ?? "",
    country: w?.country ?? "",
    is_default: w?.is_default ?? false,
    is_active: w?.is_active ?? true,
  };
}

function WarehouseDrawer({ open, onOpenChange, warehouse, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; warehouse: Warehouse | null; onSaved: () => void;
}) {
  const orgId = useOrgId();
  const [form, setForm] = useState(() => init(warehouse));
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => { setForm(init(warehouse)); setErrors({}); }, [warehouse, open]);

  const m = useMutation({
    mutationFn: async () => {
      const parsed = schema.safeParse(form);
      if (!parsed.success) {
        const errs: Record<string, string> = {};
        parsed.error.issues.forEach((i) => { errs[i.path[0] as string] = i.message; });
        setErrors(errs);
        throw new Error("Validation failed");
      }
      const { data: { user } } = await getSessionUser();
      const payload = {
        org_id: orgId!,
        name: form.name,
        code: form.code || null,
        address_line1: form.address_line1 || null,
        city: form.city || null,
        region: form.region || null,
        postal_code: form.postal_code || null,
        country: form.country || null,
        is_default: form.is_default,
        is_active: form.is_active,
      };
      if (form.is_default) {
        await supabase.from("warehouses").update({ is_default: false }).eq("org_id", orgId!).neq("id", warehouse?.id ?? "00000000-0000-0000-0000-000000000000");
      }
      if (warehouse) {
        const { error } = await supabase.from("warehouses").update(payload).eq("id", warehouse.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("warehouses").insert({ ...payload, created_by: user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(warehouse ? "Saved" : "Warehouse created"); onSaved(); onOpenChange(false); },
    onError: (e: Error) => { if (e.message !== "Validation failed") toast.error(e.message); },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{warehouse ? "Edit warehouse" : "New warehouse"}</SheetTitle>
          <SheetDescription>Physical or virtual location where you hold stock.</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
            </div>
            <div>
              <Label>Code</Label>
              <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
            </div>
            <div>
              <Label>Country</Label>
              <Input value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label>Address</Label>
              <Input value={form.address_line1} onChange={(e) => setForm((f) => ({ ...f, address_line1: e.target.value }))} />
            </div>
            <div>
              <Label>City</Label>
              <Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
            </div>
            <div>
              <Label>Region</Label>
              <Input value={form.region} onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))} />
            </div>
            <div>
              <Label>Postal code</Label>
              <Input value={form.postal_code} onChange={(e) => setForm((f) => ({ ...f, postal_code: e.target.value }))} />
            </div>
          </div>
          <div className="flex items-center justify-between border border-border bg-muted/20 px-3 py-2">
            <Label className="m-0">Default warehouse</Label>
            <Switch checked={form.is_default} onCheckedChange={(v) => setForm((f) => ({ ...f, is_default: v }))} />
          </div>
          <div className="flex items-center justify-between border border-border bg-muted/20 px-3 py-2">
            <Label className="m-0">Active</Label>
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
          </div>
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending ? "Saving…" : "Save"}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
