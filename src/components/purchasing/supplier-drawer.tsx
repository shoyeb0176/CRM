import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useOpenOnNew } from "@/lib/use-focus-row";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";
import { Plus, Truck } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/use-current-user";
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

export type Supplier = Database["public"]["Tables"]["suppliers"]["Row"];

const schema = z.object({
  name: z.string().trim().min(1).max(200),
  contact_name: z.string().trim().max(120).optional().or(z.literal("")),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  website: z.string().trim().max(255).optional().or(z.literal("")),
  tax_id: z.string().trim().max(80).optional().or(z.literal("")),
  payment_terms: z.string().trim().max(120).optional().or(z.literal("")),
  currency: z.string().trim().max(8).optional().or(z.literal("")),
  address_line1: z.string().trim().max(200).optional().or(z.literal("")),
  city: z.string().trim().max(120).optional().or(z.literal("")),
  country: z.string().trim().max(80).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

function init(s: Supplier | null) {
  return {
    name: s?.name ?? "", contact_name: s?.contact_name ?? "", email: s?.email ?? "",
    phone: s?.phone ?? "", website: s?.website ?? "", tax_id: s?.tax_id ?? "",
    payment_terms: s?.payment_terms ?? "", currency: s?.currency ?? "USD",
    address_line1: s?.address_line1 ?? "", city: s?.city ?? "", country: s?.country ?? "",
    notes: s?.notes ?? "",
  };
}

export function SupplierDrawer({ open, onOpenChange, supplier, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; supplier: Supplier | null; onSaved: () => void;
}) {
  const orgId = useOrgId();
  const [form, setForm] = useState(() => init(supplier));
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => { setForm(init(supplier)); setErrors({}); }, [supplier, open]);

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
        org_id: orgId!, name: form.name,
        contact_name: form.contact_name || null, email: form.email || null,
        phone: form.phone || null, website: form.website || null, tax_id: form.tax_id || null,
        payment_terms: form.payment_terms || null, currency: form.currency || "USD",
        address_line1: form.address_line1 || null, city: form.city || null, country: form.country || null,
        notes: form.notes || null,
      };
      if (supplier) {
        const { error } = await supabase.from("suppliers").update(payload).eq("id", supplier.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("suppliers").insert({ ...payload, created_by: user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => { onOpenChange(false); toast.success(supplier ? "Saved" : "Supplier created"); onSaved(); },
    onError: (e: Error) => { if (e.message !== "Validation failed") toast.error(friendlyError(e)); },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{supplier ? "Edit supplier" : "New supplier"}</SheetTitle>
          <SheetDescription>Vendor and contact details.</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label>Name *</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Contact name</Label>
              <Input value={form.contact_name} onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))} />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div>
              <Label>Website</Label>
              <Input value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} />
            </div>
            <div>
              <Label>Payment terms</Label>
              <Input value={form.payment_terms} onChange={(e) => setForm((f) => ({ ...f, payment_terms: e.target.value }))} placeholder="Net 30" />
            </div>
            <div>
              <Label>Currency</Label>
              <Input value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} />
            </div>
            <div>
              <Label>Tax ID</Label>
              <Input value={form.tax_id} onChange={(e) => setForm((f) => ({ ...f, tax_id: e.target.value }))} />
            </div>
            <div>
              <Label>Country</Label>
              <Input value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label>Address</Label>
              <Input value={form.address_line1} onChange={(e) => setForm((f) => ({ ...f, address_line1: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label>City</Label>
              <Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
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
