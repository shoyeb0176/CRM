import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { HrShell } from "@/components/hr/hr-shell";
import { DataTable } from "@/components/crm/data-table";
import { EmptyState } from "@/components/crm/empty-state";
import { PageToolbar } from "@/components/crm/page-toolbar";
import { ConfirmDelete } from "@/components/crm/confirm-delete";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOrgId, useHrAccess, fullName } from "@/lib/hr/use-hr";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Dept = Database["public"]["Tables"]["departments"]["Row"];

export const Route = createFileRoute("/_authenticated/app/hr/departments")({
  head: () => ({ meta: [{ title: "Departments — HR" }] }),
  component: DepartmentsPage,
});

function DepartmentsPage() {
  const orgId = useOrgId();
  const hr = useHrAccess();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Dept | null>(null);

  const depts = useQuery({
    queryKey: ["departments", orgId], enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("*, manager:manager_id(id, first_name, last_name, preferred_name)").eq("org_id", orgId!).order("name");
      if (error) throw error; return data ?? [];
    },
  });
  const counts = useQuery({
    queryKey: ["dept-counts", orgId], enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("department_id").eq("org_id", orgId!);
      if (error) throw error;
      const m = new Map<string, number>();
      for (const r of data ?? []) if (r.department_id) m.set(r.department_id, (m.get(r.department_id) ?? 0) + 1);
      return m;
    },
  });
  const managers = useQuery({
    queryKey: ["mgr-pool", orgId], enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("id, first_name, last_name, preferred_name").eq("org_id", orgId!).eq("status", "active").order("first_name");
      if (error) throw error; return data ?? [];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("departments").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Department removed"); qc.invalidateQueries({ queryKey: ["departments"] }); },
    onError: (e) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    if (!depts.data) return undefined;
    const s = search.trim().toLowerCase();
    if (!s) return depts.data;
    return depts.data.filter((d) => [d.name, d.code, d.description].filter(Boolean).some((v) => String(v).toLowerCase().includes(s)));
  }, [depts.data, search]);

  return (
    <HrShell title="Departments" breadcrumb="hr / departments"
      actions={hr ? <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}><Plus className="mr-1 size-4" />New department</Button> : null}>
      <PageToolbar search={search} onSearchChange={setSearch} placeholder="Search departments…" />
      <DataTable
        loading={depts.isLoading}
        data={filtered}
        onRowClick={hr ? (r) => { setEditing(r); setOpen(true); } : undefined}
        columns={[
          { key: "name", header: "Name", cell: (r) => <span className="font-medium">{r.name}</span> },
          { key: "code", header: "Code", cell: (r) => <span className="font-mono text-xs text-muted-foreground">{r.code || "—"}</span> },
          { key: "mgr", header: "Manager", cell: (r) => r.manager ? fullName(r.manager) : <span className="text-muted-foreground">—</span> },
          { key: "headcount", header: "Headcount", cell: (r) => <span className="font-mono">{counts.data?.get(r.id) ?? 0}</span> },
          { key: "actions", header: "", className: "w-20 text-right",
            cell: (r) => hr ? <ConfirmDelete title={`Delete ${r.name}?`} description="Employees will be unassigned." onConfirm={() => del.mutate(r.id)} loading={del.isPending} /> : null,
          },
        ]}
        empty={<EmptyState title="No departments" description="Group your employees by team or function."
          action={hr ? <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="mr-1 size-4" />Create department</Button> : undefined} />}
      />
      {hr && <DeptDrawer open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }} dept={editing} managers={managers.data ?? []} onSaved={() => qc.invalidateQueries({ queryKey: ["departments"] })} />}
    </HrShell>
  );
}

function DeptDrawer({ open, onOpenChange, dept, managers, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; dept: Dept | null;
  managers: { id: string; first_name: string; last_name: string; preferred_name: string | null }[];
  onSaved: () => void;
}) {
  const orgId = useOrgId();
  const isEdit = !!dept;
  const save = useMutation({
    mutationFn: async (form: FormData) => {
      const raw = Object.fromEntries(form.entries()) as Record<string, string>;
      if (!raw.name?.trim()) throw new Error("Name is required");
      const payload: TablesUpdate<"departments"> = {
        name: raw.name.trim(),
        code: raw.code?.trim() || null,
        description: raw.description?.trim() || null,
        manager_id: raw.manager_id === "none" ? null : raw.manager_id,
        is_active: raw.is_active === "active",
      };
      if (isEdit) { const { error } = await supabase.from("departments").update(payload).eq("id", dept!.id); if (error) throw error; }
      else { const { error } = await supabase.from("departments").insert({ ...payload, name: payload.name!, org_id: orgId! }); if (error) throw error; }
    },
    onSuccess: () => { toast.success(isEdit ? "Department updated" : "Department created"); onOpenChange(false); onSaved(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader><SheetTitle>{isEdit ? "Edit department" : "New department"}</SheetTitle><SheetDescription>Organize your workforce.</SheetDescription></SheetHeader>
        <form className="mt-6 space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(new FormData(e.currentTarget)); }}>
          <div><Label className="text-xs">Name *</Label><Input name="name" defaultValue={dept?.name ?? ""} required /></div>
          <div><Label className="text-xs">Code</Label><Input name="code" defaultValue={dept?.code ?? ""} /></div>
          <div><Label className="text-xs">Manager</Label>
            <Select name="manager_id" defaultValue={dept?.manager_id ?? "none"}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">—</SelectItem>{managers.map((m) => <SelectItem key={m.id} value={m.id}>{fullName(m)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Status</Label>
            <Select name="is_active" defaultValue={dept?.is_active === false ? "inactive" : "active"}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Description</Label><Textarea name="description" defaultValue={dept?.description ?? ""} rows={3} /></div>
          <SheetFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button></SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
