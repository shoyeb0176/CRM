import { purchaseOrdersList, suppliersMin } from "@/lib/purchasing/queries";
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

type Status = Database["public"]["Enums"]["po_status"];
const TONE: Record<Status, BadgeTone> = {
  draft: "muted", sent: "info", approved: "info", partially_received: "warning", received: "success", cancelled: "danger",
};
const STATUSES: Status[] = ["draft","sent","approved","partially_received","received","cancelled"];

export const Route = createFileRoute("/_authenticated/app/purchasing/orders/")({
  head: () => ({ meta: [{ title: "Purchase orders — Purchasing" }] }),
  component: POListPage,
});

function POListPage() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const p = usePaged();
  const [status, setStatusRaw] = useState<string>("all");
  const [supplier, setSupplierRaw] = useState<string>("all");
  const setStatus = (v: string) => { setStatusRaw(v); p.reset(); };
  const setSupplier = (v: string) => { setSupplierRaw(v); p.reset(); };

  // Paged, filtered and searched in the database: 25 rows at a time, not the whole history.
  const pos = useQuery(purchaseOrdersList(orgId, { status, supplier }, p));

  const suppliers = useQuery(suppliersMin(orgId));

  const create = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await getSessionUser();
      const { data: num, error: nErr } = await supabase.rpc("next_doc_number", { _org: orgId!, _doc: "purchase_order" });
      if (nErr) throw nErr;
      // default warehouse
      const { data: wh } = await supabase.from("warehouses").select("id").eq("org_id", orgId!).eq("is_active", true).order("is_default", { ascending: false }).limit(1).maybeSingle();
      const { data, error } = await supabase.from("purchase_orders").insert({
        org_id: orgId!, po_number: num as string, status: "draft" as Status, created_by: user?.id, warehouse_id: wh?.id ?? null,
      }).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => { qc.invalidateQueries({ queryKey: ["pos"] }); navigate({ to: "/app/purchasing/orders/$poId", params: { poId: id } }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = pos.data?.rows;

  useOpenOnNew(() => create.mutate(), !!orgId);
  return (
    <PurchasingShell title="Purchase orders" breadcrumb="purchasing / orders" actions={
      <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending || !orgId}>
        <Plus className="mr-1 size-4" /> New PO
      </Button>
    }>
      <PageToolbar search={p.search} onSearchChange={p.setSearch} placeholder="Search PO number, supplier…" filters={
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
        loading={pos.isLoading}
        data={filtered}
        onRowClick={(p) => navigate({ to: "/app/purchasing/orders/$poId", params: { poId: p.id } })}
        columns={[
          { key: "po_number", header: "PO #", cell: (p) => <span className="font-mono text-xs">{p.po_number}</span> },
          { key: "supplier", header: "Supplier", cell: (p) => p.suppliers?.name ?? <span className="text-muted-foreground">—</span> },
          { key: "order_date", header: "Order date", cell: (p) => <span className="font-mono text-xs">{p.order_date ? new Date(p.order_date).toLocaleDateString() : "—"}</span> },
          { key: "expected", header: "Expected", cell: (p) => <span className="font-mono text-xs">{p.expected_date ? new Date(p.expected_date).toLocaleDateString() : "—"}</span> },
          { key: "total", header: "Total", cell: (p) => <span className="font-mono">{fmtMoney(p.total, p.currency)}</span> },
          { key: "status", header: "Status", cell: (p) => <StatusBadge tone={TONE[p.status as Status]}>{p.status.replace("_"," ")}</StatusBadge> },
        ]}
        empty={<EmptyState title="No purchase orders" description="Create a PO to start tracking supplier purchases." action={
          <Button onClick={() => create.mutate()}><Plus className="mr-1 size-4" /> New PO</Button>
        } />}
      />
      <TablePager page={p.page} size={p.size} total={pos.data?.total ?? 0} onPage={p.setPage} onSize={p.setSize} />
    </PurchasingShell>
  );
}
