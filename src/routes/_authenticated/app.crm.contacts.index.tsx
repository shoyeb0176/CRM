import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ilikeAny, usePaged } from "@/lib/use-paged";
import { TablePager } from "@/components/ui/table-pager";
import { useOpenOnNew } from "@/lib/use-focus-row";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { Company, Contact, ContactDrawer, LIFECYCLE, Lifecycle } from "@/components/crm/contact-drawer";

const LIFECYCLE_TONE: Record<Lifecycle, BadgeTone> = {
  subscriber: "neutral", lead: "info", marketing_qualified: "info",
  sales_qualified: "warning", opportunity: "warning", customer: "success",
  evangelist: "primary", other: "default",
};

export const Route = createFileRoute("/_authenticated/app/crm/contacts/")({
  head: () => ({ meta: [{ title: "Contacts — CRM" }] }),
  component: ContactsPage,
});

function ContactsPage() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const p = usePaged();
  const [lifecycleFilter, setLifecycleFilterRaw] = useState<string>("all");
  const [companyFilter, setCompanyFilterRaw] = useState<string>("all");
  const setLifecycleFilter = (v: string) => { setLifecycleFilterRaw(v); p.reset(); };
  const setCompanyFilter = (v: string) => { setCompanyFilterRaw(v); p.reset(); };
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const restore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contacts").update({ archived: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Contact restored"); qc.invalidateQueries({ queryKey: ["contacts"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const contacts = useQuery({
    queryKey: ["contacts", orgId, lifecycleFilter, companyFilter, showArchived, p.q, p.page, p.size],
    enabled: !!orgId,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase
        .from("contacts")
        .select("*, companies:company_id(id,name)", { count: "exact" })
        .eq("org_id", orgId!)
        .eq("archived", showArchived)
        .order("created_at", { ascending: false });
      if (lifecycleFilter !== "all") q = q.eq("lifecycle_stage", lifecycleFilter as Lifecycle);
      if (companyFilter !== "all") q = q.eq("company_id", companyFilter);
      const or = ilikeAny(["first_name", "last_name", "email", "phone", "job_title"], p.q);
      if (or) q = q.or(or);
      const { data, count, error } = await q.range(p.from, p.to);
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });

  const companies = useQuery({
    queryKey: ["companies-min", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies").select("id, name").eq("org_id", orgId!).eq("archived", false).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = contacts.data?.rows;

  useOpenOnNew(() => { setEditing(null); setDrawerOpen(true); });
  return (
    <CrmShell
      title="Contacts"
      breadcrumb="crm / contacts"
      actions={
        <Button onClick={() => { setEditing(null); setDrawerOpen(true); }} size="sm">
          <Plus className="mr-1 size-4" /> New contact
        </Button>
      }
    >
      <PageToolbar
        search={p.search} onSearchChange={p.setSearch}
        placeholder="Search by name, email, phone…"
        filters={
          <>
            <Select value={lifecycleFilter} onValueChange={setLifecycleFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Lifecycle" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All lifecycles</SelectItem>
                {LIFECYCLE.map((l) => <SelectItem key={l} value={l}>{l.replaceAll("_", " ")}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={companyFilter} onValueChange={setCompanyFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Company" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All companies</SelectItem>
                {companies.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <select value={showArchived ? "archived" : "active"} onChange={(e) => setShowArchived(e.target.value === "archived")}
              className="h-9 border border-input bg-card shadow-xs px-2 text-sm" aria-label="Show">
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </>
        }
      />

      <DataTable
        loading={contacts.isLoading}
        data={filtered}
        onRowClick={(row) => navigate({ to: "/app/crm/contacts/$contactId", params: { contactId: row.id } })}
        columns={[
          { key: "name", header: "Name", cell: (r) => (
            <span className="font-medium">{[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}</span>
          )},
          { key: "email", header: "Email", cell: (r) => r.email || <span className="text-muted-foreground">—</span> },
          { key: "phone", header: "Phone", cell: (r) => r.phone || <span className="text-muted-foreground">—</span> },
          { key: "company", header: "Company", cell: (r) => {
            const c = (r as Contact & { companies?: { id: string; name: string } | null }).companies;
            return c?.name ?? <span className="text-muted-foreground">—</span>;
          }},
          { key: "stage", header: "Lifecycle", cell: (r) => (
            <StatusBadge tone={LIFECYCLE_TONE[r.lifecycle_stage]}>{r.lifecycle_stage.replaceAll("_"," ")}</StatusBadge>
          )},
          { key: "created", header: "Created", cell: (r) => (
            <span className="font-mono text-xs text-muted-foreground">
              {new Date(r.created_at).toLocaleDateString()}
            </span>
          )},
          ...(showArchived ? [{ key: "restore", header: "", cell: (r: Contact) => (
            <Button size="sm" variant="outline" disabled={restore.isPending} onClick={(e) => { e.stopPropagation(); restore.mutate(r.id); }}>Restore</Button>
          ) }] : []),
        ]}
        empty={
          <EmptyState
            title="No contacts yet"
            description="Add your first contact to start tracking relationships, deals and activities."
            action={
              <Button onClick={() => { setEditing(null); setDrawerOpen(true); }}>
                <Plus className="mr-1 size-4" /> Create contact
              </Button>
            }
          />
        }
      />
      <TablePager page={p.page} size={p.size} total={contacts.data?.total ?? 0} onPage={p.setPage} onSize={p.setSize} />

      <ContactDrawer
        open={drawerOpen}
        onOpenChange={(v) => { setDrawerOpen(v); if (!v) setEditing(null); }}
        contact={editing}
        companies={companies.data ?? []}
        onSaved={() => qc.invalidateQueries({ queryKey: ["contacts"] })}
      />
    </CrmShell>
  );
}
