import { suppliersMin, vendorBillsList } from "@/lib/purchasing/queries";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useOpenOnNew } from "@/lib/use-focus-row";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { usePaged } from "@/lib/use-paged";
import { TablePager } from "@/components/ui/table-pager";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/use-current-user";
import { PurchasingShell, fmtMoney } from "@/components/purchasing/purchasing-shell";
import { DataTable } from "@/components/crm/data-table";
import { EmptyState } from "@/components/crm/empty-state";
import { PageToolbar } from "@/components/crm/page-toolbar";
import { StatusBadge, type BadgeTone } from "@/components/crm/status-badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOrgId } from "@/lib/crm/use-org";
import { Plus } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Status = Database["public"]["Enums"]["vendor_bill_status"];
const TONE: Record<Status, BadgeTone> = {
  draft: "muted", approved: "info", partially_paid: "warning", paid: "success", overdue: "danger", void: "muted",
};
const STATUSES: Status[] = ["draft","approved","partially_paid","paid","overdue","void"];

export const Route = createFileRoute("/_authenticated/app/purchasing/bills/")({
  head: () => ({ meta: [{ title: "Vendor bills — Purchasing" }] }),
  component: BillsPage,
});

function BillsPage() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const p = usePaged();
  const [status, setStatusRaw] = useState<string>("all");
  const [supplier, setSupplierRaw] = useState<string>("all");
  const setStatus = (v: string) => { setStatusRaw(v); p.reset(); };
  const setSupplier = (v: string) => { setSupplierRaw(v); p.reset(); };

  // Paged, filtered and searched in the database: 25 rows at a time, not the whole history.
  const bills = useQuery(vendorBillsList(orgId, { status, supplier }, p));

  const suppliers = useQuery(suppliersMin(orgId));

  const create = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await getSessionUser();
      const { data: num, error: nErr } = await supabase.rpc("next_doc_number", { _org: orgId!, _doc: "vendor_bill" });
      if (nErr) throw nErr;
      const { data, error } = await supabase.from("vendor_bills").insert({
        org_id: orgId!, bill_number: num as string, status: "draft" as Status, created_by: user?.id,
      }).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => { qc.invalidateQueries({ queryKey: ["vendor-bills"] }); navigate({ to: "/app/purchasing/bills/$billId", params: { billId: id } }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = bills.data?.rows;

  useOpenOnNew(() => create.mutate(), !!orgId);
  return (
    <PurchasingShell title="Vendor bills" breadcrumb="purchasing / bills" actions={
      <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending || !orgId}>
        <Plus className="mr-1 size-4" /> New bill
      </Button>
    }>
      <PageToolbar search={p.search} onSearchChange={p.setSearch} placeholder="Search bill number, supplier…" filters={
        <>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_"," ")}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={supplier} onValueChange={setSupplier}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Supplier" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All suppliers</SelectItem>
              {suppliers.data?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </>
      } />
      <DataTable
        loading={bills.isLoading}
        data={filtered}
        onRowClick={(b) => navigate({ to: "/app/purchasing/bills/$billId", params: { billId: b.id } })}
        columns={[
          { key: "bill_number", header: "Bill #", cell: (b) => <span className="font-mono text-xs">{b.bill_number}</span> },
          { key: "supplier", header: "Supplier", cell: (b) => b.suppliers?.name ?? <span className="text-muted-foreground">—</span> },
          { key: "bill_date", header: "Date", cell: (b) => <span className="font-mono text-xs">{b.bill_date ? new Date(b.bill_date).toLocaleDateString() : "—"}</span> },
          { key: "due_date", header: "Due", cell: (b) => <span className="font-mono text-xs">{b.due_date ? new Date(b.due_date).toLocaleDateString() : "—"}</span> },
          { key: "total", header: "Total", cell: (b) => <span className="font-mono">{fmtMoney(b.total, b.currency)}</span> },
          { key: "balance", header: "Balance", cell: (b) => <span className="font-mono">{fmtMoney(b.balance_due, b.currency)}</span> },
          { key: "status", header: "Status", cell: (b) => <StatusBadge tone={TONE[b.status as Status]}>{b.status.replace("_"," ")}</StatusBadge> },
        ]}
        empty={<EmptyState title="No vendor bills" description="Record bills from suppliers to track what you owe." action={
          <Button onClick={() => create.mutate()}><Plus className="mr-1 size-4" /> New bill</Button>
        } />}
      />
      <TablePager page={p.page} size={p.size} total={bills.data?.total ?? 0} onPage={p.setPage} onSize={p.setSize} />
    </PurchasingShell>
  );
}
