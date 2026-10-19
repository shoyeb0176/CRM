import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
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

export type Employee = Database["public"]["Tables"]["employees"]["Row"];
type EmploymentType = Database["public"]["Enums"]["employment_type"];
export type EmployeeStatus = Database["public"]["Enums"]["employee_status"];

const EMP_TYPES: EmploymentType[] = ["full_time","part_time","contractor","intern"];
export const STATUSES: EmployeeStatus[] = ["active","inactive","terminated","on_leave"];

const schema = z.object({
  first_name: z.string().trim().min(1, "Required").max(80),
  last_name: z.string().trim().min(1, "Required").max(80),
  preferred_name: z.string().trim().max(80).optional().or(z.literal("")),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  employee_number: z.string().trim().max(40).optional().or(z.literal("")),
  department_id: z.string().uuid().optional().nullable(),
  job_title_id: z.string().uuid().optional().nullable(),
  manager_id: z.string().uuid().optional().nullable(),
  employment_type: z.enum(["full_time","part_time","contractor","intern"]),
  status: z.enum(["active","inactive","terminated","on_leave"]),
  start_date: z.string().optional().or(z.literal("")),
  emergency_contact_name: z.string().trim().max(120).optional().or(z.literal("")),
  emergency_contact_phone: z.string().trim().max(40).optional().or(z.literal("")),
});

export function EmployeeDrawer({
  open, onOpenChange, employee, departments, jobTitles, managers, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employee: Employee | null;
  departments: { id: string; name: string }[];
  jobTitles: { id: string; name: string }[];
  managers: { id: string; first_name: string; last_name: string; preferred_name: string | null }[];
  onSaved: () => void;
}) {
  const orgId = useOrgId();
  const isEdit = !!employee;
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: async (form: FormData) => {
      const raw = Object.fromEntries(form.entries()) as Record<string, string | null>;
      for (const k of ["department_id","job_title_id","manager_id"]) if (raw[k] === "none" || raw[k] === "") raw[k] = null;
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        const errs: Record<string, string> = {};
        for (const i of parsed.error.issues) errs[i.path[0] as string] = i.message;
        setErrors(errs);
        throw new Error("Validation failed");
      }
      setErrors({});
      // Empty inputs are saved as empty (null), not as "".
      const payload = Object.fromEntries(
        Object.entries(parsed.data).map(([k, v]) => [k, v === "" ? null : v]),
      ) as TablesUpdate<"employees">;
      if (isEdit) {
        const { error } = await supabase.from("employees").update(payload).eq("id", employee!.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("employees").insert({ ...payload, org_id: orgId! } as TablesInsert<"employees">);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "Employee updated" : "Employee created");
      onOpenChange(false); onSaved();
    },
    onError: (e) => { if (e.message !== "Validation failed") toast.error(e.message); },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit employee" : "New employee"}</SheetTitle>
          <SheetDescription>Directory and employment details.</SheetDescription>
        </SheetHeader>
        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => { e.preventDefault(); save.mutate(new FormData(e.currentTarget)); }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name" name="first_name" defaultValue={employee?.first_name ?? ""} error={errors.first_name} required />
            <Field label="Last name" name="last_name" defaultValue={employee?.last_name ?? ""} error={errors.last_name} required />
            <Field label="Preferred name" name="preferred_name" defaultValue={employee?.preferred_name ?? ""} />
            <Field label="Employee #" name="employee_number" defaultValue={employee?.employee_number ?? ""} />
            <Field label="Email" name="email" type="email" defaultValue={employee?.email ?? ""} error={errors.email} />
            <Field label="Phone" name="phone" defaultValue={employee?.phone ?? ""} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Department" name="department_id" defaultValue={employee?.department_id ?? "none"}
              options={[{ value: "none", label: "—" }, ...departments.map((d) => ({ value: d.id, label: d.name }))]} />
            <SelectField label="Job title" name="job_title_id" defaultValue={employee?.job_title_id ?? "none"}
              options={[{ value: "none", label: "—" }, ...jobTitles.map((j) => ({ value: j.id, label: j.name }))]} />
            <SelectField label="Manager" name="manager_id" defaultValue={employee?.manager_id ?? "none"}
              options={[{ value: "none", label: "—" }, ...managers.map((m) => ({ value: m.id, label: fullName(m) }))]} />
            <SelectField label="Employment type" name="employment_type" defaultValue={employee?.employment_type ?? "full_time"}
              options={EMP_TYPES.map((t) => ({ value: t, label: t.replace("_"," ") }))} />
            <SelectField label="Status" name="status" defaultValue={employee?.status ?? "active"}
              options={STATUSES.map((s) => ({ value: s, label: s.replace("_"," ") }))} />
            <Field label="Start date" name="start_date" type="date" defaultValue={employee?.start_date ?? ""} />
          </div>

          <div className="border-t border-border pt-4">
            <div className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">Emergency contact</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name" name="emergency_contact_name" defaultValue={employee?.emergency_contact_name ?? ""} />
              <Field label="Phone" name="emergency_contact_phone" defaultValue={employee?.emergency_contact_phone ?? ""} />
            </div>
          </div>

          <SheetFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button>
            <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : isEdit ? "Save changes" : "Create employee"}</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, name, defaultValue, error, type, required }: { label: string; name: string; defaultValue?: string; error?: string; type?: string; required?: boolean }) {
  return (
    <div>
      <Label htmlFor={name} className="text-xs">{label}{required && " *"}</Label>
      <Input id={name} name={name} type={type} defaultValue={defaultValue} />
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

function SelectField({ label, name, defaultValue, options }: { label: string; name: string; defaultValue: string; options: { value: string; label: string }[] }) {
  return (
    <div>
      <Label htmlFor={name} className="text-xs">{label}</Label>
      <Select name={name} defaultValue={defaultValue}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
