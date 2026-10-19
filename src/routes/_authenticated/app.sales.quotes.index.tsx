import { quotesList } from "@/lib/sales/queries";
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

type Quote = Database["public"]["Tables"]["quotes"]["Row"];
type Status = Database["public"]["Enums"]["quote_status"];

const TONE: Record<Status, BadgeTone> = {
  draft: "muted", sent: "info", accepted: "success", rejected: "danger", expired: "warning", converted: "success",
};

export const Route = createFileRoute("/_authenticated/app/sales/quotes/")({
  head: () => ({ meta: [{ title: "Quotes — Sales" }] }),
  component: QuotesPage,
});

function QuotesPage() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const p = usePaged();

  const quotes = useQuery(quotesList(orgId, p));

  const create = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await getSessionUser();
      const { data: num, error: nErr } = await supabase.rpc("next_doc_number", { _org: orgId!, _doc: "quote" });
      if (nErr) { console.error(nErr); throw new Error("Couldn't generate a quote number. Please try again or check Settings › Numbering."); }
      const { data, error } = await supabase.from("quotes").insert({
        org_id: orgId!, number: num as string, status: "draft" as Status, created_by: user?.id, owner_id: user?.id,
      }).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => { qc.invalidateQueries({ queryKey: ["quotes"] }); navigate({ to: "/app/sales/quotes/$quoteId", params: { quoteId: id } }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = quotes.data?.rows;

  useOpenOnNew(() => create.mutate(), !!orgId);
  return (
    <SalesShell title="Quotes" breadcrumb="sales / quotes" actions={
      <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending || !orgId}>
        <Plus className="mr-1 size-4" /> New quote
      </Button>
    }>
      <PageToolbar search={p.search} onSearchChange={p.setSearch} placeholder="Search by number, company, contact…" />
      <DataTable
        loading={quotes.isLoading}
        data={filtered}
        onRowClick={(q) => navigate({ to: "/app/sales/quotes/$quoteId", params: { quoteId: q.id } })}
        columns={[
          { key: "number", header: "Number", cell: (q) => <span className="font-mono text-xs">{q.number}</span> },
          { key: "customer", header: "Customer", cell: (q) =>
            q.companies?.name ?? (q.contacts ? [q.contacts.first_name, q.contacts.last_name].filter(Boolean).join(" ") : <span className="text-muted-foreground">—</span>) },
          { key: "issue", header: "Issued", cell: (q) => <span className="font-mono text-xs">{q.issue_date ? new Date(q.issue_date).toLocaleDateString() : "—"}</span> },
          { key: "expiry", header: "Expires", cell: (q) => <span className="font-mono text-xs">{q.expiry_date ? new Date(q.expiry_date).toLocaleDateString() : "—"}</span> },
          { key: "total", header: "Total", cell: (q) => <span className="font-mono">{fmtMoney(q.total, q.currency)}</span> },
          { key: "status", header: "Status", cell: (q) => <StatusBadge tone={TONE[q.status]}>{q.status}</StatusBadge> },
        ]}
        empty={<EmptyState title="No quotes yet" description="Create a quote to send pricing to a prospect." action={
          <Button onClick={() => create.mutate()}><Plus className="mr-1 size-4" /> New quote</Button>
        } />}
      />
      <TablePager page={p.page} size={p.size} total={quotes.data?.total ?? 0} onPage={p.setPage} onSize={p.setSize} />
    </SalesShell>
  );
}
