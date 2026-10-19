import { createFileRoute } from "@tanstack/react-router";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOrgId } from "@/lib/crm/use-org";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { MoreHorizontal, Plus, Sparkles } from "lucide-react";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

type Lead = Database["public"]["Tables"]["leads"]["Row"];
type Status = Database["public"]["Enums"]["lead_status"];

const STATUSES: Status[] = ["new","contacted","qualified","unqualified","converted","lost"];
const TONE: Record<Status, BadgeTone> = {
  new: "info", contacted: "warning", qualified: "primary",
  unqualified: "neutral", converted: "success", lost: "danger",
};

const schema = z.object({
  name: z.string().trim().min(1, "Required").max(160),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  company_name: z.string().trim().max(160).optional().or(z.literal("")),
  job_title: z.string().trim().max(120).optional().or(z.literal("")),
  status: z.enum(["new","contacted","qualified","unqualified","converted","lost"]),
  source: z.string().trim().max(80).optional().or(z.literal("")),
  estimated_value: z.coerce.number().min(0).optional().nullable(),
  notes: z.string().trim().max(5000).optional().or(z.literal("")),
});

export const Route = createFileRoute("/_authenticated/app/crm/leads")({
  head: () => ({ meta: [{ title: "Leads — CRM" }] }),
  component: LeadsPage,
});

