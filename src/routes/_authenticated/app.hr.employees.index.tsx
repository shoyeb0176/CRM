import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useOpenOnNew } from "@/lib/use-focus-row";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { HrShell } from "@/components/hr/hr-shell";
import { DataTable } from "@/components/crm/data-table";
import { EmptyState } from "@/components/crm/empty-state";
import { PageToolbar } from "@/components/crm/page-toolbar";
import { StatusBadge, type BadgeTone } from "@/components/crm/status-badge";
import { Button } from "@/components/ui/button";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useOrgId, useHrAccess, fmtDate, fullName } from "@/lib/hr/use-hr";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Lock } from "lucide-react";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { Employee, EmployeeDrawer, EmployeeStatus, STATUSES } from "@/components/hr/employee-drawer";

const STATUS_TONE: Record<EmployeeStatus, BadgeTone> = {
  active: "success", inactive: "neutral", terminated: "danger", on_leave: "warning",
};

export const Route = createFileRoute("/_authenticated/app/hr/employees/")({
  head: () => ({ meta: [{ title: "Employees — HR" }] }),
  component: EmployeesPage,
});

function EmployeesPage() {
  const orgId = useOrgId();
  const hr = useHrAccess();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);

  const employees = useQuery({
    queryKey: ["employees", orgId, deptFilter, statusFilter],
    enabled: !!orgId,
    queryFn: async () => {
      let q = supabase
        .from("employees")
        .select("*, departments:department_id(id, name), job_titles:job_title_id(id, name)")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });
      if (deptFilter !== "all") q = q.eq("department_id", deptFilter);
      if (statusFilter !== "all") q = q.eq("status", statusFilter as EmployeeStatus);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const departments = useQuery({
    queryKey: ["hr-depts-min", orgId], enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name").eq("org_id", orgId!).order("name");
      if (error) throw error; return data ?? [];
    },
  });
  const jobTitles = useQuery({
    queryKey: ["hr-titles-min", orgId], enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("job_titles").select("id, name").eq("org_id", orgId!).order("name");
      if (error) throw error; return data ?? [];
    },
  });
  const managers = useQuery({
    queryKey: ["hr-emp-managers", orgId], enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("id, first_name, last_name, preferred_name").eq("org_id", orgId!).eq("status", "active").order("first_name");
      if (error) throw error; return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    if (!employees.data) return undefined;
    const s = search.trim().toLowerCase();
    if (!s) return employees.data;
    return employees.data.filter((e) =>
      [e.first_name, e.last_name, e.preferred_name, e.email, e.phone, e.employee_number]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(s))
    );
  }, [employees.data, search]);

  useOpenOnNew(() => { setEditing(null); setDrawerOpen(true); });
  return (
    <HrShell
      title="Employees"
      breadcrumb="hr / employees"
      actions={
        hr ? (
          <Button onClick={() => { setEditing(null); setDrawerOpen(true); }} size="sm">
            <Plus className="mr-1 size-4" /> New employee
          </Button>
        ) : null
      }
    >
      <PageToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search by name, email, employee #…"
        filters={
          <>
            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Department" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.data?.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_"," ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </>
        }
      />

      <DataTable
        loading={employees.isLoading}
        data={filtered}
        onRowClick={(row) => navigate({ to: "/app/hr/employees/$employeeId", params: { employeeId: row.id } })}
        columns={[
          { key: "name", header: "Name", cell: (r) => (
            <div>
              <div className="font-medium">{fullName(r)}</div>
              {r.employee_number && <div className="font-mono text-xs text-muted-foreground">#{r.employee_number}</div>}
            </div>
          )},
          { key: "title", header: "Title / Dept", cell: (r) => {
            const j = r.job_titles; const d = r.departments;
            return (
              <div className="text-sm">
                <div>{j?.name ?? <span className="text-muted-foreground">—</span>}</div>
                <div className="text-xs text-muted-foreground">{d?.name ?? ""}</div>
              </div>
            );
          }},
          { key: "type", header: "Type", cell: (r) => (
            <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{r.employment_type.replace("_"," ")}</span>
          )},
          { key: "email", header: "Email", cell: (r) => r.email || <span className="text-muted-foreground">—</span> },
          { key: "start", header: "Started", cell: (r) => <span className="font-mono text-xs text-muted-foreground">{fmtDate(r.start_date)}</span> },
          { key: "status", header: "Status", cell: (r) => (
            <StatusBadge tone={STATUS_TONE[r.status]}>{r.status.replace("_"," ")}</StatusBadge>
          )},
        ]}
        empty={
          <EmptyState
            title="No employees yet"
            description={hr ? "Add your first employee to start managing your team." : "Ask an HR admin to add employees."}
            action={hr ? (
              <Button onClick={() => { setEditing(null); setDrawerOpen(true); }}>
                <Plus className="mr-1 size-4" /> Create employee
              </Button>
            ) : undefined}
          />
        }
      />

      {hr && (
        <EmployeeDrawer
          open={drawerOpen}
          onOpenChange={(v) => { setDrawerOpen(v); if (!v) setEditing(null); }}
          employee={editing}
          departments={departments.data ?? []}
          jobTitles={jobTitles.data ?? []}
          managers={(managers.data ?? []).filter((m) => m.id !== editing?.id)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["employees"] })}
        />
      )}

      {!hr && (
        <p className="mt-4 inline-flex items-center gap-2 text-xs text-muted-foreground">
          <Lock className="size-3" /> Sensitive compensation and payroll data is hidden. Contact HR for access.
        </p>
      )}
    </HrShell>
  );
}
