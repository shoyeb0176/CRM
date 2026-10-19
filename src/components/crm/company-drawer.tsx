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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { useOrgId } from "@/lib/crm/use-org";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";
import { Plus } from "lucide-react";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export type Company = Database["public"]["Tables"]["companies"]["Row"];

const schema = z.object({
  name: z.string().trim().min(1, "Required").max(160),
  website: z.string().trim().max(255).optional().or(z.literal("")),
  industry: z.string().trim().max(80).optional().or(z.literal("")),
  size: z.string().trim().max(40).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  city: z.string().trim().max(80).optional().or(z.literal("")),
  country: z.string().trim().max(80).optional().or(z.literal("")),
  address: z.string().trim().max(255).optional().or(z.literal("")),
});

export function CompanyDrawer({ open, onOpenChange, company, onSaved, newStatus }: {
  open: boolean; onOpenChange: (v: boolean) => void; company: Company | null; onSaved: () => void;
  /** Status for newly created companies (e.g. "customer" from the Customers module). */
  newStatus?: string;
}) {
  const orgId = useOrgId();
  const [form, setForm] = useState(() => init(company));
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { setForm(init(company)); setErrors({}); }, [company]);

  const m = useMutation({
    mutationFn: async () => {
      const parsed = schema.safeParse(form);
      if (!parsed.success) {
        const errs: Record<string, string> = {};
        parsed.error.issues.forEach((i) => { errs[i.path[0] as string] = i.message; });
        setErrors(errs); throw new Error("Validation failed");
      }
      setErrors({});
      const { data: { user } } = await getSessionUser();
      const payload = {
        org_id: orgId!,
        name: form.name,
        website: form.website || null, industry: form.industry || null, size: form.size || null,
        phone: form.phone || null, city: form.city || null, country: form.country || null, address: form.address || null,
      };
      if (company) {
        const { error } = await supabase.from("companies").update(payload).eq("id", company.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("companies").insert({ ...payload, created_by: user?.id, owner_id: user?.id, ...(newStatus ? { status: newStatus } : {}) });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(company ? "Company updated" : "Company created"); onSaved(); onOpenChange(false); },
    onError: (e: Error) => { if (e.message !== "Validation failed") toast.error(friendlyError(e)); },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{company ? "Edit company" : "New company"}</SheetTitle>
          <SheetDescription>Companies organize contacts and deals.</SheetDescription>
        </SheetHeader>
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="mt-6 space-y-4">
          <F label="Name" err={errors.name}><Input value={form.name} onChange={(e)=>setForm({...form, name: e.target.value})} maxLength={160} /></F>
          <div className="grid grid-cols-2 gap-3">
            <F label="Industry"><Input value={form.industry} onChange={(e)=>setForm({...form, industry: e.target.value})} maxLength={80} /></F>
            <F label="Size"><Input value={form.size} onChange={(e)=>setForm({...form, size: e.target.value})} placeholder="e.g. 11-50" maxLength={40} /></F>
          </div>
          <F label="Website"><Input value={form.website} onChange={(e)=>setForm({...form, website: e.target.value})} placeholder="example.com" maxLength={255} /></F>
          <F label="Phone"><Input value={form.phone} onChange={(e)=>setForm({...form, phone: e.target.value})} maxLength={40} /></F>
          <div className="grid grid-cols-2 gap-3">
            <F label="City"><Input value={form.city} onChange={(e)=>setForm({...form, city: e.target.value})} maxLength={80} /></F>
            <F label="Country"><Input value={form.country} onChange={(e)=>setForm({...form, country: e.target.value})} maxLength={80} /></F>
          </div>
          <F label="Address"><Textarea rows={2} value={form.address} onChange={(e)=>setForm({...form, address: e.target.value})} maxLength={255} /></F>
          <SheetFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={m.isPending}>Cancel</Button>
            <Button type="submit" disabled={m.isPending}>{m.isPending ? "Saving…" : "Save"}</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function init(c: Company | null) {
  return {
    name: c?.name ?? "", website: c?.website ?? "", industry: c?.industry ?? "",
    size: c?.size ?? "", phone: c?.phone ?? "", city: c?.city ?? "",
    country: c?.country ?? "", address: c?.address ?? "",
  };
}

function F({ label, err, children }: { label: string; err?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</Label>
      {children}
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}