function LeadsPage() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const p = usePaged();
  const [statusFilter, setStatusFilterRaw] = useState<string>("all");
  const setStatusFilter = (v: string) => { setStatusFilterRaw(v); p.reset(); };
  const [drawer, setDrawer] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);

  const leads = useQuery({
    queryKey: ["leads", orgId, statusFilter, p.q, p.page, p.size],
    enabled: !!orgId,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase.from("leads")
        .select("id, name, email, phone, company_name, job_title, source, status, estimated_value, notes, owner_id, created_at, updated_at, org_id, created_by, converted_company_id, converted_contact_id, converted_deal_id", { count: "exact" })
        .eq("org_id", orgId!).order("created_at", { ascending: false });
      if (statusFilter !== "all") q = q.eq("status", statusFilter as Status);
      const or = ilikeAny(["name", "email", "company_name", "phone"], p.q);
      if (or) q = q.or(or);
      const { data, count, error } = await q.range(p.from, p.to);
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });

  const filtered = leads.data?.rows;

  async function convert(lead: Lead) {
    if (!orgId) return;
    try {
      const { data: { user } } = await getSessionUser();
      let companyId: string | null = null;
      if (lead.company_name) {
        const { data: c } = await supabase.from("companies").insert({
          org_id: orgId, name: lead.company_name, created_by: user?.id, owner_id: user?.id,
        }).select("id").single();
        companyId = c?.id ?? null;
      }
      const [first, ...rest] = (lead.name ?? "").split(" ");
      const { data: contact } = await supabase.from("contacts").insert({
        org_id: orgId, first_name: first || null, last_name: rest.join(" ") || null,
        email: lead.email, phone: lead.phone, job_title: lead.job_title,
        company_id: companyId, lifecycle_stage: "sales_qualified",
        source: lead.source, created_by: user?.id, owner_id: user?.id,
      }).select("id").single();
      const { data: stage } = await supabase.from("deal_stages").select("id").eq("org_id", orgId).order("position").limit(1).maybeSingle();
      let stageId = stage?.id;
      if (!stageId) {
        await supabase.rpc("seed_default_deal_stages", { _org: orgId });
        const { data: s } = await supabase.from("deal_stages").select("id").eq("org_id", orgId).order("position").limit(1).maybeSingle();
        stageId = s?.id;
      }
      const { data: deal } = await supabase.from("deals").insert({
        org_id: orgId, title: lead.name, contact_id: contact?.id ?? null, company_id: companyId,
        stage_id: stageId, amount: lead.estimated_value ?? 0, owner_id: user?.id, created_by: user?.id,
      }).select("id").single();
      await supabase.from("leads").update({
        status: "converted", converted_contact_id: contact?.id ?? null,
        converted_company_id: companyId, converted_deal_id: deal?.id ?? null,
      }).eq("id", lead.id);
      toast.success("Lead converted to contact & deal");
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["companies"] });
      qc.invalidateQueries({ queryKey: ["deals"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  useOpenOnNew(() => { setEditing(null); setDrawer(true); });
  return (
    <CrmShell
      title="Leads"
      breadcrumb="crm / leads"
      actions={<Button size="sm" onClick={() => { setEditing(null); setDrawer(true); }}><Plus className="mr-1 size-4" /> New lead</Button>}
    >
      <PageToolbar
        search={p.search} onSearchChange={p.setSearch} placeholder="Search leads…"
        filters={
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        }
      />
      <DataTable
        loading={leads.isLoading}
        data={filtered}
        columns={[
          { key: "name", header: "Name", cell: (r) => <span className="font-medium">{r.name}</span> },
          { key: "company", header: "Company", cell: (r) => r.company_name || <span className="text-muted-foreground">—</span> },
          { key: "email", header: "Email", cell: (r) => r.email || <span className="text-muted-foreground">—</span> },
          { key: "value", header: "Value", cell: (r) => r.estimated_value != null
              ? <span className="font-mono">${Number(r.estimated_value).toLocaleString()}</span>
              : <span className="text-muted-foreground">—</span> },
          { key: "status", header: "Status", cell: (r) => <StatusBadge tone={TONE[r.status]}>{r.status}</StatusBadge> },
          { key: "actions", header: "", cell: (r) => (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button aria-label="More actions" variant="ghost" size="icon" onClick={(e)=>e.stopPropagation()}><MoreHorizontal className="size-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e)=>e.stopPropagation()}>
                <DropdownMenuItem onClick={() => { setEditing(r); setDrawer(true); }}>Edit</DropdownMenuItem>
                {r.status !== "converted" && (
                  <DropdownMenuItem onClick={() => convert(r)}>
                    <Sparkles className="mr-2 size-4" /> Convert to contact & deal
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )},
        ]}
        empty={<EmptyState title="No leads yet" description="Capture inbound interest, then qualify and convert into deals." action={
          <Button onClick={() => { setEditing(null); setDrawer(true); }}><Plus className="mr-1 size-4" /> Create lead</Button>
        } />}
      />
      <TablePager page={p.page} size={p.size} total={leads.data?.total ?? 0} onPage={p.setPage} onSize={p.setSize} />
      <LeadDrawer open={drawer} onOpenChange={(v) => { setDrawer(v); if (!v) setEditing(null); }} lead={editing} onSaved={() => qc.invalidateQueries({ queryKey: ["leads"] })} />
    </CrmShell>
  );
}

function LeadDrawer({ open, onOpenChange, lead, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; lead: Lead | null; onSaved: () => void;
}) {
  const orgId = useOrgId();
  const [form, setForm] = useState(() => init(lead));
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { setForm(init(lead)); setErrors({}); }, [lead]);

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
        email: form.email || null, phone: form.phone || null,
        company_name: form.company_name || null, job_title: form.job_title || null,
        status: form.status, source: form.source || null,
        estimated_value: form.estimated_value === "" || form.estimated_value == null ? null : Number(form.estimated_value),
        notes: form.notes || null,
      };
      if (lead) {
        const { error } = await supabase.from("leads").update(payload).eq("id", lead.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("leads").insert({ ...payload, created_by: user?.id, owner_id: user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(lead ? "Lead updated" : "Lead created"); onSaved(); onOpenChange(false); },
    onError: (e: Error) => { if (e.message !== "Validation failed") toast.error(e.message); },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{lead ? "Edit lead" : "New lead"}</SheetTitle>
          <SheetDescription>Track interest from prospects before they become deals.</SheetDescription>
        </SheetHeader>
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="mt-6 space-y-4">
          <F label="Name" err={errors.name}><Input value={form.name} onChange={(e)=>setForm({...form, name: e.target.value})} maxLength={160} /></F>
          <div className="grid grid-cols-2 gap-3">
            <F label="Email" err={errors.email}><Input type="email" value={form.email} onChange={(e)=>setForm({...form, email: e.target.value})} maxLength={255} /></F>
            <F label="Phone"><Input value={form.phone} onChange={(e)=>setForm({...form, phone: e.target.value})} maxLength={40} /></F>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <F label="Company"><Input value={form.company_name} onChange={(e)=>setForm({...form, company_name: e.target.value})} maxLength={160} /></F>
            <F label="Job title"><Input value={form.job_title} onChange={(e)=>setForm({...form, job_title: e.target.value})} maxLength={120} /></F>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <F label="Status">
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Status })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </F>
            <F label="Source"><Input value={form.source} onChange={(e)=>setForm({...form, source: e.target.value})} maxLength={80} /></F>
          </div>
          <F label="Estimated value">
            <Input type="number" min={0} step="0.01" value={form.estimated_value ?? ""} onChange={(e)=>setForm({...form, estimated_value: e.target.value})} />
          </F>
          <F label="Notes"><Textarea rows={3} value={form.notes} onChange={(e)=>setForm({...form, notes: e.target.value})} maxLength={5000} /></F>
          <SheetFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={m.isPending}>Cancel</Button>
            <Button type="submit" disabled={m.isPending}>{m.isPending ? "Saving…" : "Save"}</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function init(l: Lead | null) {
  return {
    name: l?.name ?? "", email: l?.email ?? "", phone: l?.phone ?? "",
    company_name: l?.company_name ?? "", job_title: l?.job_title ?? "",
    status: (l?.status ?? "new") as Status, source: l?.source ?? "",
    estimated_value: (l?.estimated_value ?? "") as string | number | "",
    notes: l?.notes ?? "",
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
