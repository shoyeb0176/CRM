import type { TablesInsert } from "@/integrations/supabase/types";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/use-current-user";
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
import { useOrgId, useHrAccess, fmtDate, fullName } from "@/lib/hr/use-hr";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/hr/attendance")({
  head: () => ({ meta: [{ title: "Attendance — HR" }] }),
  component: AttendancePage,
});

function AttendancePage() {
  const orgId = useOrgId();
  const hr = useHrAccess();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [empFilter, setEmpFilter] = useState("all");
  const [open, setOpen] = useState(false);

  const att = useQuery({
    queryKey: ["attendance", orgId, empFilter], enabled: !!orgId,
    queryFn: async () => {
      let q = supabase.from("attendance_records")
        .select("*, employees:employee_id(id, first_name, last_name, preferred_name)")
        .eq("org_id", orgId!).order("work_date", { ascending: false }).limit(200);
      if (empFilter !== "all") q = q.eq("employee_id", empFilter);
      const { data, error } = await q;
      if (error) throw error; return data ?? [];
    },
  });
  const employees = useQuery({
    queryKey: ["att-emps", orgId], enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("id, first_name, last_name, preferred_name").eq("org_id", orgId!).eq("status", "active").order("first_name");
      if (error) throw error; return data ?? [];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("attendance_records").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Entry removed"); qc.invalidateQueries({ queryKey: ["attendance"] }); },
    onError: (e) => toast.error(e.message),
  });

  const clockIn = useMutation({
    mutationFn: async () => {
      if (!empFilter || empFilter === "all") throw new Error("Pick an employee to clock in.");
      const { error } = await supabase.from("attendance_records").insert({
        org_id: orgId!, employee_id: empFilter,
        work_date: new Date().toISOString().slice(0,10),
        clock_in: new Date().toISOString(),
        source: "clock",
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Clocked in"); qc.invalidateQueries({ queryKey: ["attendance"] }); },
    onError: (e) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    if (!att.data) return undefined;
    const s = search.trim().toLowerCase();
    if (!s) return att.data;
    return att.data.filter((r) => {
      const e = r.employees;
      return [e?.first_name, e?.last_name, r.notes].filter(Boolean).some((v) => String(v).toLowerCase().includes(s));
    });
  }, [att.data, search]);

  return (
    <HrShell title="Attendance" breadcrumb="hr / attendance"
      actions={
        <div className="flex gap-2">
          {hr && <Button size="sm" variant="outline" onClick={() => clockIn.mutate()} disabled={clockIn.isPending}><Clock className="size-3.5 mr-1" />Clock in</Button>}
          {hr && <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1 size-4" />Add entry</Button>}
        </div>
      }>
      <PageToolbar
        search={search} onSearchChange={setSearch} placeholder="Search by employee or note…"
        filters={
          <Select value={empFilter} onValueChange={setEmpFilter}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Employee" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All employees</SelectItem>{employees.data?.map((e) => <SelectItem key={e.id} value={e.id}>{fullName(e)}</SelectItem>)}</SelectContent>
          </Select>
        }
      />
      <DataTable
        loading={att.isLoading}
        data={filtered}
        columns={[
          { key: "emp", header: "Employee", cell: (r) => <span className="font-medium">{fullName(r.employees ?? {})}</span> },
          { key: "date", header: "Date", cell: (r) => fmtDate(r.work_date) },
          { key: "in", header: "Clock in", cell: (r) => r.clock_in ? <span className="font-mono text-xs">{new Date(r.clock_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span> : "—" },
          { key: "out", header: "Clock out", cell: (r) => r.clock_out ? <span className="font-mono text-xs">{new Date(r.clock_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span> : "—" },
          { key: "hrs", header: "Hours", cell: (r) => <span className="font-mono">{r.hours_worked ?? "—"}</span> },
          { key: "src", header: "Source", cell: (r) => <span className="font-mono text-xs uppercase text-muted-foreground">{r.source}</span> },
          { key: "actions", header: "", className: "w-12 text-right",
            cell: (r) => hr ? <ConfirmDelete title="Delete entry?" description="This attendance record will be removed." onConfirm={() => del.mutate(r.id)} loading={del.isPending} /> : null },
        ]}
        empty={<EmptyState title="No attendance records" description="Clock in or add manual entries to start tracking attendance."
          action={hr ? <Button onClick={() => setOpen(true)}><Plus className="mr-1 size-4" />Add entry</Button> : undefined} />}
      />
      {hr && <AttendanceDrawer open={open} onOpenChange={setOpen} employees={employees.data ?? []} onSaved={() => qc.invalidateQueries({ queryKey: ["attendance"] })} />}
    </HrShell>
  );
}

function AttendanceDrawer({ open, onOpenChange, employees, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  employees: { id: string; first_name: string; last_name: string; preferred_name: string | null }[];
  onSaved: () => void;
}) {
  const orgId = useOrgId();
  const save = useMutation({
    mutationFn: async (form: FormData) => {
      const raw = Object.fromEntries(form.entries()) as Record<string, string>;
      if (!raw.employee_id) throw new Error("Pick an employee");
      if (!raw.work_date) throw new Error("Pick a date");
      const payload: TablesInsert<"attendance_records"> = {
        org_id: orgId!, employee_id: raw.employee_id, work_date: raw.work_date,
        clock_in: raw.clock_in ? new Date(`${raw.work_date}T${raw.clock_in}`).toISOString() : null,
        clock_out: raw.clock_out ? new Date(`${raw.work_date}T${raw.clock_out}`).toISOString() : null,
        hours_worked: raw.hours_worked
          ? Number(raw.hours_worked)
          : raw.clock_in && raw.clock_out
            ? Math.max(0, Math.round(((new Date(`${raw.work_date}T${raw.clock_out}`).getTime() - new Date(`${raw.work_date}T${raw.clock_in}`).getTime()) / 36e5) * 100) / 100)
            : null,
        created_by: (await getSessionUser()).data.user?.id ?? null,
        notes: raw.notes?.trim() || null,
        source: "manual",
      };
      const { error } = await supabase.from("attendance_records").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Entry added"); onOpenChange(false); onSaved(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader><SheetTitle>Add attendance</SheetTitle><SheetDescription>Manually log a work day.</SheetDescription></SheetHeader>
        <form className="mt-6 space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(new FormData(e.currentTarget)); }}>
          <div><Label className="text-xs">Employee *</Label>
            <Select name="employee_id" required>
              <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{fullName(e)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Date *</Label><Input type="date" name="work_date" defaultValue={new Date().toISOString().slice(0,10)} required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Clock in</Label><Input type="time" name="clock_in" /></div>
            <div><Label className="text-xs">Clock out</Label><Input type="time" name="clock_out" /></div>
          </div>
          <div><Label className="text-xs">Hours (override)</Label><Input type="number" step="0.25" name="hours_worked" /></div>
          <div><Label className="text-xs">Notes</Label><Textarea name="notes" rows={3} /></div>
          <SheetFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button></SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
