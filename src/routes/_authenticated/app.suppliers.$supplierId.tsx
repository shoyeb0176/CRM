import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Archive, Truck, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/crm/status-badge";
import { ConfirmDelete } from "@/components/crm/confirm-delete";
import { useOrgId } from "@/lib/crm/use-org";
import { SupplierDrawer } from "@/components/purchasing/supplier-drawer";
import { AttachmentsPanel } from "@/components/attachments/attachments-panel";

import { SectionTitle } from "@/components/ui/section-title";
export const Route = createFileRoute("/_authenticated/app/suppliers/$supplierId")({
  head: () => ({ meta: [{ title: "Supplier — Inuberry" }] }),
  component: SupplierDetail,
});

function SupplierDetail() {
  const { supplierId } = useParams({ from: "/_authenticated/app/suppliers/$supplierId" });
  const orgId = useOrgId();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const supplier = useQuery({
    queryKey: ["supplier", supplierId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*").eq("id", supplierId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const products = useQuery({
    queryKey: ["supplier-products", supplierId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, name, sku, sale_price, currency, is_active")
        .eq("supplier_id", supplierId).eq("archived", false).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const archive = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("suppliers").update({ archived: true }).eq("id", supplierId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Supplier archived");
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      navigate({ to: "/app/suppliers" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (supplier.isLoading) return <AppShell title="Supplier"><Skeleton className="h-64 w-full" /></AppShell>;
  if (!supplier.data) {
    return (
      <AppShell title="Not found">
        <div className="border border-dashed border-border p-12 text-center text-muted-foreground">
          Supplier not found. <Link to="/app/suppliers" className="text-primary">Back →</Link>
        </div>
      </AppShell>
    );
  }
  const s = supplier.data;

  return (
    <AppShell title={s.name} breadcrumb={`suppliers / ${s.name}`}>
      <div className="mb-6 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/app/suppliers" })}>
          <ArrowLeft className="mr-1 size-4" /> All suppliers
        </Button>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>Edit</Button>
          <Button size="sm" variant="outline" onClick={() => setConfirmOpen(true)}><Archive className="mr-1 size-4" /> Archive</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="border border-border bg-card shadow-sm p-6">
            <div className="flex items-start gap-4">
              <span className="grid size-12 place-items-center border border-border bg-muted/30">
                <Truck className="size-5 text-muted-foreground" />
              </span>
              <div>
                <h1 className="font-display text-2xl uppercase">{s.name}</h1>
                {s.contact_name && <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{s.contact_name}</div>}
              </div>
            </div>
            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 text-sm">
              <Stat label="Email" value={s.email ?? "—"} />
              <Stat label="Phone" value={s.phone ?? "—"} />
              <Stat label="Website" value={s.website ?? "—"} />
              <Stat label="Payment terms" value={s.payment_terms ?? "—"} />
              <Stat label="Currency" value={s.currency ?? "USD"} />
              <Stat label="Tax ID" value={s.tax_id ?? "—"} />
              <Stat label="Address" value={[s.address_line1, s.city, s.country].filter(Boolean).join(", ") || "—"} />
            </dl>
            {s.notes && (
              <div className="mt-6 border-t border-border pt-4">
                <div className="mb-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">Notes</div>
                <p className="text-sm whitespace-pre-wrap">{s.notes}</p>
              </div>
            )}
          </div>

          <section>
            <SectionTitle className="mb-3 border-b border-border pb-2">Products supplied</SectionTitle>
            {products.isLoading ? <Skeleton className="h-32" /> : (products.data ?? []).length === 0 ? (
              <div className="border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No products linked yet.</div>
            ) : (
              <ul className="divide-y divide-border border border-border bg-card">
                {products.data!.map((p) => (
                  <li key={p.id}>
                    <Link to="/app/products/$productId" params={{ productId: p.id }} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30">
                      <Package className="size-4 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{p.name}</div>
                        <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{p.sku ?? "no-sku"}</div>
                      </div>
                      <span className="font-mono">{new Intl.NumberFormat(undefined, { style: "currency", currency: p.currency ?? "USD" }).format(Number(p.sale_price))}</span>
                      <StatusBadge tone={p.is_active ? "success" : "neutral"}>{p.is_active ? "Active" : "Inactive"}</StatusBadge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <div className="border border-border bg-card shadow-sm p-5">
            <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Products</div>
            <div className="mt-1 font-display text-3xl">{products.data?.length ?? 0}</div>
          </div>
        </aside>
      </div>

      <SupplierDrawer open={editOpen} onOpenChange={setEditOpen} supplier={s}
        onSaved={() => { qc.invalidateQueries({ queryKey: ["supplier", supplierId] }); qc.invalidateQueries({ queryKey: ["suppliers"] }); }} />
      <ConfirmDelete open={confirmOpen} onOpenChange={setConfirmOpen}
        title="Archive supplier?" description="It will be hidden from supplier lists. Linked products stay intact." confirmLabel="Archive"
        onConfirm={() => archive.mutate()} />
      <AttachmentsPanel orgId={orgId} entityType="supplier" entityId={supplierId} className="mt-6 border border-border bg-background" />
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate">{value}</dd>
    </div>
  );
}
