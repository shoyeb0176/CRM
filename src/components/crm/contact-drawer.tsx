import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ilikeAny, usePaged } from "@/lib/use-paged";
import { TablePager } from "@/components/ui/table-pager";
import { useOpenOnNew } from "@/lib/use-focus-row";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/use-current-user";
import { CrmShell } from "@/components/crm/crm-shell";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useOrgId } from "@/lib/crm/use-org";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";
import { Plus } from "lucide-react";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

import { useEffect } from "react";

export type Contact = Database["public"]["Tables"]["contacts"]["Row"];
export type Company = Database["public"]["Tables"]["companies"]["Row"];
export type Lifecycle = Database["public"]["Enums"]["lifecycle_stage"];

export const LIFECYCLE: Lifecycle[] = [
  "subscriber","lead","marketing_qualified","sales_qualified","opportunity","customer","evangelist","other",
];

const schema = z.object({
  first_name: z.string().trim().max(80).optional().or(z.literal("")),
  last_name: z.string().trim().max(80).optional().or(z.literal("")),
  email: z.string().trim().email("Invalid email").max(255).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  job_title: z.string().trim().max(120).optional().or(z.literal("")),
  company_id: z.string().uuid().optional().nullable(),
  lifecycle_stage: z.enum([
    "subscriber","lead","marketing_qualified","sales_qualified","opportunity","customer","evangelist","other",
  ]),
  source: z.string().trim().max(80).optional().or(z.literal("")),
  notes: z.string().trim().max(5000).optional().or(z.literal("")),
}).refine((d) => d.first_name || d.last_name || d.email, {
  message: "Provide a name or an email",
  path: ["first_name"],
});

export function ContactDrawer({
  open, onOpenChange, contact, companies, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contact: Contact | null;
  companies: { id: string; name: string }[];
  onSaved: () => void;
}) {
  const orgId = useOrgId();
  const [form, setForm] = useState(() => initial(contact));
  const [errors, setErrors] = useState<Record<string, string>>({});

  function reset() { setForm(initial(contact)); setErrors({}); }
  // re-initialise when contact changes
  useMemoSync(() => reset(), [contact]);

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
        first_name: form.first_name || null,
        last_name: form.last_name || null,
        email: form.email || null,
        phone: form.phone || null,
        job_title: form.job_title || null,
        company_id: form.company_id || null,
        lifecycle_stage: form.lifecycle_stage,
        source: form.source || null,
        notes: form.notes || null,
      };
      if (contact) {
        const { error } = await supabase.from("contacts").update(payload).eq("id", contact.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("contacts").insert({ ...payload, created_by: user?.id, owner_id: user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(contact ? "Contact updated" : "Contact created");
      onSaved();
      onOpenChange(false);
    },
    onError: (e: Error) => {
      if (e.message !== "Validation failed") toast.error(friendlyError(e));
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{contact ? "Edit contact" : "New contact"}</SheetTitle>
          <SheetDescription>Capture the essentials. You can enrich more on the contact's page.</SheetDescription>
        </SheetHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}
          className="mt-6 space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name" error={errors.first_name}>
              <Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} maxLength={80} />
            </Field>
            <Field label="Last name">
              <Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} maxLength={80} />
            </Field>
          </div>
          <Field label="Email" error={errors.email}>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={255} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={40} />
            </Field>
            <Field label="Job title">
              <Input value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} maxLength={120} />
            </Field>
          </div>
          <Field label="Company">
            <Select
              value={form.company_id ?? "none"}
              onValueChange={(v) => setForm({ ...form, company_id: v === "none" ? null : v })}
            >
              <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Lifecycle stage">
              <Select
                value={form.lifecycle_stage}
                onValueChange={(v) => setForm({ ...form, lifecycle_stage: v as Lifecycle })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LIFECYCLE.map((l) => <SelectItem key={l} value={l}>{l.replaceAll("_", " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Source">
              <Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} maxLength={80} placeholder="e.g. website, referral" />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} maxLength={5000} />
          </Field>
          <SheetFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : "Save contact"}</Button>
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

type ContactForm = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  job_title: string;
  company_id: string | null;
  lifecycle_stage: Lifecycle;
  source: string;
  notes: string;
};

function initial(c: Contact | null): ContactForm {
  return {
    first_name: c?.first_name ?? "",
    last_name: c?.last_name ?? "",
    email: c?.email ?? "",
    phone: c?.phone ?? "",
    job_title: c?.job_title ?? "",
    company_id: c?.company_id ?? null,
    lifecycle_stage: (c?.lifecycle_stage ?? "lead") as Lifecycle,
    source: c?.source ?? "",
    notes: c?.notes ?? "",
  };
}

function useMemoSync(fn: () => void, deps: unknown[]) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(fn, deps);
}
