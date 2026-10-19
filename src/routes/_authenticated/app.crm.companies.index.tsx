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
import { Company, CompanyDrawer } from "@/components/crm/company-drawer";

export const Route = createFileRoute("/_authenticated/app/crm/companies/")({
  head: () => ({ meta: [{ title: "Companies — CRM" }] }),
  component: CompaniesPage,
});

function CompaniesPage() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const p = usePaged();
  const [drawer, setDrawer] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const restore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("companies").update({ archived: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Company restored"); qc.invalidateQueries({ queryKey: ["companies"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const companies = useQuery({
    queryKey: ["companies", orgId, showArchived, p.q, p.page, p.size],
    enabled: !!orgId,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase
        .from("companies").select("*", { count: "exact" }).eq("org_id", orgId!).eq("archived", showArchived)
        .order("created_at", { ascending: false });
      const or = ilikeAny(["name", "industry", "city", "country"], p.q);
      if (or) q = q.or(or);
      const { data, count, error } = await q.range(p.from, p.to);
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });

  const filtered = companies.data?.rows;

  useOpenOnNew(() => { setEditing(null); setDrawer(true); });
  return (
    <CrmShell
      title="Companies"
      breadcrumb="crm / companies"
      actions={<Button size="sm" onClick={() => { setEditing(null); setDrawer(true); }}><Plus className="mr-1 size-4" /> New company</Button>}
    >
      <PageToolbar search={p.search} onSearchChange={p.setSearch} placeholder="Search companies…"
        filters={
          <select value={showArchived ? "archived" : "active"} onChange={(e) => setShowArchived(e.target.value === "archived")}
            className="h-9 border border-input bg-card shadow-xs px-2 text-sm" aria-label="Show">
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        } />
      <DataTable
        loading={companies.isLoading}
        data={filtered}
        onRowClick={(row) => navigate({ to: "/app/crm/companies/$companyId", params: { companyId: row.id } })}
        columns={[
          { key: "name",     header: "Company",  cell: (r) => <span className="font-medium">{r.name}</span> },
          { key: "industry", header: "Industry", cell: (r) => r.industry || <span className="text-muted-foreground">—</span> },
          { key: "size",     header: "Size",     cell: (r) => r.size || <span className="text-muted-foreground">—</span> },
          { key: "website",  header: "Website",  cell: (r) => r.website
              ? <a href={r.website.startsWith("http") ? r.website : `https://${r.website}`} target="_blank" rel="noreferrer" className="text-primary hover:underline" onClick={(e)=>e.stopPropagation()}>{r.website}</a>
              : <span className="text-muted-foreground">—</span> },
          { key: "location", header: "Location", cell: (r) => [r.city, r.country].filter(Boolean).join(", ") || <span className="text-muted-foreground">—</span> },
          { key: "created",  header: "Created",  cell: (r) => <span className="font-mono text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span> },
          ...(showArchived ? [{ key: "restore", header: "", cell: (r: Company) => (
            <Button size="sm" variant="outline" disabled={restore.isPending} onClick={(e) => { e.stopPropagation(); restore.mutate(r.id); }}>Restore</Button>
          ) }] : []),
        ]}
        empty={showArchived ? <EmptyState title="No archived companies" description="Archived companies appear here." /> : <EmptyState title="No companies yet" description="Companies group contacts and deals together." action={
          <Button onClick={() => { setEditing(null); setDrawer(true); }}><Plus className="mr-1 size-4" /> Create company</Button>
        } />}
      />
      <TablePager page={p.page} size={p.size} total={companies.data?.total ?? 0} onPage={p.setPage} onSize={p.setSize} />
      <CompanyDrawer open={drawer} onOpenChange={(v) => { setDrawer(v); if (!v) setEditing(null); }} company={editing} onSaved={() => qc.invalidateQueries({ queryKey: ["companies"] })} />
    </CrmShell>
  );
}
