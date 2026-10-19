import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ModuleCharts } from "@/components/charts/module-charts";
import { useOpenOnNew } from "@/lib/use-focus-row";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/use-current-user";
import { ProjectsShell, PROJECT_STATUSES, PROJECT_STATUS_TONE, fmtDate, fmtMoney, type ProjectStatus } from "@/components/projects/projects-shell";
import { DataTable } from "@/components/crm/data-table";
import { EmptyState } from "@/components/crm/empty-state";
import { PageToolbar } from "@/components/crm/page-toolbar";
import { StatusBadge } from "@/components/crm/status-badge";
import { ConfirmDelete } from "@/components/crm/confirm-delete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOrgId } from "@/lib/crm/use-org";
import { useOrgMembers, memberLabel } from "@/lib/projects/use-org-members";
import { useMemo, useState, useEffect } from "react";
import { toast } from "sonner";
import { Plus, Briefcase, ListChecks, Clock, AlertTriangle, ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export type Project = Database["public"]["Tables"]["projects"]["Row"];
const schema = z.object({
  name: z.string().trim().min(1, "Name required").max(200),
  code: z.string().trim().max(40).optional().or(z.literal("")),
  description: z.string().trim().max(5000).optional().or(z.literal("")),
  status: z.enum(["planned","active","on_hold","completed","cancelled"]),
  customer_company_id: z.string().uuid().nullable().optional(),
  manager_id: z.string().uuid().nullable().optional(),
  start_date: z.string().optional().or(z.literal("")),
  due_date: z.string().optional().or(z.literal("")),
  budget: z.string().optional().or(z.literal("")),
  currency: z.string().min(3).max(8).default("USD"),
});

export function ProjectDrawer({
  open, onOpenChange, project, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: Project | null;
  onSaved: () => void;
}) {
  const orgId = useOrgId();
  // Pickers load when the drawer opens, not while it sits closed on the list page.
  const members = useOrgMembers(open ? orgId : undefined);
  const companies = useQuery({
    queryKey: ["companies-min", orgId], enabled: !!orgId && open,
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("id, name").eq("org_id", orgId!).eq("archived", false).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const [form, setForm] = useState(() => initial(project));
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { setForm(initial(project)); setErrors({}); }, [project, open]);

  async function toggleArchive() {
    if (!project) return;
    const { error } = await supabase.from("projects").update({ archived: !project.archived }).eq("id", project.id);
    if (error) return void toast.error(error.message);
    toast.success(project.archived ? "Project restored" : "Project archived");
    onSaved();
    onOpenChange(false);
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const parsed = schema.safeParse(form);
      if (!parsed.success) {
        const errs: Record<string, string> = {};
        parsed.error.issues.forEach((i) => { errs[i.path[0] as string] = i.message; });
        setErrors(errs);
        throw new Error("Validation failed");
      }
      setErrors({});
      const { data: { user } } = await getSessionUser();
      const payload = {
        org_id: orgId!,
        name: form.name,
        code: form.code || null,
        description: form.description || null,
        status: form.status,
        customer_company_id: form.customer_company_id || null,
        manager_id: form.manager_id || null,
        start_date: form.start_date || null,
        due_date: form.due_date || null,
        budget: form.budget ? Number(form.budget) : null,
        currency: form.currency || "USD",
      };
      if (project) {
        const { error } = await supabase.from("projects").update(payload).eq("id", project.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("projects").insert({ ...payload, created_by: user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(project ? "Project updated" : "Project created");
      onSaved();
      onOpenChange(false);
    },
    onError: (e: Error) => { if (e.message !== "Validation failed") toast.error(e.message); },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{project ? "Edit project" : "New project"}</SheetTitle>
          <SheetDescription>Define the project shell. You can add tasks and milestones after.</SheetDescription>
        </SheetHeader>
        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }} className="mt-6 space-y-4">
          <Field label="Name" error={errors.name}>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={200} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Code">
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} maxLength={40} placeholder="e.g. ACME-01" />
            </Field>
            <Field label="Status">
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as ProjectStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROJECT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_"," ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Customer">
            <Select value={form.customer_company_id ?? "none"} onValueChange={(v) => setForm({ ...form, customer_company_id: v === "none" ? null : v })}>
              <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {companies.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Project manager">
            <Select value={form.manager_id ?? "none"} onValueChange={(v) => setForm({ ...form, manager_id: v === "none" ? null : v })}>
              <SelectTrigger><SelectValue placeholder="Assign manager" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Unassigned —</SelectItem>
                {members.data?.map((m) => <SelectItem key={m.user_id} value={m.user_id}>{memberLabel(m)}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date">
              <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </Field>
            <Field label="Due date">
              <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Budget">
              <Input type="number" min="0" step="0.01" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
            </Field>
            <Field label="Currency">
              <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} maxLength={8} />
            </Field>
          </div>
          <Field label="Description">
            <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={5000} />
          </Field>
          {project && (
            <div className="border-t border-border pt-4">
              {project.archived ? (
                <Button type="button" variant="outline" size="sm" onClick={() => toggleArchive()}>Restore project</Button>
              ) : (
                <ConfirmDelete
                  title="Archive project?" confirmLabel="Archive"
                  description="It will be hidden from the project list. You can restore it from the archived view."
                  trigger={<Button type="button" variant="outline" size="sm">Archive project</Button>}
                  onConfirm={() => toggleArchive()}
                />
              )}
            </div>
          )}
          <SheetFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : "Save project"}</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

type ProjectForm = {
  name: string; code: string; description: string;
  status: ProjectStatus;
  customer_company_id: string | null;
  manager_id: string | null;
  start_date: string; due_date: string;
  budget: string; currency: string;
};

function initial(p: Project | null): ProjectForm {
  return {
    name: p?.name ?? "",
    code: p?.code ?? "",
    description: p?.description ?? "",
    status: (p?.status ?? "planned") as ProjectStatus,
    customer_company_id: p?.customer_company_id ?? null,
    manager_id: p?.manager_id ?? null,
    start_date: p?.start_date ?? "",
    due_date: p?.due_date ?? "",
    budget: p?.budget != null ? String(p.budget) : "",
    currency: p?.currency ?? "USD",
  };
}
