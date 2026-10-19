import { salesOrdersList } from "@/lib/sales/queries";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useOpenOnNew } from "@/lib/use-focus-row";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { usePaged } from "@/lib/use-paged";
import { TablePager } from "@/components/ui/table-pager";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/use-current-user";
import { SalesShell, fmtMoney } from "@/components/sales/sales-shell";
import { DataTable } from "@/components/crm/data-table";
import { EmptyState } from "@/components/crm/empty-state";
import { PageToolbar } from "@/components/crm/page-toolbar";
import { StatusBadge, type BadgeTone } from "@/components/crm/status-badge";
import { Button } from "@/components/ui/button";
import { useOrgId } from "@/lib/crm/use-org";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Status = Database["public"]["Enums"]["sales_order_status"];
const TONE: Record<Status, BadgeTone> = { draft: "muted", confirmed: "info", fulfilled: "success", cancelled: "danger" };

export const Route = createFileRoute("/_authenticated/app/sales/orders/")({
  head: () => ({ meta: [{ title: "Sales orders — Sales" }] }),
  component: OrdersPage,
});

function OrdersPage() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const p = usePaged();

  const orders = useQuery(salesOrdersList(orgId, p));

  const create = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await getSessionUser();
      const { data: num } = await supabase.rpc("next_doc_number", { _org: orgId!, _doc: "sales_order" });
      const { data, error } = await supabase.from("sales_orders").insert({
        org_id: orgId!, number: num as string, status: "draft", created_by: user?.id, owner_id: user?.id,
      }).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => { qc.invalidateQueries({ queryKey: ["sales-orders"] }); navigate({ to: "/app/sales/orders/$orderId", params: { orderId: id } }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = orders.data?.rows;

  useOpenOnNew(() => create.mutate(), !!orgId);
  return (
    <SalesShell title="Sales orders" breadcrumb="sales / orders" actions={
      <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending}>
        <Plus className="mr-1 size-4" /> New order
      </Button>
    }>
      <PageToolbar search={p.search} onSearchChange={p.setSearch} placeholder="Search orders…" />
      <DataTable
        loading={orders.isLoading}
        data={filtered}
        onRowClick={(o) => navigate({ to: "/app/sales/orders/$orderId", params: { orderId: o.id } })}
        columns={[
          { key: "number", header: "Number", cell: (o) => <span className="font-mono text-xs">{o.number}</span> },
          { key: "customer", header: "Customer", cell: (o) =>
            o.companies?.name ?? (o.contacts ? [o.contacts.first_name, o.contacts.last_name].filter(Boolean).join(" ") : <span className="text-muted-foreground">—</span>) },
          { key: "order_date", header: "Date", cell: (o) => <span className="font-mono text-xs">{o.order_date ? new Date(o.order_date).toLocaleDateString() : "—"}</span> },
          { key: "delivery", header: "Delivery", cell: (o) => <span className="font-mono text-xs">{o.expected_delivery ? new Date(o.expected_delivery).toLocaleDateString() : "—"}</span> },
          { key: "total", header: "Total", cell: (o) => <span className="font-mono">{fmtMoney(o.total, o.currency)}</span> },
          { key: "status", header: "Status", cell: (o) => <StatusBadge tone={TONE[o.status as Status]}>{o.status}</StatusBadge> },
        ]}
        empty={<EmptyState title="No sales orders" description="Create or convert from a quote to start fulfilment." action={
          <Button onClick={() => create.mutate()}><Plus className="mr-1 size-4" /> New order</Button>
        } />}
      />
      <TablePager page={p.page} size={p.size} total={orders.data?.total ?? 0} onPage={p.setPage} onSize={p.setSize} />
    </SalesShell>
  );
}
