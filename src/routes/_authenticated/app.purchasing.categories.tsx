import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PurchasingShell } from "@/components/purchasing/purchasing-shell";
import { DataTable } from "@/components/crm/data-table";
import { EmptyState } from "@/components/crm/empty-state";
import { ConfirmDelete } from "@/components/crm/confirm-delete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useOrgId } from "@/lib/crm/use-org";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Cat = Database["public"]["Tables"]["expense_categories"]["Row"];

export const Route = createFileRoute("/_authenticated/app/purchasing/categories")({
  head: () => ({ meta: [{ title: "Expense categories — Purchasing" }] }),
  component: CategoriesPage,
});

function CategoriesPage() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Cat | null>(null);
  const [form, setForm] = useState({ name: "", code: "", color: "" });

  const cats = useQuery({
    queryKey: ["expense-categories", orgId], enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("expense_categories").select("*").eq("org_id", orgId!).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (editing) setForm({ name: editing.name, code: editing.code ?? "", color: editing.color ?? "" });
    else setForm({ name: "", code: "", color: "" });
  }, [editing, open]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Name is required");
      const payload = { org_id: orgId!, name: form.name.trim(), code: form.code || null, color: form.color || null };
      if (editing) {
        const { error } = await supabase.from("expense_categories").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("expense_categories").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(editing ? "Category updated" : "Category added"); qc.invalidateQueries({ queryKey: ["expense-categories"] }); setOpen(false); setEditing(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("expense_categories").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Category deleted"); qc.invalidateQueries({ queryKey: ["expense-categories"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <PurchasingShell title="Expense categories" breadcrumb="purchasing / categories" actions={
      <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }} disabled={!orgId}><Plus className="mr-1 size-4" /> New category</Button>
    }>
      <DataTable
        loading={cats.isLoading}
        data={cats.data as Cat[] | undefined}
        columns={[
          { key: "name", header: "Name", cell: (c) => <span className="font-medium">{c.name}</span> },
          { key: "code", header: "Code", cell: (c) => <span className="font-mono text-xs">{c.code ?? "—"}</span> },
          { key: "color", header: "Color", cell: (c) => c.color ? <span className="inline-block size-4 border border-border" style={{ background: c.color }} /> : <span className="text-muted-foreground">—</span> },
          { key: "actions", header: "", cell: (c) => (
            <div className="flex justify-end gap-1">
              <Button aria-label="Edit category" size="sm" variant="ghost" onClick={() => { setEditing(c); setOpen(true); }}><Pencil className="size-3.5" /></Button>
              <ConfirmDelete title="Delete category?" description="Expenses using this category will become uncategorized." onConfirm={() => remove.mutate(c.id)}
                trigger={<Button aria-label="Delete category" size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive"><Trash2 className="size-3.5" /></Button>} />
            </div>
          ) },
        ]}
        empty={<EmptyState title="No categories" description="Add categories like Travel, Software, Office to classify expenses." action={
          <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="mr-1 size-4" /> New category</Button>
        } />}
      />

      <Sheet open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
        <SheetContent className="w-full sm:max-w-sm">
          <SheetHeader><SheetTitle>{editing ? "Edit category" : "New category"}</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-3">
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Travel" /></Field>
            <Field label="Code"><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="TRAV" /></Field>
            <Field label="Color"><Input type="color" value={form.color || "#64748b"} onChange={(e) => setForm({ ...form, color: e.target.value })} /></Field>
          </div>
          <SheetFooter className="mt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : (editing ? "Update" : "Create")}</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </PurchasingShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div className="space-y-1.5"><Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</Label>{children}</div>);
}
