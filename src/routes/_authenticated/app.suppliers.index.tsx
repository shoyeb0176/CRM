import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useOpenOnNew } from "@/lib/use-focus-row";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";
import { Plus, Truck } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { InventoryShell } from "@/components/inventory/inventory-shell";
import { DataTable } from "@/components/crm/data-table";
import { EmptyState } from "@/components/crm/empty-state";
import { PageToolbar } from "@/components/crm/page-toolbar";
import { StatusBadge } from "@/components/crm/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { useOrgId } from "@/lib/crm/use-org";
import type { Database } from "@/integrations/supabase/types";
import { Supplier, SupplierDrawer } from "@/components/purchasing/supplier-drawer";

export const Route = createFileRoute("/_authenticated/app/suppliers/")({
  head: () => ({ meta: [{ title: "Suppliers — Inuberry" }] }),
  component: SuppliersPage,
});

function SuppliersPage() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);

  const suppliers = useQuery({
    queryKey: ["suppliers", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id, name, contact_name, email, phone, city, country, payment_terms").eq("org_id", orgId!).eq("archived", false).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    if (!suppliers.data) return undefined;
    const s = search.trim().toLowerCase();
    if (!s) return suppliers.data;
    return suppliers.data.filter((r) => [r.name, r.contact_name, r.email, r.phone].filter(Boolean).some((v) => String(v).toLowerCase().includes(s)));
  }, [suppliers.data, search]);

  useOpenOnNew(() => { setEditing(null); setDrawerOpen(true); });
  return (
    <InventoryShell title="Suppliers" breadcrumb="suppliers"
      actions={<Button size="sm" onClick={() => { setEditing(null); setDrawerOpen(true); }}><Plus className="mr-1 size-4" /> New supplier</Button>}
    >
      <PageToolbar search={search} onSearchChange={setSearch} placeholder="Search by name, contact, email…" />
      <DataTable
        loading={suppliers.isLoading}
        data={filtered}
        onRowClick={(r) => navigate({ to: "/app/suppliers/$supplierId", params: { supplierId: r.id } })}
        columns={[
          { key: "name", header: "Supplier", cell: (r) => (
            <div className="flex items-center gap-3">
              <span className="grid size-8 place-items-center border border-border bg-muted/30">
                <Truck className="size-3.5 text-muted-foreground" />
              </span>
              <div>
                <div className="font-medium">{r.name}</div>
                {r.contact_name && <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{r.contact_name}</div>}
              </div>
            </div>
          )},
          { key: "email", header: "Email", cell: (r) => r.email ?? <span className="text-muted-foreground">—</span> },
          { key: "phone", header: "Phone", cell: (r) => r.phone ?? <span className="text-muted-foreground">—</span> },
          { key: "country", header: "Location", cell: (r) => [r.city, r.country].filter(Boolean).join(", ") || <span className="text-muted-foreground">—</span> },
          { key: "terms", header: "Terms", cell: (r) => r.payment_terms ? <StatusBadge tone="info">{r.payment_terms}</StatusBadge> : <span className="text-muted-foreground">—</span> },
        ]}
        empty={<EmptyState title="No suppliers yet" description="Add vendors that supply your products to track purchasing relationships."
          action={<Button onClick={() => { setEditing(null); setDrawerOpen(true); }}><Plus className="mr-1 size-4" /> New supplier</Button>} />}
      />
      <SupplierDrawer open={drawerOpen} onOpenChange={(v) => { setDrawerOpen(v); if (!v) setEditing(null); }}
        supplier={editing} onSaved={() => { qc.invalidateQueries({ queryKey: ["suppliers"] }); qc.invalidateQueries({ queryKey: ["suppliers-min"] }); }} />
    </InventoryShell>
  );
}
