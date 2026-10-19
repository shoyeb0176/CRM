import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { HrShell } from "@/components/hr/hr-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge, type BadgeTone } from "@/components/crm/status-badge";
import { ConfirmDelete } from "@/components/crm/confirm-delete";
import { useOrgId, useHrAccess, fmtDate, fmtMoney, fullName } from "@/lib/hr/use-hr";
import { ArrowLeft, Lock, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { EmployeeDrawer } from "@/components/hr/employee-drawer";
import { AttachmentsPanel } from "@/components/attachments/attachments-panel";
import { FILING_STATUSES, FREQUENCIES } from "@/lib/payroll/runs";

type Payroll = Database["public"]["Tables"]["payroll_profiles"]["Row"];
type EmployeeStatus = Database["public"]["Enums"]["employee_status"];

const STATUS_TONE: Record<EmployeeStatus, BadgeTone> = {
  active: "success", inactive: "neutral", terminated: "danger", on_leave: "warning",
};

export const Route = createFileRoute("/_authenticated/app/hr/employees/$employeeId")({
  head: () => ({ meta: [{ title: "Employee — HR" }] }),
  component: EmployeeDetail,
});

function EmployeeDetail() {
  const { employeeId } = Route.useParams();
  const orgId = useOrgId();
  const hr = useHrAccess();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [editOpen, setEditOpen] = useState(false);
  const departments = useQuery({
    queryKey: ["hr-depts-min", orgId], enabled: !!orgId,
    queryFn: async () => { const { data, error } = await supabase.from("departments").select("id, name").eq("org_id", orgId!).order("name"); if (error) throw error; return data ?? []; },
  });
  const jobTitles = useQuery({
    queryKey: ["hr-titles-min", orgId], enabled: !!orgId,
    queryFn: async () => { const { data, error } = await supabase.from("job_titles").select("id, name").eq("org_id", orgId!).order("name"); if (error) throw error; return data ?? []; },
  });
  const managers = useQuery({
    queryKey: ["hr-emp-managers", orgId], enabled: !!orgId,
    queryFn: async () => { const { data, error } = await supabase.from("employees").select("id, first_name, last_name, preferred_name").eq("org_id", orgId!).eq("status", "active").order("first_name"); if (error) throw error; return data ?? []; },
  });
  const emp = useQuery({
    queryKey: ["employee", employeeId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("*, departments:department_id(id, name), job_titles:job_title_id(id, name), manager:manager_id(id, first_name, last_name, preferred_name)")
        .eq("id", employeeId).single();
      if (error) throw error; return data;
    },
  });

  const leave = useQuery({
    queryKey: ["employee-leave", employeeId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("leave_requests")
        .select("id, leave_type, status, start_date, end_date, total_days")
        .eq("employee_id", employeeId).order("start_date", { ascending: false }).limit(20);
      if (error) throw error; return data ?? [];
    },
  });

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("employees").delete().eq("id", employeeId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Employee removed");
      qc.invalidateQueries({ queryKey: ["employees"] });
      navigate({ to: "/app/hr/employees" });
    },
    onError: (e) => toast.error(e.message),
  });

  if (emp.isLoading) {
    return <HrShell title="Employee" breadcrumb="hr / employees"><div className="text-sm text-muted-foreground">Loading…</div></HrShell>;
  }
  if (!emp.data) {
    return <HrShell title="Not found" breadcrumb="hr / employees"><div className="text-sm text-muted-foreground">Employee not found.</div></HrShell>;
  }

  const e = emp.data;

  return (
    <HrShell
      title={fullName(e)}
      breadcrumb="hr / employees"
      actions={
        <div className="flex items-center gap-2">
          <Link to="/app/hr/employees"><Button size="sm" variant="outline"><ArrowLeft className="size-3.5 mr-1" /> Back</Button></Link>
          {hr && <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>Edit</Button>}
          {hr && (
            <ConfirmDelete
              title="Remove employee?"
              description="This will delete the employee and related documents, leave, attendance, and payroll profile."
              onConfirm={() => del.mutate()}
              loading={del.isPending}
              trigger={<Button size="sm" variant="outline" className="text-destructive"><Trash2 className="size-3.5 mr-1" /> Delete</Button>}
            />
          )}
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="border border-border bg-card shadow-sm p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-xl">{fullName(e)}</h2>
              <div className="mt-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                {e.employee_number ? `#${e.employee_number} · ` : ""}{e.employment_type.replace("_"," ")}
              </div>
            </div>
            <StatusBadge tone={STATUS_TONE[e.status as EmployeeStatus]}>{e.status.replace("_"," ")}</StatusBadge>
          </div>
          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <Info label="Email" value={e.email} />
            <Info label="Phone" value={e.phone} />
            <Info label="Department" value={e.departments?.name} />
            <Info label="Job title" value={e.job_titles?.name} />
            <Info label="Manager" value={e.manager ? fullName(e.manager) : null} />
            <Info label="Start date" value={fmtDate(e.start_date)} />
            <Info label="Emergency contact" value={e.emergency_contact_name} />
            <Info label="Emergency phone" value={e.emergency_contact_phone} />
          </dl>
        </section>

        <section className="border border-border bg-card shadow-sm p-5">
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Payroll profile</div>
          {hr ? <PayrollPanel employeeId={employeeId} orgId={orgId!} /> : (
            <div className="mt-3 flex items-start gap-2 border border-dashed border-border p-3 text-xs text-muted-foreground">
              <Lock className="size-3.5 mt-0.5" /> Restricted to HR managers, admins, and owners.
            </div>
          )}
        </section>
      </div>

      <section className="mt-6 border border-border bg-card">
        <div className="border-b border-border px-4 py-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Leave history
        </div>
        {leave.isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading…</div>
        ) : leave.data?.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">No leave requests</div>
        ) : (
          <ul className="divide-y divide-border">
            {leave.data?.map((l) => (
              <li key={l.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <div className="font-medium capitalize">{l.leave_type}</div>
                  <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                    {fmtDate(l.start_date)} → {fmtDate(l.end_date)} · {l.total_days ?? "—"} days
                  </div>
                </div>
                <StatusBadge tone={l.status === "approved" ? "success" : l.status === "rejected" ? "danger" : l.status === "cancelled" ? "neutral" : "warning"}>{l.status}</StatusBadge>
              </li>
            ))}
          </ul>
        )}
      </section>
      {hr && emp.data && (
        <EmployeeDrawer key={emp.data.id + String(editOpen)} open={editOpen} onOpenChange={setEditOpen} employee={emp.data}
          departments={departments.data ?? []} jobTitles={jobTitles.data ?? []}
          managers={(managers.data ?? []).filter((m) => m.id !== employeeId)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["employee", employeeId] }); qc.invalidateQueries({ queryKey: ["employees"] }); }} />
      )}
      <AttachmentsPanel orgId={orgId} entityType="employee" entityId={employeeId} className="mt-6 border border-border bg-background" />
    </HrShell>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{value || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

function PayrollPanel({ employeeId, orgId }: { employeeId: string; orgId: string }) {
  const qc = useQueryClient();
  const prof = useQuery({
    queryKey: ["payroll", employeeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("payroll_profiles").select("*").eq("employee_id", employeeId).maybeSingle();
      if (error) throw error; return data as Payroll | null;
    },
  });
  const [editing, setEditing] = useState(false);

  const save = useMutation({
    mutationFn: async (form: FormData) => {
      const raw = Object.fromEntries(form.entries()) as Record<string, string>;
      const payload: Database["public"]["Tables"]["payroll_profiles"]["Update"] = {};
      for (const k of ["currency","pay_frequency","tax_id","bank_account_name","bank_account_number","bank_routing_number","bank_name","payment_method","notes","state"] as const) {
        payload[k] = raw[k] ? raw[k] : null;
      }
      for (const k of ["base_salary","hourly_rate"] as const) payload[k] = raw[k] ? Number(raw[k]) : null;
      // US payroll: blanks count as zero.
      for (const k of ["w4_dependents","w4_other_income","w4_deductions","w4_extra_withholding","state_tax_rate","retirement_percent","health_deduction"] as const) {
        payload[k] = Number(raw[k] || 0);
      }
      payload.filing_status = raw.filing_status || "single";
      payload.w4_step2 = raw.w4_step2 === "on";
      if (prof.data) {
        const { error } = await supabase.from("payroll_profiles").update(payload).eq("id", prof.data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("payroll_profiles").insert({ ...payload, employee_id: employeeId, org_id: orgId });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Payroll saved"); setEditing(false); qc.invalidateQueries({ queryKey: ["payroll", employeeId] }); },
    onError: (e) => toast.error(e.message),
  });

  if (prof.isLoading) return <div className="mt-3 text-sm text-muted-foreground">Loading…</div>;
  const p = prof.data;

  if (!editing) {
    return (
      <div className="mt-3 space-y-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Info label="Base salary" value={p ? fmtMoney(p.base_salary, p.currency ?? "USD") : "—"} />
          <Info label="Hourly rate" value={p ? fmtMoney(p.hourly_rate, p.currency ?? "USD") : "—"} />
          <Info label="Frequency" value={FREQUENCIES.find((f) => f.value === p?.pay_frequency)?.label ?? p?.pay_frequency} />
          <Info label="Payment method" value={p?.payment_method} />
          <Info label="Bank" value={p?.bank_name} />
          <Info label="Account" value={p?.bank_account_number ? "•••• " + String(p.bank_account_number).slice(-4) : null} />
          <Info label="Filing status" value={p ? FILING_STATUSES.find((f) => f.value === p.filing_status)?.label : null} />
          <Info label="State tax" value={p && Number(p.state_tax_rate) ? `${Number(p.state_tax_rate)}%${p.state ? ` (${p.state})` : ""}` : null} />
          <Info label="401(k)" value={p && Number(p.retirement_percent) ? `${Number(p.retirement_percent)}%` : null} />
          <Info label="Health, per pay" value={p && Number(p.health_deduction) ? fmtMoney(p.health_deduction, p.currency ?? "USD") : null} />
        </dl>
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>{p ? "Edit payroll" : "Add payroll"}</Button>
      </div>
    );
  }

  return (
    <form className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(new FormData(e.currentTarget)); }}>
      <div className="grid grid-cols-2 gap-3">
        <PF label="Base salary" name="base_salary" type="number" defaultValue={p?.base_salary ?? ""} />
        <PF label="Hourly rate" name="hourly_rate" type="number" defaultValue={p?.hourly_rate ?? ""} />
        <PF label="Currency" name="currency" defaultValue={p?.currency ?? "USD"} />
        <div>
          <Label className="text-xs">Pay frequency</Label>
          <Select name="pay_frequency" defaultValue={p?.pay_frequency ?? "biweekly"}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{FREQUENCIES.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <PF label="Tax ID" name="tax_id" defaultValue={p?.tax_id ?? ""} />
        <PF label="Payment method" name="payment_method" defaultValue={p?.payment_method ?? ""} />
        <PF label="Bank name" name="bank_name" defaultValue={p?.bank_name ?? ""} />
        <PF label="Account name" name="bank_account_name" defaultValue={p?.bank_account_name ?? ""} />
        <PF label="Account #" name="bank_account_number" defaultValue={p?.bank_account_number ?? ""} />
        <PF label="Routing #" name="bank_routing_number" defaultValue={p?.bank_routing_number ?? ""} />
      </div>
      <div className="border-t border-border pt-3">
        <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">US taxes (Form W-4) and deductions</div>
        <p className="mt-1 text-xs text-muted-foreground">Used by pay runs. Copy the numbers from the employee's 2020-or-later W-4. Leave blank for none.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label className="text-xs">Filing status (Step 1c)</Label>
          <Select name="filing_status" defaultValue={p?.filing_status ?? "single"}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{FILING_STATUSES.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <label className="col-span-2 flex items-center gap-2 text-sm">
          <input type="checkbox" name="w4_step2" defaultChecked={p?.w4_step2 ?? false} className="size-4 accent-primary" />
          Step 2 box ticked (two jobs, or spouse works)
        </label>
        <PF label="Step 3: dependents credit, per year" name="w4_dependents" type="number" defaultValue={zeroBlank(p?.w4_dependents)} />
        <PF label="Step 4(a): other income, per year" name="w4_other_income" type="number" defaultValue={zeroBlank(p?.w4_other_income)} />
        <PF label="Step 4(b): deductions, per year" name="w4_deductions" type="number" defaultValue={zeroBlank(p?.w4_deductions)} />
        <PF label="Step 4(c): extra withholding, per pay" name="w4_extra_withholding" type="number" defaultValue={zeroBlank(p?.w4_extra_withholding)} />
        <PF label="State (e.g. CA)" name="state" defaultValue={p?.state ?? ""} />
        <PF label="State income tax rate, %" name="state_tax_rate" type="number" defaultValue={zeroBlank(p?.state_tax_rate)} />
        <PF label="401(k), % of pay (pre-tax)" name="retirement_percent" type="number" defaultValue={zeroBlank(p?.retirement_percent)} />
        <PF label="Health insurance, per pay (pre-tax)" name="health_deduction" type="number" defaultValue={zeroBlank(p?.health_deduction)} />
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)} disabled={save.isPending}>Cancel</Button>
        <Button type="submit" size="sm" disabled={save.isPending}><Save className="size-3.5 mr-1" /> {save.isPending ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}

const zeroBlank = (n: number | null | undefined) => (n ? Number(n) : "");

function PF({ label, name, defaultValue, type }: { label: string; name: string; defaultValue: string | number | null | undefined; type?: string }) {
  return (
    <div>
      <Label htmlFor={name} className="text-xs">{label}</Label>
      <Input id={name} name={name} type={type} defaultValue={defaultValue ?? ""} step="0.01" />
    </div>
  );
}
