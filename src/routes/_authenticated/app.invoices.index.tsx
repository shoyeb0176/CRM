import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ilikeAny, usePaged } from "@/lib/use-paged";
import { TablePager } from "@/components/ui/table-pager";
import { useOpenOnNew } from "@/lib/use-focus-row";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/use-current-user";
import { SalesShell, fmtMoney } from "@/components/sales/sales-shell";
import { DataTable } from "@/components/crm/data-table";
import { EmptyState } from "@/components/crm/empty-state";
import { PageToolbar } from "@/components/crm/page-toolbar";
import { StatusBadge, type BadgeTone } from "@/components/crm/status-badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOrgId } from "@/lib/crm/use-org";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Status = Database["public"]["Enums"]["invoice_status"];
const TONE: Record<Status, BadgeTone> = {
  draft: "muted", sent: "info", partially_paid: "warning", paid: "success", overdue: "danger", void: "muted",
};

export const Route = createFileRoute("/_authenticated/app/invoices/")({
  head: () => ({ meta: [{ title: "Invoices — Inuberry" }] }),
  component: InvoicesPage,
});

function InvoicesPage() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const p = usePaged();
  const [status, setStatusRaw] = useState<string>("all");
  const setStatus = (v: string) => { setStatusRaw(v); p.reset(); };

  const invoices = useQuery({
    queryKey: ["invoices", orgId, status, p.q, p.page, p.size], enabled: !!orgId,
    placeholderData: keepPreviousData,
    // Overdue invoices are marked by the nightly job, not on every visit.
    queryFn: async () => {
      let q = supabase.from("invoices")
        .select("id, number, status, issue_date, due_date, total, balance_due, currency, company_id, contact_id, created_at, contacts:contact_id(id, first_name, last_name), companies:company_id(id, name)", { count: "exact" })
        .eq("org_id", orgId!).order("created_at", { ascending: false });
      if (status !== "all") q = q.eq("status", status as Status);
      const term = p.q.replace(/[,()%*"\\]/g, " ").trim();
      if (term) {
        // Match the invoice number or the customer's name.
        const { data: cos } = await supabase.from("companies").select("id").eq("org_id", orgId!).ilike("name", `%${term}%`).limit(50);
        const ids = (cos ?? []).map((c) => c.id);
        q = q.or([`number.ilike.%${term}%`, ...(ids.length ? [`company_id.in.(${ids.join(",")})`] : [])].join(","));
      }
      const { data, count, error } = await q.range(p.from, p.to);
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await getSessionUser();
      const { data: num, error: nErr } = await supabase.rpc("next_doc_number", { _org: orgId!, _doc: "invoice" });
      if (nErr) throw nErr;
      const due = new Date(); due.setDate(due.getDate() + 30);
      const { data, error } = await supabase.from("invoices").insert({
        org_id: orgId!, number: num as string, status: "draft" as Status,
        due_date: due.toISOString().slice(0, 10), created_by: user?.id, owner_id: user?.id,
      }).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => { qc.invalidateQueries({ queryKey: ["invoices"] }); navigate({ to: "/app/invoices/$invoiceId", params: { invoiceId: id } }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = invoices.data?.rows;

  useOpenOnNew(() => create.mutate(), !!orgId);
  return (
    <SalesShell title="Invoices" breadcrumb="invoices" actions={
      <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending}><Plus className="mr-1 size-4" /> New invoice</Button>
    }>
      <PageToolbar
        search={p.search} onSearchChange={p.setSearch} placeholder="Search by number, customer…"
        filters={
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="partially_paid">Partially paid</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="void">Void</SelectItem>
            </SelectContent>
          </Select>
        }
      />
      <DataTable
        loading={invoices.isLoading}
        data={filtered}
        onRowClick={(i) => navigate({ to: "/app/invoices/$invoiceId", params: { invoiceId: i.id } })}
        columns={[
          { key: "number", header: "Number", cell: (i) => <span className="font-mono text-xs">{i.number}</span> },
          { key: "customer", header: "Customer", cell: (i) =>
            i.companies?.name ?? (i.contacts ? [i.contacts.first_name, i.contacts.last_name].filter(Boolean).join(" ") : <span className="text-muted-foreground">—</span>) },
          { key: "issue", header: "Issued", cell: (i) => <span className="font-mono text-xs">{i.issue_date ? new Date(i.issue_date).toLocaleDateString() : "—"}</span> },
          { key: "due", header: "Due", cell: (i) => <span className="font-mono text-xs">{i.due_date ? new Date(i.due_date).toLocaleDateString() : "—"}</span> },
          { key: "total", header: "Total", cell: (i) => <span className="font-mono">{fmtMoney(i.total, i.currency)}</span> },
          { key: "balance", header: "Balance", cell: (i) => <span className="font-mono">{fmtMoney(i.balance_due, i.currency)}</span> },
          { key: "status", header: "Status", cell: (i) => <StatusBadge tone={TONE[i.status as Status]}>{(i.status as string).replace("_", " ")}</StatusBadge> },
        ]}
        empty={<EmptyState title="No invoices yet" description="Bill a customer to track receivables." action={
          <Button onClick={() => create.mutate()}><Plus className="mr-1 size-4" /> New invoice</Button>
        } />}
      />
      <TablePager page={p.page} size={p.size} total={invoices.data?.total ?? 0} onPage={p.setPage} onSize={p.setSize} />
    </SalesShell>
  );
}
