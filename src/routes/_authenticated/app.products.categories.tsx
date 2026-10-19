import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/use-current-user";
import { InventoryShell } from "@/components/inventory/inventory-shell";
import { DataTable } from "@/components/crm/data-table";
import { EmptyState } from "@/components/crm/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetDescription } from "@/components/ui/sheet";
import { ConfirmDelete } from "@/components/crm/confirm-delete";
import { useOrgId } from "@/lib/crm/use-org";
import type { Database } from "@/integrations/supabase/types";

type Cat = Database["public"]["Tables"]["product_categories"]["Row"];

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  parent_id: z.string().uuid().nullable().optional(),
  description: z.string().trim().max(500).optional().or(z.literal("")),
});

export const Route = createFileRoute("/_authenticated/app/products/categories")({
  head: () => ({ meta: [{ title: "Categories — Products" }] }),
  component: CategoriesPage,
});

function CategoriesPage() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Cat | null>(null);
  const [toDelete, setToDelete] = useState<Cat | null>(null);

  const cats = useQuery({
    queryKey: ["product-categories", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("product_categories").select("*, parent:parent_id(id,name)")
        .eq("org_id", orgId!).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("product_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Category deleted");
      qc.invalidateQueries({ queryKey: ["product-categories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <InventoryShell title="Categories" breadcrumb="products / categories"
      actions={<Button size="sm" onClick={() => { setEditing(null); setDrawerOpen(true); }}><Plus className="mr-1 size-4" /> New category</Button>}
    >
      <DataTable
        loading={cats.isLoading}
        data={cats.data ?? undefined}
        onRowClick={(r) => { setEditing(r as Cat); setDrawerOpen(true); }}
        columns={[
          { key: "name", header: "Name", cell: (r) => <span className="font-medium">{r.name}</span> },
          { key: "parent", header: "Parent", cell: (r) => {
            const p = (r as Cat & { parent?: { name: string } | null }).parent;
            return p?.name ?? <span className="text-muted-foreground">—</span>;
          }},
          { key: "actions", header: "", cell: (r) => (
            <Button variant="bare" size="bare"
              onClick={(e) => { e.stopPropagation(); setToDelete(r as Cat); }}
              className="text-muted-foreground hover:text-destructive" aria-label="Delete"
            >
              <Trash2 className="size-4" />
            </Button>
          ), className: "w-16" },
        ]}
        empty={<EmptyState title="No categories yet" description="Group products by category to filter and report on them."
          action={<Button onClick={() => { setEditing(null); setDrawerOpen(true); }}><Plus className="mr-1 size-4" /> New category</Button>} />}
      />

      <CategoryDrawer
        open={drawerOpen}
        onOpenChange={(v) => { setDrawerOpen(v); if (!v) setEditing(null); }}
        category={editing} all={cats.data ?? []}
        onSaved={() => qc.invalidateQueries({ queryKey: ["product-categories"] })}
      />
      <ConfirmDelete
        open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}
        title="Delete category?" description="Products in this category will become uncategorized."

        onConfirm={() => { if (toDelete) { del.mutate(toDelete.id); setToDelete(null); } }}
      />
    </InventoryShell>
  );
}

function CategoryDrawer({ open, onOpenChange, category, all, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; category: Cat | null; all: Cat[]; onSaved: () => void;
}) {
  const orgId = useOrgId();
  const [form, setForm] = useState({ name: "", parent_id: null as string | null, description: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setForm({
      name: category?.name ?? "",
      parent_id: category?.parent_id ?? null,
      description: category?.description ?? "",
    });
    setErrors({});
  }, [category, open]);

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
      const payload = { org_id: orgId!, name: form.name, parent_id: form.parent_id, description: form.description || null };
      if (category) {
        const { error } = await supabase.from("product_categories").update(payload).eq("id", category.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("product_categories").insert({ ...payload, created_by: user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(category ? "Saved" : "Category created"); onSaved(); onOpenChange(false); },
    onError: (e: Error) => { if (e.message !== "Validation failed") toast.error(e.message); },
  });

  const parentOptions = all.filter((c) => c.id !== category?.id);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{category ? "Edit category" : "New category"}</SheetTitle>
          <SheetDescription>Group products for filtering and reporting.</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label>Name *</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
          </div>
          <div>
            <Label>Parent</Label>
            <Select value={form.parent_id ?? "none"} onValueChange={(v) => setForm((f) => ({ ...f, parent_id: v === "none" ? null : v }))}>
              <SelectTrigger><SelectValue placeholder="No parent" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Top level —</SelectItem>
                {parentOptions.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Description</Label>
            <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
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
