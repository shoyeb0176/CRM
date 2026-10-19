import type { TablesInsert } from "@/integrations/supabase/types";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/use-current-user";
import { HrShell } from "@/components/hr/hr-shell";
import { DataTable } from "@/components/crm/data-table";
import { focusSearch, useScrollToFocus } from "@/lib/use-focus-row";
import { EmptyState } from "@/components/crm/empty-state";
import { PageToolbar } from "@/components/crm/page-toolbar";
import { StatusBadge, type BadgeTone } from "@/components/crm/status-badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOrgId, useHrAccess, fmtDate, fullName } from "@/lib/hr/use-hr";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Check, X } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type LeaveType = Database["public"]["Enums"]["leave_type"];
type LeaveStatus = Database["public"]["Enums"]["leave_status"];

const TYPES: LeaveType[] = ["vacation","sick","unpaid","personal","other"];
const STATUSES: LeaveStatus[] = ["pending","approved","rejected","cancelled"];

const TONE: Record<LeaveStatus, BadgeTone> = {
  pending: "warning", approved: "success", rejected: "danger", cancelled: "neutral",
};

export const Route = createFileRoute("/_authenticated/app/hr/leave")({
  head: () => ({ meta: [{ title: "Leave — HR" }] }),
  validateSearch: focusSearch("request"),
  component: LeavePage,
});

function daysBetween(a: string, b: string) {
  const d1 = new Date(a).getTime(); const d2 = new Date(b).getTime();
  return Math.max(1, Math.floor((d2 - d1) / 86400000) + 1);
}

function LeavePage() {
  const orgId = useOrgId();
  const hr = useHrAccess();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const { request: focusId } = Route.useSearch();

  const leave = useQuery({
    queryKey: ["leave", orgId, statusFilter, typeFilter], enabled: !!orgId,
    queryFn: async () => {
      let q = supabase.from("leave_requests")
        .select("*, employees:employee_id(id, first_name, last_name, preferred_name)")
        .eq("org_id", orgId!).order("created_at", { ascending: false });
      if (statusFilter !== "all") q = q.eq("status", statusFilter as LeaveStatus);
      if (typeFilter !== "all") q = q.eq("leave_type", typeFilter as LeaveType);
      const { data, error } = await q;
      if (error) throw error; return data ?? [];
    },
  });  useScrollToFocus(focusId, !!leave.data);


  const employees = useQuery({
    queryKey: ["emps-min", orgId], enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("id, first_name, last_name, preferred_name").eq("org_id", orgId!).eq("status", "active").order("first_name");
      if (error) throw error; return data ?? [];
    },
  });

  const decide = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: LeaveStatus }) => {
      const { data: u } = await getSessionUser();
      const { error } = await supabase.from("leave_requests").update({
        status, decided_by: u.user?.id ?? null, decided_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["leave"] }); },
    onError: (e) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    if (!leave.data) return undefined;
    const s = search.trim().toLowerCase();
    if (!s) return leave.data;
    return leave.data.filter((l) => {
      const emp = l.employees;
      return [emp?.first_name, emp?.last_name, l.reason].filter(Boolean).some((v) => String(v).toLowerCase().includes(s));
    });
  }, [leave.data, search]);

  return (
    <HrShell title="Leave Requests" breadcrumb="hr / leave"
      actions={<Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1 size-4" />New request</Button>}>
      <PageToolbar
        search={search} onSearchChange={setSearch} placeholder="Search by employee or reason…"
        filters={
          <>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All</SelectItem>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All types</SelectItem>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </>
        }
      />
      <DataTable
        focusId={focusId}
        loading={leave.isLoading}
        data={filtered}
        columns={[
          { key: "emp", header: "Employee", cell: (r) => <span className="font-medium">{fullName(r.employees ?? {})}</span> },
          { key: "type", header: "Type", cell: (r) => <span className="capitalize">{r.leave_type}</span> },
          { key: "dates", header: "Dates", cell: (r) => <span className="font-mono text-xs">{fmtDate(r.start_date)} → {fmtDate(r.end_date)}</span> },
          { key: "days", header: "Days", cell: (r) => <span className="font-mono">{r.total_days ?? "—"}</span> },
          { key: "status", header: "Status", cell: (r) => <StatusBadge tone={TONE[r.status]}>{r.status}</StatusBadge> },
          { key: "actions", header: "", className: "w-40 text-right",
            cell: (r) => hr && r.status === "pending" ? (
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="outline" onClick={() => decide.mutate({ id: r.id, status: "approved" })}><Check className="size-3.5 mr-1" />Approve</Button>
                <Button aria-label="Reject" size="sm" variant="outline" className="text-destructive" onClick={() => decide.mutate({ id: r.id, status: "rejected" })}><X className="size-3.5" /></Button>
              </div>
            ) : null,
          },
        ]}
        empty={<EmptyState title="No leave requests" description="When employees request time off, it shows here."
          action={<Button onClick={() => setOpen(true)}><Plus className="mr-1 size-4" />New request</Button>} />}
      />

      <LeaveDrawer open={open} onOpenChange={setOpen} employees={employees.data ?? []} hr={hr} onSaved={() => qc.invalidateQueries({ queryKey: ["leave"] })} />
    </HrShell>
  );
}

function LeaveDrawer({ open, onOpenChange, employees, hr, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  employees: { id: string; first_name: string; last_name: string; preferred_name: string | null }[];
  hr: boolean; onSaved: () => void;
}) {
  const orgId = useOrgId();
  const save = useMutation({
    mutationFn: async (form: FormData) => {
      const raw = Object.fromEntries(form.entries()) as Record<string, string>;
      if (!raw.employee_id) throw new Error("Pick an employee");
      if (!raw.start_date || !raw.end_date) throw new Error("Pick dates");
      if (raw.end_date < raw.start_date) throw new Error("End date must be after start");
      const { data: u } = await getSessionUser();
      const { error } = await supabase.from("leave_requests").insert({
        org_id: orgId!, employee_id: raw.employee_id,
        leave_type: raw.leave_type as TablesInsert<"leave_requests">["leave_type"], status: "pending",
        start_date: raw.start_date, end_date: raw.end_date,
        total_days: daysBetween(raw.start_date, raw.end_date),
        reason: raw.reason?.trim() || null,
        requested_by: u.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Request submitted"); onOpenChange(false); onSaved(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader><SheetTitle>New leave request</SheetTitle><SheetDescription>{hr ? "On behalf of an employee." : "Submit a time-off request."}</SheetDescription></SheetHeader>
        <form className="mt-6 space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(new FormData(e.currentTarget)); }}>
          <div><Label className="text-xs">Employee *</Label>
            <Select name="employee_id" required>
              <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{fullName(e)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Type *</Label>
            <Select name="leave_type" defaultValue="vacation">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Start *</Label><Input type="date" name="start_date" required /></div>
            <div><Label className="text-xs">End *</Label><Input type="date" name="end_date" required /></div>
          </div>
          <div><Label className="text-xs">Reason</Label><Textarea name="reason" rows={3} /></div>
          <SheetFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={save.isPending}>{save.isPending ? "Submitting…" : "Submit"}</Button></SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
