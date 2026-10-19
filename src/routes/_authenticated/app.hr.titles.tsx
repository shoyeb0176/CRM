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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOrgId, useHrAccess } from "@/lib/hr/use-hr";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Title = Database["public"]["Tables"]["job_titles"]["Row"];

export const Route = createFileRoute("/_authenticated/app/hr/titles")({
  head: () => ({ meta: [{ title: "Job Titles — HR" }] }),
  component: TitlesPage,
});

function TitlesPage() {
  const orgId = useOrgId();
  const hr = useHrAccess();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Title | null>(null);

  const titles = useQuery({
    queryKey: ["job-titles", orgId], enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("job_titles").select("*, departments:department_id(id, name)").eq("org_id", orgId!).order("name");
      if (error) throw error; return data ?? [];
    },
  });
  const depts = useQuery({
    queryKey: ["depts-min", orgId], enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name").eq("org_id", orgId!).order("name");
      if (error) throw error; return data ?? [];
    },
  });
  const counts = useQuery({
    queryKey: ["title-counts", orgId], enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("job_title_id").eq("org_id", orgId!);
      if (error) throw error;
      const m = new Map<string, number>();
      for (const r of data ?? []) if (r.job_title_id) m.set(r.job_title_id, (m.get(r.job_title_id) ?? 0) + 1);
      return m;
    },
  });
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("job_titles").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Title removed"); qc.invalidateQueries({ queryKey: ["job-titles"] }); },
    onError: (e) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    if (!titles.data) return undefined;
    const s = search.trim().toLowerCase();
    if (!s) return titles.data;
    return titles.data.filter((t) => [t.name, t.description].filter(Boolean).some((v) => String(v).toLowerCase().includes(s)));
  }, [titles.data, search]);

  return (
    <HrShell title="Job Titles" breadcrumb="hr / titles"
      actions={hr ? <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}><Plus className="mr-1 size-4" />New title</Button> : null}>
      <PageToolbar search={search} onSearchChange={setSearch} placeholder="Search titles…" />
      <DataTable
        loading={titles.isLoading}
        data={filtered}
        onRowClick={hr ? (r) => { setEditing(r); setOpen(true); } : undefined}
        columns={[
          { key: "name", header: "Title", cell: (r) => <span className="font-medium">{r.name}</span> },
          { key: "dept", header: "Department", cell: (r) => r.departments?.name ?? <span className="text-muted-foreground">—</span> },
          { key: "headcount", header: "Employees", cell: (r) => <span className="font-mono">{counts.data?.get(r.id) ?? 0}</span> },
          { key: "actions", header: "", className: "w-20 text-right",
            cell: (r) => hr ? <ConfirmDelete title={`Delete "${r.name}"?`} description="Employees with this title will be unassigned." onConfirm={() => del.mutate(r.id)} loading={del.isPending} /> : null },
        ]}
        empty={<EmptyState title="No job titles" description="Define titles to use across your employee roster."
          action={hr ? <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="mr-1 size-4" />Create title</Button> : undefined} />}
      />
      {hr && <TitleDrawer open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }} title={editing} depts={depts.data ?? []} onSaved={() => qc.invalidateQueries({ queryKey: ["job-titles"] })} />}
    </HrShell>
  );
}

function TitleDrawer({ open, onOpenChange, title, depts, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; title: Title | null;
  depts: { id: string; name: string }[]; onSaved: () => void;
}) {
  const orgId = useOrgId();
  const isEdit = !!title;
  const save = useMutation({
    mutationFn: async (form: FormData) => {
      const raw = Object.fromEntries(form.entries()) as Record<string, string>;
      if (!raw.name?.trim()) throw new Error("Name is required");
      const payload: TablesUpdate<"job_titles"> = {
        name: raw.name.trim(),
        description: raw.description?.trim() || null,
        department_id: raw.department_id === "none" ? null : raw.department_id,
      };
      if (isEdit) { const { error } = await supabase.from("job_titles").update(payload).eq("id", title!.id); if (error) throw error; }
      else { const { error } = await supabase.from("job_titles").insert({ ...payload, name: payload.name!, org_id: orgId! }); if (error) throw error; }
    },
    onSuccess: () => { toast.success(isEdit ? "Title updated" : "Title created"); onOpenChange(false); onSaved(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader><SheetTitle>{isEdit ? "Edit title" : "New title"}</SheetTitle><SheetDescription>Standardized role names.</SheetDescription></SheetHeader>
        <form className="mt-6 space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(new FormData(e.currentTarget)); }}>
          <div><Label className="text-xs">Name *</Label><Input name="name" defaultValue={title?.name ?? ""} required /></div>
          <div><Label className="text-xs">Department</Label>
            <Select name="department_id" defaultValue={title?.department_id ?? "none"}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">—</SelectItem>{depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Description</Label><Textarea name="description" defaultValue={title?.description ?? ""} rows={3} /></div>
          <SheetFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button></SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
