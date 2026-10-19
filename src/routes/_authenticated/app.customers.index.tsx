import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CrmShell } from "@/components/crm/crm-shell";
import { DataTable } from "@/components/crm/data-table";
import { EmptyState } from "@/components/crm/empty-state";
import { PageToolbar } from "@/components/crm/page-toolbar";
import { Button } from "@/components/ui/button";
import { fmtMoney } from "@/components/sales/sales-shell";
import { useOrgId } from "@/lib/crm/use-org";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { CompanyDrawer } from "@/components/crm/company-drawer";

export const Route = createFileRoute("/_authenticated/app/customers/")({
  head: () => ({ meta: [{ title: "Customers — Inuberry" }] }),
  component: CustomersPage,
});

type CustomerRow = {
  id: string; name: string; industry: string | null; contact: string | null;
  openBalance: number; lastInvoice: string | null; currency: string;
};

// A customer is a non-archived company marked status "customer", or one that has
// any quote, sales order or invoice. Derived here, so no schema change is needed.
// ponytail: loads up to 1000 rows per table client-side; move to a DB view if orgs grow past that.
function useCustomers(orgId: string | undefined) {
  return useQuery({
    queryKey: ["customers", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<CustomerRow[]> => {
      const [co, ct, q, so, inv] = await Promise.all([
        supabase.from("companies").select("id, name, industry, status").eq("org_id", orgId!).eq("archived", false).order("name").limit(1000),
        supabase.from("contacts").select("company_id, first_name, last_name, created_at").eq("org_id", orgId!).eq("archived", false).not("company_id", "is", null).order("created_at").limit(1000),
        supabase.from("quotes").select("company_id").eq("org_id", orgId!).not("company_id", "is", null).limit(1000),
        supabase.from("sales_orders").select("company_id").eq("org_id", orgId!).not("company_id", "is", null).limit(1000),
        supabase.from("invoices").select("company_id, balance_due, status, issue_date, currency").eq("org_id", orgId!).not("company_id", "is", null).limit(1000),
      ]);
      for (const r of [co, ct, q, so, inv]) if (r.error) throw r.error;

      const withDocs = new Set<string>();
      for (const r of [...(q.data ?? []), ...(so.data ?? []), ...(inv.data ?? [])]) if (r.company_id) withDocs.add(r.company_id);

      const contactOf = new Map<string, string>();
      for (const c of ct.data ?? []) {
        if (c.company_id && !contactOf.has(c.company_id)) contactOf.set(c.company_id, [c.first_name, c.last_name].filter(Boolean).join(" "));
      }
      const balance = new Map<string, number>();
      const last = new Map<string, string>();
      const ccy = new Map<string, string>();
      for (const i of inv.data ?? []) {
        if (!i.company_id || i.status === "draft" || i.status === "void") continue;
        balance.set(i.company_id, (balance.get(i.company_id) ?? 0) + Number(i.balance_due ?? 0));
        if (i.issue_date && (!last.has(i.company_id) || i.issue_date > last.get(i.company_id)!)) last.set(i.company_id, i.issue_date);
        ccy.set(i.company_id, i.currency ?? "USD");
      }

      return (co.data ?? [])
        .filter((c) => c.status === "customer" || withDocs.has(c.id))
        .map((c) => ({
          id: c.id, name: c.name, industry: c.industry, contact: contactOf.get(c.id) ?? null,
          openBalance: balance.get(c.id) ?? 0, lastInvoice: last.get(c.id) ?? null, currency: ccy.get(c.id) ?? "USD",
        }));
    },
  });
}

function CustomersPage() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [drawer, setDrawer] = useState(false);
  const customers = useCustomers(orgId);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!customers.data || !s) return customers.data;
    return customers.data.filter((c) => [c.name, c.industry, c.contact].filter(Boolean).some((v) => String(v).toLowerCase().includes(s)));
  }, [customers.data, search]);

  const newCustomer = <Button size="sm" onClick={() => setDrawer(true)}><Plus className="mr-1 size-4" /> New customer</Button>;

  return (
    <CrmShell title="Customers" breadcrumb="crm / customers">
      <PageToolbar search={search} onSearchChange={setSearch} placeholder="Search customers…" actions={newCustomer} />
      {customers.error ? (
        <div className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Couldn't load customers: {(customers.error as Error).message}</div>
      ) : (
        <DataTable
          loading={customers.isLoading}
          data={filtered}
          onRowClick={(r) => navigate({ to: "/app/customers/$companyId", params: { companyId: r.id } })}
          columns={[
            { key: "name", header: "Customer", cell: (r) => <span className="font-medium">{r.name}</span> },
            { key: "contact", header: "Primary contact", cell: (r) => r.contact || <span className="text-muted-foreground">—</span> },
            { key: "balance", header: "Open balance", className: "text-right", cell: (r) => <span className="font-mono">{fmtMoney(r.openBalance, r.currency)}</span> },
            { key: "last", header: "Last invoice", cell: (r) => r.lastInvoice ? <span className="font-mono text-xs text-muted-foreground">{new Date(r.lastInvoice).toLocaleDateString()}</span> : <span className="text-muted-foreground">—</span> },
          ]}
          empty={search
            ? <EmptyState title="No matches" description={`No customers match '${search}'.`} />
            : <EmptyState title="No customers yet" description="Companies become customers when you quote, order or invoice them, or when you add them here." action={newCustomer} />}
        />
      )}
      <CompanyDrawer open={drawer} onOpenChange={setDrawer} company={null} newStatus="customer"
        onSaved={() => { qc.invalidateQueries({ queryKey: ["customers"] }); qc.invalidateQueries({ queryKey: ["companies"] }); }} />
    </CrmShell>
  );
}
